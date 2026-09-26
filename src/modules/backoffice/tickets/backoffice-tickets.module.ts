import { Module } from '@nestjs/common';
import { BackofficeTicketsController } from './backoffice-tickets.controller';
import { BackofficeTicketsService } from './backoffice-tickets.service';

@Module({
  controllers: [BackofficeTicketsController],
  providers: [BackofficeTicketsService],
})
export class BackofficeTicketsModule {}
