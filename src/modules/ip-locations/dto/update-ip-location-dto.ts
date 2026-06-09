import { PartialType } from '@nestjs/mapped-types';
import { CreateIpLocationDto } from './create-ip-location-dto';

export class UpdateIpLocationDto extends PartialType(CreateIpLocationDto) {}
