// CLI mínima do instalador: ajuda, versão, planejamento em modo detecção e esquema.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectar, detectarBasico } from "./detectar.mjs";
import { auditarPacotes, comandoInstalacao } from "./pacotes.mjs";
import { redigir, redigirObjeto } from "./redigir.mjs";

export const VERSAO_INSTALADOR = "1.0.0";
export const SCHEMA_SAIDA = "frequenciapp.instalador/1";
export const SCHEMA_ESTADO = "frequenciapp.instalacao/1";
const DOCUMENTACAO = "docs/instalador.md";
const CAMINHO_CONFIG_PADRAO = "/etc/frequenciapp/instalador.json";
const RAIZ_INSTALADOR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CAMINHO_PACOTE = path.join(RAIZ_INSTALADOR, "package.json");
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

const COMANDOS_CONHECIDOS = new Set([
  "planejar",
  "aplicar",
  "situacao",
  "diagnosticar",
  "atualizar",
  "backup",
  "restaurar",
  "desinstalar",
  "canal",
  "versao",
  "esquema",
]);

const COMANDOS_DISPONIVEIS = new Set(["planejar", "versao", "esquema"]);

const CODIGOS_ERRO = [
  "E_USO",
  "E_DISTRO",
  "E_PACOTE",
  "E_DOCKER",
  "E_COMPOSE",
  "E_REDE",
  "E_VALIDACAO",
  "E_SAUDE",
  "E_BACKUP",
  "E_RESTAURACAO",
  "E_CONTROLADOR",
  "E_DROPBOX",
  "E_CANAL",
];

class ErroInstalador extends Error {
  constructor(codigo, mensagem, opcoes = {}) {
    super(mensagem);
    this.name = "ErroInstalador";
    this.codigo = codigo;
    this.dica = opcoes.dica ?? "";
    this.comando = opcoes.comando ?? null;
    this.documentacao = opcoes.documentacao ?? `${DOCUMENTACAO}#códigos-de-erro`;
    this.saida = opcoes.saida ?? 2;
  }
}

function erroUso(mensagem, opcoes = {}) {
  return new ErroInstalador("E_USO", mensagem, { saida: 2, ...opcoes });
}

function erroValidacao(mensagem, opcoes = {}) {
  return new ErroInstalador("E_VALIDACAO", mensagem, { saida: 7, ...opcoes });
}

function lerVersaoProjeto() {
  try {
    const dados = JSON.parse(fs.readFileSync(CAMINHO_PACOTE, "utf8"));
    return typeof dados.version === "string" ? dados.version : "desconhecida";
  } catch {
    return "desconhecida";
  }
}

const VERSAO_PROJETO = lerVersaoProjeto();

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
  return texto;
}

function definirValor(opcoes, flag, valor) {
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

function definirBooleana(opcoes, flag) {
  opcoes.booleanas.add(flag);
  opcoes.origem.set(flag, "flag");
}

function analisarArgumentos(argv) {
  const opcoes = {
    operandos: [],
    valores: new Map(),
    booleanas: new Set(),
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
  if (opcoes.booleanas.has("--sem-firewall")) {
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
        {
          codigo: "A_CONFIG_ILEGIVEL",
          mensagem: "A configuração padrão existe, mas não pode ser lida.",
          documentacao: `${DOCUMENTACAO}#arquivo-de-configuração`,
        },
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
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    throw erroValidacao("O arquivo de configuração não contém JSON válido.", {
      dica: "Corrija o JSON e repita o planejamento.",
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
      if (!opcoes.booleanas.has(flag)) definirBooleana(opcoes, flag);
      continue;
    }
    if (!["string", "number"].includes(typeof valor)) {
      throw erroUso(`A chave ${chave} exige texto ou número.`);
    }
    if (!opcoes.valores.has(flag)) {
      const texto = validarValor(flag, valor);
      opcoes.valores.set(flag, texto);
      opcoes.origem.set(flag, "config");
    }
  }
  return [];
}

function configuracaoPadrao() {
  return { perfil: "simples", canal: "release", tag: "", commit: "", imagem: "", digest: "" };
}

function configuracaoEfetiva(opcoes) {
  const valores = opcoes?.valores ?? new Map();
  const ref = valores.get("--ref") ?? "";
  return {
    perfil: valores.get("--perfil") ?? "simples",
    canal: valores.get("--canal") ?? "release",
    tag: valores.get("--tag") ?? "",
    commit: /^[a-f0-9]{7,64}$/.test(ref) ? ref : "",
    imagem: valores.get("--imagem") ?? "",
    digest: valores.get("--imagem-digest") ?? "",
  };
}

function comandoParaErro(argv) {
  if (argv.includes("--versao") || argv.includes("--version") || argv.includes("versao")) {
    return "versao";
  }
  if (argv.includes("esquema")) return "esquema";
  if (argv.includes("--aplicar") || argv.includes("aplicar")) return "aplicar";
  return "planejar";
}

function agora() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function aviso(codigo, mensagem, documentacao = DOCUMENTACAO) {
  return { codigo, mensagem, documentacao };
}

function erroObjeto(erro) {
  return {
    codigo: erro.codigo,
    mensagem: erro.message,
    dica: erro.dica,
    comando: erro.comando,
    documentacao: erro.documentacao,
  };
}

function documento(comando, configuracao, deteccao, dados) {
  return redigirObjeto({
    schema: SCHEMA_SAIDA,
    comando,
    ok: dados.erros.length === 0,
    codigo: dados.erros[0]?.codigo ?? null,
    dry_run: dados.dryRun,
    distro: deteccao.distro ?? "desconhecida",
    versao: { instalador: VERSAO_INSTALADOR, projeto: VERSAO_PROJETO },
    codename: deteccao.codename ?? "",
    familia: deteccao.familia ?? "desconhecida",
    tier: deteccao.tier ?? 3,
    arquitetura: deteccao.arquitetura ?? "desconhecida",
    gerenciador: deteccao.gerenciador ?? "desconhecido",
    iniciador: deteccao.iniciador ?? "desconhecido",
    firewall: deteccao.firewall ?? "nenhum",
    selinux: deteccao.selinux ?? "ausente",
    apparmor: deteccao.apparmor ?? "ausente",
    canal: configuracao.canal,
    perfil: configuracao.perfil,
    tag: configuracao.tag,
    commit: configuracao.commit,
    imagem: configuracao.imagem,
    digest: configuracao.digest,
    etapas: dados.etapas,
    avisos: dados.avisos,
    erros: dados.erros,
    proximos: dados.proximos,
    relatorio: dados.relatorio ?? null,
  });
}

function etapaPreflight(deteccao, avisosEtapa) {
  const inicio = agora();
  return {
    id: "preflight",
    estado: "concluida",
    inicio,
    fim: inicio,
    codigo: null,
    acoes: [
      {
        descricao: "Detecta distribuição, arquitetura, gerenciador e iniciador",
        comando: null,
        altera: false,
      },
      {
        descricao: "Confere Docker, Compose, firewall e módulos de segurança",
        comando: null,
        altera: false,
      },
      {
        descricao: "Lê a instalação existente sem alterar o host",
        comando: null,
        altera: false,
      },
    ],
    avisos: avisosEtapa,
    detalhes: {
      versaoDistro: deteccao.versaoDistro,
      idLike: deteccao.idLike,
      motivoTier: deteccao.motivoTier,
      iniciadorOrigem: deteccao.iniciadorOrigem,
      container: deteccao.container,
      docker: deteccao.docker,
      instalacao: deteccao.instalacao,
      schemaEstado: SCHEMA_ESTADO,
    },
  };
}

function etapaPacotes(auditoria, bloqueio) {
  const acoes = [];
  if (!bloqueio) {
    for (const pacote of auditoria.pacotes) {
      if (pacote.acao === "instalar") {
        acoes.push({
          descricao: `Instala o pacote ${pacote.nome}`,
          comando: comandoInstalacao(auditoria.gerenciador, [pacote.nome]),
          altera: true,
        });
      } else if (pacote.acao === "atualizar") {
        acoes.push({
          descricao: `Atualiza o pacote ${pacote.nome} para a versão mínima ${pacote.versaoMinima}`,
          comando: comandoInstalacao(auditoria.gerenciador, [pacote.nome]),
          altera: true,
        });
      }
    }
  }
  if (!acoes.length && !bloqueio) {
    acoes.push({
      descricao: "Nenhum pacote precisa ser instalado ou atualizado",
      comando: null,
      altera: false,
    });
  }
  return {
    id: "pacotes",
    estado: bloqueio ? "bloqueada" : acoes.some((acao) => acao.altera) ? "pendente" : "concluida",
    inicio: null,
    fim: null,
    codigo: bloqueio?.codigo ?? null,
    acoes,
    avisos: auditoria.avisos ?? [],
    detalhes: {
      gerenciador: auditoria.gerenciador,
      resumo: auditoria.resumo,
      pacotes: auditoria.pacotes,
    },
  };
}

function etapaDocker(docker) {
  const acoes = [];
  if (!docker.presente) {
    acoes.push({
      descricao: "Instala o Docker Engine e o plugin Compose",
      comando: null,
      altera: true,
    });
  } else {
    if (docker.daemon !== "ativo") {
      acoes.push({
        descricao:
          docker.daemon === "sem-permissao"
            ? "Corrige o acesso ao daemon do Docker"
            : "Inicia o serviço do Docker",
        comando: null,
        altera: true,
      });
    }
    if (!docker.composePresente) {
      acoes.push({
        descricao: "Instala o plugin Docker Compose",
        comando: null,
        altera: true,
      });
    } else if (!docker.composeSuficiente) {
      acoes.push({
        descricao: "Atualiza o Docker Compose para 2.24 ou superior",
        comando: null,
        altera: true,
      });
    }
    if (!docker.usuarioNoGrupo) {
      acoes.push({
        descricao: "Adiciona a conta ao grupo docker",
        comando: null,
        altera: true,
      });
    }
  }
  if (!acoes.length) {
    acoes.push({
      descricao: "Docker e Compose estão presentes e suficientes",
      comando: null,
      altera: false,
    });
  }
  return {
    id: "docker",
    estado: acoes.some((acao) => acao.altera) ? "pendente" : "concluida",
    inicio: null,
    fim: null,
    codigo: null,
    acoes,
    avisos: [],
    detalhes: docker,
  };
}

function avisosDocker(docker) {
  const avisos = [];
  if (!docker.presente) {
    avisos.push(
      aviso(
        "A_DOCKER_AUSENTE",
        "Docker não encontrado. O plano inclui a instalação.",
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
  } else {
    if (docker.daemon === "parado") {
      avisos.push(
        aviso(
          "A_DOCKER_PARADO",
          "O daemon do Docker está parado. O plano inclui a partida do serviço.",
          `${DOCUMENTACAO}#auditoria-de-pacotes`,
        ),
      );
    }
    if (docker.daemon === "sem-permissao") {
      avisos.push(
        aviso(
          "A_DOCKER_PERMISSAO",
          "A conta atual não pode consultar o daemon do Docker.",
          `${DOCUMENTACAO}#segurança`,
        ),
      );
    }
    if (!docker.usuarioNoGrupo) {
      avisos.push(
        aviso(
          "A_DOCKER_GRUPO",
          "A conta atual não pertence ao grupo docker.",
          `${DOCUMENTACAO}#segurança`,
        ),
      );
    }
    if (!docker.composePresente) {
      avisos.push(
        aviso(
          "A_COMPOSE_AUSENTE",
          "Docker Compose não encontrado. O plano inclui a instalação.",
          `${DOCUMENTACAO}#auditoria-de-pacotes`,
        ),
      );
    } else if (!docker.composeSuficiente) {
      avisos.push(
        aviso(
          "A_COMPOSE_ANTIGO",
          `Docker Compose ${docker.composeVersao} está abaixo da versão mínima 2.24.`,
          `${DOCUMENTACAO}#auditoria-de-pacotes`,
        ),
      );
    }
  }
  return avisos;
}

function deduplicarAvisos(avisos) {
  const vistos = new Set();
  return avisos.filter((item) => {
    const chave = `${item.codigo ?? ""}\n${item.mensagem}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
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

function formatarHumano(documentoFinal) {
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
      linhas.push(`- ${item.mensagem}`);
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

function formatarVersaoHumana(documentoFinal) {
  const preflight = documentoFinal.etapas.find((etapa) => etapa.id === "preflight");
  const detalhes = preflight?.detalhes ?? {};
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

function escreverSaidas(documentoFinal, opcoes, io) {
  let relatorio = null;
  if (opcoes.valores.has("--relatorio")) {
    const caminho = opcoes.valores.get("--relatorio");
    relatorio = path.resolve(caminho);
    documentoFinal.relatorio = relatorio;
    const conteudo = caminho.toLowerCase().endsWith(".json")
      ? `${JSON.stringify(redigirObjeto(documentoFinal), null, 2)}\n`
      : documentoFinal.comando === "versao"
        ? `${formatarVersaoHumana(documentoFinal)}\n`
        : formatarHumano(documentoFinal);
    escreverArquivo(caminho, conteudo, "relatório");
  }
  if (opcoes.valores.has("--arquivo-log")) {
    const conteudo = redigir(
      `${agora()} comando=${documentoFinal.comando} ok=${documentoFinal.ok} codigo=${
        documentoFinal.codigo ?? ""
      } distro=${documentoFinal.distro} tier=${documentoFinal.tier} avisos=${
        documentoFinal.avisos.length
      } erros=${documentoFinal.erros.length}\n`,
    );
    escreverArquivo(opcoes.valores.get("--arquivo-log"), conteudo, "log");
  }
  if (opcoes.booleanas.has("--json")) {
    io.stdout.write(`${JSON.stringify(redigirObjeto(documentoFinal), null, 2)}\n`);
  } else if (documentoFinal.comando === "versao") {
    io.stdout.write(`${formatarVersaoHumana(documentoFinal)}\n`);
  } else {
    io.stdout.write(formatarHumano(documentoFinal));
  }
}

function planejar(opcoes, io) {
  if (opcoes.operandos.length > 1) {
    throw erroUso("O comando planejar não aceita argumentos posicionais.");
  }
  if (opcoes.valores.has("--salvar-config")) {
    throw erroUso("A opção --salvar-config ainda não está disponível nesta versão.");
  }
  const avisosConfig = carregarConfig(opcoes);
  const configuracao = configuracaoEfetiva(opcoes);
  const deteccao = detectar();
  const avisos = [...avisosConfig, ...deteccao.avisos];
  const erros = [];

  if (deteccao.tier === 3) {
    erros.push({
      codigo: "E_DISTRO",
      mensagem:
        `A distribuição ${deteccao.distro} ${deteccao.versaoDistro} não é suportada.`.trim(),
      dica: "Use uma distribuição Tier 1 ou Tier 2 da matriz do instalador.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#tiers`,
    });
  }

  let auditoria = {
    gerenciador: deteccao.gerenciador,
    familia: deteccao.familia,
    pacotes: [],
    resumo: { total: 0, presentes: 0, faltantes: 0, desatualizados: 0 },
    avisos: [],
  };
  let bloqueio = null;
  if (!erros.length) {
    if (deteccao.gerenciador === "desconhecido") {
      erros.push({
        codigo: "E_PACOTE",
        mensagem: "Nenhum gerenciador de pacotes reconhecido foi encontrado.",
        dica: "Confira a instalação do apt, dnf, pacman, zypper ou apk.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
      });
      bloqueio = erros[erros.length - 1];
    } else {
      try {
        auditoria = auditarPacotes({
          familia: deteccao.familia,
          gerenciador: deteccao.gerenciador,
        });
      } catch {
        erros.push({
          codigo: "E_PACOTE",
          mensagem: "Falha ao auditar os pacotes do host.",
          dica: "Confira o gerenciador de pacotes e repita o planejamento.",
          comando: null,
          documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
        });
        bloqueio = erros[erros.length - 1];
      }
    }
  } else {
    bloqueio = erros[0];
  }

  if (deteccao.instalacao.existente) {
    avisos.push(
      aviso(
        "A_INSTALACAO_EXISTENTE",
        "Uma instalação existente foi detectada. O plano preserva o estado atual.",
        `${DOCUMENTACAO}#estado-durável`,
      ),
    );
  }
  if (configuracao.perfil !== "simples") {
    avisos.push(
      aviso(
        "A_PERFIL_LIMITADO",
        "Os perfis controlador, dropbox e completo ainda não alteram o plano nesta versão.",
        `${DOCUMENTACAO}#perfis`,
      ),
    );
  }
  avisos.push(...avisosDocker(deteccao.docker));

  const etapas = [
    etapaPreflight(deteccao, deteccao.avisos),
    etapaPacotes(auditoria, bloqueio),
    etapaDocker(deteccao.docker),
  ];
  const proximos = erros.length
    ? ["sudo ./instalar.sh planejar --json --nao-interativo"]
    : ["sudo ./instalar.sh aplicar --config /etc/frequenciapp/instalador.json --sim"];
  const documentoFinal = documento("planejar", configuracao, deteccao, {
    dryRun: true,
    etapas,
    avisos: deduplicarAvisos(avisos),
    erros,
    proximos,
    relatorio: null,
  });

  try {
    escreverSaidas(documentoFinal, opcoes, io);
  } catch (erro) {
    if (erro instanceof ErroInstalador) {
      documentoFinal.ok = false;
      documentoFinal.codigo = erro.codigo;
      documentoFinal.erros.push(erroObjeto(erro));
      if (opcoes.booleanas.has("--json")) {
        io.stdout.write(`${JSON.stringify(redigirObjeto(documentoFinal), null, 2)}\n`);
      } else {
        io.stderr.write(`${erro.codigo}: ${redigir(erro.message)}\n`);
      }
      return erro.saida;
    }
    throw erro;
  }
  return documentoFinal.ok ? 0 : codigoSaida(documentoFinal.codigo);
}

function codigoSaida(codigo) {
  return (
    {
      E_USO: 2,
      E_DISTRO: 3,
      E_PACOTE: 8,
      E_DOCKER: 8,
      E_COMPOSE: 8,
      E_REDE: 6,
      E_VALIDACAO: 7,
      E_SAUDE: 9,
      E_BACKUP: 10,
      E_RESTAURACAO: 10,
      E_CONTROLADOR: 78,
      E_DROPBOX: 10,
      E_CANAL: 78,
    }[codigo] ?? 1
  );
}

function versao(opcoes, io) {
  if (opcoes.operandos.length > 1) {
    throw erroUso("O comando versao não aceita argumentos posicionais.");
  }
  const avisosConfig = carregarConfig(opcoes);
  const configuracao = configuracaoEfetiva(opcoes);
  const deteccao = detectarBasico();
  const etapa = {
    id: "preflight",
    estado: "concluida",
    inicio: agora(),
    fim: agora(),
    codigo: null,
    acoes: [
      {
        descricao: "Lê a versão do instalador, do projeto e a detecção básica",
        comando: null,
        altera: false,
      },
    ],
    avisos: [],
    detalhes: {
      schemaEstado: SCHEMA_ESTADO,
      schemaSaida: SCHEMA_SAIDA,
      versaoDistro: deteccao.versaoDistro,
    },
  };
  const documentoFinal = documento("versao", configuracao, deteccao, {
    dryRun: false,
    etapas: [etapa],
    avisos: avisosConfig,
    erros: [],
    proximos: ["sudo ./instalar.sh planejar --json --nao-interativo"],
    relatorio: null,
  });
  escreverSaidas(documentoFinal, opcoes, io);
  return 0;
}

function esquema(opcoes, io) {
  if (opcoes.operandos.length > 1) {
    throw erroUso("O comando esquema não aceita argumentos posicionais.");
  }
  if (opcoes.valores.has("--relatorio")) {
    const conteudo = `${JSON.stringify(construirEsquema(), null, 2)}\n`;
    escreverArquivo(opcoes.valores.get("--relatorio"), conteudo, "esquema");
  }
  if (opcoes.valores.has("--arquivo-log")) {
    escreverArquivo(
      opcoes.valores.get("--arquivo-log"),
      `${agora()} comando=esquema ok=true\n`,
      "log",
    );
  }
  io.stdout.write(`${JSON.stringify(construirEsquema(), null, 2)}\n`);
  return 0;
}

function determinarComando(opcoes) {
  if (opcoes.booleanas.has("--planejar") && opcoes.booleanas.has("--aplicar")) {
    throw erroUso("As opções --planejar e --aplicar são mutuamente exclusivas.");
  }
  if (opcoes.booleanas.has("--planejar")) return "planejar";
  if (opcoes.booleanas.has("--aplicar")) return "aplicar";
  const primeiro = opcoes.operandos[0];
  if (!primeiro) throw erroUso("Comando ausente. Use planejar, versao ou esquema.");
  if (!COMANDOS_CONHECIDOS.has(primeiro)) {
    throw erroUso("Comando desconhecido.");
  }
  if (!COMANDOS_DISPONIVEIS.has(primeiro)) {
    throw erroUso(`O comando ${primeiro} ainda não está disponível nesta versão.`, {
      dica: "Use planejar, versao ou esquema.",
    });
  }
  return primeiro;
}

function textoAjuda() {
  return [
    "FrequenciApp - instalador auto-hospedado",
    "",
    "Uso:",
    "  ./instalar.sh <comando> [opcoes]",
    "",
    "Comandos:",
    "  planejar    Lê o host e mostra o plano, sem alterar o sistema",
    "  versao      Mostra a versão do instalador, do projeto e a detecção básica",
    "  esquema     Mostra o JSON Schema da saída",
    "",
    "Opções gerais:",
    "  --ajuda, -h, --help                 Mostra esta ajuda",
    "  --versao, --version                 Mostra a versão",
    "  --json                              Emite um único documento JSON no stdout",
    "  --nao-interativo, --non-interactive Não faz perguntas",
    "  --config <arquivo>                  Lê a configuração JSON",
    "  --relatorio, --report <arquivo>     Grava o relatório com modo 600",
    "  --arquivo-log <arquivo>             Grava o log com modo 600",
    "  --simular, --dry-run                Não altera o host",
    "  --perfil, --profile <nome>          Perfil de instalação (padrão: simples)",
    "  --canal, --channel <nome>           Canal de atualização (padrão: release)",
    "",
    "Exemplos:",
    "  ./instalar.sh planejar --json --nao-interativo",
    "  ./instalar.sh versao --json",
    "  ./instalar.sh esquema",
    "",
    "Códigos de saída: 0 sucesso; 2 uso; 3 distro; 4 pré-requisito; 5 permissão;",
    "6 rede; 7 validação; 8 pacotes ou Docker; 9 saúde; 10 backup ou restauração;",
    "78 bloqueio de política; 130 e 143 sinais.",
  ].join("\n");
}

function construirEsquema() {
  const referencia = (nome) => ({ $ref: `#/$defs/${nome}` });
  const codigoErro = { type: "string", enum: CODIGOS_ERRO };
  const estadoEtapa = {
    type: "string",
    enum: ["pendente", "executando", "concluida", "pulada", "falhou", "bloqueada"],
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "urn:frequenciapp:instalador:1",
    title: "Saída do instalador do FrequenciApp",
    description: "Contrato frequenciapp.instalador/1 para comandos e automação.",
    type: "object",
    additionalProperties: false,
    required: [
      "schema",
      "comando",
      "ok",
      "codigo",
      "dry_run",
      "distro",
      "versao",
      "codename",
      "familia",
      "tier",
      "arquitetura",
      "gerenciador",
      "iniciador",
      "firewall",
      "selinux",
      "apparmor",
      "canal",
      "perfil",
      "tag",
      "commit",
      "imagem",
      "digest",
      "etapas",
      "avisos",
      "erros",
      "proximos",
      "relatorio",
    ],
    properties: {
      schema: { const: SCHEMA_SAIDA },
      comando: {
        type: "string",
        enum: [
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
        ],
      },
      ok: { type: "boolean" },
      codigo: { anyOf: [codigoErro, { type: "null" }] },
      dry_run: { type: "boolean" },
      distro: { type: "string" },
      versao: referencia("versao"),
      codename: { type: "string" },
      familia: {
        type: "string",
        enum: ["debian", "rhel", "fedora", "arch", "suse", "alpine", "desconhecida"],
      },
      tier: { type: "integer", enum: [1, 2, 3] },
      arquitetura: { type: "string" },
      gerenciador: {
        type: "string",
        enum: ["apt", "dnf", "pacman", "zypper", "apk", "desconhecido"],
      },
      iniciador: { type: "string", enum: ["systemd", "openrc", "desconhecido"] },
      firewall: { type: "string", enum: ["ufw", "firewalld", "nft", "nenhum"] },
      selinux: { type: "string", enum: ["enforcing", "permissive", "disabled", "ausente"] },
      apparmor: { type: "string", enum: ["enforcing", "complain", "disabled", "ausente"] },
      canal: { type: "string", enum: ["release", "main"] },
      perfil: { type: "string", enum: ["simples", "controlador", "dropbox", "completo"] },
      tag: { type: "string", pattern: "^$|^v\\d+\\.\\d+\\.\\d+$" },
      commit: { type: "string", pattern: "^$|^[a-f0-9]{7,64}$" },
      imagem: { type: "string" },
      digest: { type: "string", pattern: "^$|^sha256:[a-f0-9]{64}$" },
      etapas: { type: "array", items: referencia("etapa") },
      avisos: { type: "array", items: referencia("aviso") },
      erros: { type: "array", items: referencia("erro") },
      proximos: { type: "array", items: { type: "string" } },
      relatorio: { type: ["string", "null"] },
    },
    $defs: {
      versao: {
        type: "object",
        additionalProperties: false,
        required: ["instalador", "projeto"],
        properties: {
          instalador: { type: "string" },
          projeto: { type: "string" },
        },
      },
      etapa: {
        type: "object",
        additionalProperties: false,
        required: ["id", "estado", "inicio", "fim", "codigo", "acoes", "avisos", "detalhes"],
        properties: {
          id: { type: "string", minLength: 1 },
          estado: estadoEtapa,
          inicio: { type: ["string", "null"], format: "date-time" },
          fim: { type: ["string", "null"], format: "date-time" },
          codigo: { anyOf: [codigoErro, { type: "null" }] },
          acoes: { type: "array", items: referencia("acao") },
          avisos: { type: "array", items: referencia("aviso") },
          detalhes: {
            type: "object",
            additionalProperties: true,
            description: "Dados estruturados da etapa, sempre redigidos.",
          },
        },
      },
      acao: {
        type: "object",
        additionalProperties: false,
        required: ["descricao", "comando", "altera"],
        properties: {
          descricao: { type: "string" },
          comando: { type: ["string", "null"] },
          altera: { type: "boolean" },
        },
      },
      erro: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "mensagem", "dica", "comando", "documentacao"],
        properties: {
          codigo: codigoErro,
          mensagem: { type: "string" },
          dica: { type: "string" },
          comando: { type: ["string", "null"] },
          documentacao: { type: "string" },
        },
      },
      aviso: {
        type: "object",
        additionalProperties: false,
        required: ["mensagem", "documentacao"],
        properties: {
          codigo: { type: "string", pattern: "^A_[A-Z0-9_]+$" },
          mensagem: { type: "string" },
          documentacao: { type: "string" },
        },
      },
    },
  };
}

function documentoErro(erro, argv) {
  const comando = comandoParaErro(argv);
  let deteccao;
  try {
    deteccao = detectarBasico();
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
  return documento(comando, configuracaoPadrao(), deteccao, {
    dryRun: comando === "planejar" || argv.includes("--simular") || argv.includes("--dry-run"),
    etapas: [],
    avisos: [],
    erros: [erroObjeto(erro)],
    proximos: [],
    relatorio: null,
  });
}

function escreverErro(erro, argv, io) {
  if (argv.includes("--json")) {
    try {
      const documentoFinal = documentoErro(erro, argv);
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
) {
  let opcoes;
  try {
    opcoes = analisarArgumentos(argv);
    if (opcoes.booleanas.has("--ajuda")) {
      io.stdout.write(`${textoAjuda()}\n`);
      return 0;
    }
    if (opcoes.booleanas.has("--versao")) {
      return versao(opcoes, io);
    }
    if (opcoes.operandos.length === 0 && opcoes.booleanas.size === 0 && opcoes.valores.size === 0) {
      io.stdout.write(`${textoAjuda()}\n`);
      return 0;
    }
    const comando = determinarComando(opcoes);
    if (comando === "planejar") return planejar(opcoes, io);
    if (comando === "versao") return versao(opcoes, io);
    if (comando === "esquema") return esquema(opcoes, io);
    throw erroUso(`O comando ${comando} ainda não está disponível nesta versão.`);
  } catch (erro) {
    if (erro instanceof ErroInstalador) {
      escreverErro(erro, argv, io);
      return erro.saida;
    }
    io.stderr.write(`Falha interna: ${redigir(String(erro?.message ?? "erro desconhecido"))}\n`);
    return 1;
  }
}

const executadoDiretamente =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDiretamente) {
  process.exitCode = principal();
}
