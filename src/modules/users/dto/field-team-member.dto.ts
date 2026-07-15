import { IsOptional, IsString, Length, IsNotEmpty } from 'class-validator';
import { IsCUID } from '../../../shared/validators';

/**
 * DTO de entrada — embutido em `BaseUserDto.fieldTeamMembers` / update.
 *
 * Aceita apenas `name`, `level` e `id` opcional (vindo do backend para PATCH).
 * Sem `createdAt`/`updatedAt`/`deletedAt`: gerados pelo Prisma.
 * Sem `deletedAt` no input: remoção é implícita via diff no backend.
 * Sem `companyId`: o UniversalRepository injeta automaticamente via tenant.
 */
export class FieldTeamMemberInputDto {
  /** Presente só em membros já persistidos — omitir na criação. */
  @IsOptional()
  @IsString()
  @IsCUID()
  id?: string;

  @IsString()
  @Length(1, 120)
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Length(1, 80)
  @IsNotEmpty()
  level!: string;
}

/**
 * DTO de saída — formato da resposta (Prisma/include). Não usar em validação de body.
 */
export class FieldTeamMemberResponseDto {
  id!: string;
  name!: string;
  level!: string;
  createdAt!: string;
  updatedAt!: string;
  deletedAt!: string | null;
}

/**
 * DTO de criação — consumido por `FieldTeamMemberService.criar()`.
 * Sem `id`: gerado automaticamente pelo Prisma (`cuid()`).
 */
export class CreateFieldTeamMemberDto {
  @IsString()
  @Length(1, 120)
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Length(1, 80)
  @IsNotEmpty()
  level!: string;

  @IsString()
  @IsNotEmpty()
  @IsCUID()
  userId!: string;
}

/**
 * DTO de atualização — consumido por `FieldTeamMemberService.atualizar()`.
 */
export class UpdateFieldTeamMemberDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  @IsNotEmpty()
  level?: string;
}
