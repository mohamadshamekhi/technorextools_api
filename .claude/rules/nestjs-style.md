# Rule: NestJS code style

- **Layering:** controller (thin, validation + delegation) → service (all logic) →
  repository (all Prisma) → Prisma. No layer skips. No `PrismaService` outside repositories.
- **Modules:** one per domain per consumer. Name `Backoffice<Domain>Module` /
  `Storefront<Domain>Module`; controllers likewise. Shared engines (`access`, `catalog`,
  `cart`) are `@Global` and export their repositories.
- **Guards** are global (Throttler → JwtAuth → Permissions). Opt out with `@Public()`,
  soften with `@OptionalAuth()`, gate with `@RequirePermissions(...)`. `@CurrentUser()` for
  the actor. Never wire a guard manually on a controller for these three.
- **Errors:** throw `NotFoundException` / `ForbiddenException` / `ConflictException` / … —
  `AllExceptionsFilter` shapes the body. Never `try/catch` a Prisma error for the common
  mappings.
- **DI:** constructor injection, `private readonly`. No service locator, no circular deps —
  extract a shared module instead.
- **Async:** every DB call is awaited; no floating promises (lint enforces). Use
  `prisma.$transaction` for multi-write invariants.
- **Config:** inject the typed config; never `process.env`.
- **Types:** strict mode is on (`noUncheckedIndexedAccess`, `noImplicitOverride`). No `any` —
  use `z.infer`, Prisma types, or a narrow interface. `override` keyword where required.
- **No `class-validator`, no DTO classes** — Zod only.
- Persian for user-facing strings (validation, 4xx messages); English for logs and code.
