import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChangeMyPasswordDto, LoginDto } from '../dto';
import { IAuthResponse } from '../interfaces';
import { RefreshTokenService } from './refresh-token.service';
import { AuditService } from './audit.service';
import { LoginService } from './login.service';
import { AuthValidator } from '../validators/auth.validator';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { UnauthorizedError, ValidationError } from '../../common/errors';
import { MessagesService } from '../../common/messages/messages.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
    private readonly loginService: LoginService,
    private readonly authValidator: AuthValidator,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly messagesService: MessagesService,
  ) {}

  async login(loginDto: LoginDto, request?: Request): Promise<IAuthResponse> {
    return this.loginService.login(loginDto, request);
  }

  /**
   * Renova o access token usando refresh token
   */
  async refresh(
    refreshToken: string,
    request?: Request,
  ): Promise<IAuthResponse> {
    const refreshResponse = this.refreshTokenService.refresh(refreshToken);

    // Validar se o usuário existe e está ativo
    const user = await this.authValidator.validateUserExists(refreshResponse.userId);

    if (request) {
      await this.auditService.logTokenRefresh(user.id, request, true);
    }

    return {
      access_token: refreshResponse.access_token,
      refresh_token: refreshResponse.refresh_token,
      expires_in: refreshResponse.expires_in,
      token_type: 'Bearer',
      // user: {
      //   id: user.id,
      //   name: user.name,
      //   email: user.email,
      //   role: user.role, 
      // },
    };
  }

  /**
   * Faz logout revogando o refresh token
   */
  async logout(refreshToken: string, request?: Request): Promise<void> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      if (request) {
        await this.auditService.logLogout(payload.sub, request, 'single');
      }
    } catch (error) {
      // Logout sempre retorna sucesso, mesmo se o token for inválido
      console.warn('Logout warning:', (error as Error).message);
    }
    await this.refreshTokenService.revoke(refreshToken);
  }

  /**
   * Faz logout em todos os dispositivos do usuário
   */
  async logoutAll(userId: string, request?: Request): Promise<void> {
    try {
      if (request) {
        await this.auditService.logLogout(userId, request, 'all');
      }
    } catch (error) {
      console.warn('Logout all warning:', (error as Error).message);
    }
    await this.refreshTokenService.revokeAll(userId);
  }

  async changeMyPassword(
    userId: string,
    dto: ChangeMyPasswordDto,
  ): Promise<{ message: string }> {
    const { currentPassword, newPassword, confirmPassword } = dto;

    if (newPassword !== confirmPassword) {
      throw new ValidationError('Confirmação de senha deve ser igual à nova senha');
    }

    if (currentPassword === newPassword) {
      throw new ValidationError('A nova senha deve ser diferente da senha atual');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true, password: true, deletedAt: true },
    });

    if (!user || user.status !== 'ACTIVE' || !user.password || user.deletedAt !== null) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'USER_NOT_FOUND'),
      );
    }

    const currentPasswordValid = await this.passwordService.verifyPassword(
      currentPassword,
      user.password,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedError('Senha atual inválida');
    }

    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, updatedAt: new Date() },
    });

    return { message: 'Senha alterada com sucesso' };
  }
}
