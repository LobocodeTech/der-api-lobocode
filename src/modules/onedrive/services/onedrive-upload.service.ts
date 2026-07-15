import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GraphDriveItemResponse,
  OneDriveUploadResult,
} from '../types/onedrive-upload.types';
import { MicrosoftGraphAuthService } from './microsoft-graph-auth.service';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Limite seguro para não estourar throttling do Graph. */
const UPLOAD_CONCURRENCY = 6;

/**
 * Faz upload de arquivos para a pasta configurada no OneDrive da conta fixa.
 */
@Injectable()
export class OneDriveUploadService {
  private readonly logger = new Logger(OneDriveUploadService.name);

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
  }): Promise<{ uploadedFiles: number; packagePath: string }> {
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
    this.logger.log(
      `Pacote OneDrive: ${preparadas.length} arquivo(s) em ${Date.now() - startedAt}ms (pastas=${folderMs}ms, upload=${uploadMs}ms, concurrency=${UPLOAD_CONCURRENCY})`,
    );
    return {
      uploadedFiles: preparadas.length,
      packagePath: root,
    };
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
