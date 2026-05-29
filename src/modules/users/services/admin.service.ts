import { Injectable } from '@nestjs/common';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { UserPermissionService } from './user-permission.service';
import { Roles } from '@prisma/client';

@Injectable()
export class AdminService extends BaseUserService {
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

  //  Funcionalidades específicas de administradores
  async criarNovoAdmin(dto: CreateAdminDto) {
    // ✅ Validação de role hierárquico RESTAURADA
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.ADMIN);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);
    if (dto.companyId) await this.validarSeCompanyExiste(dto.companyId);
    if (dto.phone) await this.validarSePhoneEhUnico(dto.phone);

    // Criação do usuário
    const userData = this.userFactory.criarAdmin(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  async buscarAdminsPorCompany(companyId: string) {
    return this.userRepository.buscarMuitos({ role: 'ADMIN' });
  }

  async obterEstatisticasDaCompany(companyId: string) {
    // TODO: Implementar estatísticas da empresa
    return {
      totalUsers: 0,
      totalPosts: 0,
      activePatrols: 0,
    };
  }
}
