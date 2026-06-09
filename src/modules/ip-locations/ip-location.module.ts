import { Module } from '@nestjs/common';
import { IpLocationController } from './ip-location.controller';
import { IpLocationService } from './ip-location.service';

@Module({
  imports: [],
  controllers: [IpLocationController],
  providers: [IpLocationService],
  exports: [IpLocationService]
})
export class IpLocationModule {}
