# Arquitetura de Domínio — DER API

API NestJS + Prisma para gestão operacional do DER (Departamento de Estradas de Rodagem): regionais, rodovias, ativos de monitoramento e ordens de serviço.

## Domínios principais

| Domínio | Papel |
|---------|--------|
| **Regional** | CGR / regional geográfica; agrega usuários, localidades e colunas de kanban. |
| **Location** | Rodovia/localidade vinculada a uma Regional (código, km de referência, edícula). |
| **Asset** | Ativo (câmera, NVR, etc.) instalado em uma Location; status e criticidade. |
| **WorkOrder** | Ordem de serviço (corretiva/preventiva) na Location; SLA, checklist, evidências, Kanban. |
| **Planning** | Planejamento de manutenção; pode gerar WorkOrder e ter responsáveis. |
| **Queue** | Fila de técnicos; associação N:N com WorkOrders via `WorkOrderQueue`. |

## Relacionamentos (visão)

```
Company
  └── Regional
        └── Location
              ├── Asset
              ├── WorkOrder ←→ Queue (via WorkOrderQueue)
              └── Planning ──(1:1 opcional)──► WorkOrder
```

## Multi-tenancy e permissões

- Escopo por `companyId` (soft delete com `deletedAt`).
- Autorização via CASL (roles/abilities); regionais restringem acesso a Locations/OS quando aplicável.

## Stack

NestJS · Prisma · PostgreSQL · JWT/CASL
