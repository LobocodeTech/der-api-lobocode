import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegionalStatus } from '@prisma/client';
import { IsCUID } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class RegionalAddressDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(180, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  street?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(30, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  number?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MaxLength(120, { message: VALIDATION_MESSAGES.LENGTH.MAX_LENGTH })
  city?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Matches(/^[A-Za-z]{2}$/, {
    message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID,
  })
  state?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Matches(/^\d{8}$/, {
    message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID,
  })
  postalCode?: string;
}

export class CreateRegionalsDto {
  @IsOptional()
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  companyId?: string;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  cgr: string;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  city: string;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: VALIDATION_MESSAGES.FORMAT.HEX_COLOR_INVALID,
  })
  color: string;

  @IsOptional()
  @IsEnum(RegionalStatus, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  status?: RegionalStatus;

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
  @ValidateNested()
  @Type(() => RegionalAddressDto)
  address?: RegionalAddressDto;
}
