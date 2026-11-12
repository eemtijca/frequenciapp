// Executor do aplicar: trava, estado durável, ordem das etapas, retomada e falhas.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comandoExistePadrao, executarPadrao } from "./detectar.mjs";
import {
  ErroInstalador,
  SCHEMA_ESTADO,
  codigoSaida,
  construirEsquema,
  construirEsquemaEstado,
  erroObjeto,
  erroUso,
  erroValidacao,
  aviso,
} from "./json.mjs";
import { estadoInicial, gravarArquivoAtomico, gravarEstado } from "./estado.mjs";
import {
  montarDocumento,
  agoraPadrao,
  deduplicarAvisos,
  lerDisco,
  VERSAO_PROJETO,
} from "./plano.mjs";
import { criarRedator, redigirObjeto } from "./redigir.mjs";
import {
  acao as criarAcao,
  caminhosOperacao,
  garantirDiretorio,
  USUARIO_PADRAO,
} from "./passos/contexto.mjs";
import * as preflight from "./passos/preflight.mjs";
import * as pacotes from "./passos/pacotes.mjs";
import * as docker from "./passos/docker.mjs";
import * as usuario from "./passos/usuario.mjs";
import * as diretorios from "./passos/diretorios.mjs";
import * as fonte from "./passos/fonte.mjs";
import * as ambiente from "./passos/ambiente.mjs";
import * as proxy from "./passos/proxy.mjs";
import * as compose from "./passos/compose.mjs";
import * as banco from "./passos/banco.mjs";
import * as migracoes from "./passos/migracoes.mjs";
import * as contas from "./passos/contas.mjs";
import * as saude from "./passos/saude.mjs";
import * as backupInicial from "./passos/backup-inicial.mjs";
import * as agendador from "./passos/agendador.mjs";
import * as firewall from "./passos/firewall.mjs";
import * as dropbox from "./passos/dropbox.mjs";
import * as controlador from "./passos/controlador.mjs";

const RAIZ_INSTALADOR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const MODULOS_BASE = [
  preflight,
  pacotes,
  docker,
  usuario,
  diretorios,
  fonte,
  ambiente,
  proxy,
  compose,
  banco,
  migracoes,
  contas,
  saude,
  backupInicial,
  agendador,
  firewall,
];

const PERFIS_DROPBOX = new Set(["dropbox", "completo"]);
const PERFIS_CONTROLADOR = new Set(["controlador", "completo"]);

// Ordem visível no contrato: inclui todas as etapas de todos os perfis.
const MODULOS_ORDEM = [
  ...MODULOS_BASE.slice(0, MODULOS_BASE.indexOf(backupInicial)),
  dropbox,
  ...MODULOS_BASE.slice(MODULOS_BASE.indexOf(backupInicial)),
  controlador,
];

export const ORDEM_ETAPAS = MODULOS_ORDEM.map((modulo) => modulo.id);

export function ordemEtapasPara(perfil) {
  const modulos = [];
  for (const modulo of MODULOS_BASE) {
    if (modulo === backupInicial && PERFIS_DROPBOX.has(perfil)) modulos.push(dropbox);
    modulos.push(modulo);
  }
  if (PERFIS_CONTROLADOR.has(perfil)) modulos.push(controlador);
  return modulos.map((modulo) => modulo.id);
}

export const MODULOS = [...MODULOS_BASE, dropbox, controlador];

const ETAPAS_CONHECIDAS = new Set(ORDEM_ETAPAS);
const MODULOS_POR_ID = new Map(MODULOS.map((modulo) => [modulo.id, modulo]));

function dormir(segundos) {
  if (!segundos || segundos <= 0) return;
  spawnSync("sleep", [String(segundos)], { timeout: (segundos + 5) * 1000 });
}

function fstatSeguro(descritor) {
  try {
    return fs.fstatSync(descritor);
  } catch {
    return null;
  }
}

function travaHerdada(caminho) {
  const doDescritor = fstatSeguro(9);
  if (!doDescritor) return false;
  try {
    const doArquivo = fs.statSync(caminho);
    return doDescritor.dev === doArquivo.dev && doDescritor.ino === doArquivo.ino;
  } catch {
    return false;
  }
}

// Adquire a trava exclusiva do instalador por flock, preservando a herança do bootstrap.
export function adquirirTravaPadrao(caminho) {
  garantirDiretorio(path.dirname(caminho), 0o700);
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code !== "ENOENT") {
      throw erroValidacao("Não foi possível consultar a trava do instalador.", {
        documentacao: "docs/instalador.md#trava",
      });
    }
    informacao = null;
  }
  if (informacao?.isSymbolicLink() || (informacao && !informacao.isFile())) {
    throw erroValidacao("A trava do instalador precisa ser um arquivo regular.", {
      documentacao: "docs/instalador.md#trava",
    });
  }
  const descritor = fs.openSync(caminho, fs.constants.O_CREAT | fs.constants.O_RDWR, 0o600);
  fs.fchmodSync(descritor, 0o600);
  if (travaHerdada(caminho)) {
    fs.closeSync(descritor);
    return { liberar() {} };
  }
  const resultado = spawnSync("flock", ["-w", "30", "-x", String(descritor)], {
    encoding: "utf8",
    timeout: 40000,
    stdio: (() => {
      const lista = ["ignore", "ignore", "pipe"];
      while (lista.length < descritor) lista.push("ignore");
      lista[descritor] = descritor;
      return lista;
    })(),
  });
  if (resultado.error?.code === "ENOENT") {
    fs.closeSync(descritor);
    throw erroValidacao("O utilitário flock não foi encontrado.", {
      dica: "Instale util-linux e repita o comando.",
      documentacao: "docs/instalador.md#trava",
      saida: 4,
    });
  }
  if (resultado.status === 1) {
    fs.closeSync(descritor);
    throw erroValidacao("A trava do instalador está ocupada por outro processo.", {
      dica: "Aguarde a operação em andamento e repita o comando.",
      documentacao: "docs/instalador.md#trava",
    });
  }
  if (resultado.status !== 0) {
    fs.closeSync(descritor);
    throw erroValidacao("Não foi possível adquirir a trava do instalador.", {
      documentacao: "docs/instalador.md#trava",
    });
  }
  return {
    liberar() {
      try {
        fs.closeSync(descritor);
      } catch {
        // O descritor pode ter sido fechado pelo encerramento do processo.
      }
    },
  };
}

function etapaVazia(id, estado = "pendente") {
  return {
    id,
    estado,
    inicio: null,
    fim: null,
    codigo: null,
    acoes: [],
    avisos: [],
    detalhes: {},
  };
}

function ordenarEtapas(etapas) {
  return [...etapas].sort(
    (esquerda, direita) => ORDEM_ETAPAS.indexOf(esquerda.id) - ORDEM_ETAPAS.indexOf(direita.id),
  );
}

function registrarEtapa(estado, etapa) {
  const indice = estado.etapas.findIndex((item) => item.id === etapa.id);
  if (indice >= 0) estado.etapas[indice] = etapa;
  else estado.etapas.push(etapa);
  estado.etapas = ordenarEtapas(estado.etapas);
}

function documentoAplicacao(ctx, estado, etapas, erros, avisos, dryRun = false, proximos = null) {
  return montarDocumento({
    comando: "aplicar",
    configuracao: ctx.configuracao,
    estado,
    deteccao: ctx.deteccao,
    dryRun,
    etapas,
    avisos: deduplicarAvisos(avisos),
    erros,
    proximos:
      proximos ??
      (erros.length
        ? [
            "sudo ./instalar.sh diagnosticar --json --nao-interativo",
            "sudo ./instalar.sh aplicar --retomar --sim",
          ]
        : [
            "sudo ./instalar.sh situacao --json",
            "sudo ./instalar.sh diagnosticar --json --nao-interativo",
          ]),
  });
}

function criarRegistroLog(ctx) {
  return (linha) => {
    try {
      const redator = criarRedator(ctx.segredos ?? []);
      fs.mkdirSync(path.dirname(ctx.caminhos.log), { recursive: true, mode: 0o700 });
      const descritor = fs.openSync(
        ctx.caminhos.log,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND,
        0o600,
      );
      try {
        fs.writeSync(descritor, `${redator(`${agoraPadrao()} ${linha}`)}\n`);
      } finally {
        fs.closeSync(descritor);
      }
    } catch {
      // O log é acessório; a falha dele não interrompe a aplicação.
    }
  };
}

function validarFlagsAplicacao(opcoes) {
  if (opcoes.booleanas.has("--retomar") && opcoes.valores.has("--desde-etapa")) {
    return;
  }
  if (opcoes.valores.has("--desde-etapa")) {
    const etapa = opcoes.valores.get("--desde-etapa");
    if (!ETAPAS_CONHECIDAS.has(etapa)) {
      throw erroUso(`A etapa ${etapa} não existe no aplicar.`, {
        dica: "Use uma etapa da ordem do contrato.",
        documentacao: "docs/instalador.md#aplicar",
      });
    }
  }
}

function validarAutoteste(configuracao, deteccao, estadoResultado, opcoes) {
  const verificacoes = [];
  const erros = [];
  let esquema;
  try {
    esquema = construirEsquema();
    const estadoEsquema = construirEsquemaEstado();
    verificacoes.push({
      id: "esquema",
      estado: "ok",
      mensagem: `Schemas ${esquema.$id} e ${estadoEsquema.$id} disponíveis.`,
    });
    if (esquema.required.length < 20) {
      throw new Error("schema curto");
    }
  } catch {
    erros.push({
      codigo: "E_VALIDACAO",
      mensagem: "O schema do instalador não pôde ser validado.",
      dica: "Confira json.mjs e o contrato.",
      comando: null,
      documentacao: "docs/instalador.md#contrato-json",
    });
  }
  const camposDeteccao = ["distro", "familia", "tier", "arquitetura", "gerenciador", "iniciador"];
  if (camposDeteccao.every((campo) => campo in deteccao)) {
    verificacoes.push({
      id: "deteccao",
      estado: "ok",
      mensagem: `Detecção disponível para ${deteccao.distro} ${deteccao.versaoDistro}.`.trim(),
    });
  } else {
    erros.push({
      codigo: "E_VALIDACAO",
      mensagem: "A detecção do host não devolveu os campos do contrato.",
      dica: "Confira detectar.mjs.",
      comando: null,
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  if (estadoResultado.erro) {
    erros.push(erroObjeto(estadoResultado.erro));
  } else {
    verificacoes.push({
      id: "estado",
      estado: "ok",
      mensagem: estadoResultado.presente
        ? "O estado da instalação foi lido e validado."
        : "Nenhum estado de instalação foi encontrado.",
    });
  }
  const etapa = {
    id: "autoteste",
    estado: erros.length ? "falhou" : "concluida",
    inicio: agoraPadrao(),
    fim: agoraPadrao(),
    codigo: erros[0]?.codigo ?? null,
    acoes: [
      criarAcao("Valida a CLI, os schemas, a detecção e o estado sem alterar o host", null, false),
    ],
    avisos: [],
    detalhes: {
      verificacoes,
      configuracao: redigirObjeto(configuracao),
      opcoes: [...opcoes.booleanas],
    },
  };
  const documento = montarDocumento({
    comando: "aplicar",
    configuracao,
    estado: estadoResultado.estado,
    deteccao,
    dryRun: false,
    etapas: [etapa],
    avisos: [],
    erros,
    proximos: erros.length
      ? ["Corrija o achado e repita o autoteste."]
      : ["sudo ./instalar.sh aplicar --sim"],
  });
  return documento;
}

function montarSimulacao(ctx, configuracao) {
  const etapas = ctx.ordemEtapas
    .map((id) => MODULOS_POR_ID.get(id))
    .filter(Boolean)
    .map((modulo) => ({
      id: modulo.id,
      estado: "pendente",
      inicio: null,
      fim: null,
      codigo: null,
      acoes: [criarAcao(modulo.titulo, null, modulo.id !== "preflight")],
      avisos: [],
      detalhes: { limiteSegundos: modulo.limiteSegundos },
    }));
  return montarDocumento({
    comando: "aplicar",
    configuracao,
    estado: ctx.estado,
    deteccao: ctx.deteccao,
    dryRun: true,
    etapas,
    avisos: [],
    erros: [],
    proximos: ["sudo ./instalar.sh aplicar --sim"],
  });
}

function etapaAnteriorValida(estado, id) {
  const registrada = estado?.etapas?.find((item) => item.id === id);
  return Boolean(registrada && ["concluida", "pulada"].includes(registrada.estado));
}

function artefatoAnteriorAusente(ctx, idEtapa) {
  const indice = ctx.ordemEtapas.indexOf(idEtapa);
  if (indice >= ctx.ordemEtapas.indexOf("diretorios") && !fs.existsSync(ctx.caminhos.configDir)) {
    return "diretório de configuração";
  }
  if (
    indice >= ctx.ordemEtapas.indexOf("fonte") &&
    !fs.existsSync(path.join(ctx.caminhos.appDir, "compose.yml"))
  ) {
    return "checkout da aplicação";
  }
  if (
    indice >= ctx.ordemEtapas.indexOf("ambiente") &&
    (!fs.existsSync(ctx.caminhos.appEnv) || !fs.existsSync(ctx.caminhos.opsEnv))
  ) {
    return "arquivos de ambiente";
  }
  if (
    ctx.ordemEtapas.includes(dropbox.id) &&
    indice >= ctx.ordemEtapas.indexOf(dropbox.id) &&
    !textoContemChave(ctx.caminhos.opsEnv, "BACKUP_DROPBOX_CONFIG")
  ) {
    return "configuração Dropbox no ops.env";
  }
  if (
    ctx.ordemEtapas.includes(controlador.id) &&
    indice >= ctx.ordemEtapas.indexOf(controlador.id) &&
    !fs.existsSync(ctx.caminhos.controladorPerfil)
  ) {
    return "perfil do controlador";
  }
  return null;
}

function textoContemChave(caminho, chave) {
  try {
    return new RegExp(`^${chave}=`, "m").test(fs.readFileSync(caminho, "utf8"));
  } catch {
    return false;
  }
}

function prepararContexto(deps, configuracao, deteccao, auditoria, estadoResultado, opcoes, raiz) {
  const modoTeste = Boolean(opcoes.booleanas.has("--modo-teste"));
  const caminhos = caminhosOperacao(raiz, configuracao, modoTeste);
  const estado = estadoResultado.presente ? estadoResultado.estado : null;
  const ctx = {
    deps,
    raiz,
    configuracao,
    deteccao,
    auditoria,
    estadoResultado,
    estado,
    estadoInvalido: Boolean(estadoResultado.erro),
    caminhos,
    opcoes,
    modoTeste,
    sim: Boolean(opcoes.booleanos.get("--sim")),
    naoIniciar: Boolean(opcoes.booleanos.get("--nao-iniciar")),
    pularSaude: Boolean(opcoes.booleanos.get("--pular-saude")),
    retomar: Boolean(opcoes.booleanas.has("--retomar")),
    desdeEtapa: opcoes.valores.get("--desde-etapa") ?? null,
    forcar: Boolean(opcoes.booleanos.get("--forcar")),
    forcarPacotes: Boolean(opcoes.booleanos.get("--forcar-pacotes")),
    permitirInstavel: Boolean(opcoes.booleanos.get("--permitir-instavel")),
    permitirFusoDivergente: Boolean(
      deps.permitirFusoDivergente ?? process.env.INSTALADOR_PERMITIR_FUSO_DIVERGENTE === "1",
    ),
    uid: (deps.uid ?? (() => (typeof process.getuid === "function" ? process.getuid() : 0)))(),
    usuarioServico: deps.usuarioServico ?? USUARIO_PADRAO,
    etapasConhecidas: ETAPAS_CONHECIDAS,
    ordemEtapas: ordemEtapasPara(configuracao.perfil),
    etapaSelecionada: null,
    executar: deps.executar ?? executarPadrao,
    comandoExiste:
      deps.comandoExiste ?? ((nome) => comandoExistePadrao(nome, deps.executar ?? executarPadrao)),
    auditarPacotes: deps.auditarPacotes,
    agora: deps.agora ?? agoraPadrao,
    esperar: deps.esperar ?? dormir,
    lerDisco: deps.lerDisco ?? lerDisco,
    memoriaTotal: deps.memoriaTotal ?? os.totalmem,
    gravarArquivoAtomico: deps.gravarArquivoAtomico ?? gravarArquivoAtomico,
    raizRepositorio: deps.raizRepositorio ?? RAIZ_INSTALADOR,
    segredos: [],
    ambienteBase: {
      PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
      HOME: process.env.HOME ?? "/tmp",
      TMPDIR: process.env.TMPDIR ?? "/tmp",
    },
    senhas: {},
    backupInfo: null,
    migradorSha256: null,
    commitDetectado: "",
  };
  ctx.gravarArquivo = (relativo, conteudo) => {
    const absoluto = path.join(raiz, relativo.replace(/^\/+/, ""));
    const temporario = `${absoluto}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(absoluto), { recursive: true });
    fs.writeFileSync(temporario, conteudo, { mode: 0o644 });
    fs.renameSync(temporario, absoluto);
    fs.chmodSync(absoluto, 0o644);
  };
  ctx.registrarLog = criarRegistroLog(ctx);
  return ctx;
}

function estadoParaGravar(ctx) {
  const atual = ctx.estado ?? estadoInicial({ configuracao: ctx.configuracao, agora: ctx.agora });
  atual.instaladoEm = atual.instaladoEm || ctx.agora();
  atual.atualizadoEm = ctx.agora();
  atual.perfil = ctx.configuracao.perfil;
  atual.canal = ctx.configuracao.canal;
  atual.tag = ctx.configuracao.tag ?? "";
  atual.commit = ctx.commitDetectado || ctx.configuracao.commit || atual.commit || "";
  atual.imagem = ctx.configuracao.imagem ?? atual.imagem;
  atual.digest = ctx.configuracao.digest || ctx.configuracao.imagemDigest || atual.digest || "";
  atual.migradorSha256 = ctx.migradorSha256 ?? atual.migradorSha256 ?? null;
  atual.origem = {
    repositorio: atual.origem?.repositorio ?? "https://github.com/eemtijca/frequenciapp",
    diretorioFonte: ctx.configuracao.diretorioFonte,
  };
  if (ctx.backupInfo) {
    atual.backup = {
      ultimoRecibo: ctx.backupInfo.recibo,
      verificadoEm: ctx.agora(),
    };
  }
  return atual;
}

function gravarEstadoAtual(ctx, deps) {
  if (ctx.estadoInvalido) return;
  const estado = estadoParaGravar(ctx);
  (deps.gravarEstado ?? gravarEstado)(estado, { caminho: ctx.caminhos.estado });
  ctx.estado = estado;
}

function executarEtapaSelecionada(ctx, deps, modulo) {
  const etapa = etapaVazia(modulo.id, "executando");
  etapa.inicio = ctx.agora();
  ctx.etapaSelecionada = modulo.id;
  registrarEtapa(ctx.estado, etapa);
  gravarEstadoAtual(ctx, deps);
  ctx.registrarLog(`etapa=${modulo.id} estado=executando`);
  let resultado;
  try {
    resultado = modulo.executar(ctx);
  } catch (erro) {
    const classificado =
      erro instanceof ErroInstalador
        ? erro
        : erroValidacao("Falha interna ao executar uma etapa do aplicar.", {
            dica: "Confira o log do instalador e o estado da instalação.",
            documentacao: "docs/instalador.md#aplicar",
          });
    etapa.estado = "falhou";
    etapa.fim = ctx.agora();
    etapa.codigo = classificado.codigo;
    etapa.acoes = etapa.acoes ?? [];
    etapa.avisos = etapa.avisos ?? [];
    etapa.detalhes = {
      ...(etapa.detalhes ?? {}),
      falha: classificado.codigo,
    };
    registrarEtapa(ctx.estado, etapa);
    gravarEstadoAtual(ctx, deps);
    ctx.registrarLog(
      `etapa=${modulo.id} estado=falhou codigo=${classificado.codigo} mensagem=${classificado.message}`,
    );
    return { etapa, erro: classificado };
  }
  etapa.estado = resultado.estado ?? "concluida";
  etapa.fim = ctx.agora();
  etapa.codigo = null;
  etapa.acoes = Array.isArray(resultado.acoes) ? resultado.acoes : [];
  etapa.avisos = Array.isArray(resultado.avisos) ? resultado.avisos : [];
  etapa.detalhes =
    resultado.detalhes && typeof resultado.detalhes === "object" ? resultado.detalhes : {};
  if (modulo.id === controlador.id && etapa.detalhes.adotado === true) {
    ctx.estado.controlador = {
      adotado: true,
      migradorSha256: etapa.detalhes.migradorSha256 ?? null,
      readocaoPendente: false,
    };
    if (typeof etapa.detalhes.migradorSha256 === "string") {
      ctx.migradorSha256 = etapa.detalhes.migradorSha256;
    }
  }
  registrarEtapa(ctx.estado, etapa);
  gravarEstadoAtual(ctx, deps);
  ctx.registrarLog(
    `etapa=${modulo.id} estado=${etapa.estado} mudancas=${etapa.detalhes.semMudancas === true ? "nao" : "sim"}`,
  );
  return { etapa, erro: null };
}

function selecionarInicio(ctx) {
  if (ctx.desdeEtapa) return ctx.ordemEtapas.indexOf(ctx.desdeEtapa);
  if (ctx.retomar && ctx.estado) {
    const indice = ctx.ordemEtapas.findIndex((id) => !etapaAnteriorValida(ctx.estado, id));
    if (indice === -1) return ctx.ordemEtapas.length;
    return indice;
  }
  return 0;
}

function estadoInicialAplicacao(ctx) {
  const estado = ctx.estado ?? estadoInicial({ configuracao: ctx.configuracao, agora: ctx.agora });
  estado.instaladoEm = estado.instaladoEm || ctx.agora();
  estado.perfil = ctx.configuracao.perfil;
  estado.canal = ctx.configuracao.canal;
  estado.tag = ctx.configuracao.tag ?? "";
  estado.commit = ctx.configuracao.commit || estado.commit || "";
  estado.imagem = ctx.configuracao.imagem || estado.imagem || "";
  estado.digest = ctx.configuracao.digest || ctx.configuracao.imagemDigest || estado.digest || "";
  estado.origem = {
    repositorio: estado.origem?.repositorio ?? "https://github.com/eemtijca/frequenciapp",
    diretorioFonte: ctx.configuracao.diretorioFonte,
  };
  return estado;
}

// Executa o aplicar e devolve o documento do contrato, sem lançar erro de etapa.
export function executarAplicacao(opcoes, deps, dados) {
  validarFlagsAplicacao(opcoes);
  const raiz = dados.raiz ?? "/";
  const configuracao = dados.configuracao;
  const deteccao = dados.deteccao;
  const auditoria = dados.auditoria;
  const estadoResultado = dados.estadoResultado ?? { presente: false, estado: null, avisos: [] };
  const ctx = prepararContexto(
    deps,
    configuracao,
    deteccao,
    auditoria,
    estadoResultado,
    opcoes,
    raiz,
  );
  if (opcoes.booleanas.has("--autoteste")) {
    return validarAutoteste(configuracao, deteccao, estadoResultado, opcoes);
  }
  if (opcoes.booleanas.has("--simular")) {
    return montarSimulacao(ctx, configuracao);
  }
  let trava = null;
  try {
    trava = deps.adquirirTrava
      ? deps.adquirirTrava(ctx.caminhos.lockDir)
      : adquirirTravaPadrao(path.join(ctx.caminhos.lockDir, "instalador.lock"));
  } catch (erro) {
    const classificado =
      erro instanceof ErroInstalador
        ? erro
        : erroValidacao("Não foi possível adquirir a trava do instalador.", {
            documentacao: "docs/instalador.md#trava",
          });
    return documentoAplicacao(ctx, ctx.estado, [], [erroObjeto(classificado)], []);
  }
  try {
    if (ctx.estadoInvalido) {
      const etapa = etapaVazia("preflight", "falhou");
      etapa.inicio = ctx.agora();
      etapa.fim = ctx.agora();
      etapa.codigo = estadoResultado.erro?.codigo ?? "E_VALIDACAO";
      etapa.acoes = [criarAcao("Recusa o estado corrompido sem sobrescrevê-lo", null, false)];
      etapa.avisos = [];
      etapa.detalhes = { falha: etapa.codigo, estadoInvalido: true };
      return documentoAplicacao(
        ctx,
        null,
        [etapa],
        [erroObjeto(estadoResultado.erro ?? erroValidacao("Estado inválido."))],
        [],
      );
    }
    let inicio = selecionarInicio(ctx);
    const etapaPreflight = etapaVazia("preflight", "executando");
    etapaPreflight.inicio = ctx.agora();
    ctx.etapaSelecionada = "preflight";
    try {
      const resultado = preflight.executar(ctx);
      etapaPreflight.estado = resultado.estado ?? "concluida";
      etapaPreflight.fim = ctx.agora();
      etapaPreflight.codigo = null;
      etapaPreflight.acoes = Array.isArray(resultado.acoes) ? resultado.acoes : [];
      etapaPreflight.avisos = Array.isArray(resultado.avisos) ? resultado.avisos : [];
      etapaPreflight.detalhes = resultado.detalhes ?? {};
    } catch (erro) {
      const classificado =
        erro instanceof ErroInstalador
          ? erro
          : erroValidacao("Falha interna no preflight do aplicar.", {
              dica: "Confira o log do instalador e o estado da instalação.",
              documentacao: "docs/instalador.md#aplicar",
            });
      etapaPreflight.estado = "falhou";
      etapaPreflight.fim = ctx.agora();
      etapaPreflight.codigo = classificado.codigo;
      etapaPreflight.detalhes = { falha: classificado.codigo };
      return documentoAplicacao(ctx, ctx.estado, [etapaPreflight], [erroObjeto(classificado)], []);
    }
    ctx.estado = estadoInicialAplicacao(ctx);
    if (inicio === 0) {
      registrarEtapa(ctx.estado, etapaPreflight);
      gravarEstadoAtual(ctx, deps);
      ctx.registrarLog(`etapa=preflight estado=${etapaPreflight.estado}`);
      inicio = 1;
    }
    if (inicio >= ctx.ordemEtapas.length) {
      const documento = documentoAplicacao(
        ctx,
        ctx.estado,
        ctx.estado.etapas,
        [],
        [
          aviso(
            "A_SEM_MUDANCAS",
            "Nenhuma etapa pendente para retomar.",
            "docs/instalador.md#retomada",
          ),
        ],
      );
      return documento;
    }
    for (let indice = 0; indice < ctx.ordemEtapas.length; indice += 1) {
      const idEtapa = ctx.ordemEtapas[indice];
      const modulo = MODULOS_POR_ID.get(idEtapa);
      if (indice < inicio) {
        if (!etapaAnteriorValida(ctx.estado, idEtapa)) {
          const etapa = etapaVazia(idEtapa, "falhou");
          etapa.inicio = ctx.agora();
          etapa.fim = ctx.agora();
          etapa.codigo = "E_VALIDACAO";
          etapa.acoes = [criarAcao("Revalida a etapa anterior sem executá-la", null, false)];
          etapa.detalhes = { falha: "E_VALIDACAO", revalidada: false };
          registrarEtapa(ctx.estado, etapa);
          gravarEstadoAtual(ctx, deps);
          return documentoAplicacao(
            ctx,
            ctx.estado,
            ctx.estado.etapas,
            [
              {
                codigo: "E_VALIDACAO",
                mensagem: `A etapa anterior ${idEtapa} não está concluída no estado.`,
                dica: "Execute o aplicar completo antes de retomar a partir de uma etapa.",
                comando: null,
                documentacao: "docs/instalador.md#retomada",
              },
            ],
            [],
          );
        }
        const registrada = ctx.estado.etapas.find((item) => item.id === idEtapa);
        const ausente = artefatoAnteriorAusente(ctx, idEtapa);
        if (ausente) {
          const etapa = etapaVazia(idEtapa, "falhou");
          etapa.inicio = ctx.agora();
          etapa.fim = ctx.agora();
          etapa.codigo = "E_VALIDACAO";
          etapa.acoes = [criarAcao("Revalida a etapa anterior sem executá-la", null, false)];
          etapa.detalhes = { falha: "E_VALIDACAO", revalidada: false, artefato: ausente };
          const etapas = [...ctx.estado.etapas.filter((item) => item.id !== idEtapa), etapa];
          return documentoAplicacao(
            ctx,
            ctx.estado,
            ordenarEtapas(etapas),
            [
              {
                codigo: "E_VALIDACAO",
                mensagem: `A etapa anterior ${idEtapa} não tem ${ausente} no host.`,
                dica: "Execute o aplicar completo antes de retomar a partir de uma etapa.",
                comando: null,
                documentacao: "docs/instalador.md#retomada",
              },
            ],
            [],
          );
        }
        ctx.registrarLog(`etapa=${idEtapa} revalidada estado=${registrada.estado}`);
        continue;
      }
      const resultado = executarEtapaSelecionada(ctx, deps, modulo);
      if (resultado.erro) {
        return documentoAplicacao(
          ctx,
          ctx.estado,
          ctx.estado.etapas,
          [erroObjeto(resultado.erro)],
          [],
        );
      }
    }
    gravarEstadoAtual(ctx, deps);
    const avisos = [];
    if (
      ctx.estado.etapas.every((etapa) => etapa.estado === "concluida" || etapa.estado === "pulada")
    ) {
      const semMudancas = ctx.estado.etapas.every((etapa) => etapa.detalhes?.semMudancas !== false);
      if (semMudancas) {
        avisos.push(
          aviso(
            "A_SEM_MUDANCAS",
            "A segunda execução não alterou o host.",
            "docs/instalador.md#idempotência",
          ),
        );
      }
    }
    return documentoAplicacao(ctx, ctx.estado, ctx.estado.etapas, [], avisos);
  } finally {
    if (trava) trava.liberar();
  }
}

export { codigoSaida, SCHEMA_ESTADO, VERSAO_PROJETO };
