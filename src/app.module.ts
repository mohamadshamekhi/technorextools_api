import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ConfigModule } from './config/config.module';
import { RedisModule, REDIS_CLIENT, type RedisClient } from './common/redis/redis.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpLoggerInterceptor } from './common/logging/http-logger.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PersianThrottlerGuard } from './common/guards/persian-throttler.guard';
import { SmsModule } from './common/sms/sms.module';
import { PaymentModule } from './common/payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { ContentModule } from './modules/content/content.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { SparePartsModule } from './modules/spare-parts/spare-parts.module';
import { BackofficeSparePartsModule } from './modules/backoffice/spare-parts/backoffice-spare-parts.module';
import { StorefrontSparePartsModule } from './modules/storefront/spare-parts/storefront-spare-parts.module';
import { WarrantyModule } from './modules/warranty/warranty.module';
import { AddressModule } from './modules/address/address.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { ReferralModule } from './modules/referral/referral.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SupportModule } from './modules/support/support.module';
import { AdminLogModule } from './modules/admin-log/admin-log.module';
import { SweepModule } from './modules/sweep/sweep.module';
import { MediaModule } from './modules/media/media.module';
import { PaymentCallbackModule } from './modules/payment/payment-callback.module';
import { BackofficeOrdersModule } from './modules/backoffice/orders/backoffice-orders.module';
import { BackofficeShippingModule } from './modules/backoffice/shipping/backoffice-shipping.module';
import { BackofficePaymentMethodsModule } from './modules/backoffice/payment-methods/backoffice-payment-methods.module';
import { BackofficeProductQuestionsModule } from './modules/backoffice/product-questions/backoffice-product-questions.module';
import { BackofficeInboxModule } from './modules/backoffice/inbox/backoffice-inbox.module';
import { StorefrontContactModule } from './modules/storefront/contact/storefront-contact.module';
import { BackofficeDiscountsModule } from './modules/backoffice/discounts/backoffice-discounts.module';
import { BackofficeCommentsModule } from './modules/backoffice/comments/backoffice-comments.module';
import { BackofficeTicketsModule } from './modules/backoffice/tickets/backoffice-tickets.module';
import { BackofficeWarrantiesModule } from './modules/backoffice/warranties/backoffice-warranties.module';
import { BackofficeContentModule } from './modules/backoffice/content/backoffice-content.module';
import { BackofficeSettingsModule } from './modules/backoffice/settings/backoffice-settings.module';
import { BackofficeBundlesModule } from './modules/backoffice/bundles/backoffice-bundles.module';
import { BackofficeLoyaltyModule } from './modules/backoffice/loyalty/backoffice-loyalty.module';
import { BackofficeReportsModule } from './modules/backoffice/reports/backoffice-reports.module';
import { BackofficeUsersModule } from './modules/backoffice/users/users.module';
import { BackofficeAccessModule } from './modules/backoffice/access/access-admin.module';
import { BackofficeCategoriesModule } from './modules/backoffice/categories/categories.module';
import { BackofficeBrandsModule } from './modules/backoffice/brands/brands.module';
import { BackofficeProductsModule } from './modules/backoffice/products/products.module';
import { BackofficeInventoryModule } from './modules/backoffice/inventory/inventory.module';
import { StorefrontCatalogModule } from './modules/storefront/catalog/storefront-catalog.module';
import { StorefrontCartModule } from './modules/storefront/cart/storefront-cart.module';
import { StorefrontContentModule } from './modules/storefront/content/storefront-content.module';
import { StorefrontShippingModule } from './modules/storefront/shipping/storefront-shipping.module';
import { StorefrontPaymentMethodsModule } from './modules/storefront/payment-methods/storefront-payment-methods.module';
import { StorefrontWarrantyModule } from './modules/storefront/warranty/storefront-warranty.module';
import { StorefrontAddressesModule } from './modules/storefront/addresses/storefront-addresses.module';
import { StorefrontWishlistModule } from './modules/storefront/wishlist/storefront-wishlist.module';
import { StorefrontNotificationsModule } from './modules/storefront/notifications/storefront-notifications.module';
import { StorefrontCheckoutModule } from './modules/storefront/checkout/storefront-checkout.module';
import { StorefrontOrdersModule } from './modules/storefront/orders/storefront-orders.module';
import { StorefrontDiscountsModule } from './modules/storefront/discounts/storefront-discounts.module';
import { StorefrontLoyaltyModule } from './modules/storefront/loyalty/storefront-loyalty.module';
import { StorefrontTicketsModule } from './modules/storefront/tickets/storefront-tickets.module';
import { StorefrontRepairsModule } from './modules/storefront/repairs/storefront-repairs.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AccessModule,
    CatalogModule,
    CartModule,
    ContentModule,
    ShippingModule,
    PaymentMethodsModule,
    BundlesModule,
    SparePartsModule,
    WarrantyModule,
    AddressModule,
    WishlistModule,
    NotificationsModule,
    DiscountsModule,
    LoyaltyModule,
    ReferralModule,
    OrdersModule,
    SupportModule,
    AdminLogModule,
    SweepModule,
    SmsModule,
    PaymentModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: RedisClient) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        // Shared counters across instances when Redis is configured; otherwise
        // the default per-process in-memory store.
        storage: redis
          ? (() => {
              new Logger('Throttler').log('using Redis storage');
              return new ThrottlerStorageRedisService(redis);
            })()
          : undefined,
      }),
    }),

    // Shared / root-level
    AuthModule,
    HealthModule,
    PaymentCallbackModule,

    // Admin-panel surface (abzar/backoffice) — /api/v1/backoffice/*
    BackofficeUsersModule,
    BackofficeAccessModule,
    BackofficeCategoriesModule,
    BackofficeBrandsModule,
    BackofficeProductsModule,
    BackofficeInventoryModule,
    BackofficeOrdersModule,
    BackofficeShippingModule,
    BackofficePaymentMethodsModule,
    BackofficeDiscountsModule,
    BackofficeProductQuestionsModule,
    BackofficeInboxModule,
    BackofficeCommentsModule,
    BackofficeTicketsModule,
    BackofficeWarrantiesModule,
    BackofficeContentModule,
    BackofficeSettingsModule,
    BackofficeBundlesModule,
    BackofficeSparePartsModule,
    StorefrontSparePartsModule,
    BackofficeLoyaltyModule,
    BackofficeReportsModule,
    MediaModule,

    // Public-site surface (abzar/storefront) — /api/v1/storefront/*
    StorefrontCatalogModule,
    StorefrontCartModule,
    StorefrontContentModule,
    StorefrontShippingModule,
    StorefrontPaymentMethodsModule,
    StorefrontWarrantyModule,
    StorefrontAddressesModule,
    StorefrontWishlistModule,
    StorefrontNotificationsModule,
    StorefrontCheckoutModule,
    StorefrontOrdersModule,
    StorefrontDiscountsModule,
    StorefrontContactModule,
    StorefrontLoyaltyModule,
    StorefrontTicketsModule,
    StorefrontRepairsModule,
  ],
  providers: [
    // Order matters: rate-limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: PersianThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
