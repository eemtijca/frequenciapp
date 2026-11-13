# Imagem da verificação de qualidade: Node fixo com git e OpenSSL.
# A base é a mesma do build da aplicação; os testes de unidade usam git e openssl.

FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssl jq gpg \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global corepack@0.36.0 && corepack enable
