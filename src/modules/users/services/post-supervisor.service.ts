import { Injectable } from '@nestjs/common';
import { CreatePostSupervisorDto } from '../dto/create-post-supervisor.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';
@Injectable()
export class PostSupervisorService extends BaseUserService {
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
  async criarNovoPostSupervisor(dto: CreatePostSupervisorDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.C2C);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    if (dto.phone) {
      await this.validarSePhoneEhUnico(dto.phone);
    }

    const userData = this.userFactory.criarPostSupervisor(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  /**
   * Cria novo POST_SUPERVISOR via registro público (sem validação de permissões)
   * Usado para auto-cadastro via link de registro
   */
  async criarPostSupervisorPublico(dto: CreatePostSupervisorDto) {
    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    if (dto.phone) {
      await this.validarSePhoneEhUnico(dto.phone);
    }

    // Valida se postId existe e está ativo
    if (dto.postId) {
      await this.validarPostoExiste(dto.postId);
    }

    // Criação do usuário
    const userData = this.userFactory.criarPostSupervisor(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  /**
   * Schema DEPARTAMENTO ESTADUAL DE RODOVIAS: sem modelo Post - validação desabilitada
   */
  private async validarPostoExiste(_postId: string): Promise<void> {
    // no-op
  }
}
