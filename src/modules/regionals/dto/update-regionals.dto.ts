import { PartialType } from '@nestjs/mapped-types';
import { CreateRegionalsDto } from './create-regionals.dto';

export class UpdateRegionalsDto extends PartialType(CreateRegionalsDto) {}
