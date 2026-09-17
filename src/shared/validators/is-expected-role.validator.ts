import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Roles } from '@prisma/client';

export function IsExpectedRole(
  expectedRole: Roles,
  validationOptions?: ValidationOptions,
) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isExpectedRole',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }

          // Verifica se o role enviado corresponde ao role esperado
          return value === expectedRole;
        },
        defaultMessage(args: ValidationArguments) {
          return `Role deve ser ${expectedRole}`;
        },
      },
    });
  };
}
