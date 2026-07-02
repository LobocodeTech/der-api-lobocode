import { Body, Controller, UseGuards } from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { UniversalController } from 'src/shared/universal';
import { CreateRegionalsDto } from './dto/create-regionals.dto';
import { UpdateRegionalsDto } from './dto/update-regionals.dto';
import { RegionalsService } from './regionals.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
    Roles.FIELD_TEAM,
    Roles.C2C,
  ],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('regionals')
export class RegionalsController extends UniversalController<
  CreateRegionalsDto,
  UpdateRegionalsDto,
  RegionalsService
> {
  constructor(service: RegionalsService) {
    super(service);
  }
}

