import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { VALIDATION_MESSAGES } from '../common/messages';

export function IsUniqueEmail(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isUniqueEmail',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        async validate(value: unknown) {
          if (typeof value !== 'string' || !value.trim()) return false;

          const email = value.trim().toLowerCase();
          const prismaService = new PrismaService();

          try {
            const existingUser = await prismaService.user.findFirst({
              where: { email },
            });
            return !existingUser;
          } catch {
            return false;
          } finally {
            await prismaService.$disconnect();
          }
        },
        defaultMessage(_args: ValidationArguments) {
          return VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS;
        },
      },
    });
  };
}
