import { ArrayNotEmpty, IsArray } from 'class-validator';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';
import { IsCUID } from 'src/shared/validators';

export class ReorderIpLocationsDto {
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  locationId: string;

  @IsArray({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @ArrayNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsCUID({ each: true, message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  orderedIds: string[];
}
