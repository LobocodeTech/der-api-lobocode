import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsCUID(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isCUID',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return true; // CUID é opcional

          if (typeof value !== 'string') {
            return false;
          }

          // CUID pattern: starts with 'c', followed by 25 alphanumeric characters
          const cuidPattern = /^c[a-z0-9]{24}$/;
          return cuidPattern.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return 'ID inválido';
        },
      },
    });
  };
}
