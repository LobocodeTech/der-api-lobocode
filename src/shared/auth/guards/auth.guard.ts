import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt'; 
import { PrismaService } from '../../prisma/prisma.service';
import { CaslAbilityService } from '../../casl/casl-ability/casl-ability.service';
import { ITokenPayload } from '../interfaces';
import { AUTH_MESSAGES } from '../constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private abilityService: CaslAbilityService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar se o endpoint é público
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request: Request = context.switchToHttp().getRequest();

    try {
      const token = this.extractTokenFromHeader(request);
      this.validateTokenExists(token);

      const payload = this.validateAndDecodeToken(token!);
      const user = await this.findAndValidateUser(payload.sub);

      this.setupUserContext(request, user);
      return true;
    } catch (error) {
      this.handleAuthenticationError(error);
    }
  }

  // Extrair token do header
  protected extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers['authorization']?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  // Validar se token existe
  private validateTokenExists(token: string | undefined): void {
    if (!token) {
      throw new UnauthorizedException(AUTH_MESSAGES.VALIDATION.TOKEN_REQUIRED);
    }
  }

  // Validar e decodificar token JWT
  private validateAndDecodeToken(token: string): ITokenPayload {
    try {
      return this.jwtService.verify<ITokenPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch (error: any) {
      // Tratar diferentes tipos de erro JWT de forma específica
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException(AUTH_MESSAGES.ERROR.TOKEN_EXPIRED);
      }
      
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException(AUTH_MESSAGES.ERROR.TOKEN_INVALID);
      }
      
      if (error.name === 'NotBeforeError') {
        throw new UnauthorizedException(AUTH_MESSAGES.ERROR.TOKEN_INVALID);
      }
      
      // Para outros erros JWT, não expor detalhes internos
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.TOKEN_INVALID);
    }
  }

  // Buscar e validar usuário no banco
  private async findAndValidateUser(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        permissions: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.ERROR.USER_NOT_FOUND);
    }

    return user;
  }

  // Configurar contexto do usuário
  private setupUserContext(request: Request, user: any): void {
    request.user = user;
    this.abilityService.createForUser(user); // RBAC e ABAC
  }

  // Tratar erros de autenticação
  private handleAuthenticationError(error: any): never {
    // Se já é uma UnauthorizedException, apenas log e re-throw
    if (error instanceof UnauthorizedException) {
      // Log apenas em desenvolvimento para debug
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔐 Auth Error: ${error.message}`);
      }
      throw error;
    }

    // Para outros erros, log detalhado apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.error('🔐 Authentication error:', {
        message: error.message,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n') // Apenas primeiras 3 linhas
      });
    }

    // Em produção, não expor detalhes internos
    throw new UnauthorizedException(AUTH_MESSAGES.ERROR.TOKEN_INVALID);
  }

  // Método protegido para extensão (Open/Closed Principle)
  protected getTokenExtractionStrategy(): 'header' | 'cookie' | 'custom' {
    return 'header';
  }
}
