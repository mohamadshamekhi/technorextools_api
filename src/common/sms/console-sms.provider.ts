import { Injectable, Logger } from '@nestjs/common';
import { renderFallback, SmsService, type SmsTemplate } from './sms.service';

/** Dev/test provider — logs instead of sending. */
@Injectable()
export class ConsoleSmsProvider extends SmsService {
  private readonly logger = new Logger('SMS');

  send(mobile: string, message: string): Promise<void> {
    this.logger.log(`→ ${mobile}: ${message}`);
    return Promise.resolve();
  }

  override sendTemplate(mobile: string, template: SmsTemplate, vars: string[]): Promise<void> {
    this.logger.log(`→ ${mobile} [${template}]: ${renderFallback(template, vars)}`);
    return Promise.resolve();
  }
}
