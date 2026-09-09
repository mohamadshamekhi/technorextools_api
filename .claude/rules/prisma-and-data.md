# Rule: Prisma schema & data access

## Schema changes (`prisma/schema.prisma`)
1. MongoDB connector — **no migrations**. Changes ship via `prisma db push`.
2. IDs: `String @id @default(auto()) @map("_id") @db.ObjectId`.
3. Money is **integer Toman** — never float, never a decimal type.
4. Relations are references, not joins — keep `include` depth shallow, watch N+1.
5. After every edit: `pnpm prisma:generate` (mandatory) + `pnpm prisma:push` against a
   running DB (`pnpm db:up` first).
6. Plan destructive changes (drops, renames, type changes) by hand — `db push` will not
   migrate data.
7. Do **not** set a custom `output` in the schema — the client must generate to
   `node_modules/@prisma/client` or `dist/` breaks at runtime.
8. New model → new `<model>.repository.ts` in the owning module (see
   `.claude/rules/adding-an-endpoint.md` step 3). A model read by several domains lives in
   the module that owns it conceptually and is exported from a `@Global` module.

## Data access at runtime
- Only a model's own repository calls `this.prisma.<model>`. Services inject repositories.
- Repositories return Prisma types or thin `X & { relation }` aliases — no HTTP-shaped views.
- `prisma.$transaction` needs Mongo as a **replica set** (`docker-compose.yml` gives a
  single-node one).
- Don't catch Prisma errors just to remap to HTTP — `AllExceptionsFilter` already maps
  `P2002/P2025/P2003` etc. Catch only for a domain-specific message.
- `prisma` CLI is a **runtime** dependency (prod image runs `prisma generate` / can
  `db push` on deploy) — do not move it to devDependencies.
