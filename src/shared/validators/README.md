# Decorators de Validação Customizados - Departamento de Estradas de Rodagem

## 📋 Visão Geral

Este módulo contém decorators customizados para validação de dados específicos do sistema Departamento de Estradas de Rodagem, seguindo padrões brasileiros e regras de negócio específicas.

## 🎯 Decorators Disponíveis

### **IsStrongPassword**

Valida senhas fortes com requisitos de segurança.

**Requisitos:**

- Mínimo 8 caracteres
- Pelo menos uma letra maiúscula
- Pelo menos uma letra minúscula
- Pelo menos um número
- Pelo menos um caractere especial

**Uso:**

```typescript
@IsStrongPassword({ message: 'Senha deve atender aos requisitos de segurança' })
password: string;
```

### **IsUniqueEmail**

Valida se o email é único dentro da empresa (contexto multi-tenant).

**Comportamento:**

- Verifica se o email já existe na empresa atual
- Não considera usuários deletados (soft delete)
- Permite emails duplicados entre empresas diferentes

**Uso:**

```typescript
@IsUniqueEmail({ message: 'Este email já está cadastrado na empresa' })
email: string;
```

### **IsUniqueCPF**

Valida se o CPF é único no sistema.

**Comportamento:**

- Verifica se o CPF já existe em todo o sistema
- Não considera usuários deletados
- CPF é único globalmente (não por empresa)

**Uso:**

```typescript
@IsUniqueCPF({ message: 'Este CPF já está cadastrado no sistema' })
cpf?: string;
```

### **IsCPF**

Valida formato e dígitos verificadores do CPF.

**Validações:**

- Formato correto (com ou sem pontuação)
- 11 dígitos
- Dígitos verificadores válidos
- Não permite CPFs com todos os dígitos iguais

**Uso:**

```typescript
@IsCPF({ message: 'CPF inválido' })
cpf?: string;
```

### **IsPhoneNumberBR**

Valida telefones brasileiros.

**Validações:**

- DDD válido (11-99)
- 10 ou 11 dígitos
- Formato brasileiro aceito
- Não permite números inválidos

**Uso:**

```typescript
@IsPhoneNumberBR({ message: 'Telefone deve estar no formato brasileiro' })
phone?: string;
```

## 🏗️ Exemplos de DTO

### **Admin**

```typescript
export class CreateAdminDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsUniqueEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsOptional()
  @IsPhoneNumberBR()
  phone?: string;
}
```

### **System Admin**

```typescript
export class CreateSystemAdminDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;
}
```

### **Others (FIELD_TEAM / C2C / ADMIN)**

```typescript
export class CreateOthersDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  @IsUniqueEmail()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsEnum(Roles)
  role: Roles;
}
```

## 🔧 Configuração

### **Importação**

```typescript
import {
  IsCPF,
  IsPhoneNumberBR,
  IsStrongPassword,
  IsUniqueEmail,
  IsUniqueCPF,
} from '../../../shared/validators';
```

### **Uso Global**

Os decorators são automaticamente aplicados quando o `ValidationPipe` global está configurado no `main.ts`.

## 📝 Mensagens de Erro

Todas as mensagens estão em português brasileiro e são específicas para o contexto do Departamento de Estradas de Rodagem:

- **Senha fraca**: "A senha deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula, uma minúscula, um número e um caractere especial"
- **Email duplicado**: "Este email já está cadastrado na empresa"
- **CPF inválido**: "CPF inválido"
- **CPF duplicado**: "Este CPF já está cadastrado no sistema"
- **Telefone inválido**: "Telefone deve estar no formato brasileiro: (XX) XXXXX-XXXX"

## 🚀 Próximos Passos

1. **Testes unitários** para cada decorator
2. **Validações específicas** por ambiente (dev/prod)
3. **Cache** para validações de unicidade
4. **Métricas** de validação
5. **Logs** de validações falhadas

## 📊 Benefícios

- ✅ **Consistência** - mesmo padrão em toda aplicação
- ✅ **Segurança** - validações robustas
- ✅ **UX** - mensagens claras em português
- ✅ **Manutenibilidade** - lógica centralizada
- ✅ **Multi-tenant** - isolamento por empresa
- ✅ **Performance** - validações otimizadas
