# Imagem da verificação de qualidade: Node fixo com git e OpenSSL.
# A base é a mesma do build da aplicação; os testes de unidade usam git e openssl.

FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssl jq gpg \
  && rm -rf /var/lib/apt/lists/*
