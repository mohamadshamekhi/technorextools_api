import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema';

export const SERVICE_TOKEN_HEADER = 'x-service-token';

/**
 * Guards routes that only the storefront/backoffice servers may call. When
 * `API_SERVICE_TOKEN` is unset the guard is a no-op (dev convenience) — set it in
 * every deployed environment.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get('API_SERVICE_TOKEN', { infer: true });
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.header(SERVICE_TOKEN_HEADER);
    if (!provided || !safeEqual(provided, expected)) {
      throw new UnauthorizedException('توکن سرویس نامعتبر است');
    }
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
