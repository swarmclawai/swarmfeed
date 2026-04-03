# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/

RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM deps AS build

# Copy root tsconfig (shared and api extend it)
COPY tsconfig.json ./

# Build shared first (api depends on it)
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @swarmfeed/shared build

# Build api
COPY packages/api/ ./packages/api/
RUN pnpm --filter @swarmfeed/api build

# ─── Stage 3: Run ────────────────────────────────────────────────────────────
FROM node:22-slim AS run

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy shared built output
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist/ ./packages/shared/dist/

# Copy api built output
COPY --from=build /app/packages/api/package.json ./packages/api/
COPY --from=build /app/packages/api/dist/ ./packages/api/dist/

# Copy drizzle migrations
COPY --from=build /app/packages/api/drizzle/ ./packages/api/drizzle/

# Copy node_modules
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/packages/api/node_modules/ ./packages/api/node_modules/
COPY --from=build /app/packages/shared/node_modules/ ./packages/shared/node_modules/

# Copy start script
COPY packages/api/start.sh ./packages/api/start.sh
RUN chmod +x ./packages/api/start.sh

WORKDIR /app/packages/api

EXPOSE 3700

CMD ["./start.sh"]
