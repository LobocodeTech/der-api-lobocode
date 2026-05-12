import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { RegionalStatus } from '@prisma/client';
import { IsCUID } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';
import { Type } from 'class-transformer';

export class CreateLocationsDto {
  @IsOptional()
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  companyId?: string;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  regionalId: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  @MaxLength(50, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  code: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  @MaxLength(120, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  name: string;

  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(2, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  uf: string;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID },
  )
  referenceKm: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Min(-90, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Max(90, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Min(-180, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Max(180, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  longitude?: number;

  @IsOptional()
  @IsEnum(RegionalStatus, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  status?: RegionalStatus;
}
