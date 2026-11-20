# Prepara unidade e regressões administrativas com ferramentas reais e fontes públicas.
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
RUN apt-get update && apt-get install -y --no-install-recommends git openssl util-linux passwd gnupg ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
# Os artefatos fixados atendem ao runner Linux amd64; o legado nunca entra no PATH.
RUN test "$(dpkg --print-architecture)" = amd64 \
    && mkdir -p /opt/frequenciapp-test-tools \
    && curl --fail --show-error --location --proto '=https' --proto-redir '=https' \
      https://downloads.rclone.org/v1.67.0/rclone-v1.67.0-linux-amd64.zip -o /tmp/rclone.zip \
    && printf '%s  %s\n' 07c23d21a94d70113d949253478e13261c54d14d72023bb14d96a8da5f3e7722 /tmp/rclone.zip | sha256sum -c - \
    && unzip -p /tmp/rclone.zip rclone-v1.67.0-linux-amd64/rclone > /usr/local/bin/rclone \
    && curl --fail --show-error --location --proto '=https' --proto-redir '=https' \
      https://deb.debian.org/debian/pool/main/r/rclone/rclone_1.60.1+dfsg-2+b5_amd64.deb -o /tmp/rclone-legado.deb \
    && printf '%s  %s\n' 703722dcab0c487322690fe68c7f8d6787e54e1ecd1297800d1382687ddbd81a /tmp/rclone-legado.deb | sha256sum -c - \
    && dpkg-deb --fsys-tarfile /tmp/rclone-legado.deb | tar -xOf - ./usr/bin/rclone > /opt/frequenciapp-test-tools/rclone-legado \
    && curl --fail --show-error --location --proto '=https' --proto-redir '=https' \
      https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-linux-amd64 -o /usr/local/bin/jq \
    && printf '%s  %s\n' 020468de7539ce70ef1bceaf7cde2e8c4f2ca6c3afb84642aabc5c97d9fc2a0d /usr/local/bin/jq | sha256sum -c - \
    && chmod 0755 /usr/local/bin/rclone /usr/local/bin/jq /opt/frequenciapp-test-tools/rclone-legado \
    && ln -s /usr/local/bin/node /usr/bin/node \
    && rm /tmp/rclone.zip /tmp/rclone-legado.deb
ENV PATH=/usr/local/bin:/usr/bin:/bin
# Confere versões e capacidade nos executáveis reais, sem autenticação ou acesso remoto.
RUN node --input-type=module -e ' \
    import assert from "node:assert/strict"; import { spawnSync } from "node:child_process"; \
    import { existsSync, realpathSync } from "node:fs"; import path from "node:path"; \
    const executar = (bin, args) => { const r = spawnSync(bin, args, { encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024, env: { PATH: process.env.PATH, HOME: "/tmp" } }); assert.ifError(r.error); assert.equal(r.signal, null); assert.equal(r.status, 0, r.stderr); return r.stdout; }; \
    assert.equal(path.dirname(process.execPath), "/usr/local/bin"); assert.equal(realpathSync("/usr/bin/node"), process.execPath); \
    assert.equal(executar("/bin/sh", ["-c", "command -v rclone"]).trim(), "/usr/local/bin/rclone"); assert.equal(existsSync("/usr/bin/rclone"), false); \
    assert.equal(executar("jq", ["--version"]).trim(), "jq-1.8.1"); executar("gpg", ["--version"]); executar("gpgconf", ["--version"]); \
    for (const [bin, versao, capacidade] of [["rclone", "rclone v1.67.0", true], ["/opt/frequenciapp-test-tools/rclone-legado", "rclone v1.60.1-DEV", false]]) { \
      assert.equal(executar(bin, ["--version"]).split("\n")[0], versao); \
      const dropbox = JSON.parse(executar(bin, ["--config", "/dev/null", "config", "providers"])).find(p => p.Name === "dropbox"); \
      assert.ok(dropbox); assert.equal(dropbox.Options.some(o => o.Name === "root_namespace"), capacidade); \
    }'
WORKDIR /repo
COPY --chown=0:0 scripts/servidor ./scripts/servidor
COPY --chown=0:0 scripts/instalador ./scripts/instalador
COPY --chown=0:0 tests/servidor/controlador ./tests/servidor/controlador
COPY --chown=0:0 tests/instalador ./tests/instalador
COPY --chown=0:0 infra/servidor ./infra/servidor
COPY --chown=0:0 docker/app/migrar.mjs ./docker/app/migrar.mjs
COPY --chown=0:0 src/infra/schema-postgres.mjs ./src/infra/schema-postgres.mjs
COPY --chown=0:0 package.json ./package.json
COPY --chown=0:0 instalar.sh .env.example compose*.yml ./
RUN chmod -R go-w /repo
USER 0:0
CMD ["bash", "-c", "umask 077; exec node --test --test-reporter=tap --test-concurrency=1 tests/servidor/controlador/*.test.mjs"]
