import { Injectable } from '@nestjs/common';
import { CreatePostResidentDto } from '../dto/create-post-resident.dto';
import { BaseUserService } from './base-user.service';
import { UserFactory } from '../factories/user.factory';
import { UserRepository } from '../repositories/user.repository';
import { UserValidator } from '../validators/user.validator';
import { UserQueryService } from './user-query.service';
import { Roles } from '@prisma/client';
import { UserPermissionService } from './user-permission.service';
@Injectable()
export class PostResidentService extends BaseUserService {
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
  async criarNovoPostResident(dto: CreatePostResidentDto) {
    this.userPermissionService.validarCriacaoDeUserComRole(Roles.C2C);

    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    if (dto.phone) {
      await this.validarSePhoneEhUnico(dto.phone);
    }

    const userData = this.userFactory.criarPostResident(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  /**
   * Cria novo POST_RESIDENT via registro público (sem validação de permissões)
   * Usado para auto-cadastro via link de registro
   */
  async criarPostResidentPublico(dto: CreatePostResidentDto) {
    await this.validarUnicidadeParaCriacao(dto.email, dto.login);

    if (dto.phone) {
      await this.validarSePhoneEhUnico(dto.phone);
    }

    // Valida se postId existe e está ativo
    if (dto.postId) {
      await this.validarPostoExiste(dto.postId);
    }

    // Criação do usuário
    const userData = this.userFactory.criarPostResident(dto);
    const user = await this.userRepository.criar(userData);

    return user;
  }

  /**
   * Schema DEPARTAMENTO ESTADUAL DE RODOVIAS: sem modelo Post - validação desabilitada
   */
  private async validarPostoExiste(_postId: string): Promise<void> {
    // no-op
  }

  /**
   * Busca usuários por posto
   */
  async buscarUsersPorPost(postId: string) {
    // // Valida permissão para leitura
    // this.validarPermissaoDeRead();
    // // // Com a nova estrutura, precisamos buscar através da tabela UserPost
    // // const userPosts = await this.prisma.userPost.findMany({
    // //   where: { postId },
    // //   include: {
    // //     user: {
    // //       include: this.userRepository['defaultInclude'],
    // //     },
    // //   },
    // // });
    // const users = userPosts.map((up) => up.user);
    // return this.validarResultadoDaBusca(users, 'Users', 'postId', postId);
  }
}
