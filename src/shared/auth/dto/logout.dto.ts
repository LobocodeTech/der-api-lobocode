import { IsString, IsNotEmpty } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class LogoutDto {
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  refreshToken: string;
}
