import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Se especificar um campo específico, retorna apenas esse campo
    if (data && user) {
      return user[data];
    }

    return user;
  },
);
