// Exercita os padrões restantes em sandbox com clientes e arquivos sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const raiz = process.cwd();
const sha = (x) => createHash("sha256").update(x).digest("hex");

for (const minimo of [undefined, "5", "0"]) {
  test(`opções do consumidor remoto usam ${minimo ?? "30 por padrão"} antes do bloqueio`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-opcoes-"));
    try {
      const arquivo = path.join(tmp, "observado.json");
      const script = path.join(tmp, "backup-recibos.mjs");
      const catalogo = path.join(tmp, "catalogo");
      const estado = path.join(tmp, "estado");
      const diarios = path.join(estado, "diarios");
      const trava = path.join(tmp, "trava");
      fs.mkdirSync(catalogo, { mode: 0o700 });
      fs.mkdirSync(estado, { mode: 0o700 });
      fs.writeFileSync(trava, "", { mode: 0o600 });
      const recibos = pathToFileURL(path.join(raiz, "scripts/servidor/recibos.mjs")).href;
      fs.copyFileSync(path.join(raiz, "scripts/servidor/backup-recibos.mjs"), script);
      fs.writeFileSync(
        path.join(tmp, "recibos.mjs"),
        `import fs from "node:fs";
import { planejarRetencao as planejarReal } from ${JSON.stringify(recibos)};
export * from ${JSON.stringify(recibos)};
export function planejarRetencao(...args) {
  fs.appendFileSync(process.env.CAPTURA, JSON.stringify(args) + "\\n");
  return planejarReal(...args);
}
`,
      );
      for (const nome of ["dropbox-retencao.mjs", "dropbox-api.mjs", "dropbox-estado.mjs"]) {
        fs.symlinkSync(path.join(raiz, "scripts/servidor", nome), path.join(tmp, nome));
      }
      const fd = fs.openSync(trava, "r");
      let resultado;
      try {
        resultado = spawnSync(process.execPath, [script, "expurgar-remoto", catalogo, diarios], {
          env: {
            PATH: process.env.PATH,
            HOME: tmp,
            TMPDIR: tmp,
            CAPTURA: arquivo,
            BACKUP_MODO: "compose",
            BACKUP_CATALOGO_PERSISTENTE: "true",
            SERVIDOR_ALVO_CHAVE: "sintetico",
            BACKUP_BANCO_VERIFICADO: "sintetico",
            DATABASE_SCHEMA: "public",
            BACKUP_REMOTO: "falso:copias",
            BACKUP_RETER_DIAS: "1",
            SERVIDOR_LOCK_HERDADO: trava,
            ...(minimo === undefined ? {} : { BACKUP_RETER_MINIMO: minimo }),
          },
          stdio: [
            "ignore",
            "pipe",
            "pipe",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            "ignore",
            fd,
          ],
          encoding: "utf8",
          timeout: 10000,
        });
      } finally {
        fs.closeSync(fd);
      }
      assert.ifError(resultado.error);
      assert.equal(resultado.signal, null);
      assert.equal(resultado.status, 1, resultado.stderr);
      assert.match(resultado.stderr, /Expurgo remoto suspenso.*adoção Dropbox específica/);
      const chamadas = fs.readFileSync(arquivo, "utf8").trim().split("\n").map(JSON.parse);
      assert.equal(chamadas.length, 1);
      assert.equal(chamadas[0].length, 2);
      const [entrada, opcoes] = chamadas[0];
      assert.deepEqual(entrada, []);
      assert.equal(opcoes.minimo, Number(minimo ?? 30));
      assert.equal(opcoes.dias, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

for (const minimo of [undefined, "5", "0"]) {
  test(`planilhas usam ${minimo ?? "30 por padrão"} em cópias sintéticas confirmadas`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "retencao-planilhas-"));
    try {
      const bin = path.join(tmp, "bin"),
        pasta = path.join(tmp, "planilhas"),
        remoto = path.join(tmp, "remoto");
      for (const d of [bin, pasta, remoto]) fs.mkdirSync(d);
      const nomeArquivo = (i) =>
        `frequenciapp-2000-01-01T00-00-00-000Z-00000000-0000-4000-8000-${String(i).padStart(12, "0")}.zip`;
      const recibo = (arquivo, bytes) => ({
        versao: 1,
        arquivo,
        exportadoEm: "2000-01-01T00:00:00.000Z",
        sha256: sha(bytes),
        bytes: Buffer.byteLength(bytes),
        arquivos: 1,
      });
      const nome = nomeArquivo(9999),
        conteudo = "novo sintético";
      fs.writeFileSync(path.join(remoto, nome), conteudo);
      fs.writeFileSync(
        path.join(remoto, `${nome}.confirmado.json`),
        JSON.stringify(recibo(nome, conteudo)),
      );
      fs.writeFileSync(path.join(tmp, "config"), "sintetico", { mode: 0o600 });
      fs.writeFileSync(
        path.join(bin, "node"),
        `#!/bin/sh\nif [ "$1" = scripts/backup/backup-externo.mjs ]; then printf '%s\\n' '${JSON.stringify(recibo(nome, conteudo))}'; else exec ${process.execPath} "$@"; fi\n`,
        { mode: 0o700 },
      );
      // O script chama rclone com env -i; o cliente usa um caminho fixo de fixture.
      fs.writeFileSync(
        path.join(bin, "rclone"),
        `#!/bin/sh\n[ "$1" = copyto ] || exit 80\ncp '${remoto}/'\"\${2##*/}\" "$3"\n`,
        { mode: 0o700 },
      );
      for (let i = 0; i < 32; i++) {
        const nomeAntigo = nomeArquivo(i);
        const zip = path.join(pasta, nomeAntigo);
        fs.writeFileSync(zip, "sintetico");
        fs.writeFileSync(`${zip}.confirmado.json`, JSON.stringify(recibo(nomeAntigo, "sintetico")));
        fs.utimesSync(zip, 946684800 + i, 946684800 + i);
      }
      const resultado = spawnSync("bash", ["scripts/servidor/backup-planilhas-interno.sh"], {
        cwd: raiz,
        encoding: "utf8",
        timeout: 10000,
        env: {
          PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: tmp,
          TMPDIR: tmp,
          BACKUP_RCLONE_CONFIG: path.join(tmp, "config"),
          BACKUP_DESTINO: "falso:copias",
          BACKUP_PLANILHAS_DIR: pasta,
          BACKUP_RETER_DIAS: "1",
          ...(minimo === undefined ? {} : { BACKUP_RETER_MINIMO: minimo }),
        },
      });
      assert.ifError(resultado.error);
      assert.equal(resultado.signal, null);
      assert.equal(resultado.status, 0, resultado.stderr);
      const restantes = fs.readdirSync(pasta).filter((n) => n.endsWith(".zip"));
      assert.equal(restantes.length, Math.max(1, Number(minimo ?? 30)));
      assert.ok(restantes.includes(nome));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}
