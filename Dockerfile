# FrequenciApp. Imagem da aplicação (Next.js standalone).
# Multi-estágio para manter a imagem final pequena.

# Base comum: habilita o pnpm via Corepack em todos os estágios.
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install --global corepack@0.36.0 && corepack enable

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
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS execucao
ARG COMMIT_SHA=local
LABEL org.opencontainers.image.revision=$COMMIT_SHA
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
# A atualização pode construir de uma worktree com umask 077. Ajusta apenas
# os artefatos copiados da fonte, sem seguir links ou dar escrita a node.
# A imagem de backup de planilhas também herda os scripts de execução.
RUN chmod u=rwx,go=rx ./docker ./scripts ./scripts/backup ./scripts/servidor \
  && find -P ./docker/app ./scripts/administracao ./prisma ./public ./docs \
    -type d -exec chmod u=rwx,go=rx {} + \
  && find -P ./docker/app ./scripts/administracao ./prisma ./public ./docs \
    ./scripts/servidor/agenda.mjs ./scripts/servidor/backup-planilhas-interno.sh \
    ./scripts/backup/backup-externo.mjs ./scripts/backup/pacote-backup.mjs \
    ./src/infra/schema-postgres.mjs -type f -exec chmod a+rX,go-w {} + \
  && chmod a+x ./docker/app/entrypoint.sh
USER node
# Recusa a imagem antes da troca de versão se o usuário efetivo não tiver acesso.
RUN --network=none set -eu; \
  test -x ./docker/app/entrypoint.sh \
    || { printf '%s\n' 'Não executável por node: ./docker/app/entrypoint.sh' >&2; exit 1; }; \
  exigir_leitura() { \
    test -r "$1" || { printf 'Ilegível para node: %s\n' "$1" >&2; exit 1; }; \
  }; \
  for caminho in ./docker/app/entrypoint.sh ./docker/app/migrar.mjs \
    ./scripts/administracao/criar-admin.mjs ./scripts/administracao/*.mjs \
    ./scripts/servidor/agenda.mjs ./scripts/servidor/backup-planilhas-interno.sh \
    ./scripts/backup/backup-externo.mjs ./scripts/backup/pacote-backup.mjs ./src/infra/schema-postgres.mjs \
    ./prisma/migrations ./prisma/migrations/migration_lock.toml \
    ./public/manifest.webmanifest ./docs/api.md ./server.js; do \
    exigir_leitura "$caminho"; \
  done; \
  for pasta in ./prisma/migrations/*/; do \
    exigir_leitura "${pasta}migration.sql"; \
  done
EXPOSE 3000
ENV PORT=3000
# Escuta em todas as interfaces: o healthcheck e o proxy interno usam 127.0.0.1.
ENV HOSTNAME=0.0.0.0
# Sonda usada pelo Docker e pelos emuladores de Container Apps: a réplica só é
# considerada pronta quando GET /api/saude responde sem erro.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/api/saude').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["./docker/app/entrypoint.sh"]
