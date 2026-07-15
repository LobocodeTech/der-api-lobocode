#!/usr/bin/env node
/**
 * Setup one-shot: obtém MICROSOFT_REFRESH_TOKEN para a conta OneDrive fixa.
 *
 * Uso (a partir de der-api-lobocode):
 *   npm run onedrive:oauth-setup
 *
 * Carrega automaticamente MICROSOFT_CLIENT_ID / SECRET do arquivo .env.
 * Abra o navegador na URL impressa, faça login com a conta dedicada e
 * copie o refresh token para o .env do backend.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const PORT = 3847;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ['Files.ReadWrite', 'offline_access', 'User.Read'].join(' ');

function carregarEnvArquivo(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
carregarEnvArquivo(path.join(projectRoot, '.env'));
carregarEnvArquivo(path.join(process.cwd(), '.env'));

const clientId = process.env.MICROSOFT_CLIENT_ID?.trim();
const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim();
const tenant =
  process.env.ONEDRIVE_TENANT?.trim() ||
  process.env.MICROSOFT_TENANT?.trim() ||
  'consumers';

if (!clientId || !clientSecret) {
  console.error(
    'Defina MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET no .env (ou no ambiente) antes de rodar este script.',
  );
  process.exit(1);
}

const authorizeUrl = new URL(
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
);
authorizeUrl.searchParams.set('client_id', clientId);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authorizeUrl.searchParams.set('response_mode', 'query');
authorizeUrl.searchParams.set('scope', SCOPES);
authorizeUrl.searchParams.set('prompt', 'select_account');

async function trocarCodigoPorTokens(code) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    const detail =
      payload.error_description || payload.error || JSON.stringify(payload);
    throw new Error(`Falha ao trocar code por token: ${detail}`);
  }
  return payload;
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5}
  code,pre{background:#f4f4f5;padding:2px 6px;border-radius:4px}
  pre{padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
  .ok{color:#166534}.err{color:#991b1b}
</style>
</head>
<body>${body}</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (reqUrl.pathname === '/') {
      res.writeHead(302, { Location: authorizeUrl.toString() });
      res.end();
      return;
    }
    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage('404', '<p class="err">Rota não encontrada.</p>'));
      return;
    }
    const error = reqUrl.searchParams.get('error');
    if (error) {
      const desc = reqUrl.searchParams.get('error_description') || error;
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Erro OAuth',
          `<p class="err">Autorização negada: ${desc}</p>`,
        ),
      );
      server.close();
      process.exit(1);
      return;
    }
    const code = reqUrl.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage('Erro', '<p class="err">Query param <code>code</code> ausente.</p>'),
      );
      return;
    }
    const tokens = await trocarCodigoPorTokens(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'Resposta sem refresh_token. Confirme o scope offline_access na App Registration.',
      );
    }
    console.log('\n=== OneDrive OAuth setup concluído ===\n');
    console.log('Adicione ao .env do backend:\n');
    console.log(`MICROSOFT_CLIENT_ID=${clientId}`);
    console.log(`MICROSOFT_CLIENT_SECRET=${clientSecret}`);
    console.log(`MICROSOFT_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`ONEDRIVE_TENANT=${tenant}`);
    console.log('ONEDRIVE_FOLDER_PATH=Relatorios\n');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      htmlPage(
        'Sucesso',
        `<p class="ok">Refresh token obtido. Copie o valor impresso no terminal para o <code>.env</code> e feche esta aba.</p>
         <p>Você já pode encerrar o script (Ctrl+C se ainda estiver aberto).</p>`,
      ),
    );
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(htmlPage('Erro', `<p class="err">${message}</p>`));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\nOneDrive OAuth setup');
  console.log(`1. Confirme Redirect URI na App Registration: ${REDIRECT_URI}`);
  console.log(`2. Abra no navegador: http://localhost:${PORT}`);
  console.log('3. Faça login com a CONTA DEDICADA de relatórios.\n');
});
