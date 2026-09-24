import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  fieldErrors?: unknown;
  /** Extra machine-readable context a 4xx may carry (e.g. `{ code, orderNumber }`). */
  details?: unknown;
  path: string;
  timestamp: string;
}

/**
 * The one place an error becomes an HTTP response. Produces a single envelope:
 *   { statusCode, error, message, fieldErrors?, details?, path, timestamp }
 *
 * Handled shapes:
 *  - HttpException (incl. the 400s from ZodValidationPipe, 401/403 from guards, 429 from throttler)
 *  - Prisma errors → mapped to 409 / 404 / 400 / 503
 *  - malformed JSON body (SyntaxError from body-parser) → 400
 *  - anything else → 500, logged with a stack, no internal detail leaked
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);
    if (resolved.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
    } else if (resolved.log) {
      this.logger.warn(resolved.log);
    }

    const body: ErrorBody = {
      statusCode: resolved.statusCode,
      error: HttpStatus[resolved.statusCode] ?? 'ERROR',
      message: resolved.message,
      ...(resolved.fieldErrors ? { fieldErrors: resolved.fieldErrors } : {}),
      ...(resolved.details ? { details: resolved.details } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };
    response.status(resolved.statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string | string[];
    fieldErrors?: unknown;
    details?: unknown;
    log?: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { statusCode: exception.getStatus(), message: res };
      }
      const record = (res ?? {}) as Record<string, unknown>;
      return {
        statusCode: exception.getStatus(),
        message: (record.message as string | string[]) ?? exception.message,
        fieldErrors: record.fieldErrors,
        details: record.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        ...this.mapPrismaCode(exception),
        log: `Prisma ${exception.code}: ${exception.message}`,
      };
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'پرس‌وجوی نامعتبر است',
        log: 'PrismaClientValidationError',
      };
    }
    if (
      exception instanceof Prisma.PrismaClientInitializationError ||
      exception instanceof Prisma.PrismaClientRustPanicError
    ) {
      return { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'دیتابیس در دسترس نیست' };
    }

    // body-parser raises a SyntaxError with a numeric `status` for a bad JSON body.
    if (exception instanceof SyntaxError && 'status' in exception) {
      return { statusCode: HttpStatus.BAD_REQUEST, message: 'بدنه درخواست JSON نامعتبر است' };
    }

    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'خطای داخلی سرور' };
  }

  private mapPrismaCode(e: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
  } {
    switch (e.code) {
      case 'P2002': {
        const target = (e.meta?.target as string[] | string | undefined) ?? 'value';
        const field = Array.isArray(target) ? target.join(', ') : target;
        return { statusCode: HttpStatus.CONFLICT, message: `مقدار تکراری: ${field}` };
      }
      case 'P2025':
        return { statusCode: HttpStatus.NOT_FOUND, message: 'رکورد یافت نشد' };
      case 'P2003':
        return { statusCode: HttpStatus.CONFLICT, message: 'رکورد مرتبط وجود ندارد' };
      case 'P2000':
      case 'P2006':
      case 'P2007':
      case 'P2011':
      case 'P2012':
        return { statusCode: HttpStatus.BAD_REQUEST, message: 'داده ارسالی نامعتبر است' };
      case 'P2024': // connection-pool timeout
        return { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'دیتابیس در دسترس نیست' };
      case 'P2010': {
        // Raw query failed — on Mongo this also wraps connection/topology failures.
        const detail = `${(e.meta?.code as string) ?? ''} ${(e.meta?.message as string) ?? e.message}`;
        return /selection timeout|connection refused|no available servers|not primary|topology/i.test(
          detail,
        )
          ? { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'دیتابیس در دسترس نیست' }
          : { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'خطای دیتابیس' };
      }
      default:
        // P1xxx = connection / auth / timeout against the database server
        return e.code.startsWith('P1')
          ? { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'دیتابیس در دسترس نیست' }
          : { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'خطای دیتابیس' };
    }
  }
}
