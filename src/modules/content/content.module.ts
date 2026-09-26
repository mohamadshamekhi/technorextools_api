import { Global, Module } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';
import { ArticleRepository } from './repositories/article.repository';
import { BranchRepository } from './repositories/branch.repository';
import { SeoMetaRepository } from './repositories/seo-meta.repository';
import { SiteSettingRepository } from './repositories/site-setting.repository';
import { ContactMessageRepository } from './repositories/contact-message.repository';
import { NewsletterSubscriberRepository } from './repositories/newsletter-subscriber.repository';

/**
 * Content domain core — repositories for public-site data (blog articles,
 * physical branches, per-entity SEO meta, key/value site settings) plus the
 * typed AppSettingsService. Shared by the storefront content module, the
 * backoffice content admin, and any service that reads a setting.
 * Follows the CatalogModule pattern: a @Global module exporting its providers.
 */
@Global()
@Module({
  providers: [
    ArticleRepository,
    BranchRepository,
    SeoMetaRepository,
    SiteSettingRepository,
    AppSettingsService,
    ContactMessageRepository,
    NewsletterSubscriberRepository,
  ],
  exports: [
    ArticleRepository,
    BranchRepository,
    SeoMetaRepository,
    SiteSettingRepository,
    AppSettingsService,
    ContactMessageRepository,
    NewsletterSubscriberRepository,
  ],
})
export class ContentModule {}
