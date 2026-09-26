import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../auth/token.types';
import { AdminActionLogRepository } from './repositories/admin-action-log.repository';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every successful mutating request under `/backoffice/*` to
 * `admin_action_logs`. Best-effort: a logging failure never fails the request.
 * `action` is `<METHOD> <route path>`; the last ObjectId-shaped route param
 * becomes `entityId`.
 */
@Injectable()
export class AdminLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminLog');

  constructor(private readonly logs: AdminActionLogRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const shouldLog = MUTATING.has(req.method) && req.path.includes('/backoffice/') && req.user?.id;

    if (!shouldLog) return next.handle();

    const user = req.user as AuthenticatedUser;
    const params = (req.params ?? {}) as Record<string, string>;
    const entityId =
      Object.values(params)
        .reverse()
        .find((v) => /^[a-f0-9]{24}$/i.test(v)) ?? null;
    const routePath = (req.route as { path?: string } | undefined)?.path ?? req.path;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.logs
            .create({
              userId: user.id,
              action: `${req.method} ${routePath}`,
              entityType: routePath.split('/').filter(Boolean)[1] ?? null,
              entityId,
              ip: req.ip ?? null,
            })
            .catch((err: unknown) =>
              this.logger.warn(`log failed: ${err instanceof Error ? err.message : String(err)}`),
            );
        },
      }),
    );
  }
}
