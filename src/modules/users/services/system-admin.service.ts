import { Injectable } from '@nestjs/common';
import { CreateSystemAdminDto } from '../dto/create-system-admin.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service'; 
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';

@Injectable()
export class SystemAdminService extends BaseUserService {
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
      Roles.SYSTEM_ADMIN,
    );
  }

  //  Funcionalidades específicas de administradores da plataforma
    async criarNovoSystemAdmin(dto: CreateSystemAdminDto) {
    // ✅ Validação de role hierárquico RESTAURADA
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.SYSTEM_ADMIN);
 
    await this.validarUnicidadeParaCriacao(dto.email, dto.login);
    // Criação do usuário
    const userData = this.userFactory.criarSystemAdmin(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  async buscarTodosOsPlatformAdmins() {
    return this.userRepository.buscarMuitos({ role: Roles.SYSTEM_ADMIN });
  }

  async obterEstatisticasDoSistema() {
    // TODO: Implementar estatísticas do sistema
    return {
      totalUsers: 0,
      totalCompanies: 0,
      totalPosts: 0,
      activePatrols: 0,
    };
  }

  async obterLogsDoSistema(startDate?: Date, endDate?: Date) {
    // TODO: Implementar logs do sistema
    return [];
  }

  async gerenciarConfiguracoesDoSistema(settings: any) {
    // TODO: Implementar gerenciamento de configurações
    return { success: true };
  }

  async fazerBackupDoSistema() {
    // TODO: Implementar backup do sistema
    return { backupId: 'backup-123' };
  }

  async restaurarSistema(backupId: string) {
    // TODO: Implementar restauração do sistema
    return { success: true };
  }

}
