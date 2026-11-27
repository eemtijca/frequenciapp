// Valida arquivos de ambiente antes do source, aceitando apenas atribuições literais.
// A gramática recusa construções executáveis e não repete valores nas mensagens de erro.
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NOME_VARIAVEL = /^[A-Z_][A-Z0-9_]*$/;
export const CHAVE_MIGRACOES_AUTO = "ATUALIZAR_APROVAR_MIGRACOES_AUTOMATICAMENTE";
const VALOR_SEM_ASPAS = /^[\p{L}\p{N}\p{M}_.:/@%+=,-]+$/u;
const CONTROLE = /[\u0000-\u001F\u007F]/;
const PROIBIDOS = [
  ["\\", "barra invertida não é aceita; remova escapes e continuações de linha"],
  ["`", "substituição por crase não é aceita"],
  ["$", "substituição de comando ou de variável não é aceita"],
  [";", "ponto e vírgula não é aceito"],
];

export class ErroAmbiente extends Error {
  constructor(arquivo, linha, motivo) {
    super(`${arquivo}: linha ${linha}: ${motivo}`);
    this.name = "ErroAmbiente";
    this.arquivo = arquivo;
    this.linha = linha;
    this.motivo = motivo;
  }
}

function nomeSeguro(arquivo) {
  return String(arquivo || "<ambiente>").replace(/[\p{Cc}]/gu, "?");
}

function motivoControle(caractere) {
  if (caractere === "\u0000") return "caractere NUL não é aceito";
  if (caractere === "\r") return "retorno de carro (CR) não é aceito; use fim de linha LF";
  if (caractere === "\t") return "tabulação não é aceita; use espaço";
  return "caractere de controle não é aceito";
}

function recusar(arquivo, linha, motivo) {
  throw new ErroAmbiente(arquivo, linha, motivo);
}

function validarValor(valor, arquivo, linha) {
  for (const [caractere, motivo] of PROIBIDOS) {
    if (valor.includes(caractere)) recusar(arquivo, linha, motivo);
  }

  let aspas = "";
  if (valor.startsWith("'")) aspas = "'";
  else if (valor.startsWith('"')) aspas = '"';
  if (aspas) {
    const fim = valor.indexOf(aspas, 1);
    const tipo = aspas === "'" ? "aspas simples" : "aspas duplas";
    if (fim === -1) recusar(arquivo, linha, `${tipo} não foram fechadas`);
    if (fim !== valor.length - 1) recusar(arquivo, linha, "há caracteres após o valor citado");
    return;
  }

  if (valor.startsWith(" ")) recusar(arquivo, linha, "não use espaço depois do sinal de igual");
  if (valor !== valor.trimEnd()) recusar(arquivo, linha, "espaço no fim da linha não é aceito");
  if (/\s/u.test(valor)) {
    recusar(arquivo, linha, "valor sem aspas contém espaço; cite o valor com aspas simples");
  }
  if (valor.includes("'") || valor.includes('"')) {
    recusar(arquivo, linha, "aspas só são aceitas envolvendo todo o valor");
  }
  if (!VALOR_SEM_ASPAS.test(valor)) {
    recusar(
      arquivo,
      linha,
      "valor sem aspas contém caractere não aceito; cite o valor com aspas simples",
    );
  }
}

export function validarConteudoAmbiente(conteudo, arquivo = "<ambiente>") {
  if (typeof conteudo !== "string") {
    throw new TypeError("Conteúdo de ambiente precisa ser texto.");
  }
  const nome = nomeSeguro(arquivo);
  const linhas = conteudo.split("\n");
  let atribuicoes = 0;

  for (let indice = 0; indice < linhas.length; indice++) {
    const linha = linhas[indice];
    const numero = indice + 1;
    const controle = CONTROLE.exec(linha);
    if (controle) recusar(nome, numero, motivoControle(controle[0]));
    if (linha === "" || /^ *$/.test(linha)) continue;
    if (/^ *#/.test(linha)) {
      if (linha.includes("\\")) recusar(nome, numero, PROIBIDOS[0][1]);
      continue;
    }

    const atribuicao = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linha);
    if (!atribuicao) {
      if (/^ +/.test(linha)) recusar(nome, numero, "atribuição não pode começar com espaço");
      if (/^[A-Za-z_][A-Za-z0-9_]* *=/.test(linha)) {
        recusar(nome, numero, "não use espaço em volta do sinal de igual");
      }
      recusar(nome, numero, "linha não é comentário nem atribuição literal");
    }

    const [, variavel, valor] = atribuicao;
    if (!NOME_VARIAVEL.test(variavel)) {
      recusar(
        nome,
        numero,
        "nome de variável inválido; use letras maiúsculas, números e sublinhado",
      );
    }
    if (valor !== "") validarValor(valor, nome, numero);
    atribuicoes += 1;
  }

  return { atribuicoes };
}

export function politicaMigracoesAuto(app, ops) {
  let politica;
  const atribuicao = new RegExp(`^\\s*(?:export\\s+)?${CHAVE_MIGRACOES_AUTO}\\s*=`);
  for (const [arquivo, texto] of [
    ["app.env", app],
    ["ops.env", ops],
  ]) {
    for (const [indice, linha] of texto.split("\n").entries()) {
      if (!atribuicao.test(linha)) continue;
      const numero = indice + 1;
      if (arquivo !== "ops.env")
        recusar(arquivo, numero, `${CHAVE_MIGRACOES_AUTO} só pertence ao ops.env`);
      if (politica !== undefined)
        recusar(arquivo, numero, `${CHAVE_MIGRACOES_AUTO} está duplicada`);
      const literal = linha.startsWith(`${CHAVE_MIGRACOES_AUTO}=`)
        ? linha.slice(CHAVE_MIGRACOES_AUTO.length + 1)
        : "";
      const valor = /^(?:true|false)$/.test(literal)
        ? literal
        : /^(['"])(true|false)\1$/.exec(literal)?.[2];
      if (valor === undefined)
        recusar(arquivo, numero, `${CHAVE_MIGRACOES_AUTO} exige true ou false`);
      politica = valor === "true";
    }
  }
  return politica ?? false;
}

function lerAmbientePrivado(caminho, rotulo) {
  try {
    const fd = openSync(caminho, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const st = fstatSync(fd);
      if (
        !st.isFile() ||
        st.nlink !== 1 ||
        st.size > 1048576 ||
        (st.uid !== 0 && st.uid !== process.getuid()) ||
        (st.mode & 0o037) !== 0
      )
        throw new Error("arquivo sem proteção");
      const texto = readFileSync(fd, "utf8");
      validarConteudoAmbiente(texto, rotulo);
      return texto;
    } finally {
      closeSync(fd);
    }
  } catch (erro) {
    if (erro instanceof ErroAmbiente) throw erro;
    throw new Error(`${rotulo}: ambiente operacional ausente ou sem proteção.`);
  }
}

export function validarArquivoAmbiente(caminho) {
  let conteudo;
  try {
    conteudo = readFileSync(caminho, "utf8");
  } catch {
    throw new Error(`${nomeSeguro(caminho)}: não foi possível ler o arquivo.`);
  }
  return validarConteudoAmbiente(conteudo, caminho);
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) {
  if (process.argv.length < 3) {
    console.error("Uso: ambiente-seguro.mjs <arquivo> [arquivo...]");
    process.exitCode = 2;
  } else {
    try {
      const [, , primeiro, ...args] = process.argv;
      if (primeiro === "--politica-migracoes-auto") {
        if (args.length !== 2) throw new Error("Informe app.env e ops.env.");
        console.log(
          String(
            politicaMigracoesAuto(
              lerAmbientePrivado(args[0], "app.env"),
              lerAmbientePrivado(args[1], "ops.env"),
            ),
          ),
        );
      } else {
        for (const caminho of [primeiro, ...args]) validarArquivoAmbiente(caminho);
      }
    } catch (erro) {
      console.error(erro instanceof Error ? erro.message : "Arquivo de ambiente inválido.");
      process.exitCode = 1;
    }
  }
}
