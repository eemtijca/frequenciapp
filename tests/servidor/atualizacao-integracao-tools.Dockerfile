# Camada mínima do ensaio; a base local é conferida por ID pelo coordenador.
ARG FERRAMENTAS
FROM ${FERRAMENTAS}
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends age curl \
    && rm -rf /var/lib/apt/lists/*
USER 1000:1000
