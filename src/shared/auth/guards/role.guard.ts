import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '@prisma/client';
import { Request } from 'express';
import { ForbiddenError } from 'src/shared/common/errors';
import type { RequestUser } from '../interfaces';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Roles[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request: Request = context.switchToHttp().getRequest();
    const authUser = request.user as RequestUser | undefined;

    // Se não há usuário autenticado (endpoint público), não verifica roles
    if (!authUser) {
      return true;
    }

    const isUnauthorized =
      authUser.role !== Roles.SYSTEM_ADMIN &&
      !requiredRoles.includes(authUser.role);

    if (isUnauthorized) {
      throw new ForbiddenError(
        'Você não tem permissão para acessar este recurso.',
      );
    }
    return true;
  }
}
