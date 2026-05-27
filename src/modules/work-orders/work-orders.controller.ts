import {
  Body,
  Controller,
  Get,
  MaxFileSizeValidator,
  Param,
  Patch,
  Post,
  Query,
  Delete,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ParseFilePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { TenantInterceptor } from 'src/shared/tenant';
import { UniversalController } from 'src/shared/universal';
import { CompleteWorkOrderDto } from './dto/complete-work-order.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderCommentDto } from './dto/create-work-order-comment.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { UpdateWorkOrderChecklistItemDto } from './dto/update-work-order-checklist-item.dto';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderCheckListDto } from './dto/create-work-order-checklist-item.dto';
import { MoveWorkOrderColumnDto } from './dto/move-work-order-column.dto';

@UseGuards(AuthGuard, RoleByMethodGuard)
@UseInterceptors(TenantInterceptor)
@RoleByMethod({
  GET: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
    Roles.FIELD_TEAM,
    Roles.C2C,
  ],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  DELETE: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
    Roles.FIELD_TEAM,
    Roles.C2C,
  ],
})
@Controller('work-orders')
export class WorkOrdersController extends UniversalController<
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
  WorkOrdersService
> {
  constructor(service: WorkOrdersService) {
    super(service);
  }

  @Get('location/:locationId')
  async buscarPorLocalidade(@Param('locationId') locationId: string) {
    return this.service.buscarPorLocalidade(locationId);
  }

  @Delete(':id/checklist-items/:itemId')
  @RoleByMethod({
    DELETE: [
      Roles.SYSTEM_ADMIN,
      Roles.ADMIN,
      Roles.FIELD_TEAM,
      Roles.C2C,
    ],
  })
  async removerItemDoChecklist(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removerItemDoChecklist(id, itemId);
  }

  @Patch(':id/start')
  async iniciarTrabalho(@Param('id') id: string) {
    return this.service.iniciarTrabalho(id);
  }

  @Patch(':id/complete')
  async concluirOrdem(
    @Param('id') id: string,
    @Body() body: CompleteWorkOrderDto,
  ) {
    return this.service.concluirOrdem(id, body);
  }

  @Patch(':id/column')
  async moverParaColuna(
    @Param('id') id: string,
    @Body() body: MoveWorkOrderColumnDto,
  ) {
    return this.service.moverParaColuna(id, body);
  }

  @Patch(':id/checklist-items/:itemId')
  async atualizarItemDoChecklist(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateWorkOrderChecklistItemDto,
  ) {
    return this.service.atualizarItemDoChecklist(id, itemId, body);
  }

  @Post(':id/checklist-items')
  async criarItemDoChecklist(
    @Param('id') id: string,
    @Body() body: CreateWorkOrderCheckListDto,
  ) {
    return this.service.criarItemDoChecklist(id, body);
  }

  @Post(':id/comments')
  async criarComentario(
    @Param('id') id: string,
    @Body() body: CreateWorkOrderCommentDto,
  ) {
    return this.service.criarComentario(id, body);
  }

  @Post(':id/evidences')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 100 * 1024 * 1024,
      },
    }),
  )
  @UsePipes()
  async adicionarEvidencia(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
        ],
      }),
    )
    file: any,
    @Query('description') description?: string,
  ) {
    return this.service.adicionarEvidencia(id, file, description);
  }
}

