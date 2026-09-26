import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../../modules/auth/token.types';

/** One structured log line per HTTP request: method, path, status, duration, user. */
@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const started = Date.now();

    // On the error path, AllExceptionsFilter hasn't run yet, so res.statusCode
    // is still Nest's pre-handler default — pull the real status from the error.
    const finish = (outcome: 'ok' | 'error', error?: unknown) => {
      const res = http.getResponse<Response>();
      const status =
        outcome === 'error'
          ? error instanceof HttpException
            ? error.getStatus()
            : 500
          : res.statusCode;
      const meta = `${req.method} ${req.originalUrl ?? req.url} ${status} ${Date.now() - started}ms${req.user?.id ? ` user=${req.user.id}` : ''}`;
      if (outcome === 'error' || status >= 500) this.logger.error(meta);
      else this.logger.log(meta);
    };

    return next.handle().pipe(
      tap({
        next: () => finish('ok'),
        error: (err: unknown) => finish('error', err),
      }),
    );
  }
}
