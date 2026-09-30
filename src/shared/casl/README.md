# 🔐 Módulo CASL Centralizado

Este módulo centraliza as validações de permissão usando CASL, com auditoria, contexto dinâmico e validação automática.

## 📁 Estrutura

```
src/shared/casl/
├── casl.module.ts                    # Módulo principal (Global)
├── casl.service.ts                   # Service genérico para validações
├── casl-ability/
│   └── casl-ability.service.ts       # Configuração das regras CASL
├── decorators/
│   └── casl.decorator.ts             # Decorators para validação automática
├── interceptors/
│   └── casl.interceptor.ts           # Interceptor automático
├── services/
│   ├── permission-context.service.ts # Validação contextual (empresa, horário)
│   └── permission-audit.service.ts   # Auditoria e métricas
└── README.md                         # Esta documentação
```

## 🚀 Como Usar

### 1. **Validação Manual (Básica)**

```typescript
import { CaslService } from 'src/shared/casl/casl.service';

@Injectable()
export class SeuService {
  constructor(private caslService: CaslService) {}

  async criarWorkOrder(dto: CreateWorkOrderDto) {
    this.caslService.validarAction('create', 'WorkOrder');
    // Lógica de criação...
  }
}
```

### 2. **Validação Automática com Decorators**

```typescript
import { CaslCreate, CaslUpdate, CaslRead } from 'src/shared/casl/decorators/casl.decorator';
import { UseInterceptors } from '@nestjs/common';
import { CaslInterceptor } from 'src/shared/casl/interceptors/casl.interceptor';

@Controller('work-orders')
@UseInterceptors(CaslInterceptor)
export class WorkOrderController {

  @Post()
  @CaslCreate('WorkOrder')
  async criar(@Body() dto: CreateWorkOrderDto) {
    return this.workOrderService.criar(dto);
  }

  @Patch(':id')
  @CaslUpdate('WorkOrder')
  async atualizar(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrderService.atualizar(id, dto);
  }

  @Get()
  @CaslRead('WorkOrder')
  async listar() {
    return this.workOrderService.buscarTodos();
  }
}
```

### 3. **Validação Contextual**

```typescript
import { PermissionContextService } from 'src/shared/casl/services/permission-context.service';

@Injectable()
export class WorkOrderService {
  constructor(private permissionContext: PermissionContextService) {}

  async criarComContexto(user: User, companyId: string) {
    const context = this.permissionContext.criarContexto(user, { companyId });

    const podeCriar = this.permissionContext.validarPermissaoContextual(
      context,
      {
        action: 'create',
        subject: 'WorkOrder',
        conditions: { companyId },
      },
    );

    if (!podeCriar) {
      throw new ForbiddenException('Sem permissão para criar OS');
    }
  }
}
```

### 4. **Auditoria de Permissões**

```typescript
import { PermissionAuditService } from 'src/shared/casl/services/permission-audit.service';

@Injectable()
export class SecurityService {
  constructor(private auditService: PermissionAuditService) {}

  async acessarRecurso(user: User, action: string, subject: string) {
    return this.auditService.validarComAuditoria(
      user,
      action as any,
      subject,
      {
        additionalContext: { endpoint: '/api/secure' },
      },
    );
  }
}
```

## 🎯 Decorators Disponíveis

| Decorator | Descrição | Exemplo |
|-----------|-----------|---------|
| `@CaslAction(action, subject)` | Validação básica | `@CaslAction('create', 'User')` |
| `@CaslCreate(subject)` | Criação | `@CaslCreate('WorkOrder')` |
| `@CaslRead(subject)` | Leitura | `@CaslRead('Planning')` |
| `@CaslUpdate(subject)` | Atualização | `@CaslUpdate('User')` |
| `@CaslDelete(subject)` | Exclusão | `@CaslDelete('Asset')` |
| `@CaslFields(subject, fields)` | Campos específicos | `@CaslFields('User', ['name', 'email'])` |
| `@CaslRole(action, subject, roles)` | Roles específicos | `@CaslRole('create', 'User', ['ADMIN'])` |

## 📊 Validação Contextual

O `PermissionContextService` permite validações baseadas em:

- **Horário**: restrições por período do dia
- **Empresa**: isolamento multi-tenant (`companyId`)
- **Role**: condições específicas de papel

## 👥 Roles DER

- `SYSTEM_ADMIN` — administrador da plataforma
- `ADMIN` — administrador da empresa
- `FIELD_TEAM` — equipe de campo
- `C2C` — centro de comando / operação

## 📦 Entidades CASL principais

`User`, `Company`, `Regional`, `Location`, `Asset`, `WorkOrder`, `Planning`, `Queue`

## 🔍 Auditoria e Métricas

O `PermissionAuditService` oferece logs de tentativas de acesso, métricas e exportação CSV/JSON.

---

**Dica**: use decorators para validação automática sempre que possível; reserve validação contextual para regras de empresa/horário.
