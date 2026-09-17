import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsPhoneNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return true; // Telefone é opcional
          return validatePhoneNumber(value);
        },
        defaultMessage(args: ValidationArguments) {
          return 'Telefone inválido. Use o formato: (XX) XXXXX-XXXX';
        },
      },
    });
  };
}

function validatePhoneNumber(phone: string): boolean {
  // Remove caracteres especiais
  const cleanPhone = phone.replace(/[^\d]/g, '');

  // Verifica se tem 10 ou 11 dígitos (com DDD)
  if (cleanPhone.length < 10 || cleanPhone.length > 11) return false;

  // Verifica se começa com DDD válido (11-99)
  const ddd = parseInt(cleanPhone.substring(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  // Verifica se o número não é composto apenas por zeros
  const number = cleanPhone.substring(2);
  if (/^0+$/.test(number)) return false;

  return true;
}
