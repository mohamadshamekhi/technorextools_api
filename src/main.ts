import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new JsonLogger(),
  });
  // Exactly one reverse-proxy hop (nginx) in production, so `req.ip` — and with it
  // the throttler's per-client bucket — is the real client, not the proxy.
  app.set('trust proxy', 1);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });
  // Versioned prefix; health stays at the root for probes.
  app.setGlobalPrefix(config.get('API_PREFIX', { infer: true }), { exclude: ['health'] });
  // No global ValidationPipe: every payload is validated per-route with a Zod pipe,
  // and Zod schemas strip unknown keys by default.
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`abzar/api listening on http://localhost:${port}`);
}

const logger = new Logger('Process');
process.on('unhandledRejection', (reason) => {
  logger.error(
    `Unhandled promise rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
  );
});
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
  // State may be corrupt — exit and let the orchestrator restart a clean process.
  process.exit(1);
});

void bootstrap();
