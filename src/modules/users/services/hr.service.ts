import { Injectable } from '@nestjs/common';
import { CreateHRDto } from '../dto/create-hr.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';

@Injectable()
export class HRService extends BaseUserService {
  constructor(
    userRepository: UserRepository,
    userValidator: UserValidator,
    userQueryService: UserQueryService,
    userPermissionService: UserPermissionService,
    private userFactory: UserFactory,
  ) {
    super(
      userRepository,
      userValidator,
      userQueryService,
      userPermissionService,
      Roles.ADMIN,
    );
  }

  //  Funcionalidades específicas (schema DEPARTAMENTO ESTADUAL DE RODOVIAS: mapeado para ADMIN)
  async criarNovoHR(dto: CreateHRDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.ADMIN);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    // Criação do usuário
    const userData = this.userFactory.criarHR(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  async buscarHRsPorCompany(companyId: string) {
    return this.userRepository.buscarMuitos({ role: Roles.ADMIN });
  }

  async obterListaDeEmployees(companyId: string, filters?: any) {
    // TODO: Implementar lista de funcionários com filtros
    const whereClause: any = { companyId, active: true };

    if (filters?.role) whereClause.role = filters.role;
    if (filters?.postId) whereClause.postId = filters.postId;
    if (filters?.active !== undefined) whereClause.active = filters.active;

    return this.userRepository.buscarMuitos(whereClause);
  }

  async obterDetalhesDoEmployee(employeeId: string) {
    // TODO: Implementar detalhes completos do funcionário
    return this.userRepository.buscarUnico({ id: employeeId });
  }

  async atualizarStatusDoEmployee(employeeId: string, status: any) {
    // TODO: Implementar atualização de status do funcionário
    return this.atualizar(employeeId, status);
  }

  async obterRelatoriosDeEmployees(
    companyId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // TODO: Implementar relatórios de funcionários
    return [];
  }
}
