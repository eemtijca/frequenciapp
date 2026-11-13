# Ferramentas do executor: Node fixo com Docker CLI, Buildx e Compose.
# Uso exclusivo em testes descartáveis; não é imagem de produção.

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68

RUN npm install --global corepack@0.36.0 && corepack enable

ARG DOCKER_VERSION=27.5.1
ARG DOCKER_SHA256=4f798b3ee1e0140eab5bf30b0edc4e84f4cdb53255a429dc3bbae9524845d640
ARG BUILDX_VERSION=0.20.1
ARG BUILDX_SHA256=8c38f60308a895fa570f1410e453c5de11aafd65a99fa99965d96d24b6225a78
ARG COMPOSE_VERSION=2.32.4
ARG COMPOSE_SHA256=ed1917fb54db184192ea9d0717bcd59e3662ea79db48bff36d3475516c480a6b

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ca-certificates curl; \
  rm -rf /var/lib/apt/lists/*; \
  curl -fsSL -o /tmp/docker.tgz "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_VERSION}.tgz"; \
  echo "${DOCKER_SHA256}  /tmp/docker.tgz" | sha256sum -c -; \
  tar -xzf /tmp/docker.tgz -C /tmp; \
  install -m 0755 /tmp/docker/docker /usr/local/bin/docker; \
  mkdir -p /usr/local/lib/docker/cli-plugins; \
  curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-buildx "https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.linux-amd64"; \
  echo "${BUILDX_SHA256}  /usr/local/lib/docker/cli-plugins/docker-buildx" | sha256sum -c -; \
  chmod 0755 /usr/local/lib/docker/cli-plugins/docker-buildx; \
  curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-x86_64"; \
  echo "${COMPOSE_SHA256}  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -; \
  chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose; \
  rm -rf /tmp/docker /tmp/docker.tgz; \
  docker --version; \
  docker buildx version; \
  docker compose version
