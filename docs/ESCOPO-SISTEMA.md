# 🎯 Escopo do Sistema DER (Departamento Estadual de Rodovias)

## 📋 Visão Geral

O **DER API** é o backend NestJS do sistema de gestão operacional de rodovias: ordens de serviço, planejamento, filas, ativos, regionais e localidades, com multi-tenancy e autorização CASL.

---

## 🏢 Multi-Tenancy

- **Company**: tenant (empresa)
- Isolamento completo de dados por `companyId`
- Configurações independentes por tenant

### Hierarquia de Dados

```
Company (Tenant)
├── Regional
├── Location
├── Asset
├── User
├── WorkOrder
├── Planning
└── Queue
```

---

## 👥 Roles

| Role | Descrição | Escopo |
| ---- | --------- | ------ |
| **SYSTEM_ADMIN** | Administrador da plataforma | Global |
| **ADMIN** | Administrador da empresa | Company |
| **FIELD_TEAM** | Equipe de campo | Company (+ regional quando aplicável) |
| **C2C** | Centro de comando / operação | Company |

### Hierarquia

```
SYSTEM_ADMIN
    ↓
ADMIN
    ↓
C2C / FIELD_TEAM
```

---

## 📦 Entidades Principais

- **User** — usuários e papéis
- **Company** — tenant
- **Regional** — regionais (CGR)
- **Location** — localidades
- **Asset** — ativos
- **WorkOrder** — ordens de serviço
- **Planning** — planejamento
- **Queue** — filas operacionais

---

## 🔐 Controle de Acesso

- Autenticação JWT + refresh
- Autorização CASL (`AuthGuard` / `RoleGuard` + decorators)
- Escopo por empresa e, quando aplicável, por regional

---

## 🏗️ Arquitetura Técnica

```
src/modules/
├── users/
├── companies/
├── regionals/
├── locations/
├── assets/
├── work-orders/
├── planning/
├── queue/
├── notifications/
└── documents/
```

```
src/shared/
├── auth/
├── casl/
├── tenant/
├── prisma/
└── universal/
```

---

## 📚 Documentação Relacionada

- [README Principal](../README.md)
- [CODING_STANDARDS](./CODING_STANDARDS.md)
- [NAMING_CONVENTIONS](./NAMING_CONVENTIONS.md)
- [projeto-context](./projeto-context.md)
