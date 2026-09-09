import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from './sms.service';

/** Dev/test provider — logs instead of sending. */
@Injectable()
export class ConsoleSmsProvider extends SmsService {
  private readonly logger = new Logger('SMS');

  send(mobile: string, message: string): Promise<void> {
    this.logger.log(`→ ${mobile}: ${message}`);
    return Promise.resolve();
  }
}
