// Mantém recibos tipados e planos de expurgo por artefatos exatos.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const padraoBase = /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const camposBancoPreMigracao = [
  "container",
  "cluster",
  "banco",
  "bancoOid",
  "schema",
  "schemaOid",
];
const operacaoValida = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const corresponde = (s, regex) => typeof s === "string" && regex.exec(s)?.[0] === s;

export function validarBancoPreMigracao(banco) {
  if (
    !banco ||
    typeof banco !== "object" ||
    Object.keys(banco).length !== camposBancoPreMigracao.length ||
    !camposBancoPreMigracao.every((k) => Object.hasOwn(banco, k)) ||
    !corresponde(banco.container, /^[a-f0-9]{64}$/) ||
    !corresponde(banco.cluster, /^[1-9][0-9]{0,19}$/) ||
    BigInt(banco.cluster) > 18446744073709551615n ||
    !corresponde(banco.banco, /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/) ||
    !corresponde(banco.schema, /^[a-z_][a-z0-9_]{0,62}$/) ||
    ![banco.bancoOid, banco.schemaOid].every(
      (oid) => corresponde(oid, /^[1-9][0-9]{0,9}$/) && Number(oid) <= 4294967295,
    )
  ) {
    throw new Error("Identidade física do banco pré-migração inválida.");
  }
  return banco;
}

function validarOrigemPreMigracao(origem, escopo) {
  const { operacao, ...banco } = origem;
  validarBancoPreMigracao(banco);
  if (
    !corresponde(operacao, operacaoValida) ||
    banco.banco !== escopo.banco ||
    banco.schema !== escopo.schema
  )
    throw new Error("Origem do dump não corresponde ao escopo do recibo.");
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
  if (Object.hasOwn(r, "origem")) validarOrigemPreMigracao(r.origem, r.escopo);
  return r;
}

export function conferirArtefatos(diretorio, recibo) {
  validarRecibo(recibo);
  for (const a of recibo.artefatos) {
    const arquivo = path.join(diretorio, a.nome);
    const stat = lstatSync(arquivo);
    if (!stat.isFile() || stat.isSymbolicLink() || hash(readFileSync(arquivo)) !== a.sha256) {
      throw new Error("Artefato local ausente ou divergente.");
    }
  }
  for (const a of recibo.artefatos.filter((a) => !a.nome.endsWith(".sha256"))) {
    if (
      readFileSync(path.join(diretorio, a.nome + ".sha256"), "utf8") !== `${a.sha256}  ${a.nome}\n`
    ) {
      throw new Error("Checksum associado divergente.");
    }
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
    ...(dados.origem !== undefined ? { origem: dados.origem } : {}),
    criptografia: dados.criptografia,
    destinatario: dados.destinatario,
    remoto: dados.remoto,
    etapas: { local: true, remotoVerificado: dados.verificadoRemoto, recuperacaoExercitada: false },
    artefatos: sufixos.map((s) => ({
      nome: dados.base + s,
      sha256: hash(readFileSync(path.join(diretorio, dados.base + s))),
    })),
  };
  validarRecibo(r);
  if (
    dados.origem !== undefined &&
    r.artefatos.find((a) => a.nome === `${r.base}.dump.${r.criptografia}`).sha256 !==
      dados.sha256Produzido
  ) {
    throw new Error("Os bytes do dump diferem do fluxo observado.");
  }
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
    .sort((a, b) => b.em.localeCompare(a.em) || b.base.localeCompare(a.base));
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
      const stat = lstatSync(arquivo);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Recibo não regular.");
      const recibo = validarRecibo(JSON.parse(readFileSync(arquivo, "utf8")));
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
    const [acao, diretorio, base, origem, sha256Produzido] = process.argv.slice(2);
    const e = process.env;
    if (acao === "criar") {
      if (process.argv.length !== 5 && process.argv.length !== 7)
        throw new Error("Argumentos de recibo inválidos.");
      process.stdout.write(
        JSON.stringify(
          criarRecibo(diretorio, {
            base,
            alvo: e.SERVIDOR_ALVO_CHAVE,
            banco: e.BACKUP_BANCO_VERIFICADO,
            origem: origem === undefined ? undefined : JSON.parse(origem),
            sha256Produzido,
            criptografia: e.BACKUP_CRIPTOGRAFIA ?? "gpg",
            schema: e.DATABASE_SCHEMA ?? "public",
            remoto: e.BACKUP_REMOTO ?? "",
            verificadoRemoto: e.RECIBO_REMOTO_VERIFICADO === "true",
            destinatario: e.BACKUP_DESTINATARIO_VERIFICADO ?? "",
          }),
        ) + "\n",
      );
    } else if (acao === "banco-pre-migracao" && process.argv.length === 4) {
      const banco = validarBancoPreMigracao(JSON.parse(diretorio));
      process.stdout.write(JSON.stringify(banco) + "\n");
    } else if (acao === "conferir-estado" || acao === "conferir-estado-manual") {
      const manual = acao === "conferir-estado-manual";
      const estado = JSON.parse(readFileSync(base, "utf8"));
      if (
        typeof estado.recibo !== "string" ||
        !estado.recibo.endsWith(".confirmado.json") ||
        !padraoBase.test(estado.recibo.slice(0, -".confirmado.json".length))
      ) {
        throw new Error("Ponteiro sem recibo individual válido.");
      }
      const arquivoRecibo = path.join(diretorio, estado.recibo);
      if (manual && (!lstatSync(base).isFile() || !lstatSync(arquivoRecibo).isFile()))
        throw new Error("Ponteiro ou recibo não regular.");
      const bytes = readFileSync(arquivoRecibo);
      const r = validarRecibo(JSON.parse(bytes));
      if (
        estado.recibo !== `${r.base}.confirmado.json` ||
        !mesmoEscopo(r, escopoAmbiente(e)) ||
        !r.artefatos.some(
          (a) =>
            a.nome === estado.arquivo &&
            a.sha256 === estado.sha256 &&
            a.nome === `${r.base}.dump.${r.criptografia}`,
        ) ||
        (estado.verificadoRemoto === true && r.etapas.remotoVerificado !== true)
      ) {
        throw new Error("Ponteiro diverge do recibo ou do alvo.");
      }
      conferirArtefatos(diretorio, r);
      if (manual) {
        const esperado = validarBancoPreMigracao(JSON.parse(origem));
        const id = sha256Produzido;
        if (
          !r.origem ||
          r.origem.operacao !== id ||
          !camposBancoPreMigracao.every((k) => r.origem[k] === esperado[k]) ||
          estado.modo !== "compose" ||
          estado.em !== r.em ||
          estado.verificadoRemoto !== r.etapas.remotoVerificado ||
          (r.remoto && !r.etapas.remotoVerificado)
        )
          throw new Error("Recibo não comprova o backup desta operação manual.");
        process.stdout.write(
          JSON.stringify({
            recibo: estado.recibo,
            reciboSha256: hash(bytes),
            arquivo: estado.arquivo,
            sha256: estado.sha256,
            remotoConfirmado: r.etapas.remotoVerificado,
          }),
        );
      }
    } else if (acao === "conferir") {
      conferirArtefatos(diretorio, JSON.parse(readFileSync(base, "utf8")));
    } else if (acao === "planejar-local" || acao === "planejar-remoto") {
      const remoto = acao === "planejar-remoto";
      const recibos = lerCatalogo(diretorio, !remoto);
      if (remoto && e.BACKUP_CATALOGO_PERSISTENTE !== "true")
        throw new Error("Catálogo não persistente; expurgo remoto suspenso.");
      const plano = planejarRetencao(recibos, {
        minimo: Number(e.BACKUP_RETER_MINIMO ?? 5),
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
