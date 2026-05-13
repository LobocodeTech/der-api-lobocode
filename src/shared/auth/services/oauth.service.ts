import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CaslAbilityService } from '../../casl/casl-ability/casl-ability.service';
import { packRules } from '@casl/ability/extra';
import { RefreshTokenService } from './refresh-token.service';
import { AuditService } from './audit.service';
import { IAuthResponse, ITokenPayload } from '../interfaces';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';

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
    private readonly auditService: AuditService,
  ) {}

  /**
   * Realiza login OAuth apenas para usuários já cadastrados.
   * 1. Valida existência de User por email
   * 2. Busca OAuthAccount existente e atualiza tokens
   * 3. Se não existir OAuthAccount, vincula provider ao User existente
   */
  async buscarOuCriarUserPorOAuth(data: OAuthUserData) {
    const { provider, providerId, picture, accessToken, refreshToken } = data;
    const normalizedEmail = data.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new UnauthorizedException(
        `Não foi possível identificar o email da conta ${provider.charAt(0).toUpperCase() + provider.slice(1)}.`,
      );
    }

    const userExistente = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if(!userExistente || userExistente.status !== UserStatus.ACTIVE || userExistente.deletedAt) {
      throw new UnauthorizedException(
        `Usuário não encontrado no sistema para a realização do login via ${provider.charAt(0).toUpperCase() + provider.slice(1)}.`,
      );
    }

    const contaExistente = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });

    if (contaExistente) {
      if (contaExistente.userId !== userExistente.id) {
        throw new UnauthorizedException(
          `Conta OAuth ${provider} já está vinculada a outro usuário na plataforma.`,
        );
      }
      await this.prisma.oAuthAccount.update({
        where: { id: contaExistente.id },
        data: { accessToken, refreshToken, email: normalizedEmail },
      });
      return contaExistente.user;
    }

    await this.prisma.oAuthAccount.create({
      data: {
        provider,
        providerId,
        email: normalizedEmail,
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

    this.logger.log(`OAuth vinculado ao usuário existente: ${normalizedEmail} via ${provider}`);
    return { ...userExistente, profilePicture: picture ?? userExistente.profilePicture };
  }

  /**
   * Gera o par de tokens JWT para um usuário autenticado via OAuth
   * e retorna a URL de redirecionamento para o frontend.
   */
  gerarTokensOAuth(
    user: Awaited<ReturnType<OAuthService['buscarOuCriarUserPorOAuth']>>,
    request?: Request,
    provider?: OAuthUserData['provider'],
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

    if (request) {
      void this.auditService.logLoginSuccess(user.id, request, {
        role: user.role,
        companyId: user.companyId,
        authMethod: 'oauth',
        ...(provider ? { oauthProvider: provider } : {}),
      });
    }

    return {
      access_token,
      refresh_token,
      expires_in: 2 * 60 * 60,
      token_type: 'Bearer',
      isPending: user.status === UserStatus.PENDING,
    };
  }
}
