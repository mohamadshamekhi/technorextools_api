FROM node:22-slim AS base
# npm registry for pnpm itself (corepack) and for every package. Point it at a
# mirror when the build host can't reach registry.npmjs.org (NPM_REGISTRY in
# .env.production, passed through docker-compose.prod.yml).
ARG NPM_REGISTRY=https://registry.npmjs.org/
# Keep in sync with "packageManager" in package.json — corepack refuses a mismatch
# and would download the other version on every build.
ARG PNPM_VERSION=11.6.0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_HOME=/corepack
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV npm_config_registry=$NPM_REGISTRY
# openssl + ca-certificates are required by Prisma's query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
# Download pnpm once into this cached layer instead of on every `pnpm install`;
# world-readable so the `node` user can run it too.
RUN corepack install --global pnpm@$PNPM_VERSION && chmod -R a+rX $COREPACK_HOME
WORKDIR /app

# ---- full install (dev + prod) for the build ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- compile ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- tooling: one-shot `prisma db push` / `prisma db seed` ----
# Keeps the dev deps (the seed script runs through ts-node), so it must stay a
# separate stage from `runtime` — never deploy this one as the server.
FROM base AS tooling
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["sh", "-c", "pnpm prisma:push && pnpm prisma:seed"]

# ---- production-only deps (Prisma client generated via postinstall) ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
USER node
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts package.json ./
EXPOSE 4000
CMD ["node", "dist/main"]
