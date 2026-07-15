import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserRepository } from './repositories/user.repository';
import { UserValidator } from './validators/user.validator';
import { UserFactory } from './factories/user.factory';
import { CompaniesModule } from 'src/modules/companies/companies.module';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { FieldTeamMemberModule } from './field-team-member.module';
//  Novos services específicos

import {
  UserPermissionService,
  SystemAdminService,
  AdminService,
  HRService,
  SupervisorService,
  GuardService,
  PostSupervisorService,
  PostResidentService,
  UserQueryService,
} from './services';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRepository,
    UserValidator,
    UserQueryService,
    UserPermissionService,
    UserFactory,
    PrismaService,
    //  Novos services específicos
    SystemAdminService,
    AdminService,
    HRService,
    SupervisorService,
    GuardService,
    PostSupervisorService,
    PostResidentService,
  ],
  imports: [CompaniesModule, FieldTeamMemberModule],
})
export class UsersModule {}
