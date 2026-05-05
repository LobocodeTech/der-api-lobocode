import { IsNotEmpty, IsString } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';
import { IsStrongPassword } from '../../../shared/validators';

export class ChangeMyPasswordDto {
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  currentPassword: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @IsStrongPassword({ message: VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK })
  newPassword: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.PASSWORD })
  confirmPassword: string;
}
