# Sistema de Notificações — DER

Sistema de notificações do **der-api-lobocode** (Departamento de Estradas de Rodagem). Cobre in-app, WebSocket e push, com destinatários resolvidos por regra de empresa.

## Visão Geral

| Peça | Papel |
|------|--------|
| **`NotificationService`** | Persistência e envio (WebSocket / e-mail / push) |
| **`NotificationHelper`** | API genérica (`entidadeCriada`, `entidadeAtualizada`, `notificar`, `notificarUsuarios`) |
| **`NotificationRecipientsService`** | Resolve destinatários via `getRecipients` |
| **`WorkOrderActivityNotificationService`** | Eventos de ciclo de vida e atribuição de OS |
| **`PlanningActivityNotificationService`** | Criação / atribuição / remoção em Planning |
| **`QueueActivityNotificationService`** | Associação / desassociação em Queue |
| **`NotificationGateway`** | Canal WebSocket em tempo real |

Não há helpers por entidade de domínio legado neste projeto. Use o `NotificationHelper` genérico ou os activity services acima (WorkOrder, Planning, Queue).

## Destinatários (`getRecipients`)

`NotificationRecipientsService.getRecipients(companyId, recipientType, rule?)` retorna IDs de usuários ativos da empresa:

| `RecipientType` | Comportamento |
|-----------------|---------------|
| **`ALL`** | Todos os usuários `ACTIVE` da empresa |
| **`ADMINS_ONLY`** | Apenas `ADMIN` e `SYSTEM_ADMIN` |
| **`SPECIFIC_USERS`** | IDs em `rule.userIds` |

```typescript
import { NotificationRecipientsService } from './shared/notification.recipients';

const ids = await this.recipientsService.getRecipients(companyId, 'ALL');
const admins = await this.recipientsService.getRecipients(companyId, 'ADMINS_ONLY');
const específicos = await this.recipientsService.getRecipients(
  companyId,
  'SPECIFIC_USERS',
  { type: 'SPECIFIC_USERS', userIds: ['user-1', 'user-2'] },
);
```

Os activity services ainda filtram por preferências do usuário (`ActivityNotificationPreferencesService`) e, no caso de Work Order, por escopo regional (`WorkOrderNotificationScopeService`).

## NotificationHelper (genérico)

```typescript
import { NotificationHelper } from '../notifications/notification.helper';

@Injectable()
export class MeuService {
  constructor(private readonly notificationHelper: NotificationHelper) {}

  async depoisDeCriar(resultado: { id: string; name: string }, userId: string, companyId: string) {
    await this.notificationHelper.entidadeCriada(
      'asset',
      resultado.id,
      resultado.name,
      userId,
      companyId,
    );
  }

  async notificarCustom() {
    await this.notificationHelper.notificar(
      'Título',
      'Mensagem',
      userId,
      companyId,
      'work-order',
      workOrderId,
    );
  }

  async notificarLista() {
    await this.notificationHelper.notificarUsuarios(
      ['userId1', 'userId2'],
      'Título',
      'Mensagem',
      'planning',
      planningId,
      criadoPorUserId,
      companyId,
    );
  }
}
```

## Activity notification services (domínio DER)

### Work Order

`WorkOrderActivityNotificationService` — atribuição, desatribuição e eventos de ciclo de vida (`started`, `paused`, `resumed`, `completed`, `submitted_for_review`, `approved`, `rejected`, `deleted`), com filtro de escopo da OS.

### Planning

`PlanningActivityNotificationService` — `notifyOnCreate` (destinatários `ALL` da empresa, exceto o ator), `notifyAssignment`, `notifyUnassignment`.

### Queue

`QueueActivityNotificationService` — `notifyAssociationOnCreate`, `notifyAssociationOnUpdate`, `notifyUnassociation` para usuários da fila.

## WebSocket

```typescript
import { io } from 'socket.io-client';

const socket = io('/notifications', { auth: { token: 'seu-jwt-token' } });

socket.on('new_notification', (notification) => {
  console.log('Nova notificação:', notification);
});

socket.on('unread_count_updated', (data) => {
  console.log('Não lidas:', data.unreadCount);
});
```

## Endpoints REST

```http
GET  /notifications?page=1&limit=20&isRead=false&entityType=work-order
GET  /notifications/unread-count
PUT  /notifications/:id/read
PUT  /notifications/read-all
```

## Segurança

- JWT obrigatório
- Isolamento por `companyId` (multi-tenant)
- Preferências de atividade e escopo regional aplicados nos fluxos de OS
