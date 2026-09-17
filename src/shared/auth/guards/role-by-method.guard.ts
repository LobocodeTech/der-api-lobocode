import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from '@prisma/client';
import {
  ROLE_BY_METHOD_KEY,
  RoleByMethodConfig,
} from '../role-by-method.decorator';

@Injectable()
export class RoleByMethodGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roleByMethodConfig =
      this.reflector.getAllAndOverride<RoleByMethodConfig>(ROLE_BY_METHOD_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!roleByMethodConfig) {
      return true; // Se não tem configuração, permite acesso
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;

    if (!user || !user.role) {
      return false;
    }

    const allowedRoles = roleByMethodConfig[method as keyof RoleByMethodConfig];

    if (!allowedRoles) {
      return true; // Se não tem roles definidas para o método, permite acesso
    }

    return allowedRoles.includes(user.role);
  }
}
