import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CaslAbilityService } from '../../casl/casl-ability/casl-ability.service';
import { packRules } from '@casl/ability/extra';
import { RefreshTokenService } from './refresh-token.service';
import { IAuthResponse, ITokenPayload } from '../interfaces';
import { Roles, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface OAuthUserData {
  provider: 'google' | 'microsoft';
  providerId: string;
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly abilityService: CaslAbilityService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  /**
   * Busca ou cria um usuário a partir de credenciais OAuth.
   * 1. Busca OAuthAccount existente → retorna usuário vinculado
   * 2. Busca User por email → vincula conta OAuth existente
   * 3. Cria novo User + OAuthAccount com status PENDING (aguarda aprovação)
   */
  async buscarOuCriarUserPorOAuth(data: OAuthUserData) {
    const { provider, providerId, email, name, picture, accessToken, refreshToken } = data;

    const contaExistente = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });

    if (contaExistente) {
      await this.prisma.oAuthAccount.update({
        where: { id: contaExistente.id },
        data: { accessToken, refreshToken, email },
      });
      return contaExistente.user;
    }

    const userExistente = await this.prisma.user.findUnique({
      where: { email },
    });

    if (userExistente) {
      await this.prisma.oAuthAccount.create({
        data: {
          provider,
          providerId,
          email,
          accessToken,
          refreshToken,
          userId: userExistente.id,
        },
      });

      if (picture && !userExistente.profilePicture) {
        await this.prisma.user.update({
          where: { id: userExistente.id },
          data: { profilePicture: picture },
        });
      }

      this.logger.log(`OAuth vinculado ao usuário existente: ${email} via ${provider}`);
      return { ...userExistente, profilePicture: picture ?? userExistente.profilePicture };
    }

    const novoLogin = email.split('@')[0] + '_' + randomUUID().substring(0, 6);

    const novoUser = await this.prisma.user.create({
      data: {
        name,
        email,
        login: novoLogin,
        password: '',
        role: Roles.C2C,
        status: UserStatus.ACTIVE,
        profilePicture: picture,
        oauthAccounts: {
          create: {
            provider,
            providerId,
            email,
            accessToken,
            refreshToken,
          },
        },
      },
    });

    this.logger.log(`Novo usuário criado via OAuth (${provider}): ${email} — status PENDING`);
    return novoUser;
  }

  /**
   * Gera o par de tokens JWT para um usuário autenticado via OAuth
   * e retorna a URL de redirecionamento para o frontend.
   */
  gerarTokensOAuth(
    user: Awaited<ReturnType<OAuthService['buscarOuCriarUserPorOAuth']>>,
  ): IAuthResponse & { isPending: boolean } {
    const ability = this.abilityService.createForUser(user);

    const payload: ITokenPayload = {
      name: user.name,
      email: user.email,
      role: user.role,
      sub: user.id,
    };

    const access_token = this.jwtService.sign(payload);
    const { refresh_token } = this.refreshTokenService.generate(user);

    return {
      access_token,
      refresh_token,
      expires_in: 2 * 60 * 60,
      token_type: 'Bearer',
      isPending: user.status === UserStatus.PENDING,
    };
  }
}
