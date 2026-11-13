// Prepara adoção pública do controlador com arquivos e Docker estritamente sintéticos.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

export function fixture({ instalador = false } = {}) {
  assert.equal(process.getuid?.(), 0, "Executar a suíte administrativa com root interno isolado.");
  assert.equal(fs.existsSync("/var/run/docker.sock"), false);
  const raiz = fs.mkdtempSync("/tmp/rotinas-controlador-");
  const app = instalador ? `${raiz}/opt/frequenciapp` : `${raiz}/app`,
    config = instalador ? `${raiz}/etc/frequenciapp` : `${raiz}/config`,
    prefixo = instalador ? `${raiz}/opt/frequenciapp-controlador` : `${raiz}/controlador`,
    bin = `${raiz}/bin`;
  const destino = instalador ? `${raiz}/etc` : raiz;
  fs.mkdirSync(path.dirname(app), { recursive: true, mode: 0o700 });
  const repo = path.resolve(import.meta.dirname, "../../..");
  const gravar = (nome, bytes, modo = 0o600) => {
    fs.mkdirSync(path.dirname(nome), { recursive: true, mode: 0o700 });
    fs.writeFileSync(nome, bytes, { mode: modo });
    fs.chmodSync(nome, modo);
  };
  const executar = (cmd, args, opcoes = {}) =>
    spawnSync(cmd, args, {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`, HOME: raiz, TMPDIR: raiz },
      ...opcoes,
    });
  const ok = (r) => {
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    return r;
  };
  fs.mkdirSync(app, { mode: 0o700 });
  fs.cpSync(`${repo}/scripts/servidor`, `${app}/scripts/servidor`, { recursive: true });
  fs.chmodSync(`${app}/scripts`, 0o700);
  fs.chmodSync(`${app}/scripts/servidor`, 0o700);
  for (const p of fs.globSync(`${app}/scripts/servidor/**/*`))
    fs.chmodSync(p, fs.statSync(p).isDirectory() ? 0o700 : 0o600);
  gravar(`${app}/docker/app/migrar.mjs`, fs.readFileSync(`${repo}/docker/app/migrar.mjs`));
  gravar(`${app}/compose.yml`, "services: {}\n");
  ok(executar("/usr/bin/git", ["-C", app, "init", "-q"]));
  gravar(
    `${config}/app.env`,
    "# Conteúdo preservado sem DATABASE_URL.\nPOSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\nexport AGENDA_PLANILHAS=true\n",
  );
  gravar(
    `${config}/ops.env`,
    `COMPOSE_PROJECT_NAME=sintetico\nCOMPOSE_ARQUIVOS=compose.yml\nPROXY_TIPO=caddy\nBACKUP_MODO=compose\nBACKUP_PLANILHAS_HABILITADO=false\nESTADO_DIR=${raiz}/legado\nTZ_APP=UTC\nCRON_FUSO_SISTEMA=UTC\n`,
  );
  gravar(
    `${bin}/docker`,
    `#!/bin/bash
set -Eeuo pipefail
printf '%s\\n' "$*" >>${raiz}/docker.log
if [ "$1" = info ]; then printf '{"ID":"daemon-sintetico"}\\n'; exit; fi
if [ "$1" = inspect ]; then
  printf '%s\\n' '[{"Id":"container-app","Image":"sha256:app","State":{"Running":true,"Health":{"Status":"healthy"}},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Image":"sha256:db","State":{"Running":true},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"sintetico-dados","Source":"/var/lib/docker/volumes/sintetico-dados/_data","Destination":"/var/lib/postgresql/data"}]}]'; exit
fi
[ "$1" = compose ] || exit 93
shift
while [ "$#" -gt 0 ]; do case "$1" in --project-name|--project-directory|--env-file|-f|--profile) shift 2;; *) break;; esac; done
case "$1" in
config) if [[ " $* " == *" --services "* ]]; then printf 'app\\ndb\\ncaddy\\nbackup-planilhas\\n'; else printf '%s\\n' '{"name":"sintetico","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{}},"volumes":{"dados":{"name":"sintetico-dados"}}}'; fi;;
exec) exit 0;;
ps) printf 'container-app\\ncontainer-db\\n';;
*) exit 94;;
esac
`,
    0o700,
  );
  const env = {
    PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: raiz,
    TMPDIR: raiz,
    APP_DIR: app,
    APP_ENV_FILE: `${config}/app.env`,
    OPS_ENV_FILE: `${config}/ops.env`,
    SERVIDOR_CONFIG_DIR: config,
    SERVIDOR_IDENTIDADE_ARQUIVO: `${config}/identidade.json`,
    SERVIDOR_AMBIENTE_INJETADO: "true",
    COMPOSE_ARQUIVOS: "compose.yml",
    COMPOSE_PROJECT_NAME: "sintetico",
    PROXY_TIPO: "caddy",
    SERVIDOR_LOCK_DIR: `${raiz}/locks`,
  };
  ok(
    executar("/bin/bash", [`${app}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"], {
      env,
    }),
  );
  const cli = `${repo}/scripts/servidor/controlador/cli.mjs`;
  ok(
    executar(process.execPath, [
      cli,
      "instalar",
      "--fonte",
      app,
      "--app",
      app,
      "--config",
      config,
      "--prefixo",
      prefixo,
      "--operador",
      "nobody",
      "--bin-dir",
      bin,
      "--confirmar",
    ]),
  );
  const perfil = `${prefixo}/perfil.json`;
  ok(executar(`${prefixo}/executar`, ["instalar-rotinas", "--confirmar", "--destino", destino]));
  return {
    raiz,
    app,
    config,
    prefixo,
    perfil,
    bin,
    destino,
    gravar,
    executar,
    ok,
    cli,
    limpar: () => fs.rmSync(raiz, { recursive: true, force: true }),
  };
}
