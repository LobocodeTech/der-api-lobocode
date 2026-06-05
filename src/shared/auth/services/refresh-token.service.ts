import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IRefreshResponse } from '../interfaces';
import { MessagesService } from '../../common/messages/messages.service';
import { UnauthorizedError } from 'src/shared/common/errors';

function parseExpiresInToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    default:
      return 7 * 24 * 60 * 60;
  }
}

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly messagesService: MessagesService,
    private readonly configService: ConfigService,
  ) {}

  private getRefreshExpiresIn(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
  }

  private getAccessExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '7d');
  }

  /**
   * Gera um novo refresh token JWT
   */
  generate(user: any): { refresh_token: string; expires_in: number } {
    const expires_in = parseExpiresInToSeconds(this.getRefreshExpiresIn());
    const secret =
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'secret';

    const refresh_token = this.jwtService.sign(
      { sub: user.id },
      {
        secret,
        expiresIn: expires_in,
      },
    );

    return { refresh_token, expires_in };
  }

  /**
   * Valida e renova um refresh token JWT
   */
  refresh(refreshToken: string): IRefreshResponse {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'secret',
      });
      const access_token = this.jwtService.sign(
        { sub: payload.sub },
        {
          secret: process.env.JWT_SECRET || 'secret',
          expiresIn: parseExpiresInToSeconds(this.getAccessExpiresIn()),
        },
      );
      const { refresh_token, expires_in } = this.generate({ id: payload.sub });
      return {
        access_token,
        refresh_token,
        expires_in,
        token_type: 'Bearer',
        userId: payload.sub,
      };
    } catch (e) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'TOKEN_EXPIRED'),
      );
    }
  }

  /**
   * Revogação não é possível em modelo stateless
   */
  revoke(refreshToken: string): void {
    // Stateless: não faz nada
  }

  revokeAll(userId: string): void {
    // Stateless: não faz nada
  }

  isValid(refreshToken: string): boolean {
    try {
      this.jwtService.verify(refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'secret',
      });
      return true;
    } catch {
      return false;
    }
  }
}
