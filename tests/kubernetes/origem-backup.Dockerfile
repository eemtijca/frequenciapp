# PostgreSQL, Node, age e dependências públicas; nenhuma imagem local implícita.
ARG FERRAMENTAS
FROM ${FERRAMENTAS} AS ferramentas
FROM postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994
RUN apt-get update && apt-get install -y --no-install-recommends age openssl jq util-linux coreutils && rm -rf /var/lib/apt/lists/*
COPY --from=ferramentas /usr/local/bin/node /usr/local/bin/node
COPY --from=ferramentas /node_modules /node_modules
LABEL frequenciapp.ensaio="origem-backup-sintetico" frequenciapp.ensaio.toolchain="origem-v2"
ENV NODE_VERSION=24.22.2 HOME=/tmp TMPDIR=/tmp
WORKDIR /app
ENTRYPOINT []
USER 999:999
CMD ["node", "--test", "tests/servidor/origem-backup-cli.e2e.mjs"]
