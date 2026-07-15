import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TenantService } from '../../../shared/tenant/tenant.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UserRepository {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  //  Obter companyId do contexto atual
  private obterCompanyIdDoContexto(): string | null {
    const tenant = this.tenantService.getTenant();

    // Se for tenant global (SYSTEM_ADMIN), retorna null
    if (tenant?.isGlobal) {
      return null;
    }

    // Se for tenant temporário ou normal, retorna o companyId
    return tenant?.id || null;
  }

  //  Aplicar companyId automaticamente nos dados de criação
  private aplicarCompanyIdAosDadosDeCreate(
    data: Prisma.UserCreateInput,
  ): Prisma.UserCreateInput {
    const companyId = this.obterCompanyIdDoContexto();

    // Se não tem companyId no contexto, mantém o dos dados (para SYSTEM_ADMIN)
    if (!companyId) {
      return data;
    }

    // Se tem companyId no contexto, sobrescreve o dos dados
    return {
      ...data,
      company: {
        connect: { id: companyId },
      },
    };
  }

  // Includes padrão para User
  private get defaultInclude() {
    return {
      company: {
        select: {
          id: true,
          name: true,
          cnpj: true,
          address: true,
        },
      },
      fieldTeamMembers: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  async buscarMuitos(
    where: Prisma.UserWhereInput,
    options?: {
      skip?: number;
      take?: number;
      orderBy?: Prisma.UserOrderByWithRelationInput;
    },
    include?: Prisma.UserInclude,
  ) {
    return this.prisma.user.findMany({
      where,
      skip: options?.skip,
      take: options?.take,
      orderBy: options?.orderBy,
      include: include || this.defaultInclude,
    });
  }

  async buscarPrimeiro(
    where: Prisma.UserWhereInput,
    include?: Prisma.UserInclude,
  ) {
    return this.prisma.user.findFirst({
      where,
      include: include || this.defaultInclude,
    });
  }

  async buscarUnico(
    where: Prisma.UserWhereUniqueInput,
    include?: Prisma.UserInclude,
  ) {
    return this.prisma.user.findUnique({
      where,
      include: include || this.defaultInclude,
    });
  }

  async criar(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data: this.aplicarCompanyIdAosDadosDeCreate(data),
      include: this.defaultInclude,
    });
  }

  async atualizar(
    where: Prisma.UserWhereUniqueInput,
    data: Prisma.UserUpdateInput,
  ) {
    return this.prisma.user.update({
      where,
      data,
      include: this.defaultInclude,
    });
  }

  async deletar(where: Prisma.UserWhereUniqueInput) {
    return this.prisma.user.delete({
      where,
    });
  }

  async buscarUserComRelations(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async conectarUserAosPosts(_userId: string, _postIds: string[]) {
    // Schema DEPARTAMENTO ESTADUAL DE RODOVIAS: sem Post/UserPost - no-op para compatibilidade
    return { count: 0 };
  }

  async contar(where: Prisma.UserWhereInput) {
    return this.prisma.user.count({ where });
  }
}
