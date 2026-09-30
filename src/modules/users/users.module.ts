import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserRepository } from './repositories/user.repository';
import { UserValidator } from './validators/user.validator';
import { UserFactory } from './factories/user.factory';
import { CompaniesModule } from 'src/modules/companies/companies.module';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { FieldTeamMemberModule } from './field-team-member.module';

import {
  UserPermissionService,
  SystemAdminService,
  AdminService,
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
    SystemAdminService,
    AdminService,
  ],
  imports: [CompaniesModule, FieldTeamMemberModule],
})
export class UsersModule {}
