import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { VALIDATION_MESSAGES } from '../common/messages';

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return false; // Senha é obrigatória
          return validateStrongPassword(value);
        },
        defaultMessage(args: ValidationArguments) {
          return VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK;
        },
      },
    });
  };
}

function validateStrongPassword(password: string): boolean {
  // Mínimo 8 caracteres
  if (password.length < 8) return false;

  // Pelo menos uma letra maiúscula
  if (!/[A-Z]/.test(password)) return false;

  // Pelo menos uma letra minúscula
  if (!/[a-z]/.test(password)) return false;

  // Pelo menos um número
  if (!/\d/.test(password)) return false;

  // Pelo menos um caractere especial
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) return false;

  return true;
}
