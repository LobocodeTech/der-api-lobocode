import { Injectable } from '@nestjs/common';
import { CreateGuardDto } from '../dto/create-guard.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';

@Injectable()
export class GuardService extends BaseUserService {
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
      Roles.FIELD_TEAM,
    );
  }

  //  Funcionalidades específicas (schema DEPARTAMENTO ESTADUAL DE RODOVIAS: mapeado para INSPETOR_VIA)
  async criarNovoGuard(dto: CreateGuardDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.FIELD_TEAM);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    // Criação do usuário
    const userData = this.userFactory.criarGuard(dto);
    const user = await this.userRepository.criar(userData);
    return user;
  }
}
