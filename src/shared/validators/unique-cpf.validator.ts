// import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
// import { PrismaService } from '../prisma/prisma.service';
// import { VALIDATION_MESSAGES } from '../common/messages';

// export function IsUniqueCPF(validationOptions?: ValidationOptions) {
//   return function (object: Object, propertyName: string) {
//     registerDecorator({
//       name: 'isUniqueCPF',
//       target: object.constructor,
//       propertyName: propertyName,
//       options: validationOptions,
//       validator: {
//         async validate(value: any, args: ValidationArguments) {
//           if (!value) return true; // CPF é opcional

//           const prismaService = new PrismaService();

//           try {
//             // Busca por CPF no sistema
//             const existingUser = await prismaService.user.findFirst({
//               where: {
//                 cpf: value,
//                 deletedAt: null, // Não considerar usuários deletados
//               },
//             });

//             // Se não encontrou, CPF é único
//             return !existingUser;
//           } catch (error) {
//             // Em caso de erro, permite a validação passar
//             // (será validado novamente no service)
//             return true;
//           }
//         },
//         defaultMessage(args: ValidationArguments) {
//           return VALIDATION_MESSAGES.UNIQUENESS.CPF_EXISTS;
//         }
//       }
//     });
//   };
// }
