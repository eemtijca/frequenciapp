// Reconcilia o catálogo independente e registra o expurgo remoto de conjuntos exatos.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validarRecibo, conferirArtefatos, planejarRetencao } from "./recibos.mjs";
import { executarRetencaoDropbox } from "./dropbox-retencao.mjs";
import { criarApiDropbox } from "./dropbox-api.mjs";
import {
  carregarAdocaoDropbox,
  adquirirAutoridadeDropbox,
  receberAutoridadeDropbox,
  conferirUploadDropbox,
  criarJournalDropbox,
} from "./dropbox-estado.mjs";
export { executarRetencaoDropbox };

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exigir = (condicao) => {
  if (!condicao) throw new Error("Estado de expurgo não comprovado.");
};
function privado(arquivo, diretorio = false) {
  const s = fs.lstatSync(arquivo);
  exigir(!s.isSymbolicLink() && (diretorio ? s.isDirectory() : s.isFile()));
  exigir(s.uid === process.getuid() && (s.mode & 0o077) === 0);
  return s;
}
function existe(arquivo) {
  try {
    fs.lstatSync(arquivo);
    return true;
  } catch (erro) {
    if (erro.code === "ENOENT") return false;
    throw erro;
  }
}
function persistir(arquivo, dados) {
  privado(path.dirname(arquivo), true);
  if (existe(arquivo)) privado(arquivo);
  const temporario = arquivo + "." + randomUUID() + ".tmp";
  const fd = fs.openSync(temporario, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(dados) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temporario, arquivo);
  const dir = fs.openSync(path.dirname(arquivo), "r");
  try {
    fs.fsyncSync(dir);
  } finally {
    fs.closeSync(dir);
  }
}
const limiteJson = 1024 * 1024;
function abrirRegular(arquivo, validarPrivado = false) {
  const fd = fs.openSync(
    arquivo,
    fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW,
  );
  try {
    const s = fs.fstatSync(fd);
    exigir(s.isFile());
    if (validarPrivado) exigir(s.uid === process.getuid() && (s.mode & 0o077) === 0);
    return fd;
  } catch (erro) {
    fs.closeSync(fd);
    throw erro;
  }
}
function lerLimitado(fd, limite) {
  exigir(fs.fstatSync(fd).size <= limite);
  const buffer = Buffer.alloc(limite + 1);
  let total = 0;
  while (total < buffer.length) {
    const lidos = fs.readSync(fd, buffer, total, buffer.length - total, null);
    if (!lidos) break;
    total += lidos;
  }
  exigir(total <= limite);
  return buffer.subarray(0, total);
}
export function ler(arquivo, limite = limiteJson) {
  const fd = abrirRegular(arquivo, true);
  try {
    return lerLimitado(fd, limite);
  } finally {
    fs.closeSync(fd);
  }
}
export function conferirRemoto(arquivo, artefato, recibo) {
  const fd = abrirRegular(arquivo);
  try {
    const original = artefato.nome.endsWith(".sha256")
      ? recibo.artefatos.find((b) => b.nome === artefato.nome.slice(0, -7))
      : null;
    if (artefato.nome.endsWith(".sha256")) {
      exigir(original);
      const esperado = Buffer.from(`${original.sha256}  ${original.nome}\n`);
      const bytes = lerLimitado(fd, esperado.length);
      exigir(bytes.equals(esperado) && hash(bytes) === artefato.sha256);
    } else if (artefato.nome.endsWith(".confirmado.json")) {
      exigir(hash(lerLimitado(fd, limiteJson)) === artefato.sha256);
    } else {
      const h = createHash("sha256"),
        buffer = Buffer.allocUnsafe(64 * 1024);
      let lidos;
      while ((lidos = fs.readSync(fd, buffer, 0, buffer.length, null)) !== 0)
        h.update(buffer.subarray(0, lidos));
      exigir(h.digest("hex") === artefato.sha256);
    }
  } finally {
    fs.closeSync(fd);
  }
}
// Valida apenas o estado já lido; não acessa transporte nem altera arquivos.
export function validarDiario(j, r, registro) {
  exigir(registro && j.versao === 1 && j.reciboSha256 === hash(registro.bytes));
  exigir(JSON.stringify(r) === JSON.stringify(registro.r));
  const membros = r.artefatos.map((a) => a.nome).concat(r.base + ".confirmado.json");
  exigir(Array.isArray(j.removidos) && j.removidos.length <= membros.length);
  exigir(j.removidos.every((n, i) => n === membros[i]));
  exigir(
    j.pendente === null ||
      (typeof j.pendente === "string" && j.pendente === membros[j.removidos.length]),
  );
  exigir(
    typeof j.concluido === "boolean" && j.concluido === (j.removidos.length === membros.length),
  );
}

function expurgarRclone(catalogo, diarios, e) {
  exigir(e.BACKUP_MODO === "compose" && e.BACKUP_CATALOGO_PERSISTENTE === "true");
  const escopo = {
    tipo: "schema",
    alvo: e.SERVIDOR_ALVO_CHAVE,
    banco: e.BACKUP_BANCO_VERIFICADO,
    schema: e.DATABASE_SCHEMA ?? "public",
  };
  exigir(
    [escopo.alvo, escopo.banco, escopo.schema, e.BACKUP_REMOTO].every(
      (s) => typeof s === "string" && !!s,
    ),
  );
  // O consumidor Bash já conferiu a identidade efetiva sob esta mesma trava.
  const trava = privado(e.SERVIDOR_LOCK_HERDADO);
  const herdado = fs.fstatSync(9);
  exigir(trava.dev === herdado.dev && trava.ino === herdado.ino);
  privado(catalogo, true);
  privado(path.dirname(diarios), true);
  if (!existe(diarios)) fs.mkdirSync(diarios, { mode: 0o700 });
  privado(diarios, true);
  const opcoes = {
    alvo: escopo.alvo,
    banco: escopo.banco,
    schema: escopo.schema,
    destino: e.BACKUP_REMOTO,
    minimo: Number(e.BACKUP_RETER_MINIMO ?? 5),
    dias: Number(e.BACKUP_RETER_DIAS ?? 30),
    agora: Date.now(),
    remoto: true,
  };
  planejarRetencao([], opcoes);
  if (opcoes.dias === 0) return { removidos: [] };
  const pertence = (r) =>
    r.escopo.tipo === escopo.tipo &&
    r.escopo.alvo === escopo.alvo &&
    r.escopo.banco === escopo.banco &&
    r.escopo.schema === escopo.schema &&
    r.remoto === e.BACKUP_REMOTO &&
    r.etapas.remotoVerificado;
  const registros = new Map();
  // Um recibo inválido continua bloqueando o remoto, nunca é adotado nem apagado.
  for (const nome of fs.readdirSync(catalogo).filter((n) => n.endsWith(".confirmado.json"))) {
    const bytes = ler(path.join(catalogo, nome));
    const r = validarRecibo(JSON.parse(bytes));
    exigir(nome === r.base + ".confirmado.json");
    if (pertence(r)) registros.set(r.base, { r, bytes, diario: null });
  }
  for (const nome of fs.readdirSync(diarios).filter((n) => n.endsWith(".json"))) {
    const j = JSON.parse(ler(path.join(diarios, nome)));
    const r = validarRecibo(j.recibo);
    exigir(nome === r.base + ".json");
    if (!pertence(r)) continue;
    const registro = registros.get(r.base);
    validarDiario(j, r, registro);
    registro.diario = j;
  }
  const ambiente = { PATH: e.PATH, HOME: e.HOME ?? os.tmpdir(), RCLONE_CONFIG: e.RCLONE_CONFIG };
  exigir(typeof ambiente.RCLONE_CONFIG === "string" && !!ambiente.RCLONE_CONFIG);
  if (e.RCLONE_CONFIG_PASS) ambiente.RCLONE_CONFIG_PASS = e.RCLONE_CONFIG_PASS;
  const remoto = e.BACKUP_REMOTO.replace(/\/+$/, "");
  const rclone = (...args) =>
    execFileSync("rclone", [...args, "--retries", "1", "--low-level-retries", "1"], {
      env: ambiente,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  const inventario = () => {
    const itens = JSON.parse(rclone("lsjson", remoto, "--files-only", "--max-depth", "1"));
    exigir(Array.isArray(itens));
    const nomes = new Set();
    for (const item of itens) {
      exigir(
        item.IsDir === false &&
          typeof item.Path === "string" &&
          item.Path &&
          !item.Path.includes("/") &&
          !nomes.has(item.Path),
      );
      nomes.add(item.Path);
    }
    return nomes;
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frequenciapp-expurgo-"));
  try {
    const observar = (registro) => {
      privado(diarios, true);
      const { r, bytes, diario } = registro;
      exigir(hash(ler(path.join(catalogo, r.base + ".confirmado.json"))) === hash(bytes));
      const nomes = inventario();
      const removidos = diario?.removidos ?? [];
      const membros = [...r.artefatos, { nome: r.base + ".confirmado.json", sha256: hash(bytes) }];
      for (const a of membros) {
        if (removidos.includes(a.nome)) exigir(!nomes.has(a.nome));
        // Ausência sem confirmação prévia de delete nunca é convertida em sucesso.
        else exigir(nomes.has(a.nome));
      }
      const pendentes = membros.filter((a) => !removidos.includes(a.nome));
      // Nunca reutiliza tamanho/mtime ou conteúdo de uma observação anterior.
      const destino = fs.mkdtempSync(path.join(tmp, "observacao-"));
      const lista = destino + ".lista";
      try {
        if (pendentes.length) {
          fs.writeFileSync(lista, pendentes.map((a) => a.nome).join("\n") + "\n", {
            mode: 0o600,
            flag: "wx",
          });
          rclone(
            "copy",
            remoto,
            destino,
            "--files-from-raw",
            lista,
            "--no-traverse",
            "--transfers",
            "1",
            "--checkers",
            "1",
            "--multi-thread-streams",
            "0",
          );
        }
        for (const a of pendentes) {
          const arquivo = path.join(destino, a.nome);
          const stat = fs.lstatSync(arquivo);
          exigir(stat.isFile() && !stat.isSymbolicLink());
          exigir(hash(fs.readFileSync(arquivo)) === a.sha256);
          if (a.nome.endsWith(".sha256")) {
            const original = r.artefatos.find((b) => b.nome === a.nome.slice(0, -7));
            exigir(
              original &&
                fs.readFileSync(arquivo, "utf8") === `${original.sha256}  ${original.nome}\n`,
            );
          }
        }
        if (!diario) conferirArtefatos(destino, r);
      } finally {
        fs.rmSync(destino, { recursive: true, force: true });
        fs.rmSync(lista, { force: true });
      }
    };
    const ativos = () => [...registros.values()].filter((r) => !r.diario);
    const conferirAtivos = () => {
      for (const registro of ativos()) observar(registro);
    };
    // Reconcilia tombstones somente com estado próprio íntegro e ausência comprovada.
    for (const registro of registros.values()) observar(registro);
    const aplicar = (registro) => {
      const { r, bytes } = registro;
      conferirAtivos();
      observar(registro);
      exigir(opcoes.agora - Date.parse(r.em) > opcoes.dias * 86400000);
      const restantes = ativos().filter((a) => a !== registro);
      exigir(restantes.length >= opcoes.minimo);
      if (!registro.diario) {
        const j = {
          versao: 1,
          recibo: r,
          reciboSha256: hash(bytes),
          removidos: [],
          pendente: null,
          concluido: false,
        };
        persistir(path.join(diarios, r.base + ".json"), j);
        registro.diario = j;
      }
      const membros = r.artefatos.map((a) => a.nome).concat(r.base + ".confirmado.json");
      for (const nome of membros.slice(registro.diario.removidos.length)) {
        observar(registro);
        const arquivo = path.join(diarios, r.base + ".json");
        const intencao = { ...registro.diario, pendente: nome };
        persistir(arquivo, intencao);
        registro.diario = intencao;
        rclone("deletefile", remoto + "/" + nome);
        exigir(!inventario().has(nome));
        const removidos = [...intencao.removidos, nome];
        const confirmado = {
          ...intencao,
          removidos,
          pendente: null,
          concluido: removidos.length === membros.length,
        };
        persistir(arquivo, confirmado);
        registro.diario = confirmado;
      }
      observar(registro);
    };
    for (const registro of registros.values()) {
      if (registro.diario && !registro.diario.concluido) aplicar(registro);
    }
    const plano = planejarRetencao(
      ativos().map((a) => a.r),
      opcoes,
    );
    for (const conjunto of plano) aplicar(registros.get(conjunto.base));
    return { removidos: plano.map((conjunto) => conjunto.base) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Somente a adoção Dropbox específica libera o caminho nativo. Sem ela, o
// caminho rclone existente continua sendo o transporte padrão.
async function expurgarDropbox(catalogo, diarios, e) {
  exigir(e.BACKUP_MODO === "compose" && e.BACKUP_CATALOGO_PERSISTENTE === "true");
  const opcoes = {
    alvo: e.SERVIDOR_ALVO_CHAVE,
    banco: e.BACKUP_BANCO_VERIFICADO,
    schema: e.DATABASE_SCHEMA ?? "public",
    destino: e.BACKUP_REMOTO,
    minimo: Number(e.BACKUP_RETER_MINIMO ?? 5),
    dias: Number(e.BACKUP_RETER_DIAS ?? 30),
    agora: Date.now(),
    remoto: true,
  };
  planejarRetencao([], opcoes);
  if (opcoes.dias === 0) return { removidos: [] };
  const config = carregarAdocaoDropbox(e.BACKUP_DROPBOX_CONFIG, e);
  privado(catalogo, true);
  privado(path.dirname(diarios), true);
  if (!existe(diarios)) {
    fs.mkdirSync(diarios, { mode: 0o700 });
    const fd = fs.openSync(path.dirname(diarios), "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  privado(diarios, true);
  // O journal Dropbox fica separado do journal do caminho rclone para que a
  // troca de transporte não transforme um formato no outro.
  const diariosDropbox = path.join(diarios, "dropbox");
  if (!existe(diariosDropbox)) {
    fs.mkdirSync(diariosDropbox, { mode: 0o700 });
    const fd = fs.openSync(diarios, "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  privado(diariosDropbox, true);
  const authority = e.BACKUP_DROPBOX_SESSAO
    ? receberAutoridadeDropbox(config, e)
    : adquirirAutoridadeDropbox(config, true);
  try {
    conferirUploadDropbox(config);
    const receipts = fs
      .readdirSync(catalogo)
      .filter((n) => n.endsWith(".confirmado.json"))
      .map((nome) => {
        const bytes = ler(path.join(catalogo, nome));
        const r = validarRecibo(JSON.parse(bytes));
        exigir(nome === `${r.base}.confirmado.json`);
        return { r, bytes };
      });
    const identity = Object.fromEntries(
      ["accountId", "namespaceId", "folderId", "destino", "alvo", "banco", "schema"].map((k) => [
        k,
        config[k],
      ]),
    );
    return await executarRetencaoDropbox({
      api: criarApiDropbox(config),
      authority,
      store: criarJournalDropbox(diariosDropbox),
      identity,
      receipts,
      ...opcoes,
      minimoAutorizado: config.minimoAutorizado,
      limiteBytes: config.limiteBytes,
    });
  } finally {
    authority.close();
  }
}

export async function expurgar(catalogo, diarios, e) {
  if (!e.BACKUP_DROPBOX_CONFIG) return expurgarRclone(catalogo, diarios, e);
  return expurgarDropbox(catalogo, diarios, e);
}

function ehEntradaPrincipal() {
  try {
    return (
      !!process.argv[1] &&
      fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])
    );
  } catch {
    console.error("[recibos] Não foi possível identificar a entrada principal; operação suspensa.");
    process.exitCode = 1;
    return false;
  }
}

if (ehEntradaPrincipal()) {
  try {
    const [acao, catalogo, diarios] = process.argv.slice(2);
    exigir(acao === "expurgar-remoto" && catalogo && diarios);
    await expurgar(catalogo, diarios, process.env);
  } catch {
    console.error(
      "[recibos] Expurgo remoto parcial ou não comprovado; preservar catálogo, registro e artefatos para diagnóstico.",
    );
    process.exitCode = 1;
  }
}
