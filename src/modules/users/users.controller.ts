import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RequiredRoles } from 'src/shared/auth/required-roles.decorator';
import { Roles } from '@prisma/client';
import { RoleGuard } from 'src/shared/auth/guards/role.guard';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { TenantInterceptor } from 'src/shared/tenant/tenant.interceptor';

import {
  CaslRead,
  CaslCreate,
  CaslUpdate,
  CaslDelete,
  CaslFields,
} from 'src/shared/casl/decorators/casl.decorator';
import { CaslInterceptor } from 'src/shared/casl/interceptors/casl.interceptor';
import { CreateOthersDto } from './dto/create-others.dto';
import { UserSoftDeleteScope } from './services/user-query.service';

function parseUserSoftDeleteScope(deletedOnly?: string): UserSoftDeleteScope {
  return deletedOnly === 'true' ? 'deleted' : 'active';
}

@UseGuards(AuthGuard, RoleGuard)
@UseInterceptors(TenantInterceptor, CaslInterceptor)
@RequiredRoles(Roles.SYSTEM_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post('')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoOthers(@Body() dto: CreateOthersDto) {
    return this.service.criarNovoOthers(dto);
  }

  @Get('all')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN)
  buscarTodosMotoristas(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('orderBy') orderBy: string = 'name',
    @Query('orderDirection') orderDirection: 'asc' | 'desc' = 'asc',
    @Query('deletedOnly') deletedOnly?: string,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarTodos(
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
      { q, role, status },
    );
  }

  @Get('drivers')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarTodosAll() {
    return this.service.buscarTodosMotoristas();
  }

  @Get('all-work-order-assignees')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarTodosResponsaveisPorOrdensDeServico(
    @Query('locationId') locationId?: string,
  ) {
    return this.service.buscarTodosResponsaveisPorOrdensDeServico(locationId);
  }

  @Get('all-work-order-creators')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarTodosCriadoresPorOrdensDeServico() {
    return this.service.buscarTodosCriadoresPorOrdensDeServico();
  }

  @Get()
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarTodos(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('orderBy') orderBy: string = 'name',
    @Query('orderDirection') orderDirection: 'asc' | 'desc' = 'asc',
    @Query('deletedOnly') deletedOnly?: string,
    @Query('q') q?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarTodos(
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
      { q, role, status },
    );
  }

  @Get('search')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarUsuarios(
    @Query('q') query: string = '',
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('orderBy') orderBy: string = 'name',
    @Query('orderDirection') orderDirection: 'asc' | 'desc' = 'asc',
    @Query('deletedOnly') deletedOnly?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarUsuarios(
      query,
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
      { role, status },
    );
  }

  @Get(':id')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C, Roles.SYSTEM_ADMIN)
  buscarPorId(@Param('id') id: string) {
    return this.service.buscarPorId(id);
  }

  @Post('system-admin')
  @CaslCreate('User')
  criarNovoSystemAdmin(@Body() dto: CreateSystemAdminDto) {
    return this.service.criarNovoSystemAdmin(dto);
  }

  @Post('admin')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoAdmin(@Body() dto: CreateAdminDto) {
    return this.service.criarNovoAdmin(dto);
  }

  @Patch(':id')
  @CaslUpdate('User')
  @CaslFields('User', [
    'name',
    'email',
    'login',
    'phone',
    'address',
    'status',
    'profilePicture',
  ])
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  atualizar(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.service.atualizar(id, updateUserDto);
  }

  @Delete(':id')
  @CaslDelete('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  desativar(@Param('id') id: string) {
    return this.service.desativar(id);
  }

  @Post(':id/restore')
  @CaslUpdate('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  reativar(@Param('id') id: string) {
    return this.service.reativar(id);
  }
}
