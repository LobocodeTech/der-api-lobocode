# Services de Usuários — DER

## Visão Geral

Arquitetura modular para usuários DER: serviços por tipo mantidos (`SystemAdmin`, `Admin`, `FieldTeamMember`) e CRUD genérico via `UsersService` / `criarNovoOthers`.

## Estrutura

```
services/
├── base-user.service.ts
├── system-admin.service.ts
├── admin.service.ts
├── field-team-member.service.ts
├── user-query.service.ts
├── user-permission.service.ts
└── index.ts
```

## Roles suportados

- `SYSTEM_ADMIN`
- `ADMIN`
- `FIELD_TEAM`
- `C2C`

## Endpoints de criação

- `POST /users` → `criarNovoOthers`
- `POST /users/system-admin` → `criarNovoSystemAdmin`
- `POST /users/admin` → `criarNovoAdmin`
