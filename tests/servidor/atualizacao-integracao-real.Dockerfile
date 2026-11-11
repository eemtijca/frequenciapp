# Imagem sintética fechada: base local previamente fixada, sem download ou instalação.
ARG BASE
FROM ${BASE}
ARG COMMIT_SHA
LABEL org.opencontainers.image.revision=$COMMIT_SHA
WORKDIR /app
COPY docker/app/migrar.mjs /app/docker/app/migrar.mjs
COPY src/infra/schema-postgres.mjs /app/src/infra/schema-postgres.mjs
COPY node_modules/ /app/node_modules/
COPY prisma/migrations/ /app/prisma/migrations/
COPY tests/servidor/atualizacao-integracao-real-app.mjs /app/tests/servidor/atualizacao-integracao-real-app.mjs
COPY tests/servidor/atualizacao-integracao-real-proxy.mjs /app/tests/servidor/atualizacao-integracao-real-proxy.mjs
RUN node -e 'const f=require("node:fs"),s=process.env.COMMIT_SHA;if(!/^[a-f0-9]{40}$/.test(s))throw Error("COMMIT");f.writeFileSync("/app/commit.txt",s+"\n",{mode:0o444})'
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["/app/tests/servidor/atualizacao-integracao-real-app.mjs"]
