FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable

# Copy workspace configuration
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy project package.json files
COPY core/package.json ./core/
COPY web/package.json ./web/

# Install all deps for build
RUN pnpm install --frozen-lockfile

# Copy source code
COPY core ./core
COPY web ./web
COPY Update.log ./Update.log

# Build web
RUN pnpm build:web

# ==========================================
FROM node:20-alpine AS prod-deps

WORKDIR /app

RUN corepack enable
RUN apk add --no-cache python3 make g++

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY core/package.json ./core/
COPY web/package.json ./web/

# Install only runtime deps for core
RUN pnpm -C core install --prod --frozen-lockfile
RUN cd /app/core && npm rebuild better-sqlite3

# ==========================================

FROM node:20-alpine AS runner

WORKDIR /app/core

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# Copy runtime deps
COPY --from=prod-deps /app/node_modules ../node_modules/
COPY --from=prod-deps /app/core/node_modules ./node_modules/
COPY --from=prod-deps /app/package.json ../package.json

# Copy core source
COPY --from=builder /app/core ./

# Copy built web assets
COPY --from=builder /app/web/dist ../web/dist

# Copy Update.log for notifications (from builder stage)
COPY --from=builder /app/Update.log ../Update.log

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "client.js"]
