import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { UniversalController } from 'src/shared/universal';
import { CreateLocationsDto } from './dto/create-locations.dto';
import { UpdateLocationsDto } from './dto/update-locations.dto';
import { LocationsService } from './locations.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
    Roles.FIELD_TEAM,
    Roles.C2C,
  ],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('locations')
export class LocationsController extends UniversalController<
  CreateLocationsDto,
  UpdateLocationsDto,
  LocationsService
> {
  constructor(service: LocationsService) {
    super(service);
  }
}

