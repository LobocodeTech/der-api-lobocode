import {
  IsArray,
  IsEnum,
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssetCriticality,
  AssetConnectionType,
  AssetStatus,
  AssetType,
} from '@prisma/client';
import { IsCUID } from '../../../shared/validators';
import { VALIDATION_MESSAGES } from '../../../shared/common/messages';

/**
 * Endereço IP do equipamento. O rótulo (`name`) foi removido — o IPv4 é o
 * próprio identificador único na lista.
 */
class AssetIpAddressDto {
  @IsIP('4', { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  ip: string;
}

export class CreateAssetDto {
  @IsOptional()
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  companyId?: string;

  /** ATDB (ID) e PMV (nome); não usado em câmeras. */
  @ValidateIf((o: CreateAssetDto) => o.type === AssetType.ATDB || o.type === AssetType.PMV)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @ValidateIf((o: CreateAssetDto) => o.type !== AssetType.ATDB && o.type !== AssetType.PMV)
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  name?: string;

  @ValidateIf((o: CreateAssetDto) => o.type === AssetType.CAMERA)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @ValidateIf((o: CreateAssetDto) => o.type !== AssetType.CAMERA)
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  manufacturer?: string;

  @ValidateIf((o: CreateAssetDto) => o.type === AssetType.CAMERA)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @ValidateIf((o: CreateAssetDto) => o.type !== AssetType.CAMERA)
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  model?: string;

  @ValidateIf((o: CreateAssetDto) => o.type === AssetType.CAMERA)
  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @ValidateIf((o: CreateAssetDto) => o.type !== AssetType.CAMERA)
  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  serialNumber?: string;

  @IsEnum(AssetType, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  type: AssetType;

  @IsNotEmpty({ message: VALIDATION_MESSAGES.REQUIRED.FIELD })
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsCUID({ message: VALIDATION_MESSAGES.FORMAT.UUID_INVALID })
  locationId: string;

  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  @IsOptional()
  direction?: string;

  @IsOptional()
  @IsEnum(AssetStatus, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  status?: AssetStatus;

  @IsOptional()
  @IsEnum(AssetCriticality, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  criticality?: AssetCriticality;

  @IsOptional()
  @IsEnum(AssetConnectionType, {
    message: VALIDATION_MESSAGES.FORMAT.ENUM_INVALID,
  })
  connectionType?: AssetConnectionType;

  @IsOptional()
  @IsUrl({}, { message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  connectionUrl?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MESSAGES.FORMAT.FIELD_INVALID })
  connectionToken?: string;

  @IsOptional()
  @IsArray({ message: VALIDATION_MESSAGES.FORMAT.ARRAY_INVALID })
  @ValidateNested({ each: true })
  @Type(() => AssetIpAddressDto)
  ipAddresses?: AssetIpAddressDto[];
}