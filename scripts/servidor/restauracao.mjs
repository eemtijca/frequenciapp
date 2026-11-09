// Reconcilia nomes e OIDs e persiste a intenção de troca antes de cada efeito.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const nomeValido = (n) =>
  typeof n === "string" && n.length > 0 && Buffer.byteLength(n) <= 63 && !/[\x00-\x1f]/.test(n);
export function catalogoValido(c) {
  if (
    !Array.isArray(c) ||
    !c.every((b) => Number.isSafeInteger(b.oid) && b.oid > 0 && nomeValido(b.nome)) ||
    new Set(c.map((b) => b.oid)).size !== c.length ||
    new Set(c.map((b) => b.nome)).size !== c.length
  )
    throw new Error("Catálogo ausente ou ambíguo.");
  return c;
}
export function validarOperacao(o) {
  if (
    o?.versao !== 1 ||
    typeof o.alvo !== "string" ||
    !o.alvo ||
    ![o.ativo, o.temporario, o.anterior, o.falha].every(nomeValido) ||
    new Set([o.ativo, o.temporario, o.anterior, o.falha]).size !== 4 ||
    !Number.isSafeInteger(o.originalOid) ||
    !Number.isSafeInteger(o.substitutoOid) ||
    o.originalOid === o.substitutoOid
  )
    throw new Error("Operação inválida.");
  return o;
}
export function reconciliar(o, c) {
  validarOperacao(o);
  catalogoValido(c);
  const original = c.find((b) => b.oid === o.originalOid)?.nome;
  const substituto = c.find((b) => b.oid === o.substitutoOid)?.nome;
  // Nenhum terceiro OID pode ocupar um nome reservado desta operação.
  if (
    c.some(
      (b) =>
        [o.ativo, o.temporario, o.anterior, o.falha].includes(b.nome) &&
        ![o.originalOid, o.substitutoOid].includes(b.oid),
    )
  )
    throw new Error("Nome reservado ocupado por outro banco.");
  if (original === o.ativo && substituto === o.temporario) return "validado";
  if (original === o.anterior && substituto === o.temporario) return "original-renomeado";
  if (original === o.anterior && substituto === o.ativo) return "substituto-promovido";
  if (original === o.anterior && substituto === o.falha) return "substituto-isolado";
  if (original === o.ativo && substituto === o.falha) return "recuperacao-concluida";
  throw new Error("OIDs ou nomes divergiram; intervenção explícita necessária.");
}
function atomico(arquivo, valor) {
  const tmp = `${arquivo}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(valor) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, arquivo);
  const dir = fs.openSync(path.dirname(arquivo), "r");
  try {
    fs.fsyncSync(dir);
  } finally {
    fs.closeSync(dir);
  }
}
function ler(arquivo) {
  const stat = fs.lstatSync(arquivo);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0
  )
    throw new Error("Diário precisa ser arquivo privado do operador.");
  return validarOperacao(JSON.parse(fs.readFileSync(arquivo, "utf8")));
}
function salvar(arquivo, o) {
  o.em = new Date().toISOString();
  atomico(arquivo, o);
  atomico(path.join(path.dirname(path.dirname(arquivo)), "ultima-restauracao.json"), {
    ...o,
    diario: path.basename(arquivo),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [acao, arquivo, ...a] = process.argv.slice(2);
    const entrada = () => JSON.parse(fs.readFileSync(0, "utf8"));
    if (acao === "iniciar") {
      const [alvo, ativo, temporario, anterior, falha, gerenciarApp] = a,
        c = catalogoValido(entrada());
      if (fs.existsSync(arquivo)) throw new Error("Diário já existe.");
      const o = validarOperacao({
        versao: 1,
        alvo,
        ativo,
        temporario,
        anterior,
        falha,
        gerenciarApp: gerenciarApp === "true",
        originalOid: c.find((b) => b.nome === ativo)?.oid,
        substitutoOid: c.find((b) => b.nome === temporario)?.oid,
        status: "em-andamento",
        intencao: "validado",
        fase: "validado",
      });
      if (reconciliar(o, c) !== "validado") throw new Error("Estado inicial divergente.");
      salvar(arquivo, o);
    } else if (acao === "pendentes") {
      if (fs.existsSync(arquivo))
        for (const n of fs.readdirSync(arquivo)) {
          if (!/^[a-f0-9]{32}\.json$/.test(n))
            throw new Error("Entrada desconhecida no diretório de diários.");
          const o = ler(path.join(arquivo, n));
          if (o.alvo === a[0] && !["sucesso", "recuperado"].includes(o.status))
            throw new Error(
              `Operação pendente: ${n}. Usar --diagnosticar ou --recuperar explicitamente.`,
            );
        }
    } else if (acao === "diagnosticar") {
      const o = ler(arquivo);
      process.stdout.write(reconciliar(o, entrada()) + "\n");
    } else if (acao === "reconciliar") {
      const o = ler(arquivo);
      o.fase = reconciliar(o, entrada());
      salvar(arquivo, o);
      process.stdout.write(o.fase + "\n");
    } else if (acao === "intencao") {
      const o = ler(arquivo);
      o.intencao = a[0];
      salvar(arquivo, o);
    } else if (acao === "finalizar") {
      const o = ler(arquivo);
      o.status = a[0];
      salvar(arquivo, o);
    } else if (acao === "campo") {
      const o = ler(arquivo);
      const permitidos = [
        "ativo",
        "temporario",
        "anterior",
        "falha",
        "originalOid",
        "substitutoOid",
        "alvo",
        "status",
        "gerenciarApp",
      ];
      if (!permitidos.includes(a[0])) throw new Error("Campo não permitido.");
      process.stdout.write(String(o[a[0]]) + "\n");
    } else throw new Error("Ação desconhecida.");
  } catch (e) {
    console.error(`[restauração] ${e.message}`);
    process.exitCode = 1;
  }
}
