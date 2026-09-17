import { IsEmail } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class ForgotPasswordDto {
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  email: string;
}
