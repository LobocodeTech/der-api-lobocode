import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { VALIDATION_MESSAGES } from '../common/messages';

export function IsPhoneNumberBR(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumberBR',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value == null || value === '') return true;
          if (typeof value !== 'string') return false;

          return validatePhoneNumberBR(value);
        },
        defaultMessage(args: ValidationArguments) {
          const message = VALIDATION_MESSAGES.FORMAT.PHONE_INVALID;
          return message;
        },
      },
    });
  };
}

/** Exportado para testes unitários. */
export function validatePhoneNumberBR(phone: string): boolean {
  if (typeof phone !== 'string' || !phone.trim()) return true;

  const cleanPhone = phone.replace(/[^\d]/g, '');

  if (cleanPhone.length < 10 || cleanPhone.length > 11) return false;

  const ddd = parseInt(cleanPhone.substring(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;

  const subscriber = cleanPhone.substring(2);
  if (/^0+$/.test(subscriber)) return false;

  // Rejeita só quando os 10/11 dígitos são idênticos (ex.: 11111111111).
  // Não rejeita (11) 99999-9999: após o DDD o 9 repetido é máscara comum.
  if (/^(\d)\1+$/.test(cleanPhone)) return false;

  if (cleanPhone.length === 11 && subscriber[0] !== '9') return false;

  return true;
}
