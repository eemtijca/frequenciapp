// Etapa Dropbox: valida a adoção opt-in e liga a retenção remota no ops.env.
import fs from "node:fs";
import path from "node:path";
import { ErroInstalador } from "../json.mjs";
import {
  acao,
  atualizarEnv,
  avisoEtapa,
  falha,
  gravarArquivoPrivado,
  sha256Arquivo,
} from "./contexto.mjs";

export const id = "dropbox";
export const titulo = "Valida a adoção Dropbox e liga a retenção remota";
export const limiteSegundos = 300;

const ADOCAO = "pasta-exclusiva-frequenciapp-v1";
const DOCUMENTACAO = "docs/dropbox-retencao.md#arquivo-de-adoção";
const CABECALHO_OPS =
  "# FrequenciApp. Ambiente operacional gerado pelo instalador. Não editar à mão.\n# Este arquivo contém configuração do host e deve permanecer com modo 600.";
const CHAVES_RCLONE = new Set(["type", "root_namespace", "token", "client_id", "client_secret"]);

function erroDropbox(mensagem, dica) {
  return falha("E_DROPBOX", mensagem, { dica, documentacao: DOCUMENTACAO });
}

function exigir(condicao, mensagem, dica) {
  if (!condicao) throw erroDropbox(mensagem, dica);
}

function validarDiretorioPrivado(caminho, rotulo) {
  exigir(
    typeof caminho === "string" && path.isAbsolute(caminho),
    `O caminho do diretório de ${rotulo} precisa ser absoluto.`,
    "Confira o caminho indicado nas flags do perfil Dropbox.",
  );
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch {
    throw erroDropbox(
      `O diretório de ${rotulo} não foi encontrado.`,
      "Confira o caminho e a permissão do diretório privado.",
    );
  }
  exigir(
    !informacao.isSymbolicLink() && informacao.isDirectory(),
    `O diretório de ${rotulo} precisa ser um diretório regular.`,
    "Remova o link simbólico e use um diretório privado.",
  );
  exigir(
    (informacao.mode & 0o777) === 0o700,
    `O diretório de ${rotulo} precisa ter modo 700.`,
    "Ajuste a permissão do diretório antes de repetir a instalação.",
  );
}

function lerArquivoPrivado(caminho, rotulo, limite) {
  exigir(
    typeof caminho === "string" && path.isAbsolute(caminho),
    `O caminho do arquivo de ${rotulo} precisa ser absoluto.`,
    "Confira o caminho indicado nas flags do perfil Dropbox.",
  );
  validarDiretorioPrivado(path.dirname(caminho), rotulo);
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch {
    throw erroDropbox(
      `O arquivo de ${rotulo} não foi encontrado.`,
      "Confira o caminho indicado nas flags do perfil Dropbox.",
    );
  }
  exigir(
    !informacao.isSymbolicLink() && informacao.isFile(),
    `O arquivo de ${rotulo} precisa ser um arquivo regular.`,
    "Remova o link simbólico e use um arquivo privado.",
  );
  exigir(
    (informacao.mode & 0o777) === 0o600 && informacao.size <= limite,
    `O arquivo de ${rotulo} precisa ter modo 600 e tamanho válido.`,
    "Ajuste a permissão e o conteúdo do arquivo antes de repetir a instalação.",
  );
  let descritor;
  try {
    descritor = fs.openSync(caminho, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch {
    throw erroDropbox(
      `O arquivo de ${rotulo} não pôde ser lido.`,
      "Confira a permissão e o caminho do arquivo privado.",
    );
  }
  try {
    const conferido = fs.fstatSync(descritor);
    exigir(
      conferido.isFile() && (conferido.mode & 0o777) === 0o600 && conferido.size <= limite,
      `O arquivo de ${rotulo} precisa ter modo 600 e tamanho válido.`,
      "Ajuste a permissão e o conteúdo do arquivo antes de repetir a instalação.",
    );
    return fs.readFileSync(descritor, "utf8");
  } finally {
    fs.closeSync(descritor);
  }
}

function lerAdocao(ctx) {
  const texto = lerArquivoPrivado(ctx.configuracao.configDropbox, "adoção Dropbox", 64 * 1024);
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw erroDropbox(
      "O arquivo de adoção Dropbox não contém JSON válido.",
      "Revise o arquivo privado e repita a instalação.",
    );
  }
  exigir(
    dados && typeof dados === "object" && !Array.isArray(dados),
    "O arquivo de adoção Dropbox não contém um objeto válido.",
    "Revise o arquivo privado e repita a instalação.",
  );
  return dados;
}

function textoValido(valor) {
  return (
    typeof valor === "string" &&
    valor.length > 0 &&
    valor.length <= 256 &&
    !/[\x00-\x1f\x7f|]/.test(valor)
  );
}

function validarAdocao(adocao, ctx) {
  const configuracao = ctx.configuracao;
  exigir(
    adocao.versao === 1 && adocao.adocao === ADOCAO,
    "O arquivo de adoção Dropbox não segue o contrato esperado.",
    "Use a versão 1 e o marcador pasta-exclusiva-frequenciapp-v1.",
  );
  exigir(
    typeof adocao.accountId === "string" && /^dbid:[A-Za-z0-9_-]+$/.test(adocao.accountId),
    "O identificador da conta Dropbox na adoção é inválido.",
    "Gere a adoção novamente a partir da conta correta.",
  );
  exigir(
    typeof adocao.namespaceId === "string" && /^\d+$/.test(adocao.namespaceId),
    "O identificador do namespace Dropbox na adoção é inválido.",
    "Gere a adoção novamente a partir da conta correta.",
  );
  exigir(
    typeof adocao.folderId === "string" && /^id:[A-Za-z0-9_-]+$/.test(adocao.folderId),
    "O identificador da pasta Dropbox na adoção é inválido.",
    "Gere a adoção novamente a partir da pasta correta.",
  );
  exigir(
    textoValido(adocao.alvo) && textoValido(adocao.banco) && textoValido(adocao.schema),
    "A adoção Dropbox não informa alvo, banco e schema válidos.",
    "Revise a identidade gravada no arquivo de adoção.",
  );
  exigir(
    typeof adocao.folderPath === "string" &&
      /^\/(?!$)[^\x00-\x1f\x7f\\]+$/.test(adocao.folderPath) &&
      adocao.folderPath === adocao.folderPath.toLowerCase() &&
      adocao.folderPath === path.posix.normalize(adocao.folderPath) &&
      !adocao.folderPath.endsWith("/"),
    "A pasta da adoção Dropbox não é um caminho absoluto em minúsculas e normalizado.",
    "Revise folderPath no arquivo de adoção.",
  );
  exigir(
    adocao.destino === configuracao.destino,
    "O destino da adoção Dropbox diverge do plano.",
    "Use o mesmo valor em --destino e no arquivo de adoção.",
  );
  const remoto = /^([A-Za-z0-9_-]+):(.+)$/.exec(adocao.destino);
  exigir(
    remoto,
    "O destino da adoção Dropbox não segue o formato remoto:caminho.",
    "Use o formato remoto:caminho em --destino.",
  );
  exigir(
    adocao.folderPath === `/${remoto[2]}`,
    "A pasta da adoção Dropbox diverge do destino.",
    "Ajuste folderPath para a mesma pasta de --destino.",
  );
  exigir(
    Number.isSafeInteger(adocao.limiteBytes) &&
      adocao.limiteBytes > 0 &&
      adocao.limiteBytes <= 1024 ** 4,
    "O limite de download da adoção Dropbox é inválido.",
    "Revise limiteBytes no arquivo de adoção.",
  );
  exigir(
    Number.isSafeInteger(adocao.timeoutMs) && adocao.timeoutMs >= 50 && adocao.timeoutMs <= 300000,
    "O tempo limite da adoção Dropbox é inválido.",
    "Revise timeoutMs no arquivo de adoção.",
  );
  exigir(
    adocao.minimoAutorizado === undefined ||
      (Number.isSafeInteger(adocao.minimoAutorizado) && adocao.minimoAutorizado >= 0),
    "O mínimo autorizado da adoção Dropbox é inválido.",
    "Revise minimoAutorizado no arquivo de adoção.",
  );
  exigir(
    adocao.tokenFile === configuracao.arquivoTokenDropbox,
    "O token da adoção Dropbox diverge do arquivo informado.",
    "Use o mesmo valor em --arquivo-token-dropbox e no arquivo de adoção.",
  );
  exigir(
    adocao.rcloneConfig === configuracao.configRclone,
    "O rclone.conf da adoção Dropbox diverge do arquivo informado.",
    "Use o mesmo valor em --config-rclone e no arquivo de adoção.",
  );
  lerArquivoPrivado(adocao.tokenFile, "token Dropbox", 1024 * 1024);
  const rcloneTexto = lerArquivoPrivado(adocao.rcloneConfig, "rclone.conf", 4 * 1024 * 1024);
  const hash = sha256Arquivo(adocao.rcloneConfig);
  exigir(
    typeof adocao.rcloneConfigSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(adocao.rcloneConfigSha256) &&
      hash === adocao.rcloneConfigSha256,
    "O hash do rclone.conf na adoção Dropbox não confere.",
    "Recalcule o SHA-256 do arquivo e atualize a adoção.",
  );
  return { adocao, rcloneTexto, remoto };
}

function validarRclone(rcloneTexto, remoto, adocao) {
  const secoes = new Map();
  let secao = null;
  for (const linha of rcloneTexto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#") || limpa.startsWith(";")) continue;
    const cabecalho = /^\[([^\]]+)\]$/.exec(limpa);
    if (cabecalho) {
      exigir(
        !secoes.has(cabecalho[1]),
        "O rclone.conf tem uma seção duplicada.",
        "Revise o arquivo de configuração do rclone.",
      );
      secao = new Map();
      secoes.set(cabecalho[1], secao);
      continue;
    }
    const par = /^([a-zA-Z0-9_]+)\s*=\s*(.*)$/.exec(limpa);
    exigir(
      secao && par && !secao.has(par[1]),
      "O rclone.conf não segue o formato esperado.",
      "Revise o arquivo de configuração do rclone.",
    );
    secao.set(par[1], par[2]);
  }
  const remotoAdotado = secoes.get(remoto[1]);
  exigir(
    remotoAdotado,
    "O remote da adoção Dropbox não existe no rclone.conf.",
    "Confira o nome do remote em --destino e no rclone.conf.",
  );
  exigir(
    remotoAdotado.get("type") === "dropbox" &&
      remotoAdotado.get("root_namespace") === adocao.namespaceId,
    "O remote da adoção Dropbox não aponta para o namespace esperado.",
    "Confira type e root_namespace no rclone.conf.",
  );
  for (const chave of remotoAdotado.keys()) {
    exigir(
      CHAVES_RCLONE.has(chave),
      "O remote da adoção Dropbox usa uma chave não permitida.",
      "Remova aliases, crypt e opções implícitas do remote.",
    );
  }
}

function lerOpsExistente(ctx) {
  try {
    const informacao = fs.lstatSync(ctx.caminhos.opsEnv);
    exigir(
      !informacao.isSymbolicLink() && informacao.isFile(),
      "O arquivo ops.env precisa ser um arquivo regular.",
      "Substitua o link simbólico por um arquivo privado.",
    );
    return fs.readFileSync(ctx.caminhos.opsEnv, "utf8");
  } catch (erro) {
    if (erro instanceof ErroInstalador) throw erro;
    if (erro?.code === "ENOENT") return "";
    throw erro;
  }
}

function atualizarOps(ctx, adocao) {
  const existente = lerOpsExistente(ctx);
  const desejado = new Map([
    ["BACKUP_DROPBOX_CONFIG", ctx.configuracao.configDropbox],
    ["BACKUP_RCLONE_CONFIG", ctx.configuracao.configRclone],
    ["BACKUP_REMOTO", ctx.configuracao.destino],
    ["BACKUP_RETER_REMOTO", "true"],
    ["BACKUP_VERIFICAR_REMOTO", "true"],
  ]);
  const resultado = atualizarEnv(existente, desejado, CABECALHO_OPS);
  const modoAtual = fs.existsSync(ctx.caminhos.opsEnv)
    ? fs.statSync(ctx.caminhos.opsEnv).mode & 0o777
    : null;
  const alterou = resultado.alterou || modoAtual !== 0o600;
  if (alterou) {
    gravarArquivoPrivado(ctx.caminhos.opsEnv, resultado.texto, ctx.gravarArquivoAtomico);
  }
  if (ctx.ambiente && typeof ctx.ambiente.set === "function") {
    for (const [chave, valor] of desejado) ctx.ambiente.set(chave, valor);
  }
  return { alterou, adocao };
}

function executarPasso(ctx) {
  const configuracao = ctx?.configuracao ?? {};
  const faltantes = [
    configuracao.configDropbox,
    configuracao.arquivoTokenDropbox,
    configuracao.configRclone,
    configuracao.destino,
  ].some((valor) => typeof valor !== "string" || !valor.trim());
  if (faltantes) {
    throw erroDropbox(
      "A configuração Dropbox está incompleta.",
      "Informe --config-dropbox, --arquivo-token-dropbox, --config-rclone e --destino.",
    );
  }
  const adocao = lerAdocao(ctx);
  const validada = validarAdocao(adocao, ctx);
  validarRclone(validada.rcloneTexto, validada.remoto, adocao);
  const { alterou } = atualizarOps(ctx, adocao);
  if (typeof ctx.registrarLog === "function") {
    ctx.registrarLog(
      alterou
        ? "etapa=dropbox ops.env atualizado com retencao remota"
        : "etapa=dropbox ops.env sem mudancas",
    );
  }
  const acoes = [acao("Valida a adoção Dropbox, o token e o rclone.conf", null, false)];
  acoes.push(
    alterou
      ? acao("Atualiza o ops.env com a retenção Dropbox e modo 600", null, true)
      : acao("O ops.env já contém a retenção Dropbox com modo 600", null, false),
  );
  return {
    estado: "concluida",
    acoes,
    avisos: [],
    detalhes: {
      adotado: true,
      destino: adocao.destino,
      folderPath: adocao.folderPath,
      caminhoTransporte: adocao.rcloneConfig,
      semMudancas: !alterou,
      backupPendente: true,
      identidade: {
        alvo: adocao.alvo,
        banco: adocao.banco,
        schema: adocao.schema,
        validadaContraAmbiente: false,
        conferidaPor: "scripts/servidor/backup-banco.sh",
      },
    },
  };
}

export function executar(ctx) {
  if (ctx?.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("A adoção Dropbox não foi aplicada por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "A adoção Dropbox não foi aplicada porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, adotado: false, backupPendente: false },
    };
  }
  try {
    return executarPasso(ctx);
  } catch (erro) {
    if (erro instanceof ErroInstalador && erro.codigo === "E_DROPBOX") throw erro;
    throw erroDropbox(
      "Não foi possível ativar a retenção Dropbox.",
      "Confira as permissões, o token e o hash do rclone.conf.",
    );
  }
}
