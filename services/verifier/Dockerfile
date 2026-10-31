# Verifier service production image (ROADMAP V-10)
# Pinned by digest for OpenSSF Scorecard Pinned-Dependencies; dependabot.yml has a `docker`
# ecosystem entry for this directory, so the digest is refreshed weekly rather than frozen.
# Digest of node:24-slim as resolved by the scorecard scan of 2026-10-30.
FROM node:25-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Install dependencies and build project
# Every package build extends tsconfig.base.json; without it tsc fails (TS5083).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY vendor/ ./vendor/

RUN corepack enable && pnpm install --frozen-lockfile \
 && pnpm --filter @witness/core run build \
 && pnpm --filter @accensa/sdk run build \
 && pnpm build

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.VERIFIER_PORT || process.env.PORT || 10000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# main.ts refuses to start without the model, its API key and the verifier key (it never invents a reading).
CMD ["node", "services/verifier/src/main.ts"]
