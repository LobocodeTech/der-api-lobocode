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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ParseFilePipe,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { UniversalController } from 'src/shared/universal';
import { CompleteWorkOrderDto } from './dto/complete-work-order.dto';
import { RejectWorkOrderCompletionDto } from './dto/reject-work-order-completion.dto';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderCommentDto } from './dto/create-work-order-comment.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { UpdateWorkOrderChecklistItemDto } from './dto/update-work-order-checklist-item.dto';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderCheckListDto } from './dto/create-work-order-checklist-item.dto';
import { MoveWorkOrderColumnDto } from './dto/move-work-order-column.dto';

const EVIDENCE_MAX_FILES = 30;
const EVIDENCE_MAX_FILE_BYTES = 100 * 1024 * 1024;
@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
    Roles.FIELD_TEAM,
    Roles.C2C,
  ],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  DELETE: [
    Roles.SYSTEM_ADMIN,
    Roles.ADMIN,
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

  @Patch(':id/approve-completion')
  @RoleByMethod({
    PATCH: [Roles.ADMIN, Roles.C2C],
  })
  async aprovarConclusaoOrdem(
    @Param('id') id: string,
    @Body() body: CompleteWorkOrderDto,
  ) {
    return this.service.aprovarConclusaoOrdem(id, body);
  }

  @Patch(':id/reject-completion')
  @RoleByMethod({
    PATCH: [Roles.ADMIN, Roles.C2C],
  })
  async reprovarConclusaoOrdem(
    @Param('id') id: string,
    @Body() body: RejectWorkOrderCompletionDto,
  ) {
    return this.service.reprovarConclusaoOrdem(id, body);
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
  @RoleByMethod({
    POST: [
      Roles.SYSTEM_ADMIN,
      Roles.ADMIN,
      Roles.FIELD_TEAM,
      Roles.C2C,
    ],
  })
  async criarItemDoChecklist(
    @Param('id') id: string,
    @Body() body: CreateWorkOrderCheckListDto,
  ) {
    return this.service.criarItemDoChecklist(id, body);
  }

  @Post(':id/comments')
  @RoleByMethod({
    POST: [
      Roles.SYSTEM_ADMIN,
      Roles.ADMIN,
      Roles.FIELD_TEAM,
      Roles.C2C,
    ],
  })
  async criarComentario(
    @Param('id') id: string,
    @Body() body: CreateWorkOrderCommentDto,
  ) {
    return this.service.criarComentario(id, body);
  }

  @Post(':id/evidences')
  @RoleByMethod({
    POST: [
      Roles.SYSTEM_ADMIN,
      Roles.ADMIN,
      Roles.FIELD_TEAM,
      Roles.C2C,
    ],
  })
  @UseInterceptors(
    FilesInterceptor('files', EVIDENCE_MAX_FILES, {
      limits: {
        fileSize: EVIDENCE_MAX_FILE_BYTES,
      },
    }),
  )
  @UsePipes()
  async adicionarEvidencia(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: EVIDENCE_MAX_FILE_BYTES }),
        ],
        fileIsRequired: true,
      }),
    )
    files: any[],
    @Query('description') description?: string,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Envie ao menos um arquivo.');
    }
    return this.service.adicionarEvidencia(id, files, description);
  }
}
