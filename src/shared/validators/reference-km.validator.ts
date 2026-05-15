import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const REFERENCE_KM_REGEX = /^\d{3,}\+\d{3,}$/;

@ValidatorConstraint({ name: 'isReferenceKm', async: false })
export class IsReferenceKmConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return REFERENCE_KM_REGEX.test(value.trim());
  }

  defaultMessage(): string {
    return 'KM deve estar no formato 000+000 (mínimo 3 dígitos antes e depois do +).';
  }
}

export function IsReferenceKm(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsReferenceKmConstraint,
    });
  };
}
