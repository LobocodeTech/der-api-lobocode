import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNameModel } from '../types';
import { TenantService } from 'src/shared/tenant';

@Injectable()
export class UniversalRepository<DtoCreate, DtoUpdate> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Repository universal que funciona para qualquer entidade
   */
  private buscarEntidade(entityName: EntityNameModel) {
    return this.prisma[entityName] as any;
  }

  /**
   * Buscar múltiplos registros
   */
  async buscarMuitos(
    entityName: EntityNameModel,
    where?: any,
    options?: { skip?: number; take?: number; orderBy?: any },
    include?: any,
  ): Promise<any[]> {
    return this.buscarEntidade(entityName).findMany({
      where,
      skip: options?.skip,
      take: options?.take,
      orderBy: options?.orderBy || { createdAt: 'desc' },
      include,
    });
  }

  /**
   * Buscar com paginação
   */
  async buscarComPaginacao(
    entityName: EntityNameModel,
    where?: any,
    page: number = 1,
    limit: number = 10,
    orderBy?: any,
    include?: any,
  ) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.buscarMuitos(
        entityName,
        where,
        { skip, take: limit, orderBy },
        include,
      ),
      this.contarTodos(entityName, where),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Buscar registro único
   */
  async buscarUnico(
    entityName: EntityNameModel,
    where: any,
    include?: any,
  ): Promise<any | null> {
    return this.buscarEntidade(entityName).findUnique({
      where,
      include,
    });
  }

  /**
   * Buscar primeiro registro que atenda aos critérios
   */
  async buscarPrimeiro(
    entityName: EntityNameModel,
    where: any,
    include?: any,
  ): Promise<any | null> {
    return this.buscarEntidade(entityName).findFirst({
      where,
      include,
    });
  }
  /**
   * Criar novo registro
   */
  async criar(
    entityName: EntityNameModel,
    data: DtoCreate,
    include?: any,
  ): Promise<any> {
    const transformedData = this.transformarDadosParaPrisma(
      this.aplicarCompanyIdAosDadosDeCreate(entityName, data),
    );

    return this.buscarEntidade(entityName).create({
      data: transformedData,
      include,
    });
  }

  /**
   * Atualizar registro existente
   */
  async atualizar(
    entityName: EntityNameModel,
    where: any,
    data: DtoUpdate,
    include?: any,
  ): Promise<any> {
    const transformedData = this.transformarDadosParaPrisma(data);

    return this.buscarEntidade(entityName).update({
      where,
      data: transformedData,
      include,
    });
  }

  /**
   * Deletar registro
   */
  async deletar(entityName: EntityNameModel, where: any): Promise<any> {
    return this.buscarEntidade(entityName).delete({
      where,
    });
  }

  /**
   * Contar registros
   */
  async contarTodos(entityName: EntityNameModel, where?: any): Promise<number> {
    return this.buscarEntidade(entityName).count({ where });
  }

  /**
   * Verificar se existe
   */
  async existe(entityName: EntityNameModel, where: any): Promise<boolean> {
    const count = await this.contarTodos(entityName, where);
    return count > 0;
  }

  /**
   * Soft delete (se a entidade tiver deletedAt)
   */
  async desativar(entityName: EntityNameModel, where: any): Promise<any> {
    return this.buscarEntidade(entityName).update({
      where,
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Restaurar soft delete
   */
  async reativar(entityName: EntityNameModel, where: any): Promise<any> {
    return this.buscarEntidade(entityName).update({
      where,
      data: { deletedAt: null },
    });
  }

  /**
   * Upsert - criar ou atualizar
   */
  async upsert(
    entityName: EntityNameModel,
    where: any,
    create: any,
    update: any,
    include?: any,
  ): Promise<any> {
    const transformedCreate = this.transformarDadosParaPrisma(
      this.aplicarCompanyIdAosDadosDeCreate(entityName, create),
    );
    const transformedUpdate = this.transformarDadosParaPrisma(update);

    return this.buscarEntidade(entityName).upsert({
      where,
      create: transformedCreate,
      update: transformedUpdate,
      include,
    });
  }

  /**
   * Deletar muitos
   */
  async deletarMuitos(entityName: EntityNameModel, where: any): Promise<any> {
    return this.buscarEntidade(entityName).deleteMany({
      where,
    });
  }

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

  /**
   * Transforma dados com campos "Id" em relacionamentos Prisma
   * Exemplo: { postId: "abc", userId: "xyz" } -> { post: { connect: { id: "abc" } }, user: { connect: { id: "xyz" } } }
   */
  private transformarDadosParaPrisma(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const transformedData = { ...data };

    // Detecta campos que terminam com "Id" e os transforma em relacionamentos
    Object.keys(data).forEach((key) => {
      if (!key.endsWith('Id')) return;

      const relationName = key.slice(0, -2); // Remove "Id" do final

      // Pula se já existe um relacionamento com esse nome
      if (transformedData[relationName]) return;

      if (data[key] !== null && data[key] !== undefined) {
        // Cria o relacionamento Prisma (connect)
        transformedData[relationName] = {
          connect: { id: data[key] },
        };
      } else {
        // Valor nulo: quebra a conexão para permitir edição (ex: remover dispacho da ocorrência)
        transformedData[relationName] = {
          disconnect: true,
        };
      }

      // Remove o campo original "Id"
      delete transformedData[key];
    });

    return transformedData;
  }

  /** Entidades que não possuem relação direta com Company (sem companyId no schema). */
  private static readonly ENTITIES_WITHOUT_COMPANY: EntityNameModel[] = [];

  //  Aplicar companyId automaticamente nos dados de criação
  private aplicarCompanyIdAosDadosDeCreate(
    entityName: EntityNameModel,
    data: any,
  ): any {
    if (UniversalRepository.ENTITIES_WITHOUT_COMPANY.includes(entityName)) {
      return data;
    }

    const companyId = this.obterCompanyIdDoContexto();

    // Se não tem companyId no contexto, mantém o dos dados (para SYSTEM_ADMIN)
    if (!companyId) {
      return data;
    }

    //  Remover companyId do data
    delete data.companyId;

    // Se tem companyId no contexto, sobrescreve o dos dados
    return {
      ...data,
      company: {
        connect: { id: companyId },
      },
    };
  }
}
