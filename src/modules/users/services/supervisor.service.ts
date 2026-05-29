import { Injectable } from '@nestjs/common';
import { CreateSupervisorDto } from '../dto/create-supervisor.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';

@Injectable()
export class SupervisorService extends BaseUserService {
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
      Roles.C2C,
    );
  }

  //  Funcionalidades específicas (schema DEPARTAMENTO ESTADUAL DE RODOVIAS: mapeado para OPERADOR)
  async criarNovoSupervisor(dto: CreateSupervisorDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.C2C);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    // Criação do usuário
    const userData = this.userFactory.criarSupervisor(dto);
    const user = await this.userRepository.criar(userData);
    return user;
  }
}
