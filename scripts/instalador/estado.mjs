// Estado durável do instalador: leitura idempotente, validação e escrita atômica com trava.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ErroInstalador, SCHEMA_ESTADO, erroUso, erroValidacao } from "./json.mjs";
import { contemSegredo } from "./redigir.mjs";

export const CAMINHO_ESTADO = "/var/lib/frequenciapp/instalacao.json";
export const CAMINHO_TRAVA = "/var/lock/frequenciapp/instalador.lock";

const LIMITE_ESTADO = 1024 * 1024;
const PERFIS = new Set(["simples", "controlador", "dropbox", "completo"]);
const CANAIS = new Set(["release", "main"]);
const ESTADOS_ETAPA = new Set([
  "pendente",
  "executando",
  "concluida",
  "pulada",
  "falhou",
  "bloqueada",
]);
const CHAVES_ESTADO = new Set([
  "schema",
  "instaladoEm",
  "atualizadoEm",
  "perfil",
  "canal",
  "tag",
  "commit",
  "imagem",
  "digest",
  "migradorSha256",
  "etapas",
  "controlador",
  "backup",
  "origem",
]);

const SCRIPT_ESCRITA_ATOMICA = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const alvo = process.argv[1];
const sobrescrever = process.argv[2] === "1";
if (!sobrescrever && fs.existsSync(alvo)) process.exit(3);
const diretorio = path.dirname(alvo);
const temporario = path.join(
  diretorio,
  "." + path.basename(alvo) + "." + process.pid + "." + Date.now() + ".tmp",
);
let descritor = null;
try {
  descritor = fs.openSync(temporario, "wx", 0o600);
  fs.writeFileSync(descritor, fs.readFileSync(0));
  fs.fsyncSync(descritor);
  fs.closeSync(descritor);
  descritor = null;
  fs.renameSync(temporario, alvo);
  fs.chmodSync(alvo, 0o600);
  const diretorioFd = fs.openSync(diretorio, "r");
  try {
    fs.fsyncSync(diretorioFd);
  } finally {
    fs.closeSync(diretorioFd);
  }
} catch {
  if (descritor !== null) {
    try {
      fs.closeSync(descritor);
    } catch {}
  }
  try {
    fs.unlinkSync(temporario);
  } catch {}
  process.exit(4);
}
`;

// Resolve o caminho do estado, opcionalmente dentro de uma raiz de teste.
export function caminhoEstado(raiz = "/") {
  if (!raiz || raiz === "/") return CAMINHO_ESTADO;
  return path.join(raiz, "var/lib/frequenciapp/instalacao.json");
}

// Resolve o caminho da trava local, respeitando o diretório do bootstrap.
export function caminhoTrava(dir = process.env.INSTALADOR_LOCK_DIR || "/var/lock/frequenciapp") {
  return path.join(dir, "instalador.lock");
}

function falhaEstado(mensagem, opcoes = {}) {
  return erroValidacao(mensagem, {
    dica: "Restaure o estado a partir do backup ou refaça a instalação em diretório limpo.",
    documentacao: "docs/instalador.md#estado-durável",
    ...opcoes,
  });
}

function exigirTexto(valor, campo) {
  if (typeof valor !== "string") throw falhaEstado(`O campo ${campo} do estado é inválido.`);
}

function validarEtapas(etapas) {
  if (!Array.isArray(etapas)) throw falhaEstado("O campo etapas do estado é inválido.");
  for (const etapa of etapas) {
    if (!etapa || typeof etapa !== "object" || Array.isArray(etapa)) {
      throw falhaEstado("Uma etapa do estado é inválida.");
    }
    if (typeof etapa.id !== "string" || !etapa.id) {
      throw falhaEstado("Uma etapa do estado não tem identificador.");
    }
    if (!ESTADOS_ETAPA.has(etapa.estado)) {
      throw falhaEstado("Uma etapa do estado tem situação inválida.");
    }
  }
}

function normalizarControlador(valor) {
  if (valor === undefined) {
    return { adotado: false, migradorSha256: null, readocaoPendente: false };
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw falhaEstado("O campo controlador do estado é inválido.");
  }
  if (typeof valor.adotado !== "boolean") {
    throw falhaEstado("O campo controlador.adotado do estado é inválido.");
  }
  if (typeof valor.readocaoPendente !== "boolean") {
    throw falhaEstado("O campo controlador.readocaoPendente do estado é inválido.");
  }
  if (valor.migradorSha256 !== null && typeof valor.migradorSha256 !== "string") {
    throw falhaEstado("O campo controlador.migradorSha256 do estado é inválido.");
  }
  if (typeof valor.migradorSha256 === "string" && !/^[a-f0-9]{64}$/.test(valor.migradorSha256)) {
    throw falhaEstado("O campo controlador.migradorSha256 do estado é inválido.");
  }
  return {
    adotado: valor.adotado,
    migradorSha256: valor.migradorSha256 ?? null,
    readocaoPendente: valor.readocaoPendente,
  };
}

function normalizarBackup(valor) {
  if (valor === undefined) return { ultimoRecibo: null, verificadoEm: null };
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw falhaEstado("O campo backup do estado é inválido.");
  }
  if (valor.ultimoRecibo !== null && typeof valor.ultimoRecibo !== "string") {
    throw falhaEstado("O campo backup.ultimoRecibo do estado é inválido.");
  }
  if (valor.verificadoEm !== null && typeof valor.verificadoEm !== "string") {
    throw falhaEstado("O campo backup.verificadoEm do estado é inválido.");
  }
  return {
    ultimoRecibo: valor.ultimoRecibo ?? null,
    verificadoEm: valor.verificadoEm ?? null,
  };
}

function normalizarOrigem(valor) {
  if (valor === undefined) {
    return {
      repositorio: "https://github.com/eemtijca/frequenciapp",
      diretorioFonte: "/opt/frequenciapp",
    };
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw falhaEstado("O campo origem do estado é inválido.");
  }
  if (typeof valor.repositorio !== "string" || typeof valor.diretorioFonte !== "string") {
    throw falhaEstado("Os campos de origem do estado são inválidos.");
  }
  return { repositorio: valor.repositorio, diretorioFonte: valor.diretorioFonte };
}

// Valida e normaliza o documento de estado lido do disco.
export function normalizarEstado(dados) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw falhaEstado("O estado da instalação não contém um objeto JSON.");
  }
  for (const chave of Object.keys(dados)) {
    if (!CHAVES_ESTADO.has(chave)) {
      throw falhaEstado("O estado da instalação contém uma chave desconhecida.");
    }
  }
  if (dados.schema !== SCHEMA_ESTADO) {
    throw falhaEstado("O estado da instalação não segue o schema esperado.");
  }
  if (!PERFIS.has(dados.perfil)) throw falhaEstado("O campo perfil do estado é inválido.");
  if (!CANAIS.has(dados.canal)) throw falhaEstado("O campo canal do estado é inválido.");
  exigirTexto(dados.tag, "tag");
  exigirTexto(dados.commit, "commit");
  exigirTexto(dados.imagem, "imagem");
  exigirTexto(dados.digest, "digest");
  if (dados.tag && !/^v\d+\.\d+\.\d+$/.test(dados.tag)) {
    throw falhaEstado("O campo tag do estado é inválido.");
  }
  if (dados.commit && !/^[a-f0-9]{7,64}$/.test(dados.commit)) {
    throw falhaEstado("O campo commit do estado é inválido.");
  }
  if (dados.digest && !/^sha256:[a-f0-9]{64}$/.test(dados.digest)) {
    throw falhaEstado("O campo digest do estado é inválido.");
  }
  if (dados.instaladoEm !== undefined && dados.instaladoEm !== null) {
    exigirTexto(dados.instaladoEm, "instaladoEm");
  }
  if (dados.atualizadoEm !== undefined && dados.atualizadoEm !== null) {
    exigirTexto(dados.atualizadoEm, "atualizadoEm");
  }
  if (dados.migradorSha256 !== undefined && dados.migradorSha256 !== null) {
    if (typeof dados.migradorSha256 !== "string" || !/^[a-f0-9]{64}$/.test(dados.migradorSha256)) {
      throw falhaEstado("O campo migradorSha256 do estado é inválido.");
    }
  }
  if (dados.etapas !== undefined) validarEtapas(dados.etapas);
  const estado = {
    schema: SCHEMA_ESTADO,
    instaladoEm: dados.instaladoEm ?? null,
    atualizadoEm: dados.atualizadoEm ?? null,
    perfil: dados.perfil,
    canal: dados.canal,
    tag: dados.tag,
    commit: dados.commit,
    imagem: dados.imagem,
    digest: dados.digest,
    migradorSha256: dados.migradorSha256 ?? null,
    etapas: dados.etapas ?? [],
    controlador: normalizarControlador(dados.controlador),
    backup: normalizarBackup(dados.backup),
    origem: normalizarOrigem(dados.origem),
  };
  if (contemSegredo(estado)) {
    throw falhaEstado("O estado da instalação contém um valor que não pode ser gravado.");
  }
  return estado;
}

// Monta o estado inicial de uma instalação nova.
export function estadoInicial(opcoes = {}) {
  const configuracao = opcoes.configuracao ?? {};
  const agora = typeof opcoes.agora === "function" ? opcoes.agora() : opcoes.agora;
  return {
    schema: SCHEMA_ESTADO,
    instaladoEm: agora ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    atualizadoEm: agora ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    perfil: configuracao.perfil ?? "simples",
    canal: configuracao.canal ?? "release",
    tag: configuracao.tag ?? "",
    commit: configuracao.commit ?? "",
    imagem: configuracao.imagem ?? "",
    digest: configuracao.digest ?? "",
    migradorSha256: null,
    etapas: [],
    controlador: { adotado: false, migradorSha256: null, readocaoPendente: false },
    backup: { ultimoRecibo: null, verificadoEm: null },
    origem: {
      repositorio: "https://github.com/eemtijca/frequenciapp",
      diretorioFonte: configuracao.diretorioFonte || "/opt/frequenciapp",
    },
  };
}

// Lê o estado do disco e devolve ausência, avisos e documento normalizado.
export function lerEstado(opcoes = {}) {
  const caminho = opcoes.caminho ?? caminhoEstado(opcoes.raiz ?? "/");
  const avisos = [];
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return { presente: false, estado: null, caminho, avisos };
    if (erro.code === "EACCES") {
      throw falhaEstado("Não foi possível ler o estado da instalação.", { saida: 5 });
    }
    throw falhaEstado("Não foi possível consultar o estado da instalação.");
  }
  if (informacao.isSymbolicLink() || !informacao.isFile()) {
    throw falhaEstado("O estado da instalação precisa ser um arquivo regular.");
  }
  if (informacao.size > LIMITE_ESTADO) {
    throw falhaEstado("O estado da instalação excede o limite de 1 MiB.");
  }
  if ((informacao.mode & 0o077) !== 0) {
    avisos.push({
      codigo: "A_ESTADO_PERMISSAO",
      mensagem: "O estado da instalação tem permissão mais ampla que 600.",
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    throw falhaEstado("O estado da instalação está corrompido.");
  }
  return {
    presente: true,
    estado: normalizarEstado(dados),
    caminho,
    avisos,
  };
}

function garantirDiretorio(diretorio, modo) {
  if (diretorio === "." || diretorio === "") return;
  try {
    fs.mkdirSync(diretorio, { recursive: true, mode: modo });
    fs.chmodSync(diretorio, modo);
  } catch (erro) {
    if (erro.code === "EACCES" || erro.code === "EPERM") {
      throw erroValidacao("Sem permissão para preparar o diretório do instalador.", {
        dica: "Execute o comando com a conta de implantação ou com sudo.",
        documentacao: "docs/instalador.md#trava",
        saida: 5,
      });
    }
    throw erroValidacao("Não foi possível preparar o diretório do instalador.", {
      documentacao: "docs/instalador.md#trava",
    });
  }
}

function removerTemporario(caminho) {
  try {
    fs.unlinkSync(caminho);
  } catch {
    // O temporário pode não ter sido criado.
  }
}

function sincronizarDiretorio(diretorio) {
  const descritor = fs.openSync(diretorio, "r");
  try {
    fs.fsyncSync(descritor);
  } catch (erro) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes(erro.code)) throw erro;
  } finally {
    fs.closeSync(descritor);
  }
}

// Grava um arquivo com temporário, fsync, rename e fsync do diretório.
export function gravarArquivoAtomico(caminho, conteudo, opcoes = {}) {
  const modo = opcoes.modo ?? 0o600;
  const diretorio = path.dirname(caminho);
  const temporario = path.join(
    diretorio,
    `.${path.basename(caminho)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`,
  );
  let descritor = null;
  try {
    descritor = fs.openSync(temporario, "wx", modo);
    fs.writeFileSync(descritor, conteudo, "utf8");
    fs.fsyncSync(descritor);
    fs.closeSync(descritor);
    descritor = null;
    fs.renameSync(temporario, caminho);
    fs.chmodSync(caminho, modo);
    sincronizarDiretorio(diretorio);
  } catch (erro) {
    if (descritor !== null) {
      try {
        fs.closeSync(descritor);
      } catch {}
    }
    removerTemporario(temporario);
    throw erro;
  }
  return caminho;
}

// Grava o estado normalizado com modo 600 e escrita atômica.
export function gravarEstado(estado, opcoes = {}) {
  const caminho = opcoes.caminho ?? caminhoEstado(opcoes.raiz ?? "/");
  if (contemSegredo(estado)) {
    throw falhaEstado("O estado da instalação contém um valor que não pode ser gravado.");
  }
  const normalizado = normalizarEstado({ ...estado, schema: SCHEMA_ESTADO });
  const conteudo = `${JSON.stringify(normalizado, null, 2)}\n`;
  garantirDiretorio(path.dirname(caminho), 0o700);
  let gravado;
  try {
    gravado = gravarArquivoAtomico(caminho, conteudo, { modo: 0o600 });
  } catch (erro) {
    if (erro instanceof ErroInstalador) throw erro;
    throw falhaEstado("Não foi possível gravar o estado da instalação.", {
      dica: "Confira o espaço em disco e a permissão do diretório de estado.",
    });
  }
  const informacao = fs.statSync(gravado);
  if ((informacao.mode & 0o777) !== 0o600) {
    throw falhaEstado("O estado da instalação não ficou com modo 600.");
  }
  if (typeof process.getuid === "function" && informacao.uid !== process.getuid()) {
    throw falhaEstado("O estado da instalação não ficou com o proprietário esperado.");
  }
  return gravado;
}

function primeiroPid(texto) {
  for (const parte of String(texto ?? "").split(/\s+/)) {
    if (/^\d+$/.test(parte) && Number(parte) > 0) return parte;
  }
  return null;
}

function lerPidTrava(caminhoTrava) {
  try {
    const conteudo = fs.readFileSync(caminhoTrava, "utf8").slice(0, 4096).trim();
    const exato = primeiroPid(conteudo);
    if (exato) return exato;
  } catch {}
  for (const [comando, argumentos] of [
    ["lsof", ["-t", caminhoTrava]],
    ["fuser", [caminhoTrava]],
  ]) {
    try {
      const resultado = spawnSync(comando, argumentos, {
        encoding: "utf8",
        timeout: 2000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      });
      if (resultado.status === 0 || resultado.status === 1) {
        const pid = primeiroPid(`${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}`);
        if (pid) return pid;
      }
    } catch {}
  }
  return null;
}

// Executa um comando sob a trava exclusiva do instalador.
export function executarSobTrava(caminhoTrava, comando, argumentos = [], opcoes = {}) {
  garantirDiretorio(path.dirname(caminhoTrava), 0o700);
  try {
    const informacao = fs.lstatSync(caminhoTrava);
    if (informacao.isSymbolicLink() || !informacao.isFile()) {
      throw erroValidacao("A trava do instalador precisa ser um arquivo regular.", {
        dica: "Remova links simbólicos do caminho da trava.",
        documentacao: "docs/instalador.md#trava",
      });
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") {
      if (erro instanceof ErroInstalador) throw erro;
      throw erroValidacao("Não foi possível consultar a trava do instalador.", {
        documentacao: "docs/instalador.md#trava",
      });
    }
  }
  let descritorTrava = null;
  try {
    const semSeguirLink = fs.constants.O_NOFOLLOW ?? 0;
    descritorTrava = fs.openSync(
      caminhoTrava,
      fs.constants.O_CREAT | fs.constants.O_WRONLY | semSeguirLink,
      0o600,
    );
    fs.fchmodSync(descritorTrava, 0o600);
  } catch (erro) {
    if (erro.code === "EACCES" || erro.code === "EPERM") {
      throw erroValidacao("Sem permissão para preparar a trava do instalador.", {
        dica: "Execute o comando com a conta de implantação ou com sudo.",
        documentacao: "docs/instalador.md#trava",
        saida: 5,
      });
    }
    throw erroValidacao("Não foi possível preparar a trava do instalador.", {
      documentacao: "docs/instalador.md#trava",
    });
  } finally {
    if (descritorTrava !== null) fs.closeSync(descritorTrava);
  }
  const executar = opcoes.executar ?? spawnSync;
  const resultado = executar("flock", ["-w", "30", "-x", caminhoTrava, comando, ...argumentos], {
    encoding: "utf8",
    input: opcoes.input,
    timeout: opcoes.timeout ?? 60000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (resultado.error?.code === "ENOENT") {
    throw erroValidacao("O utilitário flock não foi encontrado.", {
      dica: "Instale util-linux e repita o comando.",
      documentacao: "docs/instalador.md#trava",
      saida: 4,
    });
  }
  if (resultado.status === 1) {
    let pid = null;
    try {
      pid = (opcoes.lerPid ?? lerPidTrava)(caminhoTrava);
    } catch {
      pid = null;
    }
    const detalhe = pid ? ` Processo detentor: ${pid}.` : "";
    throw erroValidacao(`A trava do instalador está ocupada por outro processo.${detalhe}`, {
      dica: "Aguarde a operação em andamento e repita o comando.",
      documentacao: "docs/instalador.md#trava",
    });
  }
  return resultado;
}

// Grava configuração ou outro arquivo sob trava, sem segredo em argv.
export function gravarArquivoComTrava(caminhoTrava, destino, conteudo, opcoes = {}) {
  const resultado = executarSobTrava(
    caminhoTrava,
    process.execPath,
    ["-e", SCRIPT_ESCRITA_ATOMICA, destino, opcoes.sobrescrever ? "1" : "0"],
    { input: conteudo, executar: opcoes.executar, timeout: opcoes.timeout ?? 60000 },
  );
  if (resultado.status === 3) {
    throw erroUso("O arquivo de destino já existe. Use --forcar para sobrescrever.", {
      dica: "Escolha outro caminho ou confirme a sobrescrita com --forcar.",
      documentacao: "docs/instalador.md#arquivo-de-configuração",
    });
  }
  if (resultado.status !== 0) {
    throw erroValidacao("Não foi possível gravar o arquivo com segurança.", {
      dica: "Confira o caminho, a permissão do diretório e o espaço em disco.",
      documentacao: "docs/instalador.md#arquivo-de-configuração",
    });
  }
  return destino;
}

export const CONSTANTES = {
  SCHEMA_ESTADO,
  CAMINHO_ESTADO,
  CAMINHO_TRAVA,
  LIMITE_ESTADO,
};
