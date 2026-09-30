import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { BaseUserService } from './services/base-user.service';
import { UserRepository } from './repositories/user.repository';
import { UserValidator } from './validators/user.validator';
import { UserQueryService } from './services/user-query.service';
import {
  SystemAdminService,
  AdminService,
  UserPermissionService,
} from './services';
import { CreateOthersDto } from './dto/create-others.dto';
import { Prisma, Roles, UserStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { FieldTeamMemberService } from './services/field-team-member.service';
import { FieldTeamMemberInputDto } from './dto/field-team-member.dto';
import { MAX_FIELD_TEAM_MEMBERS } from './users.constants';
import { UserFactory } from './factories/user.factory';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { TenantService } from '../../shared/tenant/tenant.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotificationService } from 'src/modules/notifications/shared/notification.service';
import { PasswordService } from 'src/shared/auth/services/password.service';
import { ConflictError } from 'src/shared/common/errors';
import { VALIDATION_MESSAGES } from 'src/shared/common/messages';

function montarRotuloResponsavelOs(
  name: string,
  regional: { cgr: string; city: string } | null | undefined,
): string {
  const nomeRegional = regional?.cgr?.trim() ?? '';
  const cidadeRegional = regional?.city?.trim() ?? '';
  const partes = [name.trim(), nomeRegional, cidadeRegional].filter(
    (parte) => parte.length > 0,
  );
  return partes.join(' - ');
}

@Injectable()
export class UsersService extends BaseUserService {
  constructor(
    userRepository: UserRepository,
    userValidator: UserValidator,
    userQueryService: UserQueryService,
    userPermissionService: UserPermissionService,
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private systemAdminService: SystemAdminService,
    private adminService: AdminService,
    private userFactory: UserFactory,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly passwordService: PasswordService,
    private readonly fieldTeamMemberService: FieldTeamMemberService,
  ) {
    super(
      userRepository,
      userValidator,
      userQueryService,
      userPermissionService,
    );
  }

  async criarNovoSystemAdmin(dto: CreateSystemAdminDto) {
    return this.systemAdminService.criarNovoSystemAdmin(dto);
  }

  async criarNovoAdmin(dto: CreateAdminDto) {
    return this.adminService.criarNovoAdmin(dto);
  }

  async criarNovoOthers(dto: CreateOthersDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(dto.role);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    const { fieldTeamMembers, ...userOnly } = dto;

    const userData = this.userFactory.criarOthers(userOnly as CreateOthersDto);
    const user = await this.userRepository.criar(
      userData as Prisma.UserCreateInput,
    );

    if (fieldTeamMembers && fieldTeamMembers.length > 0) {
      await this.applyMembersChange(user.id, fieldTeamMembers);
    }

    const userAtualizado = await this.userRepository.buscarUnico({
      id: user.id,
    });
    return this.removerCamposSensiveis(userAtualizado!);
  }

  async buscarTodosMotoristas() {
    const whereClause = { role: Roles.FIELD_TEAM, status: UserStatus.ACTIVE };
    return this.userRepository.buscarMuitos(whereClause);
  }

  /**
   * Responsáveis elegíveis para OS (toda a empresa). Com `locationId`, prioriza usuários
   * cuja regional coincide com a da localidade (depois ordena por nome).
   */
  async buscarTodosResponsaveisPorOrdensDeServico(locationId?: string) {
    const companyId = this.tenantService.getCompanyId();

    let regionalPrioridadeId: string | null = null;
    const lid = locationId?.trim();
    if (lid) {
      const loc = await this.prisma.location.findFirst({
        where: {
          id: lid,
          deletedAt: null,
          ...(companyId ? { companyId } : {}),
        },
        select: { regionalId: true },
      });
      regionalPrioridadeId = loc?.regionalId ?? null;
    }

    const whereClause: Prisma.UserWhereInput = {
      role: { in: [Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C] },
      status: UserStatus.ACTIVE,
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };

    const includeAssignee: Prisma.UserInclude = {
      company: {
        select: { id: true, name: true, cnpj: true, address: true },
      },
      regional: {
        select: { id: true, cgr: true, city: true, color: true },
      },
    };

    let users = (await this.userRepository.buscarMuitos(
      whereClause,
      undefined,
      includeAssignee,
    )) as Prisma.UserGetPayload<{ include: typeof includeAssignee }>[];

    if (regionalPrioridadeId) {
      users = [...users].sort((a, b) => {
        const ap = a.regionalId === regionalPrioridadeId ? 0 : 1;
        const bp = b.regionalId === regionalPrioridadeId ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      });
    } else {
      users = [...users].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      );
    }

    return users.map((u) => {
      const regional = u.regional;
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        label: montarRotuloResponsavelOs(u.name, regional),
        regionalId: u.regionalId,
        regionalName: regional?.cgr ?? null,
        city: regional?.city ?? null,
        regionalColor: regional?.color ?? null,
      };
    });
  }

  /**
   * Criadores elegíveis para filtro de OS (exclui equipe de campo — não cria OS).
   */
  async buscarTodosCriadoresPorOrdensDeServico() {
    const companyId = this.tenantService.getCompanyId();

    const whereClause: Prisma.UserWhereInput = {
      role: { not: Roles.FIELD_TEAM },
      status: UserStatus.ACTIVE,
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };

    const users = await this.userRepository.buscarMuitos(whereClause);

    return [...users]
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        login: u.login,
      }));
  }

  async atualizar(id: string, updateUserDto: UpdateUserDto) {
    const { passwordConfirmation, password, fieldTeamMembers, ...rest } =
      updateUserDto;
    const dadosParaAtualizar: UpdateUserDto = { ...rest };

    const whereClause =
      this.userQueryService.construirWhereClauseParaUpdate(id);
    const userBefore = await this.userRepository.buscarPrimeiro(whereClause);

    if (password) {
      await this.validarSeNovaSenhaEhDiferenteDaAtual(
        password,
        userBefore?.password,
      );
      dadosParaAtualizar.password =
        await this.passwordService.hashPassword(password);
    }

    await super.atualizar(id, dadosParaAtualizar);

    const roleFinal = dadosParaAtualizar.role ?? userBefore?.role;
    const voltandoParaFieldTeam =
      roleFinal === Roles.FIELD_TEAM && userBefore?.role !== Roles.FIELD_TEAM;

    if (roleFinal !== Roles.FIELD_TEAM) {
      await this.softDeleteAllMembers(id);
    } else if (
      voltandoParaFieldTeam &&
      (fieldTeamMembers === undefined || fieldTeamMembers.length === 0)
    ) {
      await this.reativarAllMembers(id);
    } else if (fieldTeamMembers !== undefined) {
      await this.applyMembersChange(id, fieldTeamMembers);
    }

    const desativouConta =
      userBefore?.status === UserStatus.ACTIVE &&
      updateUserDto.status === UserStatus.INACTIVE;

    if (desativouConta) {
      this.notificationService.revogarSessaoUsuario(id);
    }

    const userAtualizado = await this.userRepository.buscarUnico({ id });
    return this.removerCamposSensiveis(userAtualizado!);
  }

  private async validarSeNovaSenhaEhDiferenteDaAtual(
    novaSenha: string,
    hashAtual?: string | null,
  ): Promise<void> {
    if (!hashAtual) {
      return;
    }
    const ehIgualASenhaAtual = await this.passwordService.verifyPassword(
      novaSenha,
      hashAtual,
    );
    if (ehIgualASenhaAtual) {
      throw new ConflictError(
        VALIDATION_MESSAGES.FORMAT.PASSWORD_SAME_AS_CURRENT,
      );
    }
  }

  async desativar(id: string) {
    const whereClause =
      this.userQueryService.construirWhereClauseParaDelete(id);
    const userBefore = await this.userRepository.buscarPrimeiro(whereClause);
    const result = await super.desativar(id);

    const eraAtivo =
      userBefore?.status === UserStatus.ACTIVE && userBefore.deletedAt === null;

    if (eraAtivo) {
      this.notificationService.revogarSessaoUsuario(id);
    }

    return result;
  }

  private async applyMembersChange(
    userId: string,
    inputs: FieldTeamMemberInputDto[],
  ): Promise<void> {
    if (inputs.length > MAX_FIELD_TEAM_MEMBERS) {
      throw new BadRequestException(
        `Limite de ${MAX_FIELD_TEAM_MEMBERS} membros ativos por usuário excedido.`,
      );
    }

    const existentes = await this.prisma.fieldTeamMember.findMany({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    const ativosAtuaisIds = new Set(existentes.map((e) => e.id));

    for (const input of inputs) {
      if (!input.id) {
        await this.fieldTeamMemberService.criar({
          name: input.name.trim(),
          level: input.level.trim(),
          userId,
        });
        continue;
      }
      if (!ativosAtuaisIds.has(input.id)) {
        throw new BadRequestException(
          `Membro ${input.id} não pertence a este usuário.`,
        );
      }
      await this.fieldTeamMemberService.atualizar(input.id, {
        name: input.name.trim(),
        level: input.level.trim(),
      });
    }

    const idsNoPayload = new Set(inputs.map((i) => i.id).filter(Boolean));
    const orfaos = existentes.filter((e) => !idsNoPayload.has(e.id));
    for (const orfao of orfaos) {
      await this.fieldTeamMemberService.desativar(orfao.id);
    }
  }

  private async softDeleteAllMembers(userId: string): Promise<void> {
    await this.prisma.fieldTeamMember.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async reativarAllMembers(userId: string): Promise<void> {
    await this.prisma.fieldTeamMember.updateMany({
      where: { userId, NOT: { deletedAt: null } },
      data: { deletedAt: null },
    });
  }
}
