# Cursor AI Helper — DER API

## Contexto do Projeto

- **Projeto**: der-api-lobocode (Departamento de Estradas de Rodagem)
- **Stack**: NestJS + TypeScript + Prisma + PostgreSQL
- **Arquitetura**: Multi-tenant, roles, modular

## Regras Obrigatórias

- **Arquivo**: `.cursor/rules/nestjs-rules.mdc`
- **Documentação**: `docs/NAMING_CONVENTIONS.md`
- **Contexto Completo**: `docs/projeto-context.md`

## Padrões Essenciais

### Nomenclatura

- **Métodos**: `buscarUserPorId()`, `validarSeUserExiste()`, `criarNovoAdmin()`
- **Entidades**: `User`, `Company`, `Regional`, `Location`, `Asset`, `WorkOrder`, `Planning`, `Queue`
- **Propriedades**: `id`, `name`, `email`, `companyId` (inglês)

### Arquitetura Modular

```
Repository → Validator → Factory → Service → Controller
```

### CRUD Genérico

```typescript
buscarTodos(page, limit); // Lista com paginação
buscarPorId(id); // Busca específica
criar(dto); // Criação
atualizar(id, dto); // Atualização
desativar(id); // Soft delete
```

### Sistema de Mensagens

```typescript
VALIDATION_MESSAGES.REQUIRED.NAME;
ERROR_MESSAGES.RESOURCE.NOT_FOUND;
SUCCESS_MESSAGES.CRUD.CREATED;
```

## Lembretes Importantes

- ✅ Validators customizados
- ✅ Filtros de erro padronizados
- ✅ Isolamento multi-tenant por `companyId`
- ✅ Documentar com JSDoc
- ✅ Testes unitários quando aplicável

## Referências Rápidas

- Roles: `SYSTEM_ADMIN`, `ADMIN`, `FIELD_TEAM`, `C2C`
- Validações: `@IsStrongPassword()`, `@IsUniqueEmail()`, `@IsUniqueCPF()`
- Filtros: `TokenExpiredError`, `ValidationError`, `NotFoundError`

## Para Contexto Completo

Leia: `docs/projeto-context.md` e `docs/ESCOPO-SISTEMA.md`
