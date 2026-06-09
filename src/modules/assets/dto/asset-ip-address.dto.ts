import {
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class AssetIpAddressDto {
  @IsIP('4', { message: VALIDATION_MESSAGES.FORMAT.IP_INVALID })
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  ip: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(200, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  description?: string;
}
