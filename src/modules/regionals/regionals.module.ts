import { Module } from '@nestjs/common';
import { RegionalsController } from './regionals.controller';
import { RegionalsService } from './regionals.service';

@Module({
  imports: [],
  controllers: [RegionalsController],
  providers: [RegionalsService],
  exports: [RegionalsService],
})
export class RegionalsModule {}
