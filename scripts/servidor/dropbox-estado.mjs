// Valida adoção privada e mantém journal durável sob autoridade cooperativa local.
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

const exigir = (ok) => {
  if (!ok) throw new Error("Dropbox: adoção, autoridade ou journal não comprovado.");
};
const sha = (b) => createHash("sha256").update(b).digest("hex");
function privado(p, diretorio = false) {
  exigir(typeof p === "string" && path.isAbsolute(p) && fs.realpathSync(p) === path.resolve(p));
  const s = fs.lstatSync(p);
  exigir(
    !s.isSymbolicLink() &&
      (diretorio ? s.isDirectory() : s.isFile()) &&
      [0, process.getuid()].includes(s.uid) &&
      (s.mode & 0o077) === 0,
  );
  return s;
}
export function lerPrivado(p, limite = 1024 * 1024) {
  privado(path.dirname(p), true);
  privado(p);
  const fd = fs.openSync(
    p,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const s = fs.fstatSync(fd);
    exigir(
      s.isFile() &&
        [0, process.getuid()].includes(s.uid) &&
        (s.mode & 0o077) === 0 &&
        s.size <= limite,
    );
    const b = Buffer.alloc(limite + 1);
    let total = 0,
      n;
    while (total < b.length && (n = fs.readSync(fd, b, total, b.length - total, null))) total += n;
    exigir(total <= limite);
    return b.subarray(0, total);
  } finally {
    fs.closeSync(fd);
  }
}
export function persistirDropbox(p, dados) {
  privado(path.dirname(p), true);
  if (fs.existsSync(p)) privado(p);
  const t = `${p}.${randomUUID()}.tmp`,
    fd = fs.openSync(t, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(dados) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(t, p);
  const d = fs.openSync(
    path.dirname(p),
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    fs.fsyncSync(d);
  } finally {
    fs.closeSync(d);
  }
}
export function carregarAdocaoDropbox(arquivo, e) {
  const c = JSON.parse(lerPrivado(arquivo, 64 * 1024));
  exigir(
    c.versao === 1 &&
      c.adocao === "pasta-exclusiva-frequenciapp-v1" &&
      typeof c.accountId === "string" &&
      /^dbid:[A-Za-z0-9_-]+$/.test(c.accountId) &&
      /^\d+$/.test(c.namespaceId) &&
      /^id:[A-Za-z0-9_-]+$/.test(c.folderId),
  );
  exigir(
    typeof c.folderPath === "string" &&
      /^\/(?!$)[^\x00-\x1f\x7f\\]+$/.test(c.folderPath) &&
      c.folderPath === c.folderPath.toLowerCase() &&
      c.folderPath === path.posix.normalize(c.folderPath) &&
      !c.folderPath.endsWith("/"),
  );
  exigir(
    c.destino === e.BACKUP_REMOTO &&
      c.alvo === e.SERVIDOR_ALVO_CHAVE &&
      c.banco === e.BACKUP_BANCO_VERIFICADO &&
      c.schema === (e.DATABASE_SCHEMA ?? "public"),
  );
  exigir(
    [c.alvo, c.banco, c.schema].every(
      (s) =>
        typeof s === "string" && s.length > 0 && s.length <= 256 && !/[\x00-\x1f\x7f|]/.test(s),
    ),
  );
  exigir(
    Number.isSafeInteger(c.limiteBytes) &&
      c.limiteBytes > 0 &&
      c.limiteBytes <= 1024 ** 4 &&
      Number.isSafeInteger(c.timeoutMs) &&
      c.timeoutMs >= 50 &&
      c.timeoutMs <= 300000,
  );
  exigir(
    c.minimoAutorizado === undefined ||
      (Number.isSafeInteger(c.minimoAutorizado) && c.minimoAutorizado >= 0),
  );
  lerPrivado(c.tokenFile, 64 * 1024);
  const rcloneEfetivo = e.RCLONE_CONFIG ?? e.BACKUP_RCLONE_CONFIG;
  const ini = lerPrivado(c.rcloneConfig),
    efetivo = lerPrivado(rcloneEfetivo);
  exigir(/^[a-f0-9]{64}$/.test(c.rcloneConfigSha256) && sha(ini) === c.rcloneConfigSha256);
  // Sem alias, crypt ou opções implícitas: o operador adota exatamente este mapeamento.
  const destino = /^([A-Za-z0-9_-]+):(.+)$/.exec(c.destino);
  exigir(destino && `/${destino[2]}` === c.folderPath && !e.RCLONE_CONFIG_PASS);
  function interpretarIni(bytes) {
    const secoes = new Map();
    let secao;
    for (const linha of bytes.toString("utf8").split(/\r?\n/)) {
      const l = linha.trim();
      if (!l || l.startsWith("#") || l.startsWith(";")) continue;
      const h = /^\[([^\]]+)\]$/.exec(l);
      if (h) {
        exigir(!secoes.has(h[1]));
        secao = new Map();
        secoes.set(h[1], secao);
        continue;
      }
      const par = /^([a-zA-Z0-9_]+)\s*=\s*(.*)$/.exec(l);
      exigir(secao && par && !secao.has(par[1]));
      secao.set(par[1], par[2]);
    }
    return secoes;
  }
  const remoto = interpretarIni(ini).get(destino[1]);
  exigir(remoto?.get("type") === "dropbox" && remoto.get("root_namespace") === c.namespaceId);
  exigir(
    [...remoto.keys()].every((k) =>
      ["type", "root_namespace", "token", "client_id", "client_secret"].includes(k),
    ),
  );
  const copia = interpretarIni(efetivo).get(destino[1]);
  exigir(copia);
  const mapping = (m) =>
    JSON.stringify([...m].filter(([k]) => k !== "token").sort(([a], [b]) => a.localeCompare(b)));
  exigir(mapping(copia) === mapping(remoto));
  privado(c.authorityLock);
  privado(path.dirname(c.authorityLock), true);
  privado(c.targetLock);
  exigir(e.SERVIDOR_LOCK_HERDADO === c.targetLock);
  const herdado = fs.fstatSync(9),
    adotado = fs.statSync(c.targetLock);
  exigir(herdado.dev === adotado.dev && herdado.ino === adotado.ino);
  return c;
}

// O coordenador deve manter esta autoridade durante qualquer escrita na pasta,
// inclusive upload; a trava do alvo herdada coordena o Bash da mesma instalação.
export function adquirirAutoridadeDropbox(config, esperar = false) {
  privado(config.authorityLock);
  privado(path.dirname(config.authorityLock), true);
  const fd = fs.openSync(config.authorityLock, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  let fechado = false;
  try {
    execFileSync("flock", [...(esperar ? ["-w", String(config.timeoutMs / 1000)] : ["-n"]), "3"], {
      stdio: ["ignore", "ignore", "ignore", fd],
      timeout: (esperar ? config.timeoutMs : 0) + 5000,
      env: { PATH: "/usr/bin:/bin" },
    });
  } catch {
    fs.closeSync(fd);
    throw new Error("Dropbox: autoridade ocupada.");
  }
  const original = fs.fstatSync(fd);
  return {
    fd,
    async assertExclusive(identity) {
      exigir(
        !fechado &&
          identity.accountId === config.accountId &&
          identity.namespaceId === config.namespaceId &&
          identity.folderId === config.folderId,
      );
      privado(config.authorityLock);
      const atual = fs.statSync(config.authorityLock);
      exigir(atual.dev === original.dev && atual.ino === original.ino);
      return true;
    },
    close() {
      if (!fechado) {
        fechado = true;
        fs.closeSync(fd);
      }
    },
  };
}
// O descritor da prova foi criado pelo pai, aberto para leitura e desvinculado.
// A sessão precisa pertencer a um ancestral vivo que ainda detenha ambos os FDs.
export function receberAutoridadeDropbox(config, e) {
  exigir(/^[a-f0-9]{64}$/.test(e.BACKUP_DROPBOX_SESSAO ?? ""));
  const s = fs.fstatSync(6),
    lock = fs.fstatSync(7),
    atual = privado(config.authorityLock);
  exigir(
    s.isFile() &&
      s.nlink === 0 &&
      s.uid === process.getuid() &&
      (s.mode & 0o077) === 0 &&
      s.size < 65536,
  );
  const b = Buffer.alloc(s.size);
  exigir(fs.readSync(6, b, 0, b.length, 0) === b.length);
  const p = JSON.parse(b);
  exigir(
    p.sessao === e.BACKUP_DROPBOX_SESSAO &&
      p.configHash === sha(JSON.stringify(config)) &&
      Number.isSafeInteger(p.pid) &&
      p.pid > 1,
  );
  let pid = process.ppid,
    ancestral = false;
  for (let i = 0; pid > 1 && i < 64; i++) {
    if (pid === p.pid) {
      ancestral = true;
      break;
    }
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    exigir(Number(status.match(/^Uid:\s+(\d+)/m)?.[1]) === process.getuid());
    pid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
  }
  exigir(ancestral && Number.isSafeInteger(p.proofFd) && Number.isSafeInteger(p.lockFd));
  const dono = fs.readFileSync(`/proc/${p.pid}/status`, "utf8");
  exigir(Number(dono.match(/^Uid:\s+(\d+)/m)?.[1]) === process.getuid());
  const provaPai = fs.statSync(`/proc/${p.pid}/fd/${p.proofFd}`),
    lockPai = fs.statSync(`/proc/${p.pid}/fd/${p.lockFd}`);
  exigir(
    provaPai.dev === s.dev &&
      provaPai.ino === s.ino &&
      lockPai.dev === lock.dev &&
      lockPai.ino === lock.ino &&
      lock.dev === atual.dev &&
      lock.ino === atual.ino,
  );
  // Contenção por abertura independente e sucesso no FD compartilhado comprovam
  // a mesma open file description, não apenas o mesmo nome/inode ou um booleano.
  const independente = fs.openSync(
    config.authorityLock,
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
  );
  const tentar = (fd) =>
    spawnSync("flock", ["-n", "3"], {
      stdio: ["ignore", "ignore", "ignore", fd],
      timeout: 5000,
      env: { PATH: "/usr/bin:/bin" },
    });
  try {
    const concorrente = tentar(independente),
      herdado = tentar(7);
    exigir(
      !concorrente.error &&
        concorrente.signal === null &&
        concorrente.status === 1 &&
        !herdado.error &&
        herdado.signal === null &&
        herdado.status === 0,
    );
  } finally {
    fs.closeSync(independente);
  }
  return {
    async assertExclusive(identity) {
      exigir(
        identity.accountId === config.accountId &&
          identity.namespaceId === config.namespaceId &&
          identity.folderId === config.folderId,
      );
      receberAutoridadeDropbox(config, e);
      return true;
    },
    close() {
      fs.closeSync(7);
    },
  };
}
export function conferirUploadDropbox(config) {
  exigir(!fs.lstatSync(`${config.authorityLock}.upload.json`, { throwIfNoEntry: false }));
  exigir(
    !fs
      .readdirSync(path.dirname(config.authorityLock))
      .some(
        (n) =>
          n.startsWith(path.basename(config.authorityLock) + ".upload.json.") && n.endsWith(".tmp"),
      ),
  );
}
export function criarJournalDropbox(diretorio) {
  privado(diretorio, true);
  const arquivo = (chave) => path.join(diretorio, `${sha(chave)}.json`);
  return {
    async list() {
      privado(diretorio, true);
      const entries = [];
      for (const n of fs.readdirSync(diretorio)) {
        // Restos de crash não são apagados nem interpretados como ausência de intenção.
        exigir(/^[a-f0-9]{64}\.json$/.test(n));
        const envelope = JSON.parse(lerPrivado(path.join(diretorio, n), 2 * 1024 * 1024));
        exigir(
          typeof envelope.chave === "string" &&
            path.basename(arquivo(envelope.chave)) === n &&
            envelope.valor,
        );
        entries.push(envelope);
      }
      return { complete: true, entries };
    },
    async put(chave, valor) {
      persistirDropbox(arquivo(chave), { chave, valor });
    },
  };
}
