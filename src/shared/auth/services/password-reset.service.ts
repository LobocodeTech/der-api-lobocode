import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { EmailService } from './email.service';
import { AuditService } from './audit.service';
import { AUTH_MESSAGES, PASSWORD_RESET_TOKEN_TTL_MS } from '../constants';
import {
  generatePasswordResetToken,
  normalizePasswordResetToken,
} from '../utils/password-reset-token.util';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import {
  ForgotPasswordResetDto,
  ValidateForgotPasswordTokenDto,
} from '../dto/password-reset.dto';
import { ValidationError } from '../../common/errors';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly auditService: AuditService,
  ) {}

  async requestPasswordReset(
    dto: ForgotPasswordDto,
    request?: Request,
  ): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.findEligibleUserByEmail(email);

    const token = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, isUsed: false },
        data: { isUsed: true, usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          token,
          email,
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    this.emailService.sendPasswordResetEmail(email, user.name, token);

    if (request) {
      void this.auditService
        .logPasswordReset(user.id, request, 'request')
        .catch(() => undefined);
    }
  }

  async validateResetToken(
    dto: ValidateForgotPasswordTokenDto,
    request?: Request,
  ): Promise<{ valid: true }> {
    const email = this.normalizeEmail(dto.email);
    const token = normalizePasswordResetToken(dto.token);
    const record = await this.findValidToken(email, token);

    if (!record) {
      if (request) {
        await this.auditService.logPasswordResetFailure(
          request,
          'validate',
          email,
        );
      }
      throw new BadRequestException(AUTH_MESSAGES.ERROR.RESET_TOKEN_INVALID);
    }

    if (request) {
      await this.auditService.logPasswordReset(
        record.userId,
        request,
        'validate',
      );
    }

    return { valid: true };
  }

  async resetPassword(
    dto: ForgotPasswordResetDto,
    request?: Request,
  ): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const token = normalizePasswordResetToken(dto.token);

    if (dto.password !== dto.confirmPassword) {
      throw new ValidationError(
        'Confirmação de senha deve ser igual à nova senha',
      );
    }

    const record = await this.findValidToken(email, token);

    if (!record) {
      if (request) {
        await this.auditService.logPasswordResetFailure(
          request,
          'complete',
          email,
        );
      }
      throw new BadRequestException(AUTH_MESSAGES.ERROR.RESET_TOKEN_INVALID);
    }

    const hashedPassword = await this.passwordService.hashPassword(
      dto.password,
    );
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { password: hashedPassword, updatedAt: now },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { isUsed: true, usedAt: now },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, isUsed: false },
        data: { isUsed: true, usedAt: now },
      }),
    ]);

    this.emailService.sendPasswordChangedEmail(email, record.user.name);

    if (request) {
      await this.auditService.logPasswordReset(
        record.userId,
        request,
        'complete',
      );
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async findEligibleUserByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        AUTH_MESSAGES.ERROR.PASSWORD_RESET_EMAIL_FAILED,
      );
    }

    if (user.deletedAt !== null || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(AUTH_MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    return user;
  }

  private async findValidToken(email: string, token: string) {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        token,
        email,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: { id: true, name: true, status: true, deletedAt: true },
        },
      },
    });

    if (
      !record ||
      record.user.deletedAt !== null ||
      record.user.status !== UserStatus.ACTIVE
    ) {
      return null;
    }

    return record;
  }
}
