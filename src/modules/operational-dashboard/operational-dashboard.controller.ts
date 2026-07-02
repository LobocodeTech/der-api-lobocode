import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { Roles, User } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { CurrentUser } from 'src/shared/auth/decorators';
import { TenantInterceptor } from 'src/shared/tenant';
import { OperationalDashboardService } from './operational-dashboard.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@UseInterceptors(TenantInterceptor)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('dashboard/operational')
export class OperationalDashboardController {
  constructor(
    private readonly service: OperationalDashboardService,
  ) {}

  @Get()
  async obterResumo(@CurrentUser() user: User) {
    return this.service.obterResumoOperacional(user.role);
  }
}

