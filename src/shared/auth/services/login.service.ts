import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CaslAbilityService } from '../../casl/casl-ability/casl-ability.service';
import { packRules } from '@casl/ability/extra';
import { LoginDto } from '../dto/login.dto';
import { IAuthResponse, ITokenPayload } from '../interfaces';
import { RefreshTokenService } from './refresh-token.service';
import { AuditService } from './audit.service';
import { SecurityService } from './security.service';
import { AuthValidator } from '../validators/auth.validator';
import { MessagesService } from '../../common/messages/messages.service';
import { Request } from 'express';

@Injectable()
export class LoginService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly abilityService: CaslAbilityService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly auditService: AuditService,
    private readonly securityService: SecurityService,
    private readonly authValidator: AuthValidator
  ) {}

  /**
   * Realiza login do usuário
   */
  async login(loginDto: LoginDto, request?: Request): Promise<IAuthResponse> {
    try {
      // Validar credenciais usando AuthValidator
      const user = await this.authValidator.validateCredentials(loginDto);

      // Análise de segurança se request estiver disponível
      if (request) {
        const securityEvents = await this.securityService.analyzeLoginActivity(
          user.id,
          request,
          true,
        );

        if (securityEvents.length > 0) {
          await this.securityService.processSecurityEvents(
            securityEvents,
            request,
          );
        }
      }

      // Criar payload do token
      const payload: ITokenPayload = {
        name: user.name,
        email: user.email,
        role: user.role,
        sub: user.id,
      };

      // Gerar access token
      const access_token = this.jwtService.sign(payload);
      const expires_in = 2 * 60 * 60; // 2h em segundos

      // Gerar refresh token
      const { refresh_token } = this.refreshTokenService.generate(user);

      // Log de sucesso
      if (request) {
        await this.auditService.logLoginSuccess(user.id, request, {
          role: user.role,
          companyId: user.companyId,
        });
      }

      return {
        access_token,
        refresh_token,
        expires_in,
        token_type: 'Bearer',
        // user: {
        //   id: user.id,
        //   name: user.name,
        //   email: user.email,
        //   role: user.role,
        // },
      };
    } catch (error) {
      // Log de falha se request estiver disponível
      if (request) {
        await this.auditService.logLoginFailed(
          loginDto.login,
          request,
          error.message,
        );
      }
      throw error;
    }
  }
} 