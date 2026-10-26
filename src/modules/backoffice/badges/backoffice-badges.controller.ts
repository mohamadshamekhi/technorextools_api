import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { BackofficeBadgesService, SEEN_SECTIONS, type SeenSection } from './backoffice-badges.service';

const seenSectionSchema = z.enum(SEEN_SECTIONS, { message: 'بخش نامعتبر است' });

/**
 * Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/badges`.
 * Any authenticated admin; counts are filtered by the caller's permissions.
 */
@Controller('backoffice/badges')
export class BackofficeBadgesController {
  constructor(private readonly badges: BackofficeBadgesService) {}

  @Get()
  counts(@CurrentUser() user: AuthenticatedUser) {
    return this.badges.counts(user);
  }

  @Post(':section/seen')
  @HttpCode(HttpStatus.NO_CONTENT)
  markSeen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('section', new ZodValidationPipe(seenSectionSchema)) section: SeenSection,
  ) {
    return this.badges.markSeen(user, section);
  }
}
