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
import { CreateGuardDto } from './dto/create-guard.dto';
import { CreateHRDto } from './dto/create-hr.dto';
import { CreatePostResidentDto } from './dto/create-post-resident.dto';
import { TenantInterceptor } from 'src/shared/tenant/tenant.interceptor';
import { CreatePostSupervisorDto } from './dto/create-post-supervisor.dto';
import { CreateSupervisorDto } from './dto/create-supervisor.dto';
import { Public } from 'src/shared/auth/decorators/public.decorator';

// 🎯 NOVOS DECORATORS CASL
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
@UseInterceptors(TenantInterceptor, CaslInterceptor) // ✅ Adicionado CaslInterceptor
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
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarTodos(
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
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

  @Get()
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarTodos(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('orderBy') orderBy: string = 'name',
    @Query('orderDirection') orderDirection: 'asc' | 'desc' = 'asc',
    @Query('deletedOnly') deletedOnly?: string,
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarTodos(
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
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
  ) {
    const scope = parseUserSoftDeleteScope(deletedOnly);
    return this.service.buscarUsuarios(
      query,
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
      scope,
    );
  }

  @Get('active-guards-on-shift-post/:postId')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarVigilantesAtivosEmTurnoNoPosto(@Param('postId') postId: string) {
    return this.service.buscarVigilantesAtivosEmTurnoNoPosto(postId);
  }

  @Get('post/:postId/clients')
  @CaslRead('User')
  @RequiredRoles(Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C)
  buscarClientesPorPosto(
    @Param('postId') postId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('orderBy') orderBy: string = 'name',
    @Query('orderDirection') orderDirection: 'asc' | 'desc' = 'asc',
  ) {
    return this.service.buscarClientesPorPosto(
      postId,
      Number(page),
      Number(limit),
      orderBy,
      orderDirection,
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

  @Post('hr')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoHR(@Body() dto: CreateHRDto) {
    return this.service.criarNovoHR(dto);
  }

  @Post('supervisor')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoSupervisor(@Body() dto: CreateSupervisorDto) {
    return this.service.criarNovoSupervisor(dto);
  }

  @Post('guard')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoGuard(@Body() dto: CreateGuardDto) {
    return this.service.criarNovoGuard(dto);
  }

  @Post('post-supervisor')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoPostSupervisor(@Body() dto: CreatePostSupervisorDto) {
    return this.service.criarNovoPostSupervisor(dto);
  }

  @Post('post-resident')
  @CaslCreate('User')
  @RequiredRoles(Roles.ADMIN)
  criarNovoPostResident(@Body() dto: CreatePostResidentDto) {
    return this.service.criarNovoPostResident(dto);
  }

  /**
   * Endpoint público para registro de síndico (auto-cadastro)
   * Não requer autenticação
   */
  @Public()
  @Post('public/post-supervisor')
  criarPostSupervisorPublico(@Body() dto: CreatePostSupervisorDto) {
    return this.service.criarPostSupervisorPublico(dto);
  }

  /**
   * Endpoint público para registro de morador (auto-cadastro)
   * Não requer autenticação
   */
  @Public()
  @Post('public/post-resident')
  criarPostResidentPublico(@Body() dto: CreatePostResidentDto) {
    return this.service.criarPostResidentPublico(dto);
  }

  @Patch(':id')
  @CaslUpdate('User')
  @CaslFields('User', ['name', 'email', 'login', 'phone', 'address', 'status', 'profilePicture'])
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
