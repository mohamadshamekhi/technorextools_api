import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  contactMessageSchema,
  newsletterSchema,
  type ContactMessageInput,
  type NewsletterInput,
} from './storefront-contact.schemas';
import { StorefrontContactService } from './storefront-contact.service';

/** Public site forms — consumed by `abzar/storefront`. Path: `/api/v1/storefront`. */
@Controller('storefront')
export class StorefrontContactController {
  constructor(private readonly contact: StorefrontContactService) {}

  /** Contact form → a `ContactMessage` row the backoffice inbox lists. 201. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('contact')
  submit(
    @Body(new ZodValidationPipe(contactMessageSchema)) body: ContactMessageInput,
  ): Promise<{ id: string }> {
    return this.contact.submit(body);
  }

  /** Newsletter sign-up — 201 for a new contact, 200 when already subscribed. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('newsletter')
  async subscribe(
    @Body(new ZodValidationPipe(newsletterSchema)) body: NewsletterInput,
    // passthrough: the status differs per outcome (201 new / 200 already subscribed),
    // the body is still returned by Nest as usual.
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ created: boolean }> {
    const result = await this.contact.subscribe(body);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }
}
