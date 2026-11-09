# Prepara ferramentas sem segredos; os testes usam outro namespace sem rede.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS node
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f
COPY --from=node /usr/local/ /usr/local/
RUN corepack enable pnpm && corepack prepare pnpm@12.11.2 --activate
WORKDIR /work
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/assets ./scripts/assets
RUN pnpm run db:generate && node scripts/assets/copiar-swagger-ui.mjs
