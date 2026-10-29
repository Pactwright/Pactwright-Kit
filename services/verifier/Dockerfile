# Verifier service production image (ROADMAP V-10)
FROM node:24-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies and build project
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY vendor/ ./vendor/

RUN corepack enable && pnpm install --frozen-lockfile

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "services/verifier/src/index.ts"]
