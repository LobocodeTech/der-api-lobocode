import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { CreateGuardDto } from './dto/create-guard.dto';
import { CreateHRDto } from './dto/create-hr.dto';
import { CreatePostResidentDto } from './dto/create-post-resident.dto';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { CreatePostSupervisorDto } from './dto/create-post-supervisor.dto';
import { BaseUserService } from './services/base-user.service';
import { UserRepository } from './repositories/user.repository';
import { UserValidator } from './validators/user.validator';
import { UserQueryService } from './services/user-query.service';
import {
  SystemAdminService,
  AdminService,
  SupervisorService,
  GuardService,
  HRService,
  PostSupervisorService,
  PostResidentService,
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
    private supervisorService: SupervisorService,
    private guardService: GuardService,
    private hrService: HRService,
    private postSupervisorService: PostSupervisorService,
    private postResidentService: PostResidentService,
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

  //  Métodos de orquestração - delegam para serviços específicos
  async criarNovoSystemAdmin(dto: CreateSystemAdminDto) {
    return this.systemAdminService.criarNovoSystemAdmin(dto);
  }

  async criarNovoAdmin(dto: CreateAdminDto) {
    return this.adminService.criarNovoAdmin(dto);
  }

  /**
   * Cria usuário
   */
  //  Funcionalidades específicas de RH
  async criarNovoOthers(dto: CreateOthersDto) {
    // ✅ Validação de role hierárquico RESTAURADA
    this.userPermissionService.validarCriacaoDeUserComRole(dto.role);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    // Extrai membros do DTO antes de passar para o factory (que não conhece)
    const { fieldTeamMembers, ...userOnly } = dto;

    // Criação do usuário
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

  async criarNovoHR(dto: CreateHRDto) {
    return this.hrService.criarNovoHR(dto);
  }

  async criarNovoSupervisor(dto: CreateSupervisorDto) {
    return this.supervisorService.criarNovoSupervisor(dto);
  }

  async criarNovoGuard(dto: CreateGuardDto) {
    return this.guardService.criarNovoGuard(dto);
  }

  async criarNovoPostSupervisor(dto: CreatePostSupervisorDto) {
    return this.postSupervisorService.criarNovoPostSupervisor(dto);
  }

  async criarNovoPostResident(dto: CreatePostResidentDto) {
    return this.postResidentService.criarNovoPostResident(dto);
  }

  /**
   * Cria POST_SUPERVISOR via registro público (sem autenticação)
   */
  async criarPostSupervisorPublico(dto: CreatePostSupervisorDto) {
    return this.postSupervisorService.criarPostSupervisorPublico(dto);
  }

  /**
   * Cria POST_RESIDENT via registro público (sem autenticação)
   */
  async criarPostResidentPublico(dto: CreatePostResidentDto) {
    return this.postResidentService.criarPostResidentPublico(dto);
  }

  /**
   * Busca clientes (POST_SUPERVISOR e POST_RESIDENT) de um posto específico
   */
  async buscarClientesPorPosto(
    postId: string,
    page = 1,
    limit = 20,
    orderBy = 'name',
    orderDirection: 'asc' | 'desc' = 'asc',
  ) {
    const baseWhereClause =
      this.userQueryService.construirWhereClauseParaRead();
    const skip = (page - 1) * limit;

    // Configuração de ordenação
    const orderByConfig = {
      [orderBy]: orderDirection,
    };

    // Filtrar por roles (schema DEPARTAMENTO ESTADUAL DE RODOVIAS - sem Post/userPosts)
    const whereClause: Prisma.UserWhereInput = {
      ...baseWhereClause,
      role: {
        in: [Roles.FIELD_TEAM, Roles.C2C],
      },
    };

    const [users, total] = await Promise.all([
      this.userRepository.buscarMuitos(whereClause, {
        skip,
        take: limit,
        orderBy: orderByConfig,
      } as any),
      this.userRepository.contar(whereClause),
    ]);

    // Calcular informações de paginação manualmente
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    // Transformar dados dos usuários
    const transformedData = users.map((user) => ({
      ...user,
    }));

    return {
      data: transformedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
  }

  /**
   * Busca vigilantes ativos em turno no posto específico
   */
  async buscarVigilantesAtivosEmTurnoNoPosto(_postId: string) {
    // Schema DEPARTAMENTO ESTADUAL DE RODOVIAS: sem Shift/Post - retorna usuários ativos com role INSPETOR_VIA/OPERADOR
    const whereClause = this.userQueryService.construirWhereClauseParaRead({
      role: { in: [Roles.FIELD_TEAM, Roles.FIELD_TEAM] },
      status: UserStatus.ACTIVE,
    });

    const users = await this.userRepository.buscarMuitos(whereClause);

    // Transforma os dados dos usuários para o formato esperado pelo frontend
    return users.map((user) => ({
      ...user,
    }));
  }

  // Busca todos os motoristas ativos
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

    // Sincroniza membros conforme o role final:
    //  - Saiu de FIELD_TEAM → soft-deleta todos os ativos.
    //  - Voltou para FIELD_TEAM sem lista útil no payload → reativa soft-deleted
    //    (form costuma mandar [] porque a API não devolve deletados).
    //  - Já era FIELD_TEAM (ou voltou com membros no payload) → aplica diff.
    const roleFinal = dadosParaAtualizar.role ?? userBefore?.role;
    const voltandoParaFieldTeam =
      roleFinal === Roles.FIELD_TEAM &&
      userBefore?.role !== Roles.FIELD_TEAM;

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

    // Rebusca após o sync — `super.atualizar` retorna membros do estado anterior.
    const userAtualizado = await this.userRepository.buscarUnico({ id });
    return this.removerCamposSensiveis(userAtualizado!);
  }

  /**
   * Garante que a nova senha não seja igual à senha já armazenada no banco.
   * @throws ConflictError quando a nova senha coincide com a atual
   */
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
      userBefore?.status === UserStatus.ACTIVE &&
      userBefore.deletedAt === null;

    if (eraAtivo) {
      this.notificationService.revogarSessaoUsuario(id);
    }

    return result;
  }

  /**
   * Aplica diff de membros: cria/atualiza membros do payload via
   * `FieldTeamMemberService` (que reaproveita UniversalService); soft-deleta
   * (via `desativar`) membros ativos no banco que não aparecem no payload.
   *
   * Chamado após `super.atualizar()` e `userRepository.criar()`. Equivalente
   * semântico aos hooks `depoisDeCriar`/`depoisDeAtualizar` do `UniversalService`.
   */
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

  /**
   * Soft-deleta todos os membros ativos do User.
   * Chamado quando o user deixa de ser FIELD_TEAM.
   */
  private async softDeleteAllMembers(userId: string): Promise<void> {
    await this.prisma.fieldTeamMember.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Reativa todos os membros soft-deletados do User.
   * Chamado quando o user volta a ser FIELD_TEAM (e não há payload de diff).
   */
  private async reativarAllMembers(userId: string): Promise<void> {
    await this.prisma.fieldTeamMember.updateMany({
      where: { userId, NOT: { deletedAt: null } },
      data: { deletedAt: null },
    });
  }
}
