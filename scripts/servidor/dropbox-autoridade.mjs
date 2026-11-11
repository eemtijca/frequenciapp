// Mantém a autoridade Dropbox no ciclo Bash e entrega capacidades reais aos filhos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { validarRecibo } from "./recibos.mjs";
import {
  carregarAdocaoDropbox,
  adquirirAutoridadeDropbox,
  receberAutoridadeDropbox,
  conferirUploadDropbox,
  persistirDropbox,
  lerPrivado,
} from "./dropbox-estado.mjs";

const exigir = (ok) => {
  if (!ok) throw new Error("Dropbox: sessão ou publicação não comprovada.");
};
const hash = (b) => createHash("sha256").update(b).digest("hex");
function sincronizar(arquivo, diretorio = false) {
  const fd = fs.openSync(
    arquivo,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | (diretorio ? fs.constants.O_DIRECTORY : 0),
  );
  try {
    const s = fs.fstatSync(fd);
    exigir(
      (diretorio ? s.isDirectory() : s.isFile()) &&
        s.uid === process.getuid() &&
        (s.mode & 0o077) === 0,
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
async function executar(config, e) {
  exigir(!e.BACKUP_DROPBOX_SESSAO);
  const authority = adquirirAutoridadeDropbox(config, true);
  let proofFd;
  try {
    conferirUploadDropbox(config);
    const sessao = randomBytes(32).toString("hex");
    const nome = `${config.authorityLock}.${randomUUID()}.session`;
    fs.writeFileSync(nome, "", { mode: 0o600, flag: "wx" });
    try {
      proofFd = fs.openSync(nome, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const prova = {
        pid: process.pid,
        sessao,
        configHash: hash(JSON.stringify(config)),
        proofFd,
        lockFd: authority.fd,
      };
      fs.writeFileSync(nome, JSON.stringify(prova));
    } finally {
      fs.unlinkSync(nome);
    }
    // A intenção sobrevive a erro/crash do produtor. Não se adota upload parcial.
    persistirDropbox(`${config.authorityLock}.upload.json`, {
      versao: 1,
      sessao,
      configHash: hash(JSON.stringify(config)),
    });
    const p = spawn("/bin/bash", [fileURLToPath(new URL("./backup-banco.sh", import.meta.url))], {
      env: { ...e, BACKUP_DROPBOX_SESSAO: sessao },
      stdio: [
        "inherit",
        "inherit",
        "inherit",
        "ignore",
        "ignore",
        "ignore",
        proofFd,
        authority.fd,
        "ignore",
        9,
      ],
    });
    let sinal = null;
    const encaminhar = (s) => {
      sinal = s;
      p.kill(s);
    };
    process.on("SIGINT", encaminhar);
    process.on("SIGTERM", encaminhar);
    try {
      const resultado = await new Promise((resolve, reject) => {
        p.once("error", reject);
        p.once("close", (status, signal) => resolve({ status, signal }));
      });
      exigir(!sinal && resultado.signal === null && Number.isInteger(resultado.status));
      return resultado.status;
    } finally {
      process.off("SIGINT", encaminhar);
      process.off("SIGTERM", encaminhar);
    }
  } finally {
    if (proofFd !== undefined) fs.closeSync(proofFd);
    authority.close();
  }
}
function publicar(config, e, nome) {
  exigir(/^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/.test(nome ?? ""));
  const marker = `${config.authorityLock}.upload.json`;
  const intent = JSON.parse(lerPrivado(marker));
  exigir(
    intent.versao === 1 &&
      intent.sessao === e.BACKUP_DROPBOX_SESSAO &&
      intent.configHash === hash(JSON.stringify(config)),
  );
  const catalogo = path.join(e.ESTADO_DIR, "recibos"),
    local = e.BACKUP_BANCO_DIR;
  const bytes = lerPrivado(path.join(catalogo, nome)),
    r = validarRecibo(JSON.parse(bytes));
  exigir(
    nome === `${r.base}.confirmado.json` &&
      r.escopo.alvo === config.alvo &&
      r.escopo.banco === config.banco &&
      r.escopo.schema === config.schema &&
      r.remoto === config.destino,
  );
  exigir(bytes.equals(lerPrivado(path.join(local, nome))));
  const estado = path.join(e.ESTADO_DIR, "ultimo-backup.json");
  exigir(JSON.parse(lerPrivado(estado)).recibo === nome);
  for (const a of r.artefatos) sincronizar(path.join(local, a.nome));
  for (const p of [path.join(catalogo, nome), path.join(local, nome), estado]) sincronizar(p);
  for (const d of [catalogo, local, e.ESTADO_DIR]) sincronizar(d, true);
  // Só depois de publicação durável o expurgador pode consumir o catálogo.
  fs.unlinkSync(marker);
  sincronizar(path.dirname(marker), true);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const e = process.env,
      [acao, nome] = process.argv.slice(2);
    exigir(e.BACKUP_MODO === "compose" && e.BACKUP_REMOTO && e.BACKUP_DROPBOX_CONFIG);
    const config = carregarAdocaoDropbox(e.BACKUP_DROPBOX_CONFIG, e);
    if (acao === "executar") process.exitCode = await executar(config, e);
    else {
      exigir(acao === "conferir" || acao === "publicar");
      const authority = receberAutoridadeDropbox(config, e);
      try {
        if (acao === "publicar") publicar(config, e, nome);
      } finally {
        authority.close();
      }
    }
  } catch {
    console.error(
      "[dropbox] Autoridade ou publicação incerta; preservar intenção e suspender exclusões.",
    );
    process.exitCode = 1;
  }
}
