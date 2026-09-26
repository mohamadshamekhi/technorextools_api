import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AdminLogInterceptor } from './admin-log.interceptor';
import { AdminActionLogRepository } from './repositories/admin-action-log.repository';

/**
 * Admin audit trail — the `admin_action_logs` repository plus a global
 * interceptor that records mutating `/backoffice/*` requests. @Global so the
 * backoffice reports module can inject the repository to expose a viewer.
 */
@Global()
@Module({
  providers: [
    AdminActionLogRepository,
    { provide: APP_INTERCEPTOR, useClass: AdminLogInterceptor },
  ],
  exports: [AdminActionLogRepository],
})
export class AdminLogModule {}
