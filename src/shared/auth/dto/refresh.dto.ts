import { IsString, IsNotEmpty } from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class RefreshDto {
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  refreshToken: string;
}
