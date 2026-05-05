import { Transform } from 'class-transformer';
import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
} from 'class-validator';
import { IsCNPJ, IsPhoneNumberBR } from '../../validators';
import { VALIDATION_MESSAGES } from '../../common/messages';

function trimOrUndefined({ value }: { value: unknown }) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length ? t : undefined;
}

export class UpdateMyCompanyDto {
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  @MinLength(2, { message: VALIDATION_MESSAGES.LENGTH.NAME_MIN })
  name?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsCNPJ({ message: VALIDATION_MESSAGES.FORMAT.CNPJ_INVALID })
  cnpj?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  address?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MinLength(2, { message: VALIDATION_MESSAGES.LENGTH.NAME_MIN })
  contactName?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  contactEmail?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsPhoneNumberBR({ message: VALIDATION_MESSAGES.FORMAT.PHONE_INVALID })
  contactPhone?: string;
}
