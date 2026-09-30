# Sistema de Mensagens Centralizadas - Departamento de Estradas de Rodagem

## 📋 Visão Geral

Este módulo centraliza todas as mensagens do sistema Departamento de Estradas de Rodagem, incluindo validações, erros, sucessos, logs e notificações. O sistema oferece consistência, manutenibilidade e suporte a interpolação de variáveis.

## 🎯 Características

- ✅ **Centralização** - Todas as mensagens em um local
- ✅ **Consistência** - Padrão único em toda aplicação
- ✅ **Interpolação** - Suporte a variáveis dinâmicas
- ✅ **Categorização** - Organização por tipo de mensagem
- ✅ **Manutenibilidade** - Fácil atualização e controle
- ✅ **Multi-idioma** - Preparado para internacionalização

## 🏗️ Estrutura

```
src/shared/common/messages/
├── messages.constants.ts    # Constantes com todas as mensagens
├── messages.service.ts      # Service para gerenciar mensagens
├── messages.module.ts       # Módulo NestJS
├── index.ts                 # Exportações
└── README.md               # Esta documentação
```

## 🔧 Como Usar

### **1. Importação**

```typescript
// Importar constantes
import {
  VALIDATION_MESSAGES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '../shared/common/messages';

// Importar service
import { MessagesService } from '../shared/common/messages';
```

### **2. Uso Direto das Constantes**

```typescript
// Em decorators
@IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
name: string;

// Em services
throw new NotFoundError(ERROR_MESSAGES.RESOURCE.NOT_FOUND);

// Em controllers
return { message: SUCCESS_MESSAGES.CRUD.CREATED };
```

### **3. Uso com MessagesService**

```typescript
@Injectable()
export class UsersService {
  constructor(private messagesService: MessagesService) {}

  async createUser(dto: CreateUserDto) {
    try {
      const user = await this.userRepository.create(dto);

      // Mensagem de sucesso com contexto
      const message = this.messagesService.getResourceMessage(
        'user',
        'created',
        {
          userId: user.id,
          companyId: user.companyId,
        },
      );

      return { user, message };
    } catch (error) {
      // Mensagem de erro específica
      const errorMessage = this.messagesService.getErrorMessage(
        'BUSINESS',
        'USER_ALREADY_EXISTS',
        {
          email: dto.email,
        },
      );

      throw new ConflictError(errorMessage);
    }
  }
}
```

### **4. Interpolação de Variáveis**

```typescript
// Template com variáveis
const template = 'Usuário {name} criado na empresa {companyName}';

// Contexto com valores
const context = {
  name: 'João Silva',
  companyName: 'Empresa ABC',
};

// Resultado: "Usuário João Silva criado na empresa Empresa ABC"
const message = this.messagesService.createCustomMessage(template, context);
```

## 📝 Categorias de Mensagens

### **1. Validação (VALIDATION_MESSAGES)**

```typescript
VALIDATION_MESSAGES.REQUIRED.NAME; // "Nome é obrigatório"
VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID; // "Email inválido"
VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS; // "Este email já está cadastrado"
VALIDATION_MESSAGES.LENGTH.NAME_MIN; // "Nome deve ter pelo menos 2 caracteres"
```

### **2. Erro (ERROR_MESSAGES)**

```typescript
ERROR_MESSAGES.AUTH.UNAUTHORIZED; // "Usuário não autenticado"
ERROR_MESSAGES.RESOURCE.NOT_FOUND; // "Recurso não encontrado"
ERROR_MESSAGES.BUSINESS.USER_ALREADY_EXISTS; // "Usuário já existe"
ERROR_MESSAGES.SYSTEM.INTERNAL_ERROR; // "Erro interno do servidor"
```

### **3. Sucesso (SUCCESS_MESSAGES)**

```typescript
SUCCESS_MESSAGES.CRUD.CREATED; // "Recurso criado com sucesso"
SUCCESS_MESSAGES.OPERATIONS.LOGIN_SUCCESS; // "Login realizado com sucesso"
SUCCESS_MESSAGES.VALIDATION.DATA_VALID; // "Dados válidos"
```

### **4. Log (LOG_MESSAGES)**

```typescript
LOG_MESSAGES.AUTH.LOGIN_ATTEMPT; // "Tentativa de login"
LOG_MESSAGES.OPERATIONS.CREATE; // "Recurso criado"
LOG_MESSAGES.SECURITY.UNAUTHORIZED_ACCESS; // "Tentativa de acesso não autorizado"
```

### **5. Notificação (NOTIFICATION_MESSAGES)**

```typescript
NOTIFICATION_MESSAGES.USER.WELCOME; // "Bem-vindo ao Departamento de Estradas de Rodagem!"
NOTIFICATION_MESSAGES.BUSINESS.WORK_ORDER_ASSIGNED; // "Ordem de serviço atribuída"
```

## 🎯 Exemplos Práticos

### **1. Em Decorators de Validação**

```typescript
// Antes
@IsString({ message: 'Nome é obrigatório' })
name: string;

// Depois
@IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
name: string;
```

### **2. Em Services**

```typescript
// Antes
throw new NotFoundError('Usuário não encontrado');

// Depois
throw new NotFoundError(ERROR_MESSAGES.RESOURCE.NOT_FOUND);
```

### **3. Em Controllers**

```typescript
// Antes
return { message: 'Usuário criado com sucesso', user };

// Depois
return {
  message: this.messagesService.getResourceMessage('user', 'created', {
    userId: user.id,
  }),
  user,
};
```

### **4. Em Logs**

```typescript
// Antes
this.logger.log('Usuário criado');

// Depois
this.logger.log(
  this.messagesService.getLogMessage('OPERATIONS', 'CREATE', {
    userId: user.id,
  }),
);
```

## 🔄 Migração dos Decorators

Todos os decorators customizados já foram atualizados para usar as mensagens centralizadas:

- ✅ `IsStrongPassword` - Usa `VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK`
- ✅ `IsUniqueEmail` - Usa `VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS`
- ✅ `IsUniqueCPF` - Usa `VALIDATION_MESSAGES.UNIQUENESS.CPF_EXISTS`
- ✅ `IsCPF` - Usa `VALIDATION_MESSAGES.FORMAT.CPF_INVALID`
- ✅ `IsPhoneNumberBR` - Usa `VALIDATION_MESSAGES.FORMAT.PHONE_INVALID`

## 🚀 Benefícios

### **1. Manutenibilidade**

- Mudanças centralizadas
- Consistência garantida
- Fácil localização

### **2. Consistência**

- Mesmo padrão em toda aplicação
- Mensagens padronizadas
- UX uniforme

### **3. Flexibilidade**

- Interpolação de variáveis
- Contexto dinâmico
- Mensagens personalizadas

### **4. Escalabilidade**

- Preparado para multi-idioma
- Fácil adição de novas mensagens
- Organização clara

## 📊 Métricas de Uso

O sistema permite rastrear:

- Mensagens mais usadas
- Padrões de erro
- Performance de validações
- UX por tipo de mensagem

## 🔮 Próximos Passos

1. **Migração gradual** - Atualizar services existentes
2. **Testes** - Validar todas as mensagens
3. **Métricas** - Implementar tracking de uso
4. **Multi-idioma** - Preparar para internacionalização
5. **Cache** - Otimizar performance

## 📝 Notas Importantes

- ✅ **Global** - MessagesModule é global, disponível em toda aplicação
- ✅ **Type-safe** - Todas as mensagens são tipadas
- ✅ **Performance** - Constantes são carregadas uma vez
- ✅ **Flexível** - Suporte a mensagens customizadas
- ✅ **Documentado** - Cada categoria tem propósito claro
