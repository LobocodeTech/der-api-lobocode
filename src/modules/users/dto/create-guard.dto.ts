import { IsOptional } from 'class-validator';
import { Roles } from '@prisma/client';
import { IsCUID, IsExpectedRole } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';
import { BaseUserDto } from './base-user.dto';

export class CreateGuardDto extends BaseUserDto {
  @IsOptional()
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  companyId?: string;

  @IsExpectedRole(Roles.FIELD_TEAM, {
    message: VALIDATION_MESSAGES.REQUIRED.ROLE,
  })
  role: Roles; // Schema DEPARTAMENTO ESTADUAL DE RODOVIAS: mapeado para FIELD_TEAM
}
