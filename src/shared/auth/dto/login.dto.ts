import { IsString, MinLength, IsNotEmpty } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class LoginDto {
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.LOGIN })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.LOGIN })
  login: string; // Pode ser email ou login do usuário

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @MinLength(6, { message: VALIDATION_MESSAGES.LENGTH.PASSWORD_MIN })
  password: string;
}
