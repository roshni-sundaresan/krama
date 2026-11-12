# TypeScript Temporal worker (workflows + orchestration activities).
# Build context: repository root.  docker build -f packages/workflows/Dockerfile .
FROM node:22.23.0-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/workflows/package.json packages/workflows/
RUN pnpm install --frozen-lockfile --filter "@krama/workflows..."
COPY packages/shared packages/shared
COPY packages/workflows packages/workflows
RUN pnpm --filter "@krama/workflows..." build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/packages/workflows
USER node
CMD ["node", "dist/worker.js"]
