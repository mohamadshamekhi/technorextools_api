import { ConsoleLogger, type LoggerService, type LogLevel } from '@nestjs/common';

/**
 * Structured JSON logger — one line per record on stdout/stderr, ready for a log
 * shipper. Falls back to Nest's pretty `ConsoleLogger` when `NODE_ENV` is not
 * `production` so local output stays readable. No external dependency (pino is
 * the eventual target once it can be added).
 */
export class JsonLogger implements LoggerService {
  private readonly pretty = new ConsoleLogger();
  private readonly structured = process.env.NODE_ENV === 'production';

  log(message: unknown, context?: string): void {
    this.emit('log', message, context);
  }
  error(message: unknown, stackOrContext?: string, context?: string): void {
    this.emit('error', message, context ?? stackOrContext, stackOrContext);
  }
  warn(message: unknown, context?: string): void {
    this.emit('warn', message, context);
  }
  debug(message: unknown, context?: string): void {
    this.emit('debug', message, context);
  }
  verbose(message: unknown, context?: string): void {
    this.emit('verbose', message, context);
  }
  setLogLevels(levels: LogLevel[]): void {
    this.pretty.setLogLevels?.(levels);
  }

  private emit(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    if (!this.structured) {
      (this.pretty[level as 'log'] as (m: unknown, c?: string) => void)(message, context);
      return;
    }
    const record: Record<string, unknown> = {
      level: level === 'log' ? 'info' : level,
      time: new Date().toISOString(),
      context,
      msg:
        typeof message === 'string'
          ? message
          : message instanceof Error
            ? message.message
            : JSON.stringify(message),
    };
    if (stack && stack !== context) record.stack = stack;
    const line = JSON.stringify(record);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }
}
