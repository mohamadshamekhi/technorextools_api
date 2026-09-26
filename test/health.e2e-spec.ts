import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Needs a reachable MongoDB (`pnpm db:up`). Opt in with `RUN_E2E=1 pnpm test:e2e`
 * so a bare `pnpm test:e2e` stays green in CI without infrastructure.
 */
const suite = process.env.RUN_E2E === '1' ? describe : describe.skip;

suite('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 30_000);

  it('reports service status without auth', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: expect.stringMatching(/ok|degraded/) });
  });
});
