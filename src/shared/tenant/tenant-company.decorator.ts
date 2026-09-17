import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantCompany = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const body = request.body;

    return body?.companyId || null;
  },
);
