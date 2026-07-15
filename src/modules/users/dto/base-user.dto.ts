import {
  IsString,
  IsEmail,
  MinLength,
  IsOptional,
  IsEnum,
  ValidateIf,
  ValidateNested,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IsCUID,
  IsPhoneNumberBR,
  IsStrongPassword,
  IsUniqueEmail,
  IsUniqueLogin,
} from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';
import { UserStatus } from '@prisma/client';
import { FieldTeamMemberInputDto } from './field-team-member.dto';
import { MAX_FIELD_TEAM_MEMBERS } from '../users.constants';

export class BaseUserDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  regionalId?: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.NAME })
  @MinLength(2, { message: VALIDATION_MESSAGES.LENGTH.NAME_MIN })
  name: string;

  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.LOGIN })
  @MinLength(3, { message: VALIDATION_MESSAGES.LENGTH.LOGIN_MIN })
  @ValidateIf(
    (dto: BaseUserDto) =>
      dto.login?.trim().toLowerCase() !== dto.email?.trim().toLowerCase(),
  )
  @IsUniqueLogin({ message: VALIDATION_MESSAGES.UNIQUENESS.LOGIN_EXISTS })
  login: string;

  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  @IsUniqueEmail({ message: VALIDATION_MESSAGES.UNIQUENESS.EMAIL_EXISTS })
  email: string;

  @IsStrongPassword({ message: VALIDATION_MESSAGES.FORMAT.PASSWORD_WEAK })
  password: string;

  @IsOptional()
  @IsPhoneNumberBR({ message: VALIDATION_MESSAGES.FORMAT.PHONE_INVALID })
  phone?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  address?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  profilePicture?: string;

  @IsOptional()
  @IsEnum(UserStatus, { message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID })
  status?: UserStatus;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  function?: string;

  /**
   * Membros da equipe de campo (input). Enviar só `name`/`level`;
   * `id` apenas se já persistido (PATCH). Timestamps vêm do backend.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FIELD_TEAM_MEMBERS, {
    message: `Limite de ${MAX_FIELD_TEAM_MEMBERS} membros por usuário excedido.`,
  })
  @ValidateNested({ each: true })
  @Type(() => FieldTeamMemberInputDto)
  fieldTeamMembers?: FieldTeamMemberInputDto[];
}
