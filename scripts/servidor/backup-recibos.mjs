// Reconcilia o catálogo independente e registra o expurgo remoto de conjuntos exatos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { validarRecibo, planejarRetencao } from "./recibos.mjs";
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
// Somente adoção Dropbox específica libera o caminho nativo. Rclone genérico
// continua sem autoridade para expurgar, mesmo com flags legadas habilitadas.
export async function expurgar(catalogo, diarios, e) {
  exigir(e.BACKUP_MODO === "compose" && e.BACKUP_CATALOGO_PERSISTENTE === "true");
  const opcoes = {
    alvo: e.SERVIDOR_ALVO_CHAVE,
    banco: e.BACKUP_BANCO_VERIFICADO,
    schema: e.DATABASE_SCHEMA ?? "public",
    destino: e.BACKUP_REMOTO,
    minimo: Number(e.BACKUP_RETER_MINIMO ?? 30),
    dias: Number(e.BACKUP_RETER_DIAS ?? 30),
    agora: Date.now(),
    remoto: true,
  };
  planejarRetencao([], opcoes);
  if (opcoes.dias === 0) return { removidos: [] };
  if (!e.BACKUP_DROPBOX_CONFIG) {
    console.error(
      "[recibos] Expurgo remoto suspenso: transporte limitado e exclusão condicional ou exclusividade exigem adoção Dropbox específica em configuração privada.",
    );
    throw new Error("Contrato de expurgo remoto não demonstrado.");
  }
  const config = carregarAdocaoDropbox(e.BACKUP_DROPBOX_CONFIG, e);
  privado(catalogo, true);
  privado(path.dirname(diarios), true);
  if (!fs.existsSync(diarios)) {
    fs.mkdirSync(diarios, { mode: 0o700 });
    const fd = fs.openSync(path.dirname(diarios), "r");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  privado(diarios, true);
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
      store: criarJournalDropbox(diarios),
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
