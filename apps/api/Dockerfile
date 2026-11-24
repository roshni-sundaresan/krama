# Build context: repository root.  docker build -f apps/api/Dockerfile .
FROM node:22.23.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/guardrails/package.json packages/guardrails/
COPY packages/workflows/package.json packages/workflows/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter "@krama/api..."
COPY packages/shared packages/shared
COPY packages/guardrails packages/guardrails
COPY packages/workflows packages/workflows
COPY apps/api apps/api
RUN pnpm --filter "@krama/api" exec prisma generate \
  && pnpm --filter "@krama/api..." build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
# Uploaded files live on a volume mounted here; the node user must own it.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Apply migrations, then start. Seed separately: docker compose run --rm api pnpm db:seed
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
