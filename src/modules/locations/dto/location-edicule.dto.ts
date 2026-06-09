import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

type HasEdiculeCarrier = { hasEdicule?: boolean };

const whenHasEdicule = (object: HasEdiculeCarrier) => object.hasEdicule === true;

export class LocationEdiculeDto {
  @ValidateIf(whenHasEdicule)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(8, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculePostalCode?: string | null;

  @ValidateIf(whenHasEdicule)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(200, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculeStreet?: string | null;

  @ValidateIf(whenHasEdicule)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(20, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculeNumber?: string | null;

  @ValidateIf(whenHasEdicule)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(120, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculeCity?: string | null;

  @ValidateIf(whenHasEdicule)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(200, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculeLegalName?: string | null;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(200, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  ediculeObservation?: string | null;
}
