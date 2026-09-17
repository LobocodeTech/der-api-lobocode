import { Module, Global } from '@nestjs/common';
import { MessagesService } from './messages.service';

@Global()
@Module({
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
