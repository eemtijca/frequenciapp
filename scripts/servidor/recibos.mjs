// Mantém recibos tipados e planos de expurgo por artefatos exatos.
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const padraoBase = /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const limiteJson = 1024 * 1024;

function abrirRegular(arquivo) {
  let fd;
  try {
    fd = openSync(arquivo, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new Error("Arquivo não regular.");
    return fd;
  } catch (erro) {
    if (fd !== undefined) closeSync(fd);
    throw new Error("Artefato local ausente ou divergente.", { cause: erro });
  }
}

function lerLimitado(arquivo, limite) {
  const fd = abrirRegular(arquivo);
  try {
    if (fstatSync(fd).size > limite) throw new Error("Arquivo excede limite.");
    const buffer = Buffer.alloc(limite + 1);
    let total = 0;
    while (total < buffer.length) {
      const lidos = readSync(fd, buffer, total, buffer.length - total, null);
      if (!lidos) break;
      total += lidos;
    }
    if (total > limite) throw new Error("Arquivo excede limite.");
    return buffer.subarray(0, total);
  } finally {
    closeSync(fd);
  }
}

function lerJson(arquivo) {
  return JSON.parse(lerLimitado(arquivo, limiteJson).toString("utf8"));
}

function hashArquivo(arquivo) {
  if (arquivo.endsWith(".sha256")) {
    const nome = path.basename(arquivo).slice(0, -".sha256".length);
    try {
      return createHash("sha256")
        .update(lerLimitado(arquivo, Buffer.byteLength(`${"0".repeat(64)}  ${nome}\n`)))
        .digest("hex");
    } catch (erro) {
      throw new Error("Checksum associado divergente.", { cause: erro });
    }
  }
  const h = createHash("sha256");
  const bloco = Buffer.allocUnsafe(64 * 1024);
  const descritor = abrirRegular(arquivo);
  try {
    let lidos;
    while ((lidos = readSync(descritor, bloco, 0, bloco.length, null)) !== 0) {
      h.update(bloco.subarray(0, lidos));
    }
    return h.digest("hex");
  } finally {
    closeSync(descritor);
  }
}

function mesmoEscopo(r, opcoes) {
  return (
    typeof opcoes.banco === "string" &&
    !!opcoes.banco &&
    typeof opcoes.schema === "string" &&
    !!opcoes.schema &&
    typeof opcoes.alvo === "string" &&
    !!opcoes.alvo &&
    typeof opcoes.destino === "string" &&
    r.escopo.banco === opcoes.banco &&
    r.escopo.schema === opcoes.schema &&
    r.escopo.alvo === opcoes.alvo &&
    r.remoto === opcoes.destino
  );
}

function escopoAmbiente(e) {
  return {
    alvo: e.SERVIDOR_ALVO_CHAVE,
    banco: e.BACKUP_BANCO_VERIFICADO,
    schema: e.DATABASE_SCHEMA ?? "public",
    destino: e.BACKUP_REMOTO ?? "",
  };
}

export function validarRecibo(r) {
  if (
    r?.versao !== 1 ||
    !padraoBase.test(r.base ?? "") ||
    !["age", "gpg"].includes(r.criptografia) ||
    !Number.isFinite(Date.parse(r.em)) ||
    r.escopo?.tipo !== "schema" ||
    typeof r.escopo.alvo !== "string" ||
    !r.escopo.alvo ||
    typeof r.escopo.schema !== "string" ||
    !r.escopo.schema ||
    r.etapas?.local !== true ||
    typeof r.etapas.remotoVerificado !== "boolean" ||
    r.etapas.recuperacaoExercitada !== false ||
    typeof r.remoto !== "string" ||
    typeof r.destinatario !== "string" ||
    !Array.isArray(r.artefatos)
  ) {
    throw new Error("Recibo inválido ou legado não adotado.");
  }
  const dump = `${r.base}.dump.${r.criptografia}`;
  const ambiente = `${r.base}-ambiente.env.${r.criptografia}`;
  const nomes = r.artefatos.map((a) => a.nome);
  const exigidos = [dump, `${dump}.sha256`];
  const permitidos = [...exigidos, ambiente, `${ambiente}.sha256`];
  if (
    new Set(nomes).size !== nomes.length ||
    !exigidos.every((n) => nomes.includes(n)) ||
    nomes.includes(ambiente) !== nomes.includes(`${ambiente}.sha256`) ||
    !r.artefatos.every((a) => permitidos.includes(a.nome) && /^[a-f0-9]{64}$/.test(a.sha256))
  ) {
    throw new Error("Artefatos do recibo não pertencem ao conjunto.");
  }
  if (r.etapas.remotoVerificado && !r.remoto) throw new Error("Verificação remota sem destino.");
  return r;
}

export function conferirArtefatos(diretorio, recibo) {
  validarRecibo(recibo);
  for (const a of recibo.artefatos) {
    const arquivo = path.join(diretorio, a.nome);
    if (hashArquivo(arquivo) !== a.sha256) {
      throw new Error("Artefato local ausente ou divergente.");
    }
  }
  for (const a of recibo.artefatos.filter((a) => !a.nome.endsWith(".sha256"))) {
    const esperado = Buffer.from(`${a.sha256}  ${a.nome}\n`);
    let conteudo;
    try {
      conteudo = lerLimitado(path.join(diretorio, a.nome + ".sha256"), esperado.length);
    } catch (erro) {
      throw new Error("Checksum associado divergente.", { cause: erro });
    }
    if (!conteudo.equals(esperado)) throw new Error("Checksum associado divergente.");
  }
}

export function criarRecibo(diretorio, dados) {
  if (!padraoBase.test(dados.base ?? "") || !["gpg", "age"].includes(dados.criptografia))
    throw new Error("Nome inválido.");
  const sufixos = [`.dump.${dados.criptografia}`, `.dump.${dados.criptografia}.sha256`];
  const ambiente = `${dados.base}-ambiente.env.${dados.criptografia}`;
  if (readdirSync(diretorio).includes(ambiente))
    sufixos.push(
      `-ambiente.env.${dados.criptografia}`,
      `-ambiente.env.${dados.criptografia}.sha256`,
    );
  const r = {
    versao: 1,
    base: dados.base,
    em: dados.em ?? new Date().toISOString(),
    escopo: { tipo: "schema", schema: dados.schema, alvo: dados.alvo, banco: dados.banco ?? null },
    criptografia: dados.criptografia,
    destinatario: dados.destinatario,
    remoto: dados.remoto,
    etapas: { local: true, remotoVerificado: dados.verificadoRemoto, recuperacaoExercitada: false },
    artefatos: sufixos.map((s) => ({
      nome: dados.base + s,
      sha256: hashArquivo(path.join(diretorio, dados.base + s)),
    })),
  };
  validarRecibo(r);
  conferirArtefatos(diretorio, r);
  return r;
}

export function planejarRetencao(recibos, opcoes) {
  const { minimo, dias, agora, remoto, destino } = opcoes;
  if (
    !Number.isSafeInteger(minimo) ||
    minimo < 0 ||
    !Number.isSafeInteger(dias) ||
    dias < 0 ||
    !Number.isFinite(agora)
  ) {
    throw new Error("Política de retenção inválida.");
  }
  if (dias === 0) return [];
  const bases = new Set();
  const confirmados = recibos
    .map(validarRecibo)
    .filter((r) => {
      if (bases.has(r.base)) throw new Error("Catálogo duplicado.");
      bases.add(r.base);
      return (
        mesmoEscopo(r, opcoes) && (!remoto || (r.etapas.remotoVerificado && r.remoto === destino))
      );
    })
    .sort((a, b) => Date.parse(b.em) - Date.parse(a.em) || b.base.localeCompare(a.base));
  return confirmados
    .slice(minimo)
    .filter((r) => agora - Date.parse(r.em) > dias * 86400000)
    .map((r) => ({
      base: r.base,
      artefatos: r.artefatos.map((a) => a.nome).concat(`${r.base}.confirmado.json`),
    }));
}

function lerCatalogo(diretorio, local) {
  const recibos = [];
  for (const nome of readdirSync(diretorio).filter((n) => n.endsWith(".confirmado.json"))) {
    try {
      const arquivo = path.join(diretorio, nome);
      const recibo = validarRecibo(lerJson(arquivo));
      if (nome !== `${recibo.base}.confirmado.json`) throw new Error("Nome de recibo divergente.");
      if (local) conferirArtefatos(diretorio, recibo);
      recibos.push(recibo);
    } catch {
      // Um incompleto não conta no mínimo, nem autoriza expurgo de seus membros.
      if (!local) throw new Error("Catálogo remoto local inconsistente; expurgo suspenso.");
    }
  }
  return recibos;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [acao, diretorio, base] = process.argv.slice(2);
    const e = process.env;
    if (acao === "criar") {
      process.stdout.write(
        JSON.stringify(
          criarRecibo(diretorio, {
            base,
            alvo: e.SERVIDOR_ALVO_CHAVE,
            banco: e.BACKUP_BANCO_VERIFICADO,
            criptografia: e.BACKUP_CRIPTOGRAFIA ?? "gpg",
            schema: e.DATABASE_SCHEMA ?? "public",
            remoto: e.BACKUP_REMOTO ?? "",
            verificadoRemoto: e.RECIBO_REMOTO_VERIFICADO === "true",
            destinatario: e.BACKUP_DESTINATARIO_VERIFICADO ?? "",
          }),
        ) + "\n",
      );
    } else if (acao === "conferir-estado" || acao === "diagnosticar-integridade") {
      const estado = lerJson(base);
      if (
        typeof estado.recibo !== "string" ||
        !estado.recibo.endsWith(".confirmado.json") ||
        !padraoBase.test(estado.recibo.slice(0, -".confirmado.json".length))
      ) {
        throw new Error("Ponteiro sem recibo individual válido.");
      }
      const r = validarRecibo(lerJson(path.join(diretorio, estado.recibo)));
      const ambiente = r.artefatos.find(
        (a) => a.nome === `${r.base}-ambiente.env.${r.criptografia}`,
      );
      if (
        estado.recibo !== `${r.base}.confirmado.json` ||
        (acao === "conferir-estado" && !mesmoEscopo(r, escopoAmbiente(e))) ||
        estado.em !== r.em ||
        estado.schema !== r.escopo.schema ||
        estado.criptografia !== r.criptografia ||
        estado.remoto !== r.remoto ||
        estado.ambiente !== (ambiente?.nome ?? "") ||
        estado.ambienteSha256 !== (ambiente?.sha256 ?? "") ||
        !r.artefatos.some(
          (a) =>
            a.nome === estado.arquivo &&
            a.sha256 === estado.sha256 &&
            a.nome === `${r.base}.dump.${r.criptografia}`,
        ) ||
        typeof estado.verificadoRemoto !== "boolean" ||
        estado.verificadoRemoto !== r.etapas.remotoVerificado
      ) {
        throw new Error("Ponteiro diverge do recibo ou do alvo.");
      }
      conferirArtefatos(diretorio, r);
    } else if (acao === "conferir") {
      conferirArtefatos(diretorio, lerJson(base));
    } else if (acao === "planejar-local" || acao === "planejar-remoto") {
      const remoto = acao === "planejar-remoto";
      const recibos = lerCatalogo(diretorio, !remoto);
      if (remoto && e.BACKUP_CATALOGO_PERSISTENTE !== "true")
        throw new Error("Catálogo não persistente; expurgo remoto suspenso.");
      const plano = planejarRetencao(recibos, {
        minimo: Number(e.BACKUP_RETER_MINIMO ?? 30),
        dias: Number(e.BACKUP_RETER_DIAS ?? 30),
        agora: Date.now(),
        remoto,
        destino: e.BACKUP_REMOTO ?? "",
        ...escopoAmbiente(e),
      });
      for (const conjunto of plano)
        for (const nome of conjunto.artefatos) process.stdout.write(`${conjunto.base}\t${nome}\n`);
    } else if (acao === "catalogo-remoto") {
      for (const r of lerCatalogo(diretorio, false)) {
        if (
          r.etapas.remotoVerificado &&
          r.remoto === e.BACKUP_REMOTO &&
          mesmoEscopo(r, escopoAmbiente(e))
        ) {
          for (const a of r.artefatos) process.stdout.write(`${a.nome}\t${a.sha256}\n`);
        }
      }
    } else throw new Error("Ação de recibo inválida.");
  } catch {
    console.error("[recibos] Verificação falhou; preservar catálogo e artefatos para diagnóstico.");
    process.exitCode = 1;
  }
}
