# Ferramentas da prova root isolada, sem aplicação nem credenciais na imagem.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash git jq util-linux coreutils shellcheck && rm -rf /var/lib/apt/lists/*
WORKDIR /sandbox
ENTRYPOINT ["/bin/bash", "/repo/tests/servidor/controlador/operacional.sh"]
