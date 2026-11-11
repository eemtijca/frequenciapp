// CLI do instalador: analisa flags,resolve configuração, despacha comandos e emite o contrato JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comandoExistePadrao, detectar, detectarBasico, executarPadrao } from "./detectar.mjs";
import { auditarPacotes } from "./pacotes.mjs";
import {
  ErroInstalador,
  SCHEMA_ESTADO,
  SCHEMA_SAIDA,
  aviso,
  codigoSaida,
  construirEsquema,
  erroObjeto,
  erroUso,
  erroValidacao,
} from "./json.mjs";
import { caminhoTrava, gravarArquivoComTrava, lerEstado } from "./estado.mjs";
import {
  DOCUMENTACAO,
  VERSAO_INSTALADOR,
  agoraPadrao,
  deduplicarAvisos,
  montarDiagnostico,
  montarDocumento,
  montarPlano,
  montarSituacao,
} from "./plano.mjs";
import { contemSegredo, redigir, redigirObjeto } from "./redigir.mjs";

export { SCHEMA_ESTADO, SCHEMA_SAIDA, VERSAO_INSTALADOR };

const CAMINHO_CONFIG_PADRAO = "/etc/frequenciapp/instalador.json";
const LIMITE_CONFIG = 1024 * 1024;

const ALIASES = new Map([
  ["-h", "--ajuda"],
  ["--help", "--ajuda"],
  ["--version", "--versao"],
  ["--dry-run", "--simular"],
  ["--yes", "--sim"],
  ["--profile", "--perfil"],
  ["--channel", "--canal"],
  ["--report", "--relatorio"],
  ["--non-interactive", "--nao-interativo"],
  ["--image", "--imagem"],
  ["--image-digest", "--imagem-digest"],
]);

const FLAGS_BOOLEANAS = new Set([
  "--ajuda",
  "--versao",
  "--json",
  "--nao-interativo",
  "--sim",
  "--forcar",
  "--retomar",
  "--sem-cor",
  "--silencioso",
  "--verboso",
  "--autoteste",
  "--nao-iniciar",
  "--pular-saude",
  "--modo-teste",
  "--planejar",
  "--aplicar",
  "--simular",
  "--sem-firewall",
  "--permitir-instavel",
  "--permitir-downgrade",
  "--permitir-migracoes",
  "--forcar-pacotes",
  "--do-remoto",
  "--remover-dados",
  "--pular-contas",
  "--seed",
  "--acme-staging",
  "--habilitar-atualizacoes",
]);

const FLAGS_VALOR = new Map([
  ["--config", "config"],
  ["--relatorio", "relatorio"],
  ["--arquivo-log", "arquivoLog"],
  ["--perfil", "perfil"],
  ["--canal", "canal"],
  ["--tag", "tag"],
  ["--ref", "ref"],
  ["--diretorio-fonte", "diretorioFonte"],
  ["--imagem", "imagem"],
  ["--imagem-digest", "imagemDigest"],
  ["--proxy", "proxy"],
  ["--tls", "tls"],
  ["--dominio", "dominio"],
  ["--email-acme", "emailAcme"],
  ["--email-admin", "emailAdmin"],
  ["--arquivo-senha-admin", "arquivoSenhaAdmin"],
  ["--email-coordenacao", "emailCoordenacao"],
  ["--arquivo-senha-coordenacao", "arquivoSenhaCoordenacao"],
  ["--arquivo-google", "arquivoGoogle"],
  ["--modo-backup", "modoBackup"],
  ["--criptografia", "criptografia"],
  ["--destinatario-gpg", "destinatarioGpg"],
  ["--destinatarios-age", "destinatariosAge"],
  ["--config-rclone", "configRclone"],
  ["--destino", "destino"],
  ["--retencao-dias", "retencaoDias"],
  ["--retencao-minimo", "retencaoMinimo"],
  ["--config-dropbox", "configDropbox"],
  ["--arquivo-token-dropbox", "arquivoTokenDropbox"],
  ["--agendador", "agendador"],
  ["--fuso", "fuso"],
  ["--canal-atualizacao", "canalAtualizacao"],
  ["--ref-atualizacao", "refAtualizacao"],
  ["--firewall", "firewall"],
  ["--porta-ssh", "portaSsh"],
  ["--porta-http", "portaHttp"],
  ["--porta-https", "portaHttps"],
  ["--desde-etapa", "desdeEtapa"],
  ["--tempo-limite", "tempoLimite"],
  ["--arquivo", "arquivo"],
  ["--salvar-config", "salvarConfig"],
]);

const FLAGS_VALOR_OPCIONAL = new Set(["--salvar-config"]);

const CHAVES_CONFIG = new Map([
  ["perfil", "--perfil"],
  ["canal", "--canal"],
  ["tag", "--tag"],
  ["ref", "--ref"],
  ["diretorioFonte", "--diretorio-fonte"],
  ["imagem", "--imagem"],
  ["imagemDigest", "--imagem-digest"],
  ["proxy", "--proxy"],
  ["tls", "--tls"],
  ["dominio", "--dominio"],
  ["emailAcme", "--email-acme"],
  ["emailAdmin", "--email-admin"],
  ["arquivoSenhaAdmin", "--arquivo-senha-admin"],
  ["emailCoordenacao", "--email-coordenacao"],
  ["arquivoSenhaCoordenacao", "--arquivo-senha-coordenacao"],
  ["arquivoGoogle", "--arquivo-google"],
  ["pularContas", "--pular-contas"],
  ["seed", "--seed"],
  ["modoBackup", "--modo-backup"],
  ["criptografia", "--criptografia"],
  ["destinatarioGpg", "--destinatario-gpg"],
  ["destinatariosAge", "--destinatarios-age"],
  ["configRclone", "--config-rclone"],
  ["destino", "--destino"],
  ["retencaoDias", "--retencao-dias"],
  ["retencaoMinimo", "--retencao-minimo"],
  ["configDropbox", "--config-dropbox"],
  ["arquivoTokenDropbox", "--arquivo-token-dropbox"],
  ["agendador", "--agendador"],
  ["fuso", "--fuso"],
  ["habilitarAtualizacoes", "--habilitar-atualizacoes"],
  ["canalAtualizacao", "--canal-atualizacao"],
  ["refAtualizacao", "--ref-atualizacao"],
  ["firewall", "--firewall"],
  ["portaSsh", "--porta-ssh"],
  ["portaHttp", "--porta-http"],
  ["portaHttps", "--porta-https"],
  ["tempoLimite", "--tempo-limite"],
  ["acmeStaging", "--acme-staging"],
]);

const VALORES_ACEITOS = new Map([
  ["--perfil", ["simples", "controlador", "dropbox", "completo"]],
  ["--canal", ["release", "main"]],
  ["--proxy", ["caddy", "nginx"]],
  ["--tls", ["acme", "interno"]],
  ["--agendador", ["auto", "systemd", "cron"]],
  ["--modo-backup", ["compose", "url"]],
  ["--criptografia", ["gpg", "age"]],
  ["--firewall", ["auto", "sim", "nao"]],
  ["--canal-atualizacao", ["release", "main"]],
]);

const PADROES = {
  perfil: "simples",
  canal: "release",
  tag: "",
  ref: "",
  diretorioFonte: "/opt/frequenciapp",
  imagem: "ghcr.io/eemtijca/frequenciapp",
  imagemDigest: "",
  proxy: "caddy",
  tls: "acme",
  dominio: "",
  emailAcme: "",
  emailAdmin: "",
  arquivoSenhaAdmin: "",
  emailCoordenacao: "",
  arquivoSenhaCoordenacao: "",
  arquivoGoogle: "",
  pularContas: false,
  seed: false,
  modoBackup: "compose",
  criptografia: "gpg",
  destinatarioGpg: "",
  destinatariosAge: "",
  configRclone: "",
  destino: "",
  retencaoDias: 30,
  retencaoMinimo: 5,
  configDropbox: "",
  arquivoTokenDropbox: "",
  agendador: "auto",
  fuso: "America/Fortaleza",
  habilitarAtualizacoes: false,
  canalAtualizacao: "release",
  refAtualizacao: "",
  firewall: "nao",
  portaSsh: 22,
  portaHttp: 80,
  portaHttps: 443,
  tempoLimite: "7200",
  acmeStaging: false,
};

const CAMPOS_CONFIG = [
  "perfil",
  "canal",
  "tag",
  "ref",
  "diretorioFonte",
  "imagem",
  "imagemDigest",
  "proxy",
  "tls",
  "dominio",
  "emailAcme",
  "emailAdmin",
  "arquivoSenhaAdmin",
  "emailCoordenacao",
  "arquivoSenhaCoordenacao",
  "arquivoGoogle",
  "pularContas",
  "seed",
  "modoBackup",
  "criptografia",
  "destinatarioGpg",
  "destinatariosAge",
  "configRclone",
  "destino",
  "retencaoDias",
  "retencaoMinimo",
  "configDropbox",
  "arquivoTokenDropbox",
  "agendador",
  "fuso",
  "habilitarAtualizacoes",
  "canalAtualizacao",
  "refAtualizacao",
  "firewall",
  "portaSsh",
  "portaHttp",
  "portaHttps",
  "tempoLimite",
  "acmeStaging",
];

const COMANDOS_CONHECIDOS = new Set([
  "planejar",
  "aplicar",
  "situacao",
  "diagnosticar",
  "atualizar",
  "backup",
  "restaurar",
  "desinstalar",
  "canal mostrar",
  "canal definir",
  "versao",
  "esquema",
]);

const COMANDOS_DISPONIVEIS = new Set(["planejar", "versao", "esquema", "situacao", "diagnosticar"]);

const COMANDOS_RECUSADOS = new Set([
  "aplicar",
  "atualizar",
  "backup",
  "restaurar",
  "desinstalar",
  "canal mostrar",
  "canal definir",
]);

function validarValor(flag, valor) {
  const texto = String(valor);
  if (!texto) {
    if (flag === "--tag") return "";
    throw erroUso(`A opção ${flag} exige um valor não vazio.`);
  }
  const aceitos = VALORES_ACEITOS.get(flag);
  if (aceitos && !aceitos.includes(texto)) {
    throw erroUso(`Valor inválido para ${flag}.`);
  }
  if (["--porta-ssh", "--porta-http", "--porta-https"].includes(flag)) {
    if (!/^\d+$/.test(texto)) throw erroUso(`A opção ${flag} exige um número de porta.`);
    const porta = Number(texto);
    if (porta < 1 || porta > 65535) throw erroUso(`A porta de ${flag} está fora do intervalo.`);
  }
  if (["--retencao-dias", "--retencao-minimo"].includes(flag)) {
    if (!/^\d+$/.test(texto)) throw erroUso(`A opção ${flag} exige um inteiro não negativo.`);
  }
  if (flag === "--tempo-limite" && !/^\d+[smh]?$/.test(texto)) {
    throw erroUso("A opção --tempo-limite aceita segundos ou os sufixos s, m e h.");
  }
  if (flag === "--tag" && !/^v\d+\.\d+\.\d+$/.test(texto)) {
    throw erroUso("A opção --tag exige o formato vX.Y.Z.");
  }
  if (flag === "--imagem-digest" && !/^sha256:[a-f0-9]{64}$/.test(texto)) {
    throw erroUso("A opção --imagem-digest exige sha256: seguido de 64 hexadecimais.");
  }
  if (contemSegredo(texto)) {
    throw erroUso("A opção recebeu um valor que parece segredo. Use um arquivo com modo 600.");
  }
  return texto;
}

function definirValor(opcoes, flag, valor) {
  if (valor === null) {
    if (opcoes.valores.has(flag) && opcoes.valores.get(flag) !== null) {
      throw erroUso(`A opção ${flag} foi repetida com valores diferentes.`);
    }
    opcoes.valores.set(flag, null);
    opcoes.origem.set(flag, "flag");
    return;
  }
  const texto = validarValor(flag, valor);
  if (opcoes.valores.has(flag)) {
    if (opcoes.valores.get(flag) !== texto) {
      throw erroUso(`A opção ${flag} foi repetida com valores diferentes.`);
    }
    return;
  }
  opcoes.valores.set(flag, texto);
  opcoes.origem.set(flag, "flag");
}

function definirBooleana(opcoes, flag, valor = true) {
  opcoes.booleanas.add(flag);
  opcoes.booleanos.set(flag, valor);
  opcoes.origem.set(flag, "flag");
}

function analisarArgumentos(argv) {
  const opcoes = {
    operandos: [],
    valores: new Map(),
    booleanas: new Set(),
    booleanos: new Map(),
    origem: new Map(),
  };
  let indice = 0;
  while (indice < argv.length) {
    const bruto = argv[indice];
    if (bruto === "--") {
      opcoes.operandos.push(...argv.slice(indice + 1));
      break;
    }
    if (!bruto.startsWith("-") || bruto === "-") {
      opcoes.operandos.push(bruto);
      indice += 1;
      continue;
    }
    let nome = bruto;
    let valorInline = null;
    const igual = bruto.indexOf("=");
    if (igual > 0) {
      nome = bruto.slice(0, igual);
      valorInline = bruto.slice(igual + 1);
    }
    nome = ALIASES.get(nome) ?? nome;
    if (FLAGS_BOOLEANAS.has(nome)) {
      if (valorInline !== null) throw erroUso(`A opção ${nome} não aceita valor.`);
      definirBooleana(opcoes, nome);
      indice += 1;
      continue;
    }
    if (!FLAGS_VALOR.has(nome)) throw erroUso(`Opção desconhecida: ${nome}.`);
    if (FLAGS_VALOR_OPCIONAL.has(nome)) {
      if (valorInline !== null) {
        definirValor(opcoes, nome, valorInline || null);
        indice += 1;
        continue;
      }
      const proximo = argv[indice + 1];
      if (proximo !== undefined && !proximo.startsWith("-")) {
        definirValor(opcoes, nome, proximo);
        indice += 2;
      } else {
        definirValor(opcoes, nome, null);
        indice += 1;
      }
      continue;
    }
    let valor = valorInline;
    if (valor === null) {
      if (indice + 1 >= argv.length) throw erroUso(`A opção ${nome} exige um valor.`);
      valor = argv[indice + 1];
      if (valor.startsWith("--")) throw erroUso(`A opção ${nome} exige um valor.`);
      indice += 2;
    } else {
      indice += 1;
    }
    definirValor(opcoes, nome, valor);
  }
  if (opcoes.booleanos.has("--sem-firewall")) {
    const firewallAtual = opcoes.valores.get("--firewall");
    if (firewallAtual && firewallAtual !== "nao" && opcoes.origem.get("--firewall") === "flag") {
      throw erroUso("As opções --firewall e --sem-firewall entram em conflito.");
    }
    opcoes.valores.set("--firewall", "nao");
    opcoes.origem.set("--firewall", "flag");
  }
  return opcoes;
}

function carregarConfig(opcoes) {
  const caminhoInformado = opcoes.valores.get("--config");
  const explicitado = Boolean(caminhoInformado);
  const caminho = caminhoInformado ?? CAMINHO_CONFIG_PADRAO;
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT" && !explicitado) return [];
    if (erro.code === "EACCES" && !explicitado) {
      return [
        aviso(
          "A_CONFIG_ILEGIVEL",
          "A configuração padrão existe, mas não pode ser lida.",
          `${DOCUMENTACAO}#arquivo-de-configuração`,
        ),
      ];
    }
    throw erroValidacao("Não foi possível ler o arquivo de configuração.", {
      dica: "Confira o caminho indicado em --config.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  if (informacao.isSymbolicLink() || !informacao.isFile()) {
    throw erroValidacao("O arquivo de configuração precisa ser um arquivo regular.", {
      dica: "Remova links simbólicos do caminho indicado em --config.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  if (informacao.size > LIMITE_CONFIG) {
    throw erroValidacao("O arquivo de configuração excede o limite de 1 MiB.", {
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  let texto;
  try {
    texto = fs.readFileSync(caminho, "utf8");
  } catch (erro) {
    if (erro.code === "EACCES" && !explicitado) {
      return [
        aviso(
          "A_CONFIG_ILEGIVEL",
          "A configuração padrão existe, mas não pode ser lida.",
          `${DOCUMENTACAO}#arquivo-de-configuração`,
        ),
      ];
    }
    if (erro.code === "EACCES") {
      throw erroValidacao("Sem permissão para ler o arquivo de configuração.", {
        dica: "Confira a permissão do caminho indicado em --config.",
        documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
        saida: 5,
      });
    }
    throw erroValidacao("Não foi possível ler o arquivo de configuração.", {
      dica: "Confira o caminho indicado em --config.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw erroValidacao("O arquivo de configuração não contém JSON válido.", {
      dica: "Corrija o JSON e repita o comando.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    throw erroValidacao("O arquivo de configuração precisa conter um objeto JSON.", {
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  for (const [chave, valor] of Object.entries(dados)) {
    const flag = CHAVES_CONFIG.get(chave);
    if (!flag) throw erroUso(`Chave de configuração desconhecida: ${chave}.`);
    if (FLAGS_BOOLEANAS.has(flag)) {
      if (typeof valor !== "boolean") {
        throw erroUso(`A chave ${chave} exige um valor booleano.`);
      }
      if (!opcoes.booleanos.has(flag)) {
        opcoes.booleanos.set(flag, valor);
        opcoes.origem.set(flag, "config");
      }
      continue;
    }
    if (!["string", "number"].includes(typeof valor)) {
      throw erroUso(`A chave ${chave} exige texto ou número.`);
    }
    if (typeof valor === "string" && contemSegredo(valor)) {
      throw erroUso("A configuração contém um valor que parece segredo.", {
        dica: "Use os arquivos indicados pelas flags de senha, token e chave.",
        documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
      });
    }
    if (!opcoes.valores.has(flag)) {
      const texto = validarValor(flag, valor);
      opcoes.valores.set(flag, texto);
      opcoes.origem.set(flag, "config");
    }
  }
  return [];
}

function converterValor(chave, valor) {
  if (["retencaoDias", "retencaoMinimo", "portaSsh", "portaHttp", "portaHttps"].includes(chave)) {
    return Number(valor);
  }
  return valor;
}

function resolverConfiguracao(opcoes, estadoResultado) {
  const valores = { ...PADROES };
  const definidos = new Set();
  for (const [chave, flag] of CHAVES_CONFIG) {
    if (opcoes.booleanos.has(flag)) {
      valores[chave] = Boolean(opcoes.booleanos.get(flag));
      definidos.add(chave);
      continue;
    }
    if (opcoes.valores.has(flag)) {
      const bruto = opcoes.valores.get(flag);
      valores[chave] = converterValor(chave, bruto);
      definidos.add(chave);
    }
  }
  if (valores.canal === "main" && !valores.ref) valores.ref = "main";
  if (valores.imagemDigest) {
    valores.digest = valores.imagemDigest;
    definidos.add("digest");
  }
  if (/^[a-f0-9]{7,64}$/.test(String(valores.ref ?? ""))) {
    valores.commit = valores.ref;
    definidos.add("commit");
  }
  if (estadoResultado?.presente && estadoResultado.estado) {
    for (const campo of ["perfil", "canal", "tag", "commit", "imagem", "digest"]) {
      if (!definidos.has(campo) && estadoResultado.estado[campo]) {
        valores[campo] = estadoResultado.estado[campo];
      }
    }
  }
  return { valores, definidos };
}

function configuracaoParaArquivo(configuracao) {
  const saida = {};
  for (const chave of CAMPOS_CONFIG) {
    const valor = configuracao[chave];
    if (valor === undefined || valor === null || valor === "") continue;
    if (typeof valor === "string" && contemSegredo(valor)) {
      throw erroUso("A configuração efetiva contém um valor que parece segredo.");
    }
    saida[chave] = valor;
  }
  return saida;
}

function lerEstadoSeguro(deps) {
  try {
    return deps.lerEstado({ raiz: deps.raiz });
  } catch (erro) {
    if (erro instanceof ErroInstalador) {
      return { presente: false, estado: null, avisos: [], erro };
    }
    throw erro;
  }
}

function auditarSeguro(deps, deteccao) {
  if (deteccao.tier === 3 || deteccao.gerenciador === "desconhecido") {
    return { auditoria: null, avisos: [] };
  }
  try {
    return {
      auditoria: deps.auditarPacotes({
        familia: deteccao.familia,
        gerenciador: deteccao.gerenciador,
        executar: deps.executar,
        comandoExiste: deps.comandoExiste,
      }),
      avisos: [],
    };
  } catch {
    return { auditoria: null, avisos: [] };
  }
}

function salvarConfig(opcoes, configuracao, deps) {
  const caminho = opcoes.valores.get("--salvar-config") || CAMINHO_CONFIG_PADRAO;
  const absoluto = path.resolve(caminho);
  const diretorio = path.dirname(absoluto);
  let informacao;
  try {
    informacao = fs.statSync(diretorio);
  } catch (erro) {
    if (erro.code === "EACCES" || erro.code === "EPERM") {
      throw erroValidacao("Sem permissão para preparar o diretório da configuração.", {
        dica: "Confira a permissão do diretório indicado em --salvar-config.",
        documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
        saida: 5,
      });
    }
    throw erroValidacao("O diretório da configuração não existe.", {
      dica: "Crie o diretório antes de repetir o comando.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  if (!informacao.isDirectory()) {
    throw erroValidacao("O destino da configuração não é um diretório.", {
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  let existente = null;
  try {
    existente = fs.lstatSync(absoluto);
  } catch {
    existente = null;
  }
  if (existente?.isSymbolicLink() || (existente && !existente.isFile())) {
    throw erroValidacao("O arquivo de configuração precisa ser um arquivo regular.", {
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  if (existente && !opcoes.booleanos.get("--forcar")) {
    throw erroUso("O arquivo de configuração já existe. Use --forcar para sobrescrever.", {
      dica: "Escolha outro caminho ou confirme a sobrescrita com --forcar.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
  const conteudo = `${JSON.stringify(configuracaoParaArquivo(configuracao), null, 2)}\n`;
  deps.gravarConfig(deps.caminhoTrava(), absoluto, conteudo, {
    sobrescrever: Boolean(opcoes.booleanos.get("--forcar")),
  });
  return absoluto;
}

function etapaVersao(deteccao, avisos, agora) {
  return {
    id: "versao",
    estado: "concluida",
    inicio: agora,
    fim: agora,
    codigo: null,
    acoes: [
      {
        descricao: "Lê a versão do instalador, do projeto e a detecção básica",
        comando: null,
        altera: false,
      },
    ],
    avisos,
    detalhes: {
      schemaEstado: SCHEMA_ESTADO,
      schemaSaida: SCHEMA_SAIDA,
      versaoDistro: deteccao.versaoDistro,
    },
  };
}

function processarPlanejar(opcoes, io, deps) {
  const avisosConfig = carregarConfig(opcoes);
  const deteccao = deps.detectar({
    raiz: deps.raiz,
    executar: deps.executar,
    comandoExiste: deps.comandoExiste,
  });
  const estadoResultado = lerEstadoSeguro(deps);
  const { valores } = resolverConfiguracao(opcoes, estadoResultado);
  const { auditoria } = auditarSeguro(deps, deteccao);
  const documento = montarPlano({
    configuracao: valores,
    deteccao,
    auditoria,
    estadoResultado,
    avisosConfig,
    agora: deps.agora(),
    permitirInstavel: Boolean(opcoes.booleanos.get("--permitir-instavel")),
  });
  if (opcoes.valores.has("--salvar-config")) {
    const caminho = salvarConfig(opcoes, valores, deps);
    documento.avisos = deduplicarAvisos([
      ...documento.avisos,
      aviso(
        "A_CONFIG_SALVA",
        `A configuração efetiva foi gravada em ${caminho}.`,
        `${DOCUMENTACAO}#arquivo-de-configuração`,
      ),
    ]);
    if (documento.ok) {
      documento.proximos = [
        `sudo ./instalar.sh aplicar --config ${caminho} --sim`,
        ...documento.proximos.slice(1),
      ];
    }
  }
  return emitir(documento, opcoes, io);
}

function recusarSalvarConfig(opcoes) {
  if (opcoes.valores.has("--salvar-config")) {
    throw erroUso("A opção --salvar-config só se aplica ao comando planejar.", {
      dica: "Use --salvar-config junto de planejar.",
      documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
    });
  }
}

function processarVersao(opcoes, io, deps) {
  recusarSalvarConfig(opcoes);
  const avisosConfig = carregarConfig(opcoes);
  const deteccao = deps.detectarBasico(deps.raiz);
  const estadoResultado = lerEstadoSeguro(deps);
  const { valores } = resolverConfiguracao(opcoes, estadoResultado);
  const avisos = [...avisosConfig, ...(estadoResultado.avisos ?? [])];
  if (estadoResultado.erro) {
    avisos.push(
      aviso("A_ESTADO_INVALIDO", estadoResultado.erro.message, `${DOCUMENTACAO}#estado-durável`),
    );
  }
  const documento = montarDocumento({
    comando: "versao",
    configuracao: valores,
    estado: estadoResultado.estado,
    deteccao,
    dryRun: Boolean(opcoes.booleanos.get("--simular")),
    etapas: [etapaVersao(deteccao, [], deps.agora())],
    avisos,
    erros: [],
    proximos: ["sudo ./instalar.sh planejar --json --nao-interativo"],
  });
  return emitir(documento, opcoes, io);
}

function processarSituacao(opcoes, io, deps) {
  if (opcoes.operandos.length > 1) {
    throw erroUso("O comando situacao não aceita argumentos posicionais.");
  }
  recusarSalvarConfig(opcoes);
  const avisosConfig = carregarConfig(opcoes);
  const deteccao = deps.detectar({
    raiz: deps.raiz,
    executar: deps.executar,
    comandoExiste: deps.comandoExiste,
  });
  const estadoResultado = lerEstadoSeguro(deps);
  const { valores } = resolverConfiguracao(opcoes, estadoResultado);
  const documento = montarSituacao({
    configuracao: valores,
    deteccao,
    estadoResultado,
    executar: deps.executar,
    comandoExiste: deps.comandoExiste,
    raiz: deps.raiz,
    agora: deps.agora(),
    dryRun: Boolean(opcoes.booleanos.get("--simular")),
  });
  documento.avisos = deduplicarAvisos([...avisosConfig, ...documento.avisos]);
  return emitir(documento, opcoes, io);
}

function processarDiagnosticar(opcoes, io, deps) {
  if (opcoes.operandos.length > 1) {
    throw erroUso("O comando diagnosticar não aceita argumentos posicionais.");
  }
  recusarSalvarConfig(opcoes);
  const avisosConfig = carregarConfig(opcoes);
  const deteccao = deps.detectar({
    raiz: deps.raiz,
    executar: deps.executar,
    comandoExiste: deps.comandoExiste,
  });
  const estadoResultado = lerEstadoSeguro(deps);
  const { valores } = resolverConfiguracao(opcoes, estadoResultado);
  const { auditoria } = auditarSeguro(deps, deteccao);
  const documento = montarDiagnostico({
    configuracao: valores,
    deteccao,
    estadoResultado,
    auditoria,
    executar: deps.executar,
    comandoExiste: deps.comandoExiste,
    raiz: deps.raiz,
    agora: deps.agora(),
    dryRun: Boolean(opcoes.booleanos.get("--simular")),
  });
  documento.avisos = deduplicarAvisos([...avisosConfig, ...documento.avisos]);
  return emitir(documento, opcoes, io);
}

function processarEsquema(opcoes, io) {
  if (opcoes.valores.has("--salvar-config")) {
    throw erroUso("A opção --salvar-config não se aplica ao comando esquema.", {
      dica: "Use --salvar-config apenas com planejar.",
    });
  }
  const esquema = construirEsquema();
  const conteudo = `${JSON.stringify(esquema, null, 2)}\n`;
  if (opcoes.valores.has("--relatorio")) {
    escreverArquivo(opcoes.valores.get("--relatorio"), conteudo, "esquema");
  }
  if (opcoes.valores.has("--arquivo-log")) {
    escreverArquivo(
      opcoes.valores.get("--arquivo-log"),
      `${agoraPadrao()} comando=esquema ok=true\n`,
      "log",
    );
  }
  io.stdout.write(conteudo);
  return 0;
}

function formatarTabelaPacotes(pacotes) {
  const largura = Math.max(6, ...pacotes.map((pacote) => pacote.pacote.length));
  const linhas = [
    `${"pacote".padEnd(largura)}  presente  versao    acao`,
    ...pacotes.map(
      (pacote) =>
        `${pacote.pacote.padEnd(largura)}  ${(pacote.presente ? "sim" : "nao").padEnd(
          8,
        )}  ${(pacote.versao || "-").padEnd(8)}  ${pacote.acao}`,
    ),
  ];
  return linhas.join("\n");
}

function formatarVersaoHumana(documentoFinal) {
  const etapa = documentoFinal.etapas.find((item) => item.id === "versao");
  const detalhes = etapa?.detalhes ?? {};
  return [
    `instalador: ${documentoFinal.versao.instalador}`,
    `projeto: ${documentoFinal.versao.projeto}`,
    `schema de saída: ${SCHEMA_SAIDA}`,
    `schema do estado: ${detalhes.schemaEstado ?? SCHEMA_ESTADO}`,
    `distribuição: ${documentoFinal.distro} ${detalhes.versaoDistro ?? ""}`.trim(),
    `codename: ${documentoFinal.codename}`,
    `família: ${documentoFinal.familia}`,
    `tier: ${documentoFinal.tier}`,
    `arquitetura: ${documentoFinal.arquitetura}`,
    `gerenciador: ${documentoFinal.gerenciador}`,
    `iniciador: ${documentoFinal.iniciador}`,
    `canal: ${documentoFinal.canal}`,
    `tag: ${documentoFinal.tag}`,
    `commit: ${documentoFinal.commit}`,
    `imagem: ${documentoFinal.imagem}`,
    `digest: ${documentoFinal.digest}`,
  ].join("\n");
}

function formatarPlanoHumano(documentoFinal) {
  const linhas = [];
  const preflight = documentoFinal.etapas.find((etapa) => etapa.id === "preflight");
  const pacotes = documentoFinal.etapas.find((etapa) => etapa.id === "pacotes");
  const detalhes = preflight?.detalhes ?? {};
  linhas.push("FrequenciApp - instalador");
  linhas.push("");
  linhas.push(`Comando: ${documentoFinal.comando}`);
  linhas.push(
    `Distribuição: ${documentoFinal.distro} ${detalhes.versaoDistro ?? ""}${
      documentoFinal.codename ? ` (${documentoFinal.codename})` : ""
    }`.trim(),
  );
  linhas.push(`Família: ${documentoFinal.familia}  Tier: ${documentoFinal.tier}`);
  linhas.push(`Arquitetura: ${documentoFinal.arquitetura}`);
  linhas.push(`Gerenciador: ${documentoFinal.gerenciador}`);
  linhas.push(`Iniciador: ${documentoFinal.iniciador}`);
  linhas.push(`Firewall: ${documentoFinal.firewall}`);
  linhas.push(`SELinux: ${documentoFinal.selinux}  AppArmor: ${documentoFinal.apparmor}`);
  linhas.push(`Perfil: ${documentoFinal.perfil}  Canal: ${documentoFinal.canal}`);
  if (documentoFinal.tag) linhas.push(`Tag: ${documentoFinal.tag}`);
  linhas.push("");
  linhas.push("Pacotes:");
  if (pacotes?.detalhes?.pacotes?.length) {
    linhas.push(formatarTabelaPacotes(pacotes.detalhes.pacotes));
  } else {
    linhas.push("nenhum pacote auditado");
  }
  if (documentoFinal.avisos.length) {
    linhas.push("");
    linhas.push("Avisos:");
    for (const item of documentoFinal.avisos) {
      linhas.push(`- ${item.codigo ? `${item.codigo}: ` : ""}${item.mensagem}`);
    }
  }
  if (documentoFinal.erros.length) {
    linhas.push("");
    linhas.push("Erros:");
    for (const item of documentoFinal.erros) {
      linhas.push(`- ${item.codigo}: ${item.mensagem}`);
      if (item.dica) linhas.push(`  Dica: ${item.dica}`);
    }
  }
  if (documentoFinal.proximos.length) {
    linhas.push("");
    linhas.push("Próximos passos:");
    for (const item of documentoFinal.proximos) linhas.push(`- ${item}`);
  }
  linhas.push("");
  linhas.push(`Resultado: ${documentoFinal.ok ? "ok" : documentoFinal.codigo}`);
  return `${linhas.join("\n")}\n`;
}

function formatarVerificacoes(documentoFinal) {
  const etapa = documentoFinal.etapas[0];
  const verificacoes = etapa?.detalhes?.verificacoes ?? [];
  const linhas = [];
  for (const item of verificacoes) {
    const rotulo =
      item.estado === "ok" ? "ok" : item.estado === "aviso" ? "aviso" : (item.codigo ?? "falha");
    linhas.push(`- [${rotulo}] ${item.titulo}: ${item.mensagem}`);
    if (item.estado !== "ok" && item.dica) linhas.push(`  Dica: ${item.dica}`);
    if (item.estado !== "ok" && item.comando) linhas.push(`  Comando: ${item.comando}`);
  }
  return linhas;
}

function formatarLeituraHumana(documentoFinal, titulo) {
  const linhas = [];
  const etapa = documentoFinal.etapas[0];
  const detalhes = etapa?.detalhes ?? {};
  linhas.push(`FrequenciApp - ${titulo}`);
  linhas.push("");
  linhas.push(`Comando: ${documentoFinal.comando}`);
  linhas.push(`Distribuição: ${documentoFinal.distro}  Tier: ${documentoFinal.tier}`);
  linhas.push(`Perfil: ${documentoFinal.perfil}  Canal: ${documentoFinal.canal}`);
  if (documentoFinal.tag) linhas.push(`Tag: ${documentoFinal.tag}`);
  if (documentoFinal.commit) linhas.push(`Commit: ${documentoFinal.commit}`);
  if (documentoFinal.imagem) linhas.push(`Imagem: ${documentoFinal.imagem}`);
  if (documentoFinal.digest) linhas.push(`Digest: ${documentoFinal.digest}`);
  if (documentoFinal.comando === "situacao") {
    const estado = detalhes.estado ?? {};
    linhas.push(`Instalação: ${estado.presente ? "presente" : "ausente"}`);
    const containers = detalhes.containers ?? [];
    linhas.push(`Containers: ${containers.length}`);
    for (const container of containers) {
      linhas.push(`- ${container.nome}: ${container.status}`);
    }
    const backup = detalhes.backup ?? {};
    if (backup.presente) {
      linhas.push(
        `Backup: ${backup.valido ? "válido" : "inválido"}${
          backup.idadeDias !== null ? ` (${backup.idadeDias} dias)` : ""
        }`,
      );
    } else {
      linhas.push("Backup: ausente");
    }
    const disco = detalhes.disco;
    if (disco) linhas.push(`Disco: ${disco.livreGiB} GiB livres`);
    const timers = detalhes.timers ?? {};
    if (timers.disponivel) linhas.push(`Timers: ${timers.quantidade}`);
    const controlador = estado.controlador;
    if (controlador?.adotado) {
      linhas.push(
        `Controlador: adotado${controlador.readocaoPendente ? ", readoção pendente" : ""}`,
      );
    }
  }
  linhas.push("");
  linhas.push("Verificações:");
  linhas.push(...formatarVerificacoes(documentoFinal));
  if (documentoFinal.avisos.length) {
    linhas.push("");
    linhas.push("Avisos:");
    for (const item of documentoFinal.avisos) {
      linhas.push(`- ${item.codigo ? `${item.codigo}: ` : ""}${item.mensagem}`);
    }
  }
  if (documentoFinal.erros.length) {
    linhas.push("");
    linhas.push("Erros:");
    for (const item of documentoFinal.erros) {
      linhas.push(`- ${item.codigo}: ${item.mensagem}`);
      if (item.dica) linhas.push(`  Dica: ${item.dica}`);
      if (item.comando) linhas.push(`  Comando: ${item.comando}`);
    }
  }
  if (documentoFinal.proximos.length) {
    linhas.push("");
    linhas.push("Próximos passos:");
    for (const item of documentoFinal.proximos) linhas.push(`- ${item}`);
  }
  linhas.push("");
  linhas.push(`Resultado: ${documentoFinal.ok ? "ok" : documentoFinal.codigo}`);
  return `${linhas.join("\n")}\n`;
}

function formatarHumano(documentoFinal) {
  if (documentoFinal.comando === "situacao") {
    return formatarLeituraHumana(documentoFinal, "situação");
  }
  if (documentoFinal.comando === "diagnosticar") {
    return formatarLeituraHumana(documentoFinal, "diagnóstico");
  }
  return formatarPlanoHumano(documentoFinal);
}

function escreverArquivo(caminho, conteudo, descricao) {
  const absoluto = path.resolve(caminho);
  const diretorio = path.dirname(absoluto);
  let informacao;
  try {
    informacao = fs.statSync(diretorio);
  } catch {
    throw erroValidacao(`O diretório de ${descricao} não existe.`, {
      dica: "Crie o diretório antes de repetir o comando.",
      documentacao: `${DOCUMENTACAO}#flags`,
    });
  }
  if (!informacao.isDirectory()) {
    throw erroValidacao(`O destino de ${descricao} não é um diretório.`, {
      documentacao: `${DOCUMENTACAO}#flags`,
    });
  }
  let descritor = null;
  try {
    const semSeguirLink = fs.constants.O_NOFOLLOW ?? 0;
    descritor = fs.openSync(
      absoluto,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | semSeguirLink,
      0o600,
    );
    fs.fchmodSync(descritor, 0o600);
    fs.writeFileSync(descritor, conteudo, "utf8");
    fs.fsyncSync(descritor);
  } catch {
    throw erroValidacao(`Não foi possível gravar ${descricao}.`, {
      dica: "Confira o caminho e a permissão do diretório.",
      documentacao: `${DOCUMENTACAO}#flags`,
    });
  } finally {
    if (descritor !== null) fs.closeSync(descritor);
  }
  return absoluto;
}

function emitir(documento, opcoes, io) {
  let relatorio = null;
  try {
    if (opcoes.valores.has("--relatorio")) {
      relatorio = path.resolve(opcoes.valores.get("--relatorio"));
      documento.relatorio = relatorio;
      const conteudo = relatorio.toLowerCase().endsWith(".json")
        ? `${JSON.stringify(redigirObjeto(documento), null, 2)}\n`
        : formatarHumano(documento);
      escreverArquivo(relatorio, conteudo, "relatório");
    }
    if (opcoes.valores.has("--arquivo-log")) {
      const conteudo = redigir(
        `${agoraPadrao()} comando=${documento.comando} ok=${documento.ok} codigo=${
          documento.codigo ?? ""
        } distro=${documento.distro} tier=${documento.tier} avisos=${
          documento.avisos.length
        } erros=${documento.erros.length}\n`,
      );
      escreverArquivo(opcoes.valores.get("--arquivo-log"), conteudo, "log");
    }
  } catch (erro) {
    if (erro instanceof ErroInstalador) {
      documento.relatorio = null;
      documento.ok = false;
      documento.codigo = erro.codigo;
      documento.erros.push(erroObjeto(erro));
      if (opcoes.booleanas.has("--json")) {
        io.stdout.write(`${JSON.stringify(redigirObjeto(documento), null, 2)}\n`);
      } else {
        io.stderr.write(`${erro.codigo}: ${redigir(erro.message)}\n`);
      }
      return erro.saida;
    }
    throw erro;
  }
  if (opcoes.booleanas.has("--json")) {
    io.stdout.write(`${JSON.stringify(redigirObjeto(documento), null, 2)}\n`);
  } else if (documento.comando === "versao") {
    io.stdout.write(`${formatarVersaoHumana(documento)}\n`);
  } else {
    io.stdout.write(formatarHumano(documento));
  }
  if (
    documento.comando === "situacao" &&
    documento.codigo &&
    !["E_DOCKER", "E_VALIDACAO", "E_USO"].includes(documento.codigo)
  ) {
    return 0;
  }
  return documento.ok ? 0 : codigoSaida(documento.codigo);
}

function determinarComando(opcoes) {
  if (opcoes.booleanas.has("--planejar") && opcoes.booleanas.has("--aplicar")) {
    throw erroUso("As opções --planejar e --aplicar são mutuamente exclusivas.");
  }
  if (opcoes.booleanas.has("--planejar")) return "planejar";
  if (opcoes.booleanas.has("--aplicar")) return "aplicar";
  const primeiro = opcoes.operandos[0];
  if (!primeiro) {
    if (opcoes.booleanas.has("--simular")) return "planejar";
    throw erroUso("Comando ausente. Use planejar, situacao, diagnosticar, versao ou esquema.");
  }
  if (primeiro === "canal") {
    const subcomando = opcoes.operandos[1];
    if (subcomando !== "mostrar" && subcomando !== "definir") {
      throw erroUso("O comando canal exige mostrar ou definir.", {
        dica: "Use canal mostrar ou canal definir.",
      });
    }
    return `canal ${subcomando}`;
  }
  if (!COMANDOS_CONHECIDOS.has(primeiro)) {
    throw erroUso("Comando desconhecido.");
  }
  if (COMANDOS_RECUSADOS.has(primeiro)) return primeiro;
  if (!COMANDOS_DISPONIVEIS.has(primeiro)) {
    throw erroUso(`O comando ${primeiro} ainda não está disponível nesta versão.`);
  }
  return primeiro;
}

function comandoParaErro(argv) {
  if (argv.includes("--versao") || argv.includes("--version") || argv.includes("versao")) {
    return "versao";
  }
  if (argv.includes("esquema")) return "esquema";
  if (argv.includes("situacao")) return "situacao";
  if (argv.includes("diagnosticar")) return "diagnosticar";
  if (argv.includes("--aplicar") || argv.includes("aplicar")) return "aplicar";
  if (argv.includes("atualizar")) return "atualizar";
  if (argv.includes("backup")) return "backup";
  if (argv.includes("restaurar")) return "restaurar";
  if (argv.includes("desinstalar")) return "desinstalar";
  if (argv.includes("canal")) {
    return argv.includes("definir") ? "canal definir" : "canal mostrar";
  }
  return "planejar";
}

function processarRecusa(comando) {
  const mensagens = {
    aplicar: "O comando aplicar ainda não está disponível nesta versão.",
    atualizar: "O comando atualizar ainda não está disponível nesta versão.",
    backup: "O comando backup ainda não está disponível nesta versão.",
    restaurar: "O comando restaurar ainda não está disponível nesta versão.",
    desinstalar: "O comando desinstalar ainda não está disponível nesta versão.",
    "canal mostrar": "O comando canal ainda não está disponível nesta versão.",
    "canal definir": "O comando canal ainda não está disponível nesta versão.",
  };
  throw erroUso(mensagens[comando] ?? "O comando ainda não está disponível nesta versão.", {
    dica: "Use planejar, situacao, diagnosticar, versao ou esquema.",
    documentacao: `${DOCUMENTACAO}#comandos`,
  });
}

function textoAjuda() {
  return [
    "FrequenciApp - instalador auto-hospedado",
    "",
    "Uso:",
    "  ./instalar.sh <comando> [opcoes]",
    "",
    "Comandos:",
    "  planejar      Lê o host e mostra o plano, sem alterar o sistema",
    "  situacao      Mostra containers, saúde, versão, backup, timers e disco",
    "  diagnosticar  Verifica dependências, portas, DNS, TLS, banco e backup",
    "  versao        Mostra a versão do instalador, do projeto e a detecção básica",
    "  esquema       Mostra o JSON Schema da saída",
    "",
    "Opções gerais:",
    "  --ajuda, -h, --help                 Mostra esta ajuda",
    "  --versao, --version                 Mostra a versão",
    "  --json                              Emite um único documento JSON no stdout",
    "  --nao-interativo, --non-interactive Não faz perguntas",
    "  --config <arquivo>                  Lê a configuração JSON",
    "  --salvar-config [arquivo]           Grava a configuração efetiva com modo 600",
    "  --relatorio, --report <arquivo>     Grava o relatório com modo 600",
    "  --arquivo-log <arquivo>             Grava o log com modo 600",
    "  --forcar                            Confirma a sobrescrita da configuração",
    "  --permitir-instavel                 Confirma o uso do canal main",
    "  --simular, --dry-run                Não altera o host",
    "  --perfil, --profile <nome>          Perfil de instalação (padrão: simples)",
    "  --canal, --channel <nome>           Canal de atualização (padrão: release)",
    "",
    "Exemplos:",
    "  ./instalar.sh planejar --json --nao-interativo",
    "  ./instalar.sh situacao --json",
    "  ./instalar.sh diagnosticar --json",
    "  ./instalar.sh versao --json",
    "  ./instalar.sh esquema",
    "",
    "Códigos de saída: 0 sucesso; 2 uso; 3 distro; 4 pré-requisito; 5 permissão;",
    "6 rede; 7 validação; 8 pacotes ou Docker; 9 saúde; 10 backup ou restauração;",
    "78 bloqueio de política; 130 e 143 sinais.",
  ].join("\n");
}

function documentoErro(erro, argv, deps) {
  let deteccao;
  try {
    deteccao = deps.detectarBasico(deps.raiz);
  } catch {
    deteccao = {
      distro: "desconhecida",
      versaoDistro: "",
      codename: "",
      familia: "desconhecida",
      tier: 3,
      arquitetura: "desconhecida",
      gerenciador: "desconhecido",
      iniciador: "desconhecido",
      firewall: "nenhum",
      selinux: "ausente",
      apparmor: "ausente",
    };
  }
  return montarDocumento({
    comando: comandoParaErro(argv),
    configuracao: PADROES,
    estado: null,
    deteccao,
    dryRun:
      comandoParaErro(argv) === "planejar" ||
      argv.includes("--simular") ||
      argv.includes("--dry-run"),
    etapas: [],
    avisos: [],
    erros: [erroObjeto(erro)],
    proximos: [],
  });
}

function escreverErro(erro, argv, io, deps) {
  if (argv.includes("--json") || argv.includes("--json=true")) {
    try {
      const documentoFinal = documentoErro(erro, argv, deps);
      io.stdout.write(`${JSON.stringify(redigirObjeto(documentoFinal), null, 2)}\n`);
      return;
    } catch {
      // A falha de emissão cai no texto curto abaixo.
    }
  }
  io.stderr.write(`${erro.codigo}: ${redigir(erro.message)}\n`);
  if (erro.dica) io.stderr.write(`Dica: ${redigir(erro.dica)}\n`);
}

// Executa a CLI e devolve o código de saída sem encerrar o processo.
export function principal(
  argv = process.argv.slice(2),
  io = { stdout: process.stdout, stderr: process.stderr },
  dependencias = {},
) {
  const deps = {
    detectar,
    detectarBasico,
    auditarPacotes,
    lerEstado,
    gravarConfig: gravarArquivoComTrava,
    caminhoTrava: () => caminhoTrava(),
    agora: agoraPadrao,
    executar: executarPadrao,
    comandoExiste: null,
    raiz: "/",
    ...dependencias,
  };
  deps.executar = deps.executar ?? executarPadrao;
  deps.comandoExiste = deps.comandoExiste ?? ((nome) => comandoExistePadrao(nome, deps.executar));
  try {
    const opcoes = analisarArgumentos(argv);
    if (opcoes.booleanas.has("--ajuda")) {
      io.stdout.write(`${textoAjuda()}\n`);
      return 0;
    }
    if (opcoes.booleanas.has("--versao")) {
      return processarVersao(opcoes, io, deps);
    }
    if (opcoes.operandos.length === 0 && opcoes.booleanas.size === 0 && opcoes.valores.size === 0) {
      io.stdout.write(`${textoAjuda()}\n`);
      return 0;
    }
    const comando = determinarComando(opcoes);
    if (COMANDOS_RECUSADOS.has(comando)) processarRecusa(comando);
    if (comando === "planejar") return processarPlanejar(opcoes, io, deps);
    if (comando === "versao") return processarVersao(opcoes, io, deps);
    if (comando === "esquema") return processarEsquema(opcoes, io);
    if (comando === "situacao") return processarSituacao(opcoes, io, deps);
    if (comando === "diagnosticar") return processarDiagnosticar(opcoes, io, deps);
    throw erroUso("Comando desconhecido.");
  } catch (erro) {
    if (erro instanceof ErroInstalador) {
      escreverErro(erro, argv, io, deps);
      return erro.saida;
    }
    io.stderr.write("Falha interna: não foi possível concluir o comando.\n");
    return 1;
  }
}

const executadoDiretamente =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDiretamente) {
  process.exitCode = principal();
}
