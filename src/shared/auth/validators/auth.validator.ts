import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from '../../common/messages/messages.service';
import { LoginDto } from '../dto/login.dto';
import bcrypt from 'bcrypt';
import { UnauthorizedError } from 'src/shared/common/errors';

@Injectable()
export class AuthValidator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messagesService: MessagesService,
  ) {}

  /**
   * Valida credenciais de login
   */
  async validateCredentials(loginDto: LoginDto) {
    const { login, password } = loginDto;

    // Busca usuário por email ou login
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: login.trim().toLowerCase() },
          { login: login.trim().toLowerCase() },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'INVALID_CREDENTIALS'),
      );
    }

    // Verifica se o usuário está ativo
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('RESOURCE', 'INACTIVE'),
      );
    }

    if (!user.password) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'INVALID_CREDENTIALS'),
      );
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'INVALID_CREDENTIALS'),
      );
    }

    return user;
  }

  /**
   * Valida se o usuário existe e está ativo
   */
  async validateUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        login: true,
        name: true,
        phone: true,
        status: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('AUTH', 'USER_NOT_FOUND'),
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError(
        this.messagesService.getErrorMessage('RESOURCE', 'INACTIVE'),
      );
    }

    return user;
  }

  /**
   * Valida se o email existe e está ativo para reset de senha
   */
  async validateEmailForReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, status: true },
    });

    if (!user) {
      // Por segurança, não revelamos se o email existe ou não
      return null;
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException(
        this.messagesService.getErrorMessage('RESOURCE', 'INACTIVE'),
      );
    }

    return user;
  }
}