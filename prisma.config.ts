import path from 'node:path';
import { defineConfig } from 'prisma/config';

// A Prisma config file disables Prisma's own .env auto-loading, so do it here.
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // no .env file (CI passes DATABASE_URL directly) — fine
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node --project tsconfig.json prisma/seed.ts',
  },
});
