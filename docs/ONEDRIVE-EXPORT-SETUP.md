# OneDrive — exportação de relatórios (conta fixa)

Exporta relatórios XLSX para uma **conta Microsoft pessoal dedicada**, sem login dos usuários do DER. As credenciais ficam apenas no backend.

## O que você precisa (tudo gratuito)

| Item | Onde obter |
|------|------------|
| Conta Microsoft pessoal | outlook.com / hotmail (ex.: `der.relatorios@outlook.com`) |
| App Registration | [Microsoft Entra admin center](https://entra.microsoft.com/) → App registrations |
| Client ID + Client secret | App registration → Overview / Certificates & secrets |
| Refresh token | Script one-shot `npm run onedrive:oauth-setup` (uma vez) |

> Contas pessoais **não** suportam `client_credentials` (app-only). O equivalente gratuito é: refresh token da conta dedicada + Client ID/Secret no `.env`.

## 1. Conta dedicada

1. Crie uma conta Microsoft **somente para relatórios**.
2. Não use a conta pessoal de um colaborador.
3. Guarde usuário/senha em local seguro (cofre / gestor de senhas da equipe).

## 2. App Registration (Entra)

Pode **reutilizar** o app Microsoft já usado no login do DER (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`), desde que:

- o tipo de conta permita Microsoft pessoais (ou "any org + personal");
- exista a Redirect URI de setup abaixo;
- existam as permissões Delegated listadas.

Ou criar um app dedicado:

1. Acesse [App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) → **New registration**.
2. **Name**: `DER Relatorios OneDrive` (ou similar).
3. **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts* **ou** *Personal Microsoft accounts only*.
4. **Redirect URI** (obrigatória no app usado pelo script):
   - Platform: **Web**
   - URI: `http://localhost:3847/callback`
5. Após criar, copie o **Application (client) ID** (ou use o já existente no `.env`).
6. **Certificates & secrets** → use o secret já configurado ou crie um novo.
7. **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**:
   - `Files.ReadWrite`
   - `offline_access`
   - `User.Read`
8. Não é necessário admin consent para conta pessoal; o consentimento ocorre no login do script.

## 3. Obter o refresh token (uma vez)

No diretório `der-api-lobocode` (o script lê o `.env` automaticamente):

```bash
npm run onedrive:oauth-setup
```

O script abre `http://localhost:3847`, redireciona para o login Microsoft e imprime o `MICROSOFT_REFRESH_TOKEN`.

**Importante:** faça login com a **conta dedicada** de relatórios.

## 4. Variáveis de ambiente (backend)

Adicione ao `.env` (produção/dev):

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REFRESH_TOKEN=
ONEDRIVE_TENANT=consumers
ONEDRIVE_FOLDER_PATH=DER_Relatórios_OS
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `MICROSOFT_CLIENT_ID` | Sim* | Application (client) ID (pode reutilizar o do login Microsoft) |
| `MICROSOFT_CLIENT_SECRET` | Sim* | Client secret |
| `MICROSOFT_REFRESH_TOKEN` | Sim* | Token do script de setup |
| `ONEDRIVE_TENANT` | Não | Default: `consumers` (independente do `MICROSOFT_TENANT` do login) |
| `ONEDRIVE_FOLDER_PATH` | Não | Pasta no OneDrive; default: `DER_Relatórios_OS` |

\*Obrigatórias apenas se for usar o botão OneDrive. Sem elas, a API responde erro claro pedindo configuração.

## 5. Endpoint da API

```http
POST /reports/work-orders/export/onedrive
Authorization: Bearer <jwt-der>
Content-Type: multipart/form-data

files: <um ou mais .xlsx — ordem do manifesto>
manifest: <JSON { typeReports[], osReports[] }>
filters: <JSON dos filtros do relatório>
exportTypes: <JSON { corrective, preventive, general }>
```

Roles: `SYSTEM_ADMIN`, `ADMIN` (igual aos demais endpoints de reports).

Estrutura no OneDrive (`ONEDRIVE_FOLDER_PATH`, default `DER_Relatórios_OS`):

```
DER_Relatórios_OS/
  Corretiva/
    Relatorio OS Corretiva • Mensal.xlsx
    OS-1 • 212 KM 212+121 • Corretiva/
      OS-1 • 212 KM 212+121 • Corretiva.xlsx
      checklist.txt
      foto1.jpg
  Preventiva/
    Relatorio OS Preventiva • Mensal.xlsx
    OS-2 • 065 KM 065+000 • Preventiva/
      OS-2 • 065 KM 065+000 • Preventiva.xlsx
      checklist.txt
  Geral/
    Relatorio OS Geral • Mensal.xlsx
    ...
```

Só são criadas as pastas de tipo selecionadas/com dados. O export Excel local (desktop) permanece inalterado.

A pasta mãe (`ONEDRIVE_FOLDER_PATH`) é publicada com link anônimo **somente leitura** via Graph `createLink` (`view` + `anonymous`). No OneDrive pessoal moderno (conta migrada / `microsoftpersonalcontent`), o Graph gera `1drv.ms` **inválido se a pasta estiver vazia** — a API garante um `LEIA-ME.txt` (ou usa os arquivos do export) antes de publicar. O link volta no response do export (`folderShareUrl` / `webUrl`) e também em:

```http
GET /reports/work-orders/export/onedrive/folder-link
```

## 6. Renovação e falhas

- Se o refresh token for revogado (senha alterada, consent removido), rode o script de setup novamente e atualize o `.env`.
- Client secrets no Azure **expiram**; renove em Certificates & secrets e atualize `MICROSOFT_CLIENT_SECRET`.
- Usuários do DER **nunca** fazem login na Microsoft em produção.

## 7. Teste manual

1. Configure as envs e reinicie a API.
2. No app, em Relatórios → **OneDrive** → confirme tipos.
3. Verifique na conta dedicada a pasta `DER_Relatórios_OS` com `Corretiva` / `Preventiva` / `Geral`.
