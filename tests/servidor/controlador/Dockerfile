# Prepara os ensaios administrativos com clientes falsos e fontes públicas de root.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
RUN apt-get update && apt-get install -y --no-install-recommends git util-linux passwd \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --chown=0:0 scripts/servidor ./scripts/servidor
COPY --chown=0:0 scripts/instalador ./scripts/instalador
COPY --chown=0:0 tests/servidor/controlador ./tests/servidor/controlador
COPY --chown=0:0 docker/app/migrar.mjs ./docker/app/migrar.mjs
COPY --chown=0:0 package.json ./package.json
RUN chmod -R go-w /repo
USER 0:0
CMD ["bash", "-c", "umask 077; exec node --test --test-reporter=tap --test-concurrency=1 tests/servidor/controlador/*.test.mjs"]
