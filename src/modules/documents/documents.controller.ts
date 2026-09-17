import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AuthGuard } from '../../shared/auth/guards/auth.guard';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { TenantInterceptor } from '../../shared/tenant/tenant.interceptor';
import { RoleByMethodGuard } from '../../shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from '../../shared/auth/role-by-method.decorator';
import { Roles } from '@prisma/client';
import { DocumentStatus } from '@prisma/client';

@Controller('documents')
@UseGuards(AuthGuard, RoleByMethodGuard)
@UseInterceptors(TenantInterceptor)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
})
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.create(
      createDocumentDto,
      user.id,
      user.companyId,
    );
  }

  @Get('sent')
  async findSent(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findSent(
      user.id,
      user.companyId,
      +page,
      +limit,
    );
  }

  @Get('received')
  async findReceived(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findReceived(
      user.role,
      user.companyId,
      +page,
      +limit,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.findOne(id, user.id, user.companyId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: DocumentStatus,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.updateStatus(
      id,
      status,
      user.id,
      user.companyId,
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.update(
      id,
      updateDocumentDto,
      user.id,
      user.companyId,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.remove(id, user.id, user.companyId);
  }
}
