// Contexto compartilhado das etapas do aplicar: caminhos, ambiente, segredos e comandos.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ErroInstalador, erroValidacao } from "../json.mjs";

export const USUARIO_PADRAO = "frequenciapp";
export const PROJETO_PADRAO = "frequenciapp";
export const PROJETO_TESTE = "frequenciapp-teste";
export const DOMINIO_PADRAO = "frequencia.local";
export const NOME_ADMIN_PADRAO = "Administração";
export const NOME_COORDENACAO_PADRAO = "Coordenação";

// Junta a raiz de teste ao caminho absoluto do contrato.
export function sobRaiz(raiz, absoluto) {
  if (!raiz || raiz === "/") return absoluto;
  return path.join(raiz, absoluto.replace(/^\/+/, ""));
}

// Resolve os caminhos operacionais usados pelas etapas.
export function caminhosOperacao(raiz = "/", configuracao = {}, modoTeste = false) {
  const diretorioFonte = configuracao.diretorioFonte || "/opt/frequenciapp";
  const travaDirInformada = process.env.INSTALADOR_LOCK_DIR || "";
  return {
    raiz,
    appDir: sobRaiz(raiz, diretorioFonte),
    configDir: sobRaiz(raiz, "/etc/frequenciapp"),
    appEnv: sobRaiz(raiz, "/etc/frequenciapp/app.env"),
    opsEnv: sobRaiz(raiz, "/etc/frequenciapp/ops.env"),
    identidade: sobRaiz(raiz, "/etc/frequenciapp/identidade.json"),
    estadoDir: sobRaiz(raiz, "/var/lib/frequenciapp"),
    estado: sobRaiz(raiz, "/var/lib/frequenciapp/instalacao.json"),
    backupDir: sobRaiz(raiz, "/var/backups/frequenciapp"),
    backupBancoDir: sobRaiz(raiz, "/var/backups/frequenciapp/banco"),
    backupPlanilhasDir: sobRaiz(raiz, "/var/backups/frequenciapp/planilhas"),
    logDir: sobRaiz(raiz, "/var/log/frequenciapp"),
    log: sobRaiz(raiz, "/var/log/frequenciapp/instalador.log"),
    lockDir: travaDirInformada
      ? path.resolve(travaDirInformada)
      : sobRaiz(raiz, "/var/lock/frequenciapp"),
    projetoCompose: modoTeste
      ? process.env.COMPOSE_PROJECT_NAME || PROJETO_TESTE
      : process.env.COMPOSE_PROJECT_NAME || PROJETO_PADRAO,
  };
}

// Lê um arquivo de ambiente no formato CHAVE=valor, sem interpretar shell.
export function lerEnv(texto) {
  const mapa = new Map();
  const ordem = [];
  for (const linha of String(texto ?? "").split(/\r?\n/)) {
    const combinacao = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linha);
    if (!combinacao) continue;
    let valor = combinacao[2];
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2) {
      valor = valor.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (!mapa.has(combinacao[1])) ordem.push(combinacao[1]);
    mapa.set(combinacao[1], valor);
  }
  return { mapa, ordem };
}

// Monta o texto estável de um arquivo de ambiente.
export function montarEnv(mapa, ordem, cabecalho = "") {
  const linhas = [];
  if (cabecalho) linhas.push(...cabecalho.split("\n"));
  for (const chave of ordem) {
    if (!mapa.has(chave)) continue;
    const valor = String(mapa.get(chave) ?? "");
    if (/[\r\n]/.test(valor)) {
      throw erroValidacao(`O valor da variável ${chave} não pode ter quebra de linha.`);
    }
    linhas.push(`${chave}=${valor}`);
  }
  return `${linhas.join("\n")}\n`;
}

// Acrescenta ou atualiza chaves gerenciadas preservando as demais.
export function atualizarEnv(existente, gerenciados, cabecalho = "") {
  const lido = lerEnv(existente || "");
  const ordem = [...gerenciados.keys()];
  for (const chave of lido.ordem) {
    if (!gerenciados.has(chave) && !ordem.includes(chave)) ordem.push(chave);
  }
  const mapa = new Map(lido.mapa);
  for (const [chave, valor] of gerenciados) mapa.set(chave, String(valor));
  const igual =
    Boolean(existente) &&
    lido.ordem.every((chave) => mapa.has(chave)) &&
    lido.mapa.size === mapa.size &&
    [...mapa].every(([chave, valor]) => lido.mapa.get(chave) === valor);
  return {
    alterou: !igual,
    texto: igual ? existente : montarEnv(mapa, ordem, cabecalho),
    mapa,
  };
}

// Compara mapas de ambiente gerenciados sem considerar a ordem das linhas.
export function mesmoAmbiente(mapa, desejado) {
  for (const [chave, valor] of desejado) {
    if (mapa.get(chave) !== String(valor)) return false;
  }
  return true;
}

export function segredoAleatorio(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function senhaAleatoria(tamanho = 20) {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(tamanho);
  let senha = "A1";
  for (const byte of bytes) senha += alfabeto[byte % alfabeto.length];
  return senha.slice(0, Math.max(8, tamanho));
}

export function sha256Texto(texto) {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

export function sha256Arquivo(caminho) {
  const hash = crypto.createHash("sha256");
  const descritor = fs.openSync(caminho, "r");
  const bloco = Buffer.allocUnsafe(1024 * 1024);
  try {
    let lidos = 0;
    while ((lidos = fs.readSync(descritor, bloco, 0, bloco.length, null)) > 0) {
      hash.update(bloco.subarray(0, lidos));
    }
  } finally {
    fs.closeSync(descritor);
  }
  return hash.digest("hex");
}

// Cria diretório com modo restrito, sem seguir link simbólico.
export function garantirDiretorio(caminho, modo) {
  let info;
  try {
    info = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code !== "ENOENT") {
      throw erroValidacao("Não foi possível consultar um diretório da instalação.", {
        dica: "Confira a permissão e o caminho do diretório.",
        documentacao: "docs/instalador.md#estado-durável",
      });
    }
    fs.mkdirSync(caminho, { recursive: true, mode: modo });
    info = fs.lstatSync(caminho);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw erroValidacao(`O caminho ${caminho} precisa ser um diretório regular.`, {
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  const modoAtual = info.mode & 0o777;
  if (modoAtual !== modo) fs.chmodSync(caminho, modo);
  return modoAtual !== modo;
}

// Grava arquivo com modo 600 e troca atômica.
export function gravarArquivoPrivado(caminho, conteudo, gravarAtomico) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(path.dirname(caminho), 0o700);
  } catch {
    // O chmod do diretório pode não ser permitido em ambiente de teste.
  }
  gravarAtomico(caminho, conteudo, { modo: 0o600 });
  fs.chmodSync(caminho, 0o600);
}

// Lê arquivo de segredo exigindo modo 600 e arquivo regular.
export function lerSegredo(caminho, rotulo) {
  let info;
  try {
    info = fs.lstatSync(caminho);
  } catch {
    throw erroValidacao(`O arquivo de ${rotulo} não foi encontrado.`, {
      dica: "Crie o arquivo com a senha e modo 600, ou deixe o instalador gerar.",
      documentacao: "docs/instalador.md#segurança",
    });
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw erroValidacao(`O arquivo de ${rotulo} precisa ser um arquivo regular.`, {
      documentacao: "docs/instalador.md#segurança",
    });
  }
  if ((info.mode & 0o077) !== 0) {
    throw erroValidacao(`O arquivo de ${rotulo} precisa ter modo 600.`, {
      dica: "Ajuste a permissão antes de repetir a instalação.",
      documentacao: "docs/instalador.md#segurança",
    });
  }
  const texto = fs.readFileSync(caminho, "utf8").replace(/\r?\n$/, "");
  if (!texto) {
    throw erroValidacao(`O arquivo de ${rotulo} está vazio.`, {
      documentacao: "docs/instalador.md#segurança",
    });
  }
  return texto;
}

// Executa um comando com ambiente explícito e devolve a saída normalizada.
export function executarEtapa(ctx, comando, argumentos = [], opcoes = {}) {
  const ambiente = { ...(ctx.ambienteBase ?? {}), ...(opcoes.env ?? {}) };
  const resultado = ctx.executar(comando, argumentos, {
    input: opcoes.input,
    timeout: opcoes.timeout ?? 120000,
    maxBuffer: 4 * 1024 * 1024,
    env: ambiente,
  });
  const normalizado = {
    status: typeof resultado.status === "number" ? resultado.status : 1,
    stdout: String(resultado.stdout ?? ""),
    stderr: String(resultado.stderr ?? ""),
    erro: resultado.error ?? resultado.erro ?? null,
  };
  return normalizado;
}

// Repete uma operação transitória com espera progressiva.
export function comRetentativas(ctx, operacao, opcoes = {}) {
  const tentativas = opcoes.tentativas ?? 3;
  const esperas = opcoes.esperas ?? [5, 15, 45];
  let ultimo;
  for (let indice = 0; indice < tentativas; indice += 1) {
    ultimo = operacao(indice);
    if (ultimo) return ultimo;
    if (indice < tentativas - 1) {
      const segundos = esperas[indice] ?? esperas[esperas.length - 1] ?? 5;
      ctx.esperar(segundos);
    }
  }
  return ultimo;
}

export function falha(codigo, mensagem, opcoes = {}) {
  return new ErroInstalador(codigo, mensagem, opcoes);
}

// Cria uma ação do contrato sem expor segredo no comando.
export function acao(descricao, comando, altera) {
  return { descricao, comando: comando ?? null, altera: Boolean(altera) };
}

export function avisoEtapa(codigo, mensagem, documentacao = "docs/instalador.md#aplicar") {
  return { codigo, mensagem, documentacao };
}
