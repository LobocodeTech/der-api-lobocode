import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GraphCreateLinkResponse,
  GraphDriveItemResponse,
  OneDriveUploadResult,
} from '../types/onedrive-upload.types';
import { MicrosoftGraphAuthService } from './microsoft-graph-auth.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Limite seguro para não estourar throttling do Graph. */
const UPLOAD_CONCURRENCY = 6;
/**
 * OneDrive pessoal (microsoftpersonalcontent / migratedtospo): createLink em
 * pasta vazia gera 1drv.ms que abre 403/"inválido". Precisa de ao menos 1 arquivo.
 */
const SHARE_SEED_FILE_NAME = 'LEIA-ME.txt';
const SHARE_SEED_CONTENT = Buffer.from(
  'Pasta pública de relatórios DER (OneDrive). Os arquivos exportados ficam nas subpastas.',
  'utf8',
);
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Faz upload de arquivos para a pasta configurada no OneDrive da conta fixa.
 */
@Injectable()
export class OneDriveUploadService {
  private readonly logger = new Logger(OneDriveUploadService.name);
  /**
   * Cache do link público amarrado ao itemId atual da pasta.
   * Se a pasta for apagada e recriada, o Graph gera outro id — o cache antigo
   * é ignorado (não reabre o 1drv.ms morto).
   */
  private cachedFolderShare: { itemId: string; url: string } | null = null;

  constructor(
    private readonly graphAuthService: MicrosoftGraphAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Envia um arquivo para `ONEDRIVE_FOLDER_PATH[/subpasta]/fileName`.
   */
  async enviarArquivo(params: {
    buffer: Buffer;
    fileName: string;
    contentType?: string;
    /** Subpastas relativas a ONEDRIVE_FOLDER_PATH. */
    subpasta?: string;
    /** Token já obtido (evita renovação/cache lookup repetido). */
    accessToken?: string;
    /** Quando true, assume que as pastas pai já existem. */
    pularGarantiaDePasta?: boolean;
  }): Promise<OneDriveUploadResult> {
    const fileName = this.sanitizarNomeArquivo(params.fileName);
    if (!fileName) {
      throw new BadRequestException('Nome do arquivo é obrigatório.');
    }
    if (!params.buffer?.length) {
      throw new BadRequestException('Arquivo vazio ou inválido.');
    }
    const root = this.obterPastaDestino();
    if (!params.pularGarantiaDePasta) {
      if (params.subpasta?.trim()) {
        await this.garantirPasta(this.juntarCaminho(root, params.subpasta));
      } else {
        await this.garantirPasta(root);
      }
    }
    const relativePath = this.juntarCaminho(root, params.subpasta, fileName);
    const encodedPath = this.codificarCaminhoGraph(relativePath);
    const accessToken =
      params.accessToken || (await this.graphAuthService.obterAccessToken());
    if (params.buffer.length <= SIMPLE_UPLOAD_MAX_BYTES) {
      return this.enviarUploadSimples({
        accessToken,
        encodedPath,
        buffer: params.buffer,
        contentType: params.contentType || 'application/octet-stream',
      });
    }
    return this.enviarUploadSessao({
      accessToken,
      encodedPath,
      buffer: params.buffer,
    });
  }

  /**
   * Envia vários arquivos com paths relativos a ONEDRIVE_FOLDER_PATH.
   * Cria pastas únicas uma vez e faz upload em paralelo (concorrência limitada).
   */
  async enviarPacote(params: {
    files: Array<{
      relativePath: string;
      buffer: Buffer;
      contentType: string;
    }>;
  }): Promise<{
    uploadedFiles: number;
    packagePath: string;
    folderShareUrl: string;
  }> {
    const root = this.obterPastaDestino();
    const accessToken = await this.graphAuthService.obterAccessToken();
    const preparadas = params.files
      .map((file) => {
        const normalized = file.relativePath
          .replace(/\\/g, '/')
          .replace(/^\/+/, '');
        const segments = normalized.split('/').filter(Boolean);
        const fileName = segments.pop();
        if (!fileName) return null;
        return {
          fileName,
          subpasta: segments.join('/') || undefined,
          buffer: file.buffer,
          contentType: file.contentType,
        };
      })
      .filter(
        (
          item,
        ): item is {
          fileName: string;
          subpasta: string | undefined;
          buffer: Buffer;
          contentType: string;
        } => item !== null,
      );
    const startedAt = Date.now();
    await this.garantirPastasDoPacote({
      root,
      subpastas: preparadas.map((item) => item.subpasta),
      accessToken,
    });
    const folderMs = Date.now() - startedAt;
    const uploadStartedAt = Date.now();
    await this.executarComConcurrency(
      preparadas,
      UPLOAD_CONCURRENCY,
      async (item) => {
        await this.enviarArquivo({
          buffer: item.buffer,
          fileName: item.fileName,
          contentType: item.contentType,
          subpasta: item.subpasta,
          accessToken,
          pularGarantiaDePasta: true,
        });
      },
    );
    const uploadMs = Date.now() - uploadStartedAt;
    const folderShareUrl =
      await this.obterOuCriarLinkPublicoPastaRaiz(accessToken);
    this.logger.log(
      `Pacote OneDrive: ${preparadas.length} arquivo(s) em ${Date.now() - startedAt}ms (pastas=${folderMs}ms, upload=${uploadMs}ms, concurrency=${UPLOAD_CONCURRENCY}) share=${folderShareUrl}`,
    );
    return {
      uploadedFiles: preparadas.length,
      packagePath: root,
      folderShareUrl,
    };
  }

  /**
   * Garante a pasta raiz e retorna link público anônimo (somente leitura).
   * Sempre resolve a pasta pelo caminho (itemId atual) antes de qualquer link.
   * Cache só vale se for do mesmo itemId — pasta apagada/recriada = link novo.
   */
  async obterOuCriarLinkPublicoPastaRaiz(
    accessToken?: string,
  ): Promise<string> {
    const token =
      accessToken || (await this.graphAuthService.obterAccessToken());
    const root = this.obterPastaDestino();
    await this.garantirPasta(root, token);
    const itemId = await this.obterIdItemPorCaminhoComRetry(root, token);
    if (
      this.cachedFolderShare?.itemId === itemId &&
      this.cachedFolderShare.url
    ) {
      this.logger.log(
        `Pasta OneDrive link em cache (id=${itemId}) → ${this.cachedFolderShare.url}`,
      );
      return this.cachedFolderShare.url;
    }
    if (this.cachedFolderShare) {
      this.logger.log(
        `Pasta OneDrive recriada (cache id=${this.cachedFolderShare.itemId} ≠ ${itemId}) — publicando de novo`,
      );
      this.cachedFolderShare = null;
    }
    await this.garantirConteudoMinimoParaShare(itemId, token);
    const existing = await this.buscarLinkAnonimoNasPermissoes(itemId, token);
    if (existing) {
      const status = await this.avaliarLinkPublicoViaHttp(existing);
      if (status === 'ok') {
        this.cachedFolderShare = { itemId, url: existing };
        this.logger.log(
          `Pasta OneDrive já pública: ${root} (id=${itemId}) → ${existing}`,
        );
        return existing;
      }
      this.logger.warn(
        `Link anônimo existente inválido — republicando ${root}: ${existing}`,
      );
    }
    const confirmed = await this.republicarLinkAnonimoPasta(itemId, token);
    this.cachedFolderShare = { itemId, url: confirmed };
    this.logger.log(
      `Pasta OneDrive publicada: ${root} (id=${itemId}) → ${confirmed}`,
    );
    return confirmed;
  }

  /**
   * OneDrive pessoal: pasta sem arquivos → createLink gera link morto.
   * Garante um LEIA-ME.txt quando a pasta ainda não tem filhos.
   */
  private async garantirConteudoMinimoParaShare(
    itemId: string,
    accessToken: string,
  ): Promise<void> {
    const childrenRes = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/children?$top=1&$select=id`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const childrenPayload = (await childrenRes.json().catch(() => ({}))) as {
      value?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (childrenRes.ok && (childrenPayload.value?.length ?? 0) > 0) {
      return;
    }
    this.logger.log(
      `Pasta OneDrive vazia — criando ${SHARE_SEED_FILE_NAME} antes do createLink`,
    );
    const encodedName = encodeURIComponent(SHARE_SEED_FILE_NAME);
    const putRes = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}:/${encodedName}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: new Uint8Array(SHARE_SEED_CONTENT),
      },
    );
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Falha ao preparar pasta OneDrive para compartilhamento: ${putRes.status} ${detail.slice(0, 180)}`,
      );
    }
    // Propagação do item no OneDrive pessoal antes do createLink.
    await this.aguardarMs(1500);
  }

  /**
   * Remove shares anônimos quebrados e cria um novo (após haver conteúdo).
   */
  private async republicarLinkAnonimoPasta(
    itemId: string,
    accessToken: string,
  ): Promise<string> {
    const attempts = [0, 1000, 2500];
    let lastUrl = '';
    let lastDetail = 'falha ao republicar link';
    for (const delay of attempts) {
      if (delay > 0) {
        await this.aguardarMs(delay);
      }
      await this.garantirConteudoMinimoParaShare(itemId, accessToken);
      await this.removerLinksAnonimosDoItem(itemId, accessToken);
      await this.aguardarMs(500);
      const webUrl = await this.criarLinkAnonimoPorItemId(itemId, accessToken);
      const fromPermissions =
        (await this.buscarLinkAnonimoNasPermissoes(itemId, accessToken)) ||
        webUrl;
      lastUrl = fromPermissions;
      await this.aguardarMs(1000);
      const status = await this.avaliarLinkPublicoViaHttp(fromPermissions);
      if (status === 'ok') {
        return fromPermissions;
      }
      lastDetail = `link criado mas não abre publicamente: ${fromPermissions}`;
      this.logger.warn(lastDetail);
    }
    throw new ServiceUnavailableException(
      `Falha ao publicar pasta OneDrive: ${lastDetail}`,
    );
  }

  /**
   * Abre o 1drv.ms como browser (sem login do dono).
   * Link morto de pasta vazia → 403 / login.live / “might not exist”.
   */
  private async avaliarLinkPublicoViaHttp(
    webUrl: string,
  ): Promise<'ok' | 'broken' | 'unknown'> {
    const trimmed = webUrl?.trim();
    if (!trimmed) return 'broken';
    try {
      const response = await fetch(trimmed, {
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      const finalUrl = response.url?.toLowerCase() || '';
      const body = (await response.text().catch(() => ''))
        .slice(0, 5000)
        .toLowerCase();
      const requiresLogin =
        finalUrl.includes('login.live.com') ||
        finalUrl.includes('login.microsoftonline.com') ||
        body.includes('wa=wsignin');
      const seemsBroken =
        response.status === 403 ||
        response.status === 404 ||
        requiresLogin ||
        body.includes('this item might not exist') ||
        body.includes('item might not exist or is no longer available') ||
        body.includes('this link has been removed') ||
        body.includes('não está disponível') ||
        body.includes('something went wrong');
      if (!response.ok || seemsBroken) {
        this.logger.warn(
          `Share HTTP inválido (${response.status} final=${finalUrl.slice(0, 80)}): ${trimmed.slice(0, 96)}`,
        );
        return 'broken';
      }
      return 'ok';
    } catch (error) {
      this.logger.warn(
        `Falha ao checar share via HTTP: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'unknown';
    }
  }

  /**
   * Resolve o driveItem.id da pasta por caminho, com retry (propagação Graph).
   */
  private async obterIdItemPorCaminhoComRetry(
    pathFromRoot: string,
    accessToken: string,
  ): Promise<string> {
    const delaysMs = [0, 400, 900, 1600];
    let lastDetail = 'item não encontrado';
    for (const delay of delaysMs) {
      if (delay > 0) {
        await this.aguardarMs(delay);
      }
      const encodedPath = this.codificarCaminhoGraph(pathFromRoot);
      const response = await fetch(
        `${GRAPH_BASE}/me/drive/root:/${encodedPath}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as GraphDriveItemResponse;
      if (response.ok && payload.id) {
        return payload.id;
      }
      lastDetail =
        payload.error?.message || `status ${response.status} sem id`;
      this.logger.warn(
        `Pasta ${pathFromRoot} ainda não resolvida: ${lastDetail}`,
      );
    }
    throw new ServiceUnavailableException(
      `Pasta OneDrive não encontrada após criar: ${pathFromRoot} (${lastDetail})`,
    );
  }

  /**
   * Lê permissões do item e devolve webUrl de link anonymous, se existir.
   */
  private async buscarLinkAnonimoNasPermissoes(
    itemId: string,
    accessToken: string,
  ): Promise<string | null> {
    const response = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/permissions`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      value?: Array<{
        id?: string;
        link?: { scope?: string; type?: string; webUrl?: string };
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      this.logger.warn(
        `Falha ao listar permissions item=${itemId}: ${payload.error?.message || response.status}`,
      );
      return null;
    }
    for (const permission of payload.value ?? []) {
      const link = permission.link;
      if (
        link?.scope === 'anonymous' &&
        (link.type === 'view' || link.type === 'edit') &&
        link.webUrl?.trim()
      ) {
        return link.webUrl.trim();
      }
    }
    return null;
  }

  /**
   * Cria link view + anonymous no item (pasta) e retorna webUrl.
   */
  private async criarLinkAnonimoPorItemId(
    itemId: string,
    accessToken: string,
  ): Promise<string> {
    const attempts = [0, 600, 1400];
    let lastDetail = 'falha createLink';
    for (const delay of attempts) {
      if (delay > 0) {
        await this.aguardarMs(delay);
      }
      const response = await fetch(
        `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/createLink`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'view',
            scope: 'anonymous',
          }),
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as GraphCreateLinkResponse;
      const webUrl = payload.link?.webUrl?.trim();
      const scope = payload.link?.scope;
      if (response.ok && webUrl) {
        if (scope && scope !== 'anonymous') {
          lastDetail = `scope inesperado: ${scope}`;
          this.logger.warn(
            `createLink retornou scope=${scope} (esperado anonymous) item=${itemId}`,
          );
          continue;
        }
        this.logger.log(
          `createLink ok item=${itemId} scope=${scope || 'n/d'} type=${payload.link?.type || 'n/d'}`,
        );
        return webUrl;
      }
      lastDetail =
        payload.error?.message || `status ${response.status} sem webUrl`;
      this.logger.warn(`createLink falhou item=${itemId}: ${lastDetail}`);
    }
    throw new ServiceUnavailableException(
      `Falha ao publicar pasta OneDrive: ${lastDetail}`,
    );
  }

  private async removerLinksAnonimosDoItem(
    itemId: string,
    accessToken: string,
  ): Promise<void> {
    const response = await fetch(
      `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/permissions`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      value?: Array<{
        id?: string;
        link?: { scope?: string; webUrl?: string };
      }>;
    };
    if (!response.ok) return;
    for (const permission of payload.value ?? []) {
      if (permission.link?.scope !== 'anonymous' || !permission.id) continue;
      const del = await fetch(
        `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/permissions/${encodeURIComponent(permission.id)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (del.ok || del.status === 204 || del.status === 404) {
        this.logger.log(
          `Link anônimo removido item=${itemId} permission=${permission.id}`,
        );
      } else {
        this.logger.warn(
          `Falha ao remover permission ${permission.id} item=${itemId}: ${del.status}`,
        );
      }
    }
  }

  private aguardarMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Cria pastas intermediárias via Graph (ex.: DER_Relatórios_OS / Preventiva / OS-1).
   */
  async garantirPasta(
    pathFromRoot: string,
    accessToken?: string,
    cache?: Set<string>,
  ): Promise<void> {
    const segments = pathFromRoot
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      return;
    }
    const token =
      accessToken || (await this.graphAuthService.obterAccessToken());
    let currentPath = '';
    for (const segment of segments) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (cache?.has(currentPath)) {
        continue;
      }
      await this.garantirSegmentoPasta({
        currentPath,
        parentPath,
        segment,
        accessToken: token,
      });
      cache?.add(currentPath);
    }
  }

  /**
   * Garante root + todas as subpastas do pacote sem repetir probes Graph.
   * Pastas do mesmo nível são criadas em paralelo.
   */
  private async garantirPastasDoPacote(params: {
    root: string;
    subpastas: Array<string | undefined>;
    accessToken: string;
  }): Promise<void> {
    const caminhos = new Set<string>();
    caminhos.add(params.root);
    for (const subpasta of params.subpastas) {
      if (!subpasta?.trim()) continue;
      const full = this.juntarCaminho(params.root, subpasta);
      const segments = full.split('/').filter(Boolean);
      let current = '';
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        caminhos.add(current);
      }
    }
    const porProfundidade = new Map<number, string[]>();
    for (const caminho of caminhos) {
      const depth = caminho.split('/').filter(Boolean).length;
      const grupo = porProfundidade.get(depth) ?? [];
      grupo.push(caminho);
      porProfundidade.set(depth, grupo);
    }
    const profundidades = [...porProfundidade.keys()].sort((a, b) => a - b);
    const cache = new Set<string>();
    for (const depth of profundidades) {
      const nivel = porProfundidade.get(depth) || [];
      await Promise.all(
        nivel.map((caminho) =>
          this.garantirPasta(caminho, params.accessToken, cache),
        ),
      );
    }
  }

  private async garantirSegmentoPasta(params: {
    currentPath: string;
    parentPath: string;
    segment: string;
    accessToken: string;
  }): Promise<void> {
    const encodedCurrent = this.codificarCaminhoGraph(params.currentPath);
    const probeUrl = `${GRAPH_BASE}/me/drive/root:/${encodedCurrent}`;
    const probe = await fetch(probeUrl, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (probe.ok) {
      return;
    }
    if (probe.status !== 404) {
      const payload = (await probe.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      this.logger.warn(
        `Falha ao verificar pasta ${params.currentPath}: ${payload.error?.message || probe.status}`,
      );
    }
    const createUrl = params.parentPath
      ? `${GRAPH_BASE}/me/drive/root:/${this.codificarCaminhoGraph(params.parentPath)}:/children`
      : `${GRAPH_BASE}/me/drive/root/children`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.segment,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });
    if (
      createResponse.ok ||
      createResponse.status === 409 ||
      createResponse.status === 405
    ) {
      return;
    }
    const createPayload = (await createResponse.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    if (
      createPayload.error?.code === 'nameAlreadyExists' ||
      createResponse.status === 409
    ) {
      return;
    }
    this.logger.error(
      `Falha ao criar pasta ${params.currentPath}: ${createPayload.error?.message || createResponse.status}`,
    );
    throw new ServiceUnavailableException(
      `Falha ao criar pasta no OneDrive: ${params.currentPath}`,
    );
  }

  private async enviarUploadSimples(params: {
    accessToken: string;
    encodedPath: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<OneDriveUploadResult> {
    const url = `${GRAPH_BASE}/me/drive/root:/${params.encodedPath}:/content?@microsoft.graph.conflictBehavior=replace`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': params.contentType,
      },
      body: new Uint8Array(params.buffer),
    });
    const payload = (await response.json()) as GraphDriveItemResponse;
    if (!response.ok || !payload.id) {
      this.tratarErroGraph('upload simples', response.status, payload);
    }
    return this.mapearResultado(payload);
  }

  private async enviarUploadSessao(params: {
    accessToken: string;
    encodedPath: string;
    buffer: Buffer;
  }): Promise<OneDriveUploadResult> {
    const sessionUrl = `${GRAPH_BASE}/me/drive/root:/${params.encodedPath}:/createUploadSession`;
    const sessionResponse = await fetch(sessionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
        },
      }),
    });
    const sessionPayload = (await sessionResponse.json()) as {
      uploadUrl?: string;
      error?: { message?: string };
    };
    if (!sessionResponse.ok || !sessionPayload.uploadUrl) {
      const detail =
        sessionPayload.error?.message || 'não foi possível criar upload session';
      this.logger.error(`Falha createUploadSession: ${detail}`);
      throw new ServiceUnavailableException(
        `Falha ao preparar upload no OneDrive: ${detail}`,
      );
    }
    const total = params.buffer.length;
    const chunkSize = 320 * 1024 * 10;
    let offset = 0;
    let lastPayload: GraphDriveItemResponse | null = null;
    while (offset < total) {
      const end = Math.min(offset + chunkSize, total);
      const chunk = params.buffer.subarray(offset, end);
      const chunkResponse = await fetch(sessionPayload.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
        },
        body: new Uint8Array(chunk),
      });
      const chunkPayload =
        (await chunkResponse.json().catch(() => ({}))) as GraphDriveItemResponse;
      if (!chunkResponse.ok && chunkResponse.status !== 202) {
        this.tratarErroGraph('upload session', chunkResponse.status, chunkPayload);
      }
      if (chunkResponse.status === 200 || chunkResponse.status === 201) {
        lastPayload = chunkPayload;
      }
      offset = end;
    }
    if (!lastPayload?.id) {
      throw new ServiceUnavailableException(
        'Upload OneDrive finalizou sem retorno do arquivo.',
      );
    }
    return this.mapearResultado(lastPayload);
  }

  private async executarComConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;
    let nextIndex = 0;
    const runners = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const index = nextIndex;
          nextIndex += 1;
          await worker(items[index]);
        }
      },
    );
    await Promise.all(runners);
  }

  private tratarErroGraph(
    contexto: string,
    status: number,
    payload: GraphDriveItemResponse,
  ): never {
    const detail = payload.error?.message || JSON.stringify(payload);
    this.logger.error(`Falha Graph (${contexto}) status=${status}: ${detail}`);
    throw new ServiceUnavailableException(
      `Falha ao enviar arquivo ao OneDrive: ${detail}`,
    );
  }

  private mapearResultado(payload: GraphDriveItemResponse): OneDriveUploadResult {
    return {
      id: payload.id as string,
      name: payload.name || 'arquivo',
      webUrl: payload.webUrl ?? null,
      size: payload.size ?? null,
    };
  }

  obterPastaDestino(): string {
    const raw =
      this.configService.get<string>('ONEDRIVE_FOLDER_PATH', 'DER_Relatórios_OS') ||
      'DER_Relatórios_OS';
    return raw
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('/');
  }

  private juntarCaminho(...parts: Array<string | undefined | null>): string {
    return parts
      .flatMap((part) =>
        String(part ?? '')
          .replace(/\\/g, '/')
          .split('/')
          .map((segment) => segment.trim())
          .filter(Boolean),
      )
      .join('/');
  }

  private sanitizarNomeArquivo(fileName: string): string {
    return fileName
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 200);
  }

  private codificarCaminhoGraph(path: string): string {
    return path
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }
}
