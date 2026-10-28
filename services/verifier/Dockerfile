# Verifier service image (ROADMAP V-10).
FROM node:24-slim
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile --prod
CMD ["node", "services/verifier/src/index.ts"]
