# Imagem da verificação de qualidade: Node fixo com git e OpenSSL.
# A base é a mesma do build da aplicação; os testes de unidade usam git e openssl.

FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssl jq gpg \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global corepack@0.36.0 && corepack enable
