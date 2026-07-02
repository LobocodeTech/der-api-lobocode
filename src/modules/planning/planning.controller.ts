import { Controller, UseGuards } from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { CreatePlanningDto } from './dto/create-planning.dto';
import { UpdatePlanningDto } from './dto/update-planning.dto';
import { PlanningService } from './planning.service';
import { UniversalController } from 'src/shared/universal';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('planning')
export class PlanningController extends UniversalController<
  CreatePlanningDto,
  UpdatePlanningDto,
  PlanningService
> {
  constructor(service: PlanningService) {
    super(service);
  }
}
