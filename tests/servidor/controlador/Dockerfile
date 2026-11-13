# Prepara os ensaios administrativos com clientes falsos e fontes públicas de root.
FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
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
