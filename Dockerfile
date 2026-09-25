# FrequenciApp. Imagem da aplicação (Next.js standalone).
# Multi-estágio para manter a imagem final pequena.

# 1. Dependências (prisma junto: o postinstall gera o cliente)
FROM node:24-bookworm-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# 2. Compilação
FROM node:24-bookworm-slim AS compilacao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
# O cliente é sempre regenerado no build, independente do que houver no host.
COPY --from=dependencias /app/generated ./generated
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    DIRECT_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    AUTH_SECRET=segredo-dummy-de-32-bytes-para-build-0000 \
    TZ_APP=America/Fortaleza \
    npm run build

# 3. Execução (somente o necessário)
FROM node:24-bookworm-slim AS execucao
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app
COPY --from=compilacao /app/.next/standalone ./
COPY --from=compilacao /app/.next/static ./.next/static
COPY --from=compilacao /app/public ./public
COPY --from=compilacao /app/prisma ./prisma
COPY --from=compilacao /app/generated ./generated
COPY --from=compilacao /app/docker ./docker
COPY --from=compilacao /app/scripts ./scripts
# Fecho de dependências do migrador e dos scripts administrativos, que
# rodam fora da árvore do standalone: pg e transitivas, mais dotenv.
COPY --from=dependencias /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=dependencias /app/node_modules/pg ./node_modules/pg
COPY --from=dependencias /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=dependencias /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=dependencias /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=dependencias /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=dependencias /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=dependencias /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=dependencias /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=dependencias /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=dependencias /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=dependencias /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=dependencias /app/node_modules/split2 ./node_modules/split2
COPY --from=dependencias /app/node_modules/xtend ./node_modules/xtend
RUN chmod +x ./docker/app/entrypoint.sh
USER node
EXPOSE 3000
ENV PORT=3000
# Escuta em todas as interfaces: o healthcheck e o proxy interno usam 127.0.0.1.
ENV HOSTNAME=0.0.0.0
CMD ["./docker/app/entrypoint.sh"]
