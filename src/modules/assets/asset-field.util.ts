import { BadRequestException } from '@nestjs/common';
import { AssetType } from '@prisma/client';
import { CreateAssetDto } from './dto/create-asset.dto';

export function aplicarCamposAssetPorTipo(dto: CreateAssetDto): void {
  if (dto.type === AssetType.CAMERA) {
    dto.name = undefined;
    const manufacturer = dto.manufacturer?.trim() ?? '';
    const model = dto.model?.trim() ?? '';
    const serialNumber = dto.serialNumber?.trim() ?? '';
    if (!manufacturer) {
      throw new BadRequestException('Fabricante é obrigatório para câmeras.');
    }
    if (!model) {
      throw new BadRequestException('Modelo é obrigatório para câmeras.');
    }
    if (!serialNumber) {
      throw new BadRequestException(
        'Número de série é obrigatório para câmeras.',
      );
    }
    dto.manufacturer = manufacturer;
    dto.model = model;
    dto.serialNumber = serialNumber;
    dto.direction = dto.direction?.trim() || undefined;
    return;
  }

  if (dto.type === AssetType.ATDB || dto.type === AssetType.PMV) {
    dto.manufacturer = null as unknown as undefined;
    dto.model = null as unknown as undefined;
    dto.serialNumber = null as unknown as undefined;
    dto.direction = null as unknown as undefined;
    const name = dto.name?.trim() ?? '';
    if (!name) {
      throw new BadRequestException(
        dto.type === AssetType.ATDB
          ? 'ID é obrigatório para ATDB.'
          : 'Nome é obrigatório para PMV.',
      );
    }
    dto.name = name;
  }
}
