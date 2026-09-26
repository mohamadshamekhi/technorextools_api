import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema';

/**
 * Injection token for the shared ioredis client. Resolves to `null` when
 * `REDIS_URL` is unset — callers must handle the in-memory fallback.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type RedisClient = Redis | null;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): RedisClient => {
        const url = config.get('REDIS_URL', { infer: true });
        if (!url) return null;

        const logger = new Logger('Redis');
        const client = new Redis(url, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
          // Rate-limit counters are best-effort — never let a Redis blip fail a request.
          enableOfflineQueue: true,
        });
        client.on('error', (err) => logger.error(`connection error: ${err.message}`));
        client.on('connect', () => logger.log('connected'));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
