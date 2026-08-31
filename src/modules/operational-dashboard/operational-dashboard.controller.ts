import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
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
  async obterResumo(
    @CurrentUser() user: User,
    @Query('incidentsPage') incidentsPage?: string,
    @Query('pendingPage') pendingPage?: string,
    @Query('preventivePage') preventivePage?: string,
    @Query('generalPage') generalPage?: string,
    @Query('listLimit') listLimit?: string,
    @Query('agingListLimit') agingListLimit?: string,
  ) {
    return this.service.obterResumoOperacional(user.role, {
      incidentsPage: incidentsPage ? Number(incidentsPage) : undefined,
      pendingPage: pendingPage ? Number(pendingPage) : undefined,
      preventivePage: preventivePage ? Number(preventivePage) : undefined,
      generalPage: generalPage ? Number(generalPage) : undefined,
      listLimit: listLimit ? Number(listLimit) : undefined,
      agingListLimit: agingListLimit ? Number(agingListLimit) : undefined,
    });
  }
}

