import { IntersectionType, OmitType, PartialType } from '@nestjs/mapped-types';
import { BaseUserDto } from './base-user.dto';
import { ResetUserPasswordDto } from './reset-user-password.dto';
import { Roles } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';
import { FieldTeamMemberInputDto } from './field-team-member.dto';
import { MAX_FIELD_TEAM_MEMBERS } from '../users.constants';

/**
 * Update não usa @IsUniqueLogin/@IsUniqueEmail do BaseUserDto — em PATCH o próprio
 * registro falharia na validação assíncrona. Unicidade é checada no service.
 * A redefinição de senha (password/passwordConfirmation) vem de ResetUserPasswordDto.
 *
 * `fieldTeamMembers` é redeclarado (não herda via PartialType): IntersectionType/
 * PartialType podem perder `@Type`/`ValidateNested` — sem isso o whitelist remove
 * o array e o sync de membros não roda.
 */
export class UpdateUserDto extends IntersectionType(
  PartialType(
    OmitType(BaseUserDto, [
      'password',
      'login',
      'email',
      'fieldTeamMembers',
    ] as const),
  ),
  ResetUserPasswordDto,
) {
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.REQUIRED.LOGIN })
  @MinLength(3, { message: VALIDATION_MESSAGES.LENGTH.LOGIN_MIN })
  login?: string;

  @IsOptional()
  @IsEmail({}, { message: VALIDATION_MESSAGES.FORMAT.EMAIL_INVALID })
  email?: string;

  @IsOptional()
  @IsEnum(Roles, { message: VALIDATION_MESSAGES.REQUIRED.ROLE })
  role?: Roles;

  /**
   * Estado completo desejado dos membros.
   * Sem id = criar; com id do backend = atualizar; ausentes = soft-delete.
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
