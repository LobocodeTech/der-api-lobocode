import { Controller, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RequiredRoles } from 'src/shared/auth/required-roles.decorator';
import { Roles } from '@prisma/client';
import { RoleGuard } from 'src/shared/auth/guards/role.guard';
import { UniversalController } from 'src/shared/universal';

@UseGuards(AuthGuard, RoleGuard)
@RequiredRoles(Roles.SYSTEM_ADMIN)
@Controller('companies')
export class CompaniesController extends UniversalController<
  CreateCompanyDto,
  UpdateCompanyDto,
  CompaniesService
> {
  constructor(service: CompaniesService) {
    super(service);
  }
}
