import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { IsStrongPassword, Match } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

/**
 * DTO dedicado à redefinição de senha do usuário.
 * Os campos só são validados quando `password` é enviado no payload.
 */
export class ResetUserPasswordDto {
  @IsOptional()
  @IsStrongPassword({ message: VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK })
  password?: string;

  @ValidateIf(
    (dto: ResetUserPasswordDto) =>
      dto.password !== undefined && dto.password !== null && dto.password !== '',
  )
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Match('password', { message: VALIDATION_MESSAGES.FORMAT.PASSWORD_MISMATCH })
  passwordConfirmation?: string;
}
