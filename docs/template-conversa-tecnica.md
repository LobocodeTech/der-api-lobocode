# Template para Conversas Técnicas — DER API

## Início de Conversa (Sempre usar)

```
Olá! Vou trabalhar no projeto der-api-lobocode (DER) **seguindo as regras do projeto**:

📋 **Contexto**:
- Projeto: Departamento de Estradas de Rodagem (gestão operacional de rodovias)
- Stack: NestJS + TypeScript + Prisma + PostgreSQL
- Arquitetura: Multi-tenant, Sistema de Roles, Modular

🔗 **Regras Obrigatórias**:
- Arquivo: `.cursor/rules/nestjs-rules.mdc`
- Documentação: `docs/NAMING_CONVENTIONS.md`
- Contexto Completo: `docs/projeto-context.md`

🎯 **Padrões Essenciais**:
- Métodos: `buscarUserPorId()`, `validarSeUserExiste()`, `criarNovoAdmin()`
- Entidades: `User`, `Company`, `Regional`, `WorkOrder`, `Planning`, `Queue`
- Propriedades: `id`, `name`, `email`, `companyId` (inglês)
- Arquitetura: Repository → Validator → Factory → Service → Controller
```

## Checklist de Implementação

### Antes de Qualquer Código

- [ ] Ler regras específicas no `.cursor/rules/nestjs-rules.mdc`
- [ ] Consultar `docs/projeto-context.md` para contexto de negócio
- [ ] Verificar `docs/NAMING_CONVENTIONS.md` para nomenclatura
- [ ] Entender o padrão arquitetural específico

### Durante Implementação

- [ ] Métodos em português (`buscarTodos`, `validarSeUserExiste`)
- [ ] Entidades em inglês (`User`, `Company`, `Regional`, `WorkOrder`)
- [ ] Seguir padrão Repository → Validator → Factory → Service → Controller
- [ ] Usar sistema de mensagens centralizadas
- [ ] Implementar filtros de erro específicos
- [ ] Documentar com JSDoc
- [ ] Criar testes unitários quando aplicável

### Validação Final

- [ ] Código segue as regras estabelecidas
- [ ] Nomenclatura está correta
- [ ] Arquitetura SOLID aplicada
- [ ] Padrões do projeto respeitados
- [ ] Documentação atualizada

## Frases Obrigatórias

### Sempre mencionar

- "Seguindo as regras do projeto"
- "Conforme estabelecido no `.cursor/rules/nestjs-rules.mdc`"
- "Aplicando os padrões do DER API"

### Exemplo

```
"Vou implementar esta funcionalidade **seguindo as regras do projeto**,
aplicando a arquitetura Repository → Validator → Factory → Service → Controller
e usando nomenclatura em português para métodos (`buscarTodos`, `validarSeUserExiste`)."
```

## Referências Rápidas

### Roles

- `SYSTEM_ADMIN`, `ADMIN`, `FIELD_TEAM`, `C2C`

### Validações Customizadas

- `@IsStrongPassword()`, `@IsUniqueEmail()`, `@IsUniqueCPF()`

### Filtros de Erro

- `TokenExpiredError`, `ValidationError`, `NotFoundError`

### CRUD Genérico

- `buscarTodos(page, limit)` - Lista com paginação
- `buscarPorId(id)` - Busca específica
- `criar(dto)` - Criação
- `atualizar(id, dto)` - Atualização
- `desativar(id)` - Soft delete

### Sistema de Mensagens

```typescript
VALIDATION_MESSAGES.REQUIRED.NAME;
ERROR_MESSAGES.RESOURCE.NOT_FOUND;
SUCCESS_MESSAGES.CRUD.CREATED;
```

## Comandos Úteis

### Desenvolvimento

```bash
npm run start:dev
npx prisma studio
npm run test
```

### Build

```bash
npm run build
npm run format
npm run lint
```

## Documentação Essencial

### Sempre consultar

1. `.cursor/rules/nestjs-rules.mdc` - Regras específicas
2. `docs/NAMING_CONVENTIONS.md` - Nomenclatura
3. `docs/projeto-context.md` - Contexto completo
4. `docs/cursor-helper.md` - Padrões essenciais
5. `docs/ESCOPO-SISTEMA.md` - Escopo de negócio

### Documentação por módulo

- `src/shared/common/filters/README.md` - Sistema de filtros
- `src/shared/auth/README.md` - Autenticação
- `src/modules/users/README.md` - Usuários

## Regras de Negócio (alto nível)

- Isolamento multi-tenant por `companyId`
- OS com escopo por regional/localidade quando aplicável
- Notificações via WebSocket/push para atividades de WorkOrder, Planning e Queue
- Documentos com destinatários tipados no Prisma (`DocumentRecipientType` — não renomear)

---

**Dica**: Este template garante alinhamento às regras do projeto, mesmo sem contexto anterior.

## Frase de Contextualização Completa

### Copie e cole sempre

```
Vou trabalhar no projeto der-api-lobocode (DER) seguindo as regras do projeto estabelecidas em .cursor/rules/nestjs-rules.mdc. Leia docs/cursor-helper.md para padrões essenciais, docs/projeto-context.md para contexto completo e docs/template-conversa-tecnica.md para estrutura. Aplique arquitetura Repository → Validator → Factory → Service → Controller, métodos em português (buscarTodos, validarSeUserExiste), entidades em inglês (User, Company, Regional, WorkOrder) e roles SYSTEM_ADMIN / ADMIN / FIELD_TEAM / C2C.
```
