# FrequenciApp. Imagem da aplicação (Next.js standalone).
# Multi-estágio para manter a imagem final pequena.

# Base comum: habilita o pnpm via Corepack em todos os estágios.
FROM node:24-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 1. Dependências (prisma e scripts junto: o postinstall gera o cliente
# e copia os assets do Swagger UI para public/vendor)
FROM base AS dependencias
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

# 2. Compilação
FROM base AS compilacao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
# Os assets do Swagger UI são gerados na instalação e novamente antes do build.
COPY --from=dependencias /app/public ./public
# O cliente é sempre regenerado no build, independente do que houver no host.
COPY --from=dependencias /app/generated ./generated
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    DIRECT_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    AUTH_SECRET=segredo-dummy-de-32-bytes-para-build-0000 \
    TZ_APP=America/Fortaleza \
    pnpm run build

# 3. Dependências de produção (o migrador e os scripts administrativos rodam
# fora da árvore do standalone e usam pg e dotenv).
FROM base AS producao
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# 4. Execução (somente o necessário)
FROM node:24-bookworm-slim AS execucao
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app
# Dependências de produção completas (o standalone não cobre o migrador).
COPY --from=producao /app/node_modules ./node_modules
# Servidor standalone do Next e arquivos estáticos.
COPY --from=compilacao /app/.next/standalone/server.js ./server.js
COPY --from=compilacao /app/.next/standalone/package.json ./package.json
COPY --from=compilacao /app/.next/standalone/.next ./.next
# Documentação em Markdown lida em tempo de execução por /api/docs/api.md.
COPY --from=compilacao /app/.next/standalone/docs ./docs
COPY --from=compilacao /app/.next/static ./.next/static
COPY --from=compilacao /app/public ./public
COPY --from=compilacao /app/prisma ./prisma
COPY --from=compilacao /app/generated ./generated
COPY --from=compilacao /app/docker ./docker
COPY --from=compilacao /app/scripts ./scripts
COPY --from=compilacao /app/src/infra/schema-postgres.mjs ./src/infra/schema-postgres.mjs
RUN chmod +x ./docker/app/entrypoint.sh
USER node
EXPOSE 3000
ENV PORT=3000
# Escuta em todas as interfaces: o healthcheck e o proxy interno usam 127.0.0.1.
ENV HOSTNAME=0.0.0.0
# Sonda usada pelo Docker e pelos emuladores de Container Apps: a réplica só é
# considerada pronta quando GET /api/saude responde sem erro.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/api/saude').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./docker/app/entrypoint.sh"]
