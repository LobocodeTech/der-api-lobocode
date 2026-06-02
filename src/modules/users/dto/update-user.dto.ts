import { OmitType, PartialType } from '@nestjs/mapped-types';
import { BaseUserDto } from './base-user.dto';
import { Roles } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';

/**
 * Update não usa @IsUniqueLogin/@IsUniqueEmail do BaseUserDto — em PATCH o próprio
 * registro falharia na validação assíncrona. Unicidade é checada no service.
 */
export class UpdateUserDto extends PartialType(
  OmitType(BaseUserDto, ['password', 'login', 'email'] as const),
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
}
