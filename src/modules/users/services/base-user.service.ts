import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { UserPermissionService } from './user-permission.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { Prisma, Roles } from '@prisma/client';
import { CrudAction } from '../../../shared/common/types';
import { NotFoundError, ConflictError } from '../../../shared/common/errors';
import { SUCCESS_MESSAGES } from '../../../shared/common/messages';
import { CreateOthersDto } from '../dto/create-others.dto';
import bcrypt from 'bcrypt';

@Injectable()
export class BaseUserService {
  constructor(
    protected readonly userRepository: UserRepository,
    protected readonly userValidator: UserValidator,
    protected readonly userQueryService: UserQueryService,
    protected readonly userPermissionService: UserPermissionService,
    protected targetRole?: Roles,
  ) {}

  // ============================================================================
  // 📋 MÉTODOS PÚBLICOS - CRUD BÁSICO
  // ============================================================================

  /**
   * Lista todos os usuários com paginação e ordenação
   */
  async buscarTodos(page = 1, limit = 20, orderBy = 'name', orderDirection: 'asc' | 'desc' = 'asc') {
    const whereClause = this.userQueryService.construirWhereClauseParaRead();
    const skip = (page - 1) * limit;
    
    // Configuração de ordenação
    const orderByConfig = {
      [orderBy]: orderDirection
    };
    
    const [users, total] = await Promise.all([
      this.userRepository.buscarMuitos(whereClause, { 
        skip, 
        take: limit,
        orderBy: orderByConfig
      } as any),
      this.userRepository.contar(whereClause),
    ]);

    const { totalPages, hasNextPage, hasPreviousPage } =
      this.calcularInformacoesDePaginacao(page, limit, total);

    const transformedData = this.transformData(users);

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
   * Busca usuários com filtro de pesquisa
   */
  async buscarUsuarios(query: string, page = 1, limit = 20, orderBy = 'name', orderDirection: 'asc' | 'desc' = 'asc') {
    const baseWhereClause = this.userQueryService.construirWhereClauseParaRead();
    
    // Adicionar filtros de pesquisa se query fornecida
    let whereClause = baseWhereClause;
    if (query && query.trim()) {
      const searchTerm = query.trim();
      whereClause = {
        ...baseWhereClause,
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { phone: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (page - 1) * limit;
    
    // Configuração de ordenação
    const orderByConfig = {
      [orderBy]: orderDirection
    };
    
    const [users, total] = await Promise.all([
      this.userRepository.buscarMuitos(whereClause, { 
        skip, 
        take: limit,
        orderBy: orderByConfig
      } as any),
      this.userRepository.contar(whereClause),
    ]);

    const { totalPages, hasNextPage, hasPreviousPage } =
      this.calcularInformacoesDePaginacao(page, limit, total);

    const transformedData = this.transformData(users);

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
   * Busca usuário por ID
   */
  async buscarPorId(id: string) {
    const whereClause = this.userQueryService.construirWhereClauseParaRead({
      id,
    });
    const user = await this.userRepository.buscarPrimeiro(whereClause);

    this.validarResultadoDaBusca(user, 'User', 'id', id);

    return { data: user };
  }

  /**
   * Busca usuário por email
   */
  async buscarUserPorEmail(email: string) {
    const whereClause = this.userQueryService.construirWhereClauseParaRead({
      email,
    });
    const user = await this.userRepository.buscarPrimeiro(whereClause);

    this.validarResultadoDaBusca(user, 'User', 'email', email);

    return { data: user };
  }

  /**
   * Busca usuários por empresa
   */
  async buscarUsersPorCompany(companyId: string) {
    const whereClause = this.userQueryService.construirWhereClauseParaRead({
      companyId,
    });
    const users = await this.userRepository.buscarMuitos(whereClause);

    return { data: users };
  }

  /**
   * Atualiza usuário
   */
  async atualizar(id: string, updateUserDto: UpdateUserDto) {
    const whereClause =
      this.userQueryService.construirWhereClauseParaUpdate(id);
    const user = await this.userRepository.buscarPrimeiro(whereClause);

    this.validarResultadoDaBusca(user, 'User', 'id', id);

    // Prepara dados para atualização (sem permissões)
    const { permissions, ...userData } = updateUserDto;
    const updateData = this.prepararDadosParaUpdate(userData);
    const emailAtualNormalizado = user?.email?.trim().toLowerCase();
    const loginAtualNormalizado = user?.login?.trim().toLowerCase();
    const novoEmailNormalizado = updateData.email?.trim().toLowerCase();
    const novoLoginNormalizado = updateData.login?.trim().toLowerCase();

    // Validações antes de atualizar (excluindo o próprio usuário)
    if (novoEmailNormalizado && novoEmailNormalizado !== emailAtualNormalizado) {
      await this.validarSeEmailEhUnico(novoEmailNormalizado, id);
      updateData.email = novoEmailNormalizado;
    }
    if (novoLoginNormalizado && novoLoginNormalizado !== loginAtualNormalizado) {
      await this.validarSeLoginEhUnico(novoLoginNormalizado, id);
      updateData.login = novoLoginNormalizado;
    }
    // if (updateData.cpf) {
    //   await this.validarSeCPFEhUnico(updateData.cpf, id);
    // }
    if (updateData.phone) {
      await this.validarSePhoneEhUnico(updateData.phone, id);
    }

    // Atualiza o usuário
    const updatedUser = await this.userRepository.atualizar({ id }, updateData);

    // Atualiza permissões se fornecidas
    if (permissions !== undefined) {
      await this.userRepository.atualizarPermissoesDoUsuario(id, permissions);
    }

    return this.removerCamposSensiveis(updatedUser);
  }

  /**
   * Soft delete - marca usuário como deletado
   */
  async desativar(id: string) {
    const whereClause =
      this.userQueryService.construirWhereClauseParaDelete(id);
    const user = await this.userRepository.buscarPrimeiro(whereClause);

    if (!user) {
      throw new NotFoundError('User', id, 'id');
    }

    await this.userValidator.validarSeUserPodeSerDeletado(id);

    // Soft delete - marca como deletado
    const result = await this.userRepository.atualizar(
      { id },
      { deletedAt: new Date() },
    );

    return {
      message: SUCCESS_MESSAGES.CRUD.DELETED,
      data: result,
    };
  }

  /**
   * Restaura usuário deletado (soft delete)
   */
  async reativar(id: string) {
    // Busca usuário deletado
    const whereClause =
      this.userQueryService.construirWhereClauseParaUpdate(id);
    const user = await this.userRepository.buscarPrimeiro({
      ...whereClause,
      deletedAt: { not: null }, // Só restaura se estiver deletado
    });

    if (!user) {
      throw new NotFoundError('User', id, 'id');
    }

    const result = await this.userRepository.atualizar(
      { id },
      { deletedAt: null },
    );

    return {
      message: SUCCESS_MESSAGES.CRUD.RESTORED,
      data: result,
    };
  }

  // ============================================================================
  // 🔐 MÉTODOS PÚBLICOS - VALIDAÇÕES AVANÇADAS (Opcional)
  // ============================================================================

  /**
   * Validação contextual para operações críticas
   * Útil para operações que precisam de contexto específico
   */
  async validarOperacaoCritica(user: any, action: CrudAction, context?: any) {
    return this.userPermissionService.validarContextual(user, action, context);
  }

  /**
   * Validação para operações de RH com restrições de horário
   */
  async validarOperacaoRH(user: any, action: CrudAction, context?: any) {
    return this.userPermissionService.validarOperacaoRH(user, action, context);
  }

  // ============================================================================
  // 📊 MÉTODOS PÚBLICOS - MÉTRICAS E AUDITORIA (Novo)
  // ============================================================================

  /**
   * Obtém métricas de permissões de usuário
   */
  obterMetricas(periodo?: { inicio: Date; fim: Date }) {
    return this.userPermissionService.obterMetricas(periodo);
  }

  /**
   * Obtém logs de auditoria de usuário
   */
  obterLogs(filtros?: any, limit = 100) {
    return this.userPermissionService.obterLogs(filtros, limit);
  }

  /**
   * Exporta logs de usuário para análise
   */
  exportarLogs(formato: 'json' | 'csv' = 'json') {
    return this.userPermissionService.exportarLogs(formato);
  }

  // ============================================================================
  // 🔧 MÉTODOS PROTEGIDOS - UTILITÁRIOS
  // ============================================================================

  /**
   * Valida se usuário existe
   */
  protected async validarSeUserExiste(id: string) {
    return this.userValidator.validarSeUserExiste(id);
  }

  /**
   * Valida se empresa existe
   */
  protected async validarSeCompanyExiste(companyId: string) {
    return this.userValidator.validarSeCompanyExiste(companyId);
  }

  /**
   * Valida se email é único
   */
  protected async validarSeEmailEhUnico(email: string, excludeUserId?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.userRepository.buscarPrimeiro({
      email: normalizedEmail,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    });

    if (existingUser) {
      throw new ConflictError('Email já está em uso');
    }
  }

  /**
   * Valida se login é único
   */
  protected async validarSeLoginEhUnico(login: string, excludeUserId?: string) {
    if (!login) return;
    
    const normalizedLogin = login.trim().toLowerCase();
    const existingUser = await this.userRepository.buscarPrimeiro({
      login: normalizedLogin,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    });
    
    if (existingUser) {
      throw new ConflictError('Este login já está cadastrado no sistema');
    }
  }

  /**
   * Valida se CPF é único
   */
  // protected async validarSeCPFEhUnico(cpf: string, excludeUserId?: string) {
  //   return this.userValidator.validarSeCPFEhUnico(cpf, excludeUserId);
  // }

  /**
   * Valida formato do telefone único
   */
  protected async validarSePhoneEhUnico(phone: string, excludeUserId?: string) {
    return this.userValidator.validarSePhoneEhUnico(phone, excludeUserId);
  }

  // ============================================================================
  // 🔧 MÉTODOS PRIVADOS - UTILITÁRIOS CENTRALIZADOS
  // ============================================================================

  /**
   * Prepara dados para atualização removendo campos vazios.
   * Campos em nullableFields aceitam null explícito (e.g. para remover profilePicture).
   */
  private prepararDadosParaUpdate(
    updateUserDto: UpdateUserDto,
  ): Record<string, any> {
    const updateData: Record<string, any> = {};
    const nullableFields = ['profilePicture'];

    Object.entries(updateUserDto).forEach(([key, value]) => {
      if (nullableFields.includes(key)) {
        if (value === null || value === '' || value === undefined) {
          updateData[key] = null;
        } else {
          updateData[key] = value;
        }
      } else if (value !== undefined && value !== null && value !== '') {
        updateData[key] = value;
      }
    });

    if (updateData.password)
      updateData.password = bcrypt.hashSync(updateData.password, 10);

    if (updateData.login)
      updateData.login = updateData.login.trim().toLowerCase();

    if (updateData.email)
      updateData.email = updateData.email.trim().toLowerCase();

    return updateData;
  }

  /**
   * Valida resultado da busca e lança erro se não encontrado
   */
  protected validarResultadoDaBusca(
    result: any,
    entity: string,
    identifier: string,
    value: string,
  ): any {
    if (!result) {
      throw new NotFoundError(entity, value, identifier);
    }
    return result;
  }

  /**
   * Calcula informações de paginação
   */
  private calcularInformacoesDePaginacao(
    page: number,
    limit: number,
    total: number,
  ) {
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return { totalPages, hasNextPage, hasPreviousPage };
  }

  /**
   * Transforma os dados dos usuários para o formato esperado pelo frontend
   */
  private transformData(users: any[]): any[] {
    return users.map((user) => ({
      ...this.removerCamposSensiveis(user),
      permissions:
        user.permissions?.map((permission: any) => permission.permissionType) ||
        [],
    }));
  }

  /**
   * Remove campos sensíveis do usuário antes de responder para o frontend.
   */
  private removerCamposSensiveis<T extends Record<string, any>>(user: T): Omit<T, 'password'> {
    const { password, ...safeUser } = user;
    return safeUser as Omit<T, 'password'>;
  }
}
