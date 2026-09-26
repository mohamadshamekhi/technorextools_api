import { Global, Module } from '@nestjs/common';
import { TicketRepository } from './repositories/ticket.repository';

/**
 * Support domain core — the `tickets` repository (owns `ticket_messages`).
 * Consumed by the storefront customer panel and the backoffice support desk.
 */
@Global()
@Module({
  providers: [TicketRepository],
  exports: [TicketRepository],
})
export class SupportModule {}
