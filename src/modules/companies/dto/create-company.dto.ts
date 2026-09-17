import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  IsUrl,
} from 'class-validator';
import { IsCNPJ, IsPhoneNumberBR } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

export class CreateCompanyDto {
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  @MinLength(2, { message: VALIDATION_MESSAGES.LENGTH.NAME_MIN })
  name: string;

  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsCNPJ({ message: VALIDATION_MESSAGES.FORMAT.CNPJ_INVALID })
  cnpj: string;

  @IsOptional()
  @IsUrl({}, { message: VALIDATION_MESSAGES.FORMAT.URL_INVALID })
  website?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  address?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  country?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @MinLength(2, { message: VALIDATION_MESSAGES.LENGTH.NAME_MIN })
  contactName?: string;

  @IsOptional()
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  contactEmail?: string;

  @IsOptional()
  @IsPhoneNumberBR({ message: VALIDATION_MESSAGES.FORMAT.PHONE_INVALID })
  contactPhone?: string;
}
