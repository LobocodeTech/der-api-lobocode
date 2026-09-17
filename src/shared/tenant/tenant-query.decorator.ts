import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para extrair companyId da query da requisição
 * Apenas SYSTEM_ADMIN pode usar este decorator
 */
export const TenantQuery = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.query?.companyId;
  },
);
