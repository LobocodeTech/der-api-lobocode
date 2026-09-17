import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { Request } from 'express';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { GlobalSearchService } from './global-search.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
})
@Controller('global-search')
export class GlobalSearchController {
  constructor(private readonly globalSearchService: GlobalSearchService) {}

  @Get()
  async search(@Query() query: GlobalSearchQueryDto, @Req() req: Request) {
    const user = req.user as any;
    return this.globalSearchService.search(
      query.q,
      user,
      query.limitPerType ?? 5,
    );
  }
}
