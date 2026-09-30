# 🏢 Contexto do Projeto — DER API

## 📋 Informações Essenciais

### Domínio

- **Produto**: Gestão operacional de rodovias (DER)
- **Modelo**: SaaS multi-tenant (cada empresa = 1 tenant)
- **Foco**: Ordens de serviço, planejamento, filas, ativos, regionais e localidades

### Arquitetura Técnica

- **Backend**: NestJS + TypeScript + Prisma + PostgreSQL
- **Padrão**: Repository → Validator → Factory → Service → Controller (quando aplicável)
- **Auth**: JWT + refresh tokens + CASL
- **Deploy**: Docker + Docker Compose

## 🚀 Configuração Rápida

```env
DATABASE_URL="postgresql://user:password@localhost:15432/departamento-estadual-rodovias"
JWT_SECRET="your-jwt-secret-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=development
```

```bash
npm install
npm run start:dev
npx prisma migrate dev
npx prisma generate
```

## 👥 Roles

```
SYSTEM_ADMIN (global)
    ↓
ADMIN (empresa)
    ↓
C2C / FIELD_TEAM (empresa)
```

### Regras de Associação

- **SYSTEM_ADMIN**: acesso global, sem empresa obrigatória
- **ADMIN / C2C**: associados a 1 empresa
- **FIELD_TEAM**: associados a 1 empresa; regional opcional conforme regra de negócio

## 📦 Entidades Principais

`User`, `Company`, `Regional`, `Location`, `Asset`, `WorkOrder`, `Planning`, `Queue`

## 🎯 Regras de Negócio (alto nível)

- Isolamento multi-tenant por `companyId`
- OS com escopo por regional/localidade quando aplicável
- Notificações via WebSocket/push para atividades de OS, Planning e Queue
- Documentos com destinatários tipados no Prisma (`DocumentRecipientType` — não renomear)

## 🏗️ Camadas Típicas

```typescript
// Repository
export class UserRepository {
  async buscarMuitos(where: Prisma.UserWhereInput) {}
  async criar(data: Prisma.UserCreateInput) {}
}

// Service
export class UsersService {
  async criarNovoAdmin(dto: CreateAdminDto) {}
  async criarNovoOthers(dto: CreateOthersDto) {}
}

// Controller
@UseGuards(AuthGuard, RoleGuard)
export class UsersController {
  @Post('admin')
  @RequiredRoles(Roles.ADMIN)
  criarNovoAdmin(@Body() dto: CreateAdminDto) {}
}
```

## 📚 Docs Relacionados

- [ESCOPO-SISTEMA](./ESCOPO-SISTEMA.md)
- [CODING_STANDARDS](./CODING_STANDARDS.md)
- [NAMING_CONVENTIONS](./NAMING_CONVENTIONS.md)
