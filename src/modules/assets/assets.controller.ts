import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@prisma/client';
import { AuthGuard } from 'src/shared/auth/guards/auth.guard';
import { RoleByMethodGuard } from 'src/shared/auth/guards/role-by-method.guard';
import { RoleByMethod } from 'src/shared/auth/role-by-method.decorator';
import { UniversalController } from 'src/shared/universal';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetsService } from './assets.service';

@UseGuards(AuthGuard, RoleByMethodGuard)
@RoleByMethod({
  GET: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.FIELD_TEAM, Roles.C2C],
  POST: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  PATCH: [Roles.SYSTEM_ADMIN, Roles.ADMIN, Roles.C2C],
  DELETE: [Roles.SYSTEM_ADMIN, Roles.ADMIN],
})
@Controller('assets')
export class AssetsController extends UniversalController<
  CreateAssetDto,
  UpdateAssetDto,
  AssetsService
> {
  constructor(service: AssetsService) {
    super(service);
  }

  /**
   * Lista todos os ativos vinculados a uma localidade pelo nome exato
   */
  @Get('location/:locationId')
  async buscarPorRodovia(@Param('locationId') locationId: string) {
    return this.service.buscarMuitosPorRodoviaAtiva(locationId);
  }

  /**
   * Lista ativos por tipo (CAMERA, SENSOR, EQUIPMENT)
   */
  @Get('by-type/:type')
  async buscarPorTipo(@Param('type') type: string) {
    return this.service.buscarMuitosPorCampo('type', type);
  }

  /**
   * Reativa um ativo desativado
   */
  @Post(':id/restore')
  async reativar(@Param('id') id: string) {
    return this.service.reativar(id);
  }
}
