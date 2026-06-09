import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { IpLocationService } from './ip-location.service';
import { UniversalController } from 'src/shared/universal';
import { CreateIpLocationDto } from './dto/create-ip-location-dto';
import { UpdateIpLocationDto } from './dto/update-ip-location-dto';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { Roles } from '@prisma/client';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('ip-locations')
export class IpLocationController extends UniversalController<
  CreateIpLocationDto,
  UpdateIpLocationDto,
  IpLocationService
> {
  constructor(service: IpLocationService) {
    super(service);
  }

  @Get('location/:locationId')
  async buscarPorLocalidade(@Param('locationId') locationId: string) {
    return this.service.buscarMuitosPorLocalidadeAtiva(locationId);
  }
}
