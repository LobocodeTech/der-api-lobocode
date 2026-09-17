import { IsEmail, IsNotEmpty, IsString, Validate } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';
import { IsStrongPassword } from '../../../shared/validators';

export class ValidateForgotPasswordTokenDto {
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  email: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  token: string;
}

export class ForgotPasswordResetDto {
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  email: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  token: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @IsStrongPassword({ message: VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK })
  password: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @Validate(
    (value: string, args: { object: ForgotPasswordResetDto }) => {
      return value === args.object.password;
    },
    { message: 'Confirmação de senha deve ser igual à nova senha' },
  )
  confirmPassword: string;
}
