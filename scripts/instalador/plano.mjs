// Monta o plano determinístico e os relatórios somente leitura de situação e diagnóstico.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executarPadrao } from "./detectar.mjs";
import { comandoInstalacao } from "./pacotes.mjs";
import { SCHEMA_ESTADO, SCHEMA_SAIDA, aviso, erroObjeto, codigoSaida } from "./json.mjs";
import { lerEstadoAtualizador } from "./estado.mjs";
import { redigirObjeto } from "./redigir.mjs";

export const VERSAO_INSTALADOR = "1.0.0";
export const DOCUMENTACAO = "docs/instalador.md";
export const FUSO_PADRAO = "America/Fortaleza";

const RAIZ_INSTALADOR = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CAMINHO_PACOTE = path.join(RAIZ_INSTALADOR, "package.json");
const LIMITE_BACKUP = 1024 * 1024;
const PACOTES_OBRIGATORIOS = new Set([
  "bash",
  "curl",
  "ca-certificates",
  "git",
  "jq",
  "openssl",
  "tar",
  "gzip",
  "flock",
  "sha256sum",
]);

function lerVersaoProjeto() {
  try {
    const dados = JSON.parse(fs.readFileSync(CAMINHO_PACOTE, "utf8"));
    return typeof dados.version === "string" ? dados.version : "desconhecida";
  } catch {
    return "desconhecida";
  }
}

export const VERSAO_PROJETO = lerVersaoProjeto();

// Relógio padrão em ISO 8601 UTC, sem milissegundos.
export function agoraPadrao() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function deduplicarAvisos(avisos) {
  const vistos = new Set();
  return avisos.filter((item) => {
    const chave = `${item.codigo ?? ""}\n${item.mensagem}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function montarDocumento(opcoes) {
  const configuracao = opcoes.configuracao ?? {};
  const estado = opcoes.estado ?? null;
  const estadoPrimeiro = ["situacao", "diagnosticar", "versao"].includes(opcoes.comando);
  const escolher = (campo) =>
    estadoPrimeiro
      ? (estado?.[campo] ?? configuracao[campo])
      : (configuracao[campo] ?? estado?.[campo]);
  return redigirObjeto({
    schema: SCHEMA_SAIDA,
    comando: opcoes.comando,
    ok: opcoes.erros.length === 0,
    codigo: opcoes.erros[0]?.codigo ?? null,
    dry_run: Boolean(opcoes.dryRun),
    distro: opcoes.deteccao?.distro ?? "desconhecida",
    versao: { instalador: VERSAO_INSTALADOR, projeto: VERSAO_PROJETO },
    codename: opcoes.deteccao?.codename ?? "",
    familia: opcoes.deteccao?.familia ?? "desconhecida",
    tier: opcoes.deteccao?.tier ?? 3,
    arquitetura: opcoes.deteccao?.arquitetura ?? "desconhecida",
    gerenciador: opcoes.deteccao?.gerenciador ?? "desconhecido",
    iniciador: opcoes.deteccao?.iniciador ?? "desconhecido",
    firewall: opcoes.deteccao?.firewall ?? "nenhum",
    selinux: opcoes.deteccao?.selinux ?? "ausente",
    apparmor: opcoes.deteccao?.apparmor ?? "ausente",
    canal: escolher("canal") ?? "release",
    perfil: escolher("perfil") ?? "simples",
    tag: escolher("tag") ?? "",
    commit: escolher("commit") ?? "",
    imagem: escolher("imagem") ?? "",
    digest: escolher("digest") ?? "",
    etapas: opcoes.etapas,
    avisos: deduplicarAvisos(opcoes.avisos),
    erros: opcoes.erros,
    proximos: opcoes.proximos,
    relatorio: opcoes.relatorio ?? null,
  });
}

function etapaPreflight(deteccao, avisosEtapa, agora, erros) {
  const inicio = agora;
  const erro = erros[0] ?? null;
  return {
    id: "preflight",
    estado: erro ? "falhou" : "concluida",
    inicio,
    fim: inicio,
    codigo: erro?.codigo ?? null,
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

function auditoriaVazia(gerenciador) {
  return {
    gerenciador,
    familia: "desconhecida",
    pacotes: [],
    resumo: { total: 0, presentes: 0, faltantes: 0, desatualizados: 0 },
    avisos: [],
  };
}

function etapaPacotes(auditoria, bloqueio) {
  const dados = auditoria ?? auditoriaVazia("desconhecido");
  const acoes = [];
  if (!bloqueio) {
    for (const pacote of dados.pacotes) {
      if (pacote.acao === "instalar") {
        acoes.push({
          descricao: `Instala o pacote ${pacote.nome}`,
          comando: comandoInstalacao(dados.gerenciador, [pacote.nome]),
          altera: true,
        });
      } else if (pacote.acao === "atualizar") {
        acoes.push({
          descricao: `Atualiza o pacote ${pacote.nome} para a versão mínima ${pacote.versaoMinima}`,
          comando: comandoInstalacao(dados.gerenciador, [pacote.nome]),
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
    avisos: dados.avisos ?? [],
    detalhes: {
      gerenciador: dados.gerenciador,
      resumo: dados.resumo,
      pacotes: dados.pacotes,
    },
  };
}

function etapaDocker(docker, bloqueio) {
  const acoes = [];
  const dados = docker ?? { presente: false, daemon: "ausente" };
  if (!dados.presente) {
    acoes.push({
      descricao: "Instala o Docker Engine e o plugin Compose",
      comando: null,
      altera: true,
    });
  } else {
    if (dados.daemon !== "ativo") {
      acoes.push({
        descricao:
          dados.daemon === "sem-permissao"
            ? "Corrige o acesso ao daemon do Docker"
            : "Inicia o serviço do Docker",
        comando: null,
        altera: true,
      });
    }
    if (!dados.composePresente) {
      acoes.push({
        descricao: "Instala o plugin Docker Compose",
        comando: null,
        altera: true,
      });
    } else if (!dados.composeSuficiente) {
      acoes.push({
        descricao: "Atualiza o Docker Compose para 2.24 ou superior",
        comando: null,
        altera: true,
      });
    }
    if (!dados.usuarioNoGrupo) {
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
    estado: bloqueio ? "bloqueada" : acoes.some((acao) => acao.altera) ? "pendente" : "concluida",
    inicio: null,
    fim: null,
    codigo: bloqueio?.codigo ?? null,
    acoes,
    avisos: [],
    detalhes: dados,
  };
}

function avisosDocker(docker) {
  const dados = docker ?? { presente: false };
  const avisos = [];
  if (!dados.presente) {
    avisos.push(
      aviso(
        "A_DOCKER_AUSENTE",
        "Docker não encontrado. O plano inclui a instalação.",
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
    return avisos;
  }
  if (dados.daemon === "parado") {
    avisos.push(
      aviso(
        "A_DOCKER_PARADO",
        "O daemon do Docker está parado. O plano inclui a partida do serviço.",
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
  }
  if (dados.daemon === "sem-permissao") {
    avisos.push(
      aviso(
        "A_DOCKER_PERMISSAO",
        "A conta atual não pode consultar o daemon do Docker.",
        `${DOCUMENTACAO}#segurança`,
      ),
    );
  }
  if (dados.daemon === "indisponivel") {
    avisos.push(
      aviso(
        "A_DOCKER_INDISPONIVEL",
        "O daemon do Docker respondeu de forma inesperada.",
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
  }
  if (!dados.usuarioNoGrupo) {
    avisos.push(
      aviso(
        "A_DOCKER_GRUPO",
        "A conta atual não pertence ao grupo docker.",
        `${DOCUMENTACAO}#segurança`,
      ),
    );
  }
  if (!dados.composePresente) {
    avisos.push(
      aviso(
        "A_COMPOSE_AUSENTE",
        "Docker Compose não encontrado. O plano inclui a instalação.",
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
  } else if (!dados.composeSuficiente) {
    avisos.push(
      aviso(
        "A_COMPOSE_ANTIGO",
        `Docker Compose ${dados.composeVersao} está abaixo da versão mínima 2.24.`,
        `${DOCUMENTACAO}#auditoria-de-pacotes`,
      ),
    );
  }
  return avisos;
}

function erroDistro(deteccao) {
  return {
    codigo: "E_DISTRO",
    mensagem: `A distribuição ${deteccao.distro} ${deteccao.versaoDistro} não é suportada.`.trim(),
    dica: "Use uma distribuição Tier 1 ou Tier 2 da matriz do instalador.",
    comando: null,
    documentacao: `${DOCUMENTACAO}#tiers`,
  };
}

function erroPacote(mensagem, dica) {
  return {
    codigo: "E_PACOTE",
    mensagem,
    dica,
    comando: null,
    documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
  };
}

function erroCanal(mensagem, dica) {
  return {
    codigo: "E_CANAL",
    mensagem,
    dica,
    comando: null,
    documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
  };
}

function proximosPlano(erros) {
  if (!erros.length) {
    return ["sudo ./instalar.sh aplicar --config /etc/frequenciapp/instalador.json --sim"];
  }
  return [
    "sudo ./instalar.sh diagnosticar --json --nao-interativo",
    "sudo ./instalar.sh planejar --json --nao-interativo",
  ];
}

function priorizarErro(erros, erro) {
  if (!erro) return;
  const indice = erros.findIndex(
    (item) => item.codigo === erro.codigo && item.mensagem === erro.message,
  );
  if (indice > 0) erros.unshift(erros.splice(indice, 1)[0]);
}

// Monta o plano completo a partir de detecção, auditoria e estado já lidos.
export function montarPlano(opcoes) {
  const configuracao = opcoes.configuracao ?? {};
  const deteccao = opcoes.deteccao;
  const auditoria = opcoes.auditoria ?? null;
  const estadoResultado = opcoes.estadoResultado ?? { presente: false };
  const agora = opcoes.agora ?? agoraPadrao();
  const erros = [];
  const errosPreflight = [];
  const avisos = [
    ...(opcoes.avisosConfig ?? []),
    ...(deteccao?.avisos ?? []),
    ...(estadoResultado.avisos ?? []),
  ];

  if (deteccao?.tier === 3) {
    const erro = erroDistro(deteccao);
    erros.push(erro);
    errosPreflight.push(erro);
  }
  let bloqueio = erros[0] ?? null;
  if (!erros.length && deteccao?.gerenciador === "desconhecido") {
    const erro = erroPacote(
      "Nenhum gerenciador de pacotes reconhecido foi encontrado.",
      "Confira a instalação do apt, dnf, pacman, zypper ou apk.",
    );
    erros.push(erro);
    bloqueio = erro;
  }
  if (!erros.length && !auditoria) {
    const erro = erroPacote(
      "Falha ao auditar os pacotes do host.",
      "Confira o gerenciador de pacotes e repita o planejamento.",
    );
    erros.push(erro);
    bloqueio = erro;
  }
  if (estadoResultado.erro) {
    const erro = erroObjeto(estadoResultado.erro);
    erros.push(erro);
    errosPreflight.push(erro);
  }
  if (
    (configuracao.canal === "main" || configuracao.canalAtualizacao === "main") &&
    !opcoes.permitirInstavel
  ) {
    erros.push(
      erroCanal(
        "O canal main exige confirmação explícita.",
        "Repita o comando com --permitir-instavel para usar o canal main.",
      ),
    );
  }

  if (estadoResultado.presente) {
    avisos.push(
      aviso(
        "A_INSTALACAO_EXISTENTE",
        "Uma instalação existente foi detectada. O plano preserva o estado atual.",
        `${DOCUMENTACAO}#estado-durável`,
      ),
    );
  }
  if (configuracao.perfil && configuracao.perfil !== "simples") {
    avisos.push(
      aviso(
        "A_PERFIL_LIMITADO",
        "Os perfis controlador, dropbox e completo ainda não alteram o plano nesta versão.",
        `${DOCUMENTACAO}#perfis`,
      ),
    );
  }
  if (configuracao.canal === "release" && !configuracao.tag) {
    avisos.push(
      aviso(
        "A_TAG_AUSENTE",
        "O canal release exige uma tag estável para aplicar a instalação.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (configuracao.canal === "main" && configuracao.tag) {
    erros.push(
      erroCanal(
        "O canal main não usa tag estável.",
        "Remova --tag ou use o canal release com uma tag vX.Y.Z.",
      ),
    );
  }
  if (configuracao.canal === "main" && opcoes.permitirInstavel) {
    avisos.push(
      aviso(
        "A_CANAL_MAIN",
        "O canal main é instável e não é recomendado para produção.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (configuracao.canalAtualizacao === "main" && opcoes.permitirInstavel) {
    avisos.push(
      aviso(
        "A_CANAL_ATUALIZACAO_MAIN",
        "As atualizações agendadas usarão o canal main e são instáveis.",
        `${DOCUMENTACAO}#canal-release-e-main`,
      ),
    );
  }
  if (configuracao.tls === "acme" && !configuracao.dominio) {
    avisos.push(
      aviso(
        "A_DOMINIO_AUSENTE",
        "O modo TLS acme exige um domínio para o certificado público.",
        `${DOCUMENTACAO}#flags`,
      ),
    );
  }
  if (configuracao.tls === "acme" && !configuracao.emailAcme) {
    avisos.push(
      aviso(
        "A_EMAIL_ACME_AUSENTE",
        "O modo TLS acme exige um endereço de e-mail para a autoridade certificadora.",
        `${DOCUMENTACAO}#flags`,
      ),
    );
  }
  avisos.push(...avisosDocker(deteccao?.docker));

  priorizarErro(erros, estadoResultado.erro);
  priorizarErro(errosPreflight, estadoResultado.erro);
  const etapas = [
    etapaPreflight(
      deteccao,
      [...(deteccao?.avisos ?? []), ...(estadoResultado.avisos ?? [])],
      agora,
      errosPreflight,
    ),
    etapaPacotes(auditoria, bloqueio),
    etapaDocker(deteccao?.docker, bloqueio),
  ];
  return montarDocumento({
    comando: "planejar",
    configuracao,
    estado: estadoResultado.estado,
    deteccao,
    dryRun: true,
    etapas,
    avisos,
    erros,
    proximos: proximosPlano(erros),
  });
}

function resumoEstado(estadoResultado) {
  if (!estadoResultado?.presente || !estadoResultado.estado) {
    return {
      presente: false,
      perfil: "",
      canal: "",
      tag: "",
      commit: "",
      imagem: "",
      digest: "",
    };
  }
  return { presente: true, ...estadoResultado.estado };
}

function commitDaTag(executar, diretorio, tag) {
  if (!diretorio || !tag) return "";
  const resultado = executar(
    "git",
    ["-C", diretorio, "rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
    { timeout: 15000 },
  );
  return resultado.status === 0 ? String(resultado.stdout).trim() : "";
}

function canalDoAtualizador(informado) {
  if (!informado) return "";
  if (informado.modo === "release" || informado.modo === "main") return informado.modo;
  if (/^v\d+\.\d+\.\d+$/.test(informado.ref)) return "release";
  if (informado.ref) return "main";
  return "";
}

function resumoCanal(estadoResultado, estadoAtualizador, configuracao, executar) {
  const estado = estadoResultado?.estado ?? null;
  const preferido = {
    canal: estado?.canal ?? configuracao?.canal ?? "release",
    tag: estado?.tag ?? configuracao?.tag ?? "",
  };
  let instalado;
  if (estadoAtualizador?.estado) {
    instalado = {
      canal: canalDoAtualizador(estadoAtualizador.estado),
      tag: estadoAtualizador.estado.ref,
      commit: estadoAtualizador.estado.commit,
      imagem: estadoAtualizador.estado.imagem,
      digest: estado?.digest ?? "",
      atualizadoEm: estadoAtualizador.estado.atualizadoEm,
    };
  } else if (estado) {
    instalado = {
      canal: estado.canal,
      tag: estado.tag,
      commit: estado.commit,
      imagem: estado.imagem,
      digest: estado.digest,
      atualizadoEm: estado.atualizadoEm,
    };
  } else {
    instalado = null;
  }
  let divergente = false;
  if (estado && instalado) {
    if (instalado.canal && preferido.canal !== instalado.canal) divergente = true;
    if (
      preferido.canal === "release" &&
      preferido.tag &&
      instalado.canal === "release" &&
      instalado.tag &&
      preferido.tag !== instalado.tag
    ) {
      divergente = true;
    }
    if (
      estadoAtualizador?.estado &&
      estado.commit &&
      estadoAtualizador.estado.commit &&
      estado.commit !== estadoAtualizador.estado.commit
    ) {
      divergente = true;
    }
    if (!estadoAtualizador?.estado && preferido.tag) {
      const appDir = estado.origem?.diretorioFonte ?? configuracao?.diretorioFonte ?? "";
      const commit = commitDaTag(executar, appDir, preferido.tag);
      if (commit && estado.commit && commit !== estado.commit) divergente = true;
    }
  }
  return { preferido, instalado, divergente };
}

function registrarCanal(verificacoes, erros, avisos, canalInfo, estadoAtualizador) {
  if (estadoAtualizador?.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("canal_atualizador", "Estado do atualizador", "aviso", {
        codigo: "A_ESTADO_ATUALIZADOR",
        mensagem: estadoAtualizador.erro,
        dica: "Confira /var/lib/frequenciapp/estado.json.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      }),
    });
  }
  const emExecucao = canalInfo.instalado?.canal || canalInfo.preferido.canal;
  if (canalInfo.divergente) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("canal", "Canal de atualização", "aviso", {
        codigo: "A_CANAL_DIVERGENTE",
        mensagem: "A preferência de canal diverge da instalação em execução.",
        dica: "Aplique a preferência com canal definir --aplicar ou revise o estado.",
        comando: "sudo ./instalar.sh canal mostrar --json",
        documentacao: `${DOCUMENTACAO}#troca-de-canal`,
      }),
    });
    return;
  }
  if (emExecucao === "main") {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("canal", "Canal de atualização", "aviso", {
        codigo: "A_CANAL_MAIN",
        mensagem: "A instalação está no canal main e é considerada instável.",
        dica: "Migre para uma tag estável quando houver release compatível.",
        comando: "sudo ./instalar.sh canal definir release --tag vX.Y.Z --planejar",
        documentacao: `${DOCUMENTACAO}#canal-release-e-main`,
      }),
    });
  }
}

function verificacao(id, titulo, estado, dados = {}) {
  return {
    id,
    titulo,
    estado,
    codigo: dados.codigo ?? null,
    mensagem: dados.mensagem ?? "",
    comando: dados.comando ?? null,
    dica: dados.dica ?? "",
    documentacao: dados.documentacao ?? `${DOCUMENTACAO}#situacao`,
  };
}

function registrar(verificacoes, erros, avisos, item) {
  verificacoes.push(item);
  if (item.estado === "falha") {
    erros.push({
      codigo: item.codigo,
      mensagem: item.mensagem,
      dica: item.dica,
      comando: item.comando,
      documentacao: item.documentacao,
    });
  } else if (item.estado === "aviso") {
    avisos.push({
      codigo: item.codigo,
      mensagem: item.mensagem,
      documentacao: item.documentacao,
    });
  }
}

function resumoDocker(deteccao) {
  const docker = deteccao?.docker ?? { presente: false, daemon: "ausente" };
  return {
    presente: Boolean(docker.presente),
    daemon: docker.daemon ?? "ausente",
    versao: docker.versao ?? "",
    composeVersao: docker.composeVersao ?? "",
    composeSuficiente: Boolean(docker.composeSuficiente),
    usuarioNoGrupo: Boolean(docker.usuarioNoGrupo),
  };
}

function coletarContainers(deteccao, executar) {
  const docker = deteccao?.docker ?? { presente: false, daemon: "ausente" };
  if (!docker.presente) {
    return {
      erro: {
        codigo: "E_DOCKER",
        mensagem: "Docker não encontrado neste host.",
        dica: "Instale o Docker Engine e o plugin Compose.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
      },
      containers: [],
    };
  }
  if (docker.daemon !== "ativo") {
    const semPermissao = docker.daemon === "sem-permissao";
    return {
      erro: {
        codigo: "E_DOCKER",
        mensagem: semPermissao
          ? "A conta atual não pode consultar o daemon do Docker."
          : "O daemon do Docker não está ativo.",
        dica: semPermissao
          ? "Use uma conta com acesso ao daemon do Docker."
          : "Inicie o serviço do Docker e repita o comando.",
        comando: semPermissao ? null : "sudo systemctl start docker",
        documentacao: `${DOCUMENTACAO}#segurança`,
      },
      containers: [],
    };
  }
  const resultado = executar("docker", ["ps", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}"]);
  if (resultado.status !== 0) {
    return {
      erro: {
        codigo: "E_DOCKER",
        mensagem: "Não foi possível consultar os containers do Docker.",
        dica: "Confira o serviço do Docker e a permissão da conta.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#situacao`,
      },
      containers: [],
    };
  }
  const containers = String(resultado.stdout ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linha) => {
      const [nome = "", status = "", imagem = ""] = linha.split("\t");
      return { nome, status, imagem };
    });
  return { erro: null, containers };
}

function identificarAplicacao(containers) {
  return containers.find(
    (container) =>
      /(?:^|[-_])app(?:[-_]|$)|frequenciapp|web/i.test(container.nome) &&
      !/(?:^|[-_])(?:db|postgres|banco)(?:[-_]|$)/i.test(container.nome),
  );
}

function identificarBanco(containers) {
  return containers.find((container) =>
    /(?:^|[-_])(?:db|postgres|banco)(?:[-_]|$)/i.test(container.nome),
  );
}

function verificarSaude(app, executar, exigir = false) {
  if (!app) {
    if (exigir) {
      return {
        estado: "falha",
        codigo: "E_SAUDE",
        mensagem: "Instalação registrada sem container da aplicação.",
        dica: "Confira a pilha do Compose e o nome do projeto.",
        comando: "docker ps",
        documentacao: `${DOCUMENTACAO}#situacao`,
      };
    }
    return {
      estado: "aviso",
      codigo: "A_SEM_APLICACAO",
      mensagem: "Container da aplicação não encontrado.",
      dica: "Confira a pilha do Compose e o nome do projeto.",
      comando: "docker ps",
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  const resultado = executar("docker", [
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    app.nome,
  ]);
  if (resultado.status !== 0) {
    return {
      estado: "falha",
      codigo: "E_SAUDE",
      mensagem: "Não foi possível consultar a saúde da aplicação.",
      dica: "Confira o container e o log da aplicação.",
      comando: `docker inspect ${app.nome}`,
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  const saude = String(resultado.stdout ?? "").trim();
  if (saude === "healthy" || saude === "running") {
    return { estado: "ok", mensagem: `A aplicação está ${saude}.`, comando: null };
  }
  return {
    estado: "falha",
    codigo: "E_SAUDE",
    mensagem: `A aplicação está em estado ${saude || "desconhecido"}.`,
    dica: "Confira o log da aplicação e o resultado de /api/saude.",
    comando: `docker inspect ${app.nome}`,
    documentacao: `${DOCUMENTACAO}#situacao`,
  };
}

function verificarBanco(banco, executar, exigir = false) {
  if (!banco) {
    if (exigir) {
      return {
        estado: "falha",
        codigo: "E_SAUDE",
        mensagem: "Instalação registrada sem container do banco.",
        dica: "Confira a pilha do Compose e o nome do projeto.",
        comando: "docker ps",
        documentacao: `${DOCUMENTACAO}#situacao`,
      };
    }
    return {
      estado: "aviso",
      codigo: "A_SEM_BANCO",
      mensagem: "Container do banco não encontrado.",
      dica: "Confira a pilha do Compose e o nome do projeto.",
      comando: "docker ps",
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  const resultado = executar("docker", ["exec", banco.nome, "pg_isready"]);
  if (resultado.status === 0) {
    return { estado: "ok", mensagem: "O banco responde ao pg_isready.", comando: null };
  }
  return {
    estado: "falha",
    codigo: "E_SAUDE",
    mensagem: "O banco não respondeu ao pg_isready.",
    dica: "Confira o container do banco, o volume e as migrações.",
    comando: `docker exec ${banco.nome} pg_isready`,
    documentacao: `${DOCUMENTACAO}#situacao`,
  };
}

function lerTimers(executar, comandoExiste) {
  if (typeof comandoExiste !== "function" || !comandoExiste("systemctl")) {
    return { disponivel: false, quantidade: 0, unidades: [], erro: null };
  }
  const resultado = executar("systemctl", ["list-timers", "--all", "--no-pager"]);
  if (resultado.status !== 0) {
    return {
      disponivel: true,
      quantidade: 0,
      unidades: [],
      erro: "Não foi possível consultar os timers do systemd.",
    };
  }
  const unidades = [];
  for (const linha of String(resultado.stdout ?? "").split(/\r?\n/)) {
    const combinacao = /(\S+\.timer)\b/.exec(linha);
    if (
      combinacao &&
      /frequenciapp|backup-planilhas|backup-banco|renovar-certificado/i.test(combinacao[1])
    ) {
      unidades.push(combinacao[1]);
    }
  }
  return { disponivel: true, quantidade: unidades.length, unidades, erro: null };
}

export function lerDisco(raiz = "/") {
  try {
    const dados = fs.statfsSync(raiz);
    const bloco = Number(dados.bsize);
    const livre = Number(dados.bavail) * bloco;
    const total = Number(dados.blocks) * bloco;
    return {
      livreBytes: livre,
      totalBytes: total,
      livreGiB: Number((livre / 1024 ** 3).toFixed(1)),
      totalGiB: Number((total / 1024 ** 3).toFixed(1)),
    };
  } catch {
    return null;
  }
}

export function lerBackup(raiz = "/", agora = agoraPadrao()) {
  const caminho = path.join(raiz, "var/lib/frequenciapp/ultimo-backup.json");
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch {
    return { presente: false, caminho, valido: false, idadeDias: null, arquivo: null };
  }
  if (informacao.isSymbolicLink() || !informacao.isFile() || informacao.size > LIMITE_BACKUP) {
    return { presente: true, caminho, valido: false, idadeDias: null, arquivo: null };
  }
  let dados;
  try {
    dados = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    return { presente: true, caminho, valido: false, idadeDias: null, arquivo: null };
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return { presente: true, caminho, valido: false, idadeDias: null, arquivo: null };
  }
  const bruto = dados.verificadoEm ?? dados.criadoEm ?? dados.em ?? dados.data ?? null;
  const instante = typeof bruto === "string" ? Date.parse(bruto) : Number.NaN;
  const agoraInstante = Date.parse(agora);
  const idadeDias =
    Number.isFinite(instante) && Number.isFinite(agoraInstante)
      ? Number(((agoraInstante - instante) / 86400000).toFixed(1))
      : null;
  const valido = Number.isFinite(instante);
  return {
    presente: true,
    caminho,
    valido,
    idadeDias,
    arquivo: typeof dados.arquivo === "string" ? path.basename(dados.arquivo) : null,
  };
}

function verificarBackup(estadoPresente, raiz, agora) {
  const backup = lerBackup(raiz, agora);
  if (!backup.presente) {
    if (!estadoPresente) {
      return {
        backup,
        estado: "ok",
        mensagem: "Nenhum backup confirmado; a instalação ainda não foi aplicada.",
        comando: null,
      };
    }
    return {
      backup,
      estado: "aviso",
      codigo: "A_BACKUP_AUSENTE",
      mensagem: "Nenhum backup confirmado foi encontrado.",
      dica: "Execute o backup inicial e confira o recibo.",
      comando: "sudo ./instalar.sh backup --sim",
      documentacao: `${DOCUMENTACAO}#backup`,
    };
  }
  if (!backup.valido) {
    return {
      backup,
      estado: "aviso",
      codigo: "A_BACKUP_INVALIDO",
      mensagem: "O ponteiro do último backup não pôde ser lido.",
      dica: "Confira /var/lib/frequenciapp/ultimo-backup.json.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#backup`,
    };
  }
  if (backup.idadeDias !== null && backup.idadeDias > 7) {
    return {
      backup,
      estado: "aviso",
      codigo: "A_BACKUP_ANTIGO",
      mensagem: `O último backup confirmado tem ${backup.idadeDias} dias.`,
      dica: "Confira a agenda de backup e o recibo mais recente.",
      comando: "sudo ./instalar.sh backup --sim",
      documentacao: `${DOCUMENTACAO}#backup`,
    };
  }
  return {
    backup,
    estado: "ok",
    mensagem: "O último backup confirmado está recente.",
    comando: null,
  };
}

function etapaSomenteLeitura(id, verificacoes, avisos, erros, detalhes, agora) {
  return {
    id,
    estado: erros.length ? "falhou" : "concluida",
    inicio: agora,
    fim: agora,
    codigo: erros[0]?.codigo ?? null,
    acoes: verificacoes.map((item) => ({
      descricao: item.titulo,
      comando: item.comando,
      altera: false,
    })),
    avisos,
    detalhes: { ...detalhes, verificacoes },
  };
}

function proximosLeitura(estadoResultado, erros, comando) {
  if (erros.length) {
    const codigo = erros[0].codigo;
    if (codigo === "E_DISTRO") {
      return ["Consulte a matriz de distribuições em docs/instalador.md"];
    }
    if (codigo === "E_PACOTE" || codigo === "E_DOCKER" || codigo === "E_COMPOSE") {
      return ["sudo ./instalar.sh planejar --json --nao-interativo"];
    }
    if (codigo === "E_REDE") {
      return ["Confira DNS, portas 80 e 443 e conectividade em docs/instalador.md"];
    }
    if (codigo === "E_BACKUP") {
      return ["Confira rclone, cliente PostgreSQL e backup em docs/instalador.md"];
    }
    if (codigo === "E_DROPBOX") {
      return ["Confira o token e o perfil Dropbox em docs/instalador.md"];
    }
    if (codigo === "E_CONTROLADOR") {
      return ["Revise o journal e os pins antes de reagir ao controlador"];
    }
    if (codigo === "E_SAUDE") {
      return comando === "situacao"
        ? ["sudo ./instalar.sh diagnosticar --json"]
        : ["sudo ./instalar.sh situacao --json"];
    }
    return ["Corrija o achado e repita o diagnóstico"];
  }
  if (!estadoResultado?.presente) {
    return ["sudo ./instalar.sh planejar --json --nao-interativo"];
  }
  return comando === "situacao"
    ? ["sudo ./instalar.sh diagnosticar --json --nao-interativo"]
    : ["sudo ./instalar.sh situacao --json"];
}

// Monta o relatório somente leitura de situação da instalação.
export function montarSituacao(opcoes) {
  const deteccao = opcoes.deteccao;
  const estadoResultado = opcoes.estadoResultado ?? { presente: false };
  const executar = opcoes.executar ?? executarPadrao;
  const comandoExiste = opcoes.comandoExiste;
  const configuracao = opcoes.configuracao ?? {};
  const agora = opcoes.agora ?? agoraPadrao();
  const raiz = opcoes.raiz ?? "/";
  const verificacoes = [];
  const erros = [];
  const avisos = [...(deteccao?.avisos ?? []), ...(estadoResultado.avisos ?? [])];
  const estadoAtualizador = lerEstadoAtualizador({ raiz });
  const canalInfo = resumoCanal(estadoResultado, estadoAtualizador, configuracao, executar);

  if (estadoResultado.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "falha", {
        codigo: estadoResultado.erro.codigo,
        mensagem: estadoResultado.erro.message,
        dica: estadoResultado.erro.dica,
        comando: estadoResultado.erro.comando,
        documentacao: estadoResultado.erro.documentacao,
      }),
    });
  } else if (!estadoResultado.presente) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "aviso", {
        codigo: "A_SEM_INSTALACAO",
        mensagem: "Nenhuma instalação registrada foi encontrada.",
        dica: "Execute o planejamento antes de aplicar.",
        comando: "sudo ./instalar.sh planejar --json --nao-interativo",
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "ok", {
        mensagem: "O estado da instalação foi lido com sucesso.",
      }),
    });
  }

  const coleta = coletarContainers(deteccao, executar);
  if (coleta.erro) {
    const estadoEssencial = Boolean(estadoResultado.presente);
    const dadosDocker = estadoEssencial
      ? coleta.erro
      : {
          codigo: "A_DOCKER_AUSENTE",
          mensagem: coleta.erro.mensagem,
          dica: coleta.erro.dica,
          comando: coleta.erro.comando,
          documentacao: coleta.erro.documentacao,
        };
    registrar(verificacoes, erros, avisos, {
      ...verificacao("docker", "Docker", estadoEssencial ? "falha" : "aviso", dadosDocker),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("docker", "Docker", "ok", {
        mensagem: `Docker respondeu com ${coleta.containers.length} container(s).`,
      }),
    });
  }
  registrarCanal(verificacoes, erros, avisos, canalInfo, estadoAtualizador);
  const app = identificarAplicacao(coleta.containers);
  const banco = identificarBanco(coleta.containers);
  let saude = { estado: "aviso", codigo: "A_SEM_APLICACAO", mensagem: "Não verificada." };
  let bancoVerificado = { estado: "aviso", codigo: "A_SEM_BANCO", mensagem: "Não verificado." };
  if (!coleta.erro) {
    saude = verificarSaude(app, executar, estadoResultado.presente);
    registrar(verificacoes, erros, avisos, {
      ...verificacao(
        "saude",
        "Saúde da aplicação",
        saude.estado,
        saude.estado === "ok" ? { mensagem: saude.mensagem } : saude,
      ),
    });
    bancoVerificado = verificarBanco(banco, executar, estadoResultado.presente);
    registrar(verificacoes, erros, avisos, {
      ...verificacao(
        "banco",
        "Banco de dados",
        bancoVerificado.estado,
        bancoVerificado.estado === "ok" ? { mensagem: bancoVerificado.mensagem } : bancoVerificado,
      ),
    });
  }

  const controlador = verificarControlador(estadoResultado);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "controlador",
      "Controlador",
      controlador.estado,
      controlador.estado === "ok" ? { mensagem: controlador.mensagem } : controlador,
    ),
  });

  const timers = lerTimers(executar, comandoExiste);
  if (!timers.disponivel) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "aviso", {
        codigo: "A_TIMERS",
        mensagem: "O systemd não está disponível para consultar os timers.",
        dica: "Confira o agendador do perfil adotado.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else if (timers.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "aviso", {
        codigo: "A_TIMERS",
        mensagem: timers.erro,
        dica: "Confira o systemd e as units do FrequenciApp.",
        comando: "systemctl list-timers --all",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "ok", {
        mensagem: `${timers.quantidade} timer(s) encontrado(s).`,
      }),
    });
  }

  const backup = verificarBackup(estadoResultado.presente, raiz, agora);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "backup",
      "Backup",
      backup.estado,
      backup.estado === "ok" ? { mensagem: backup.mensagem } : backup,
    ),
  });

  const disco = lerDisco(raiz);
  if (disco) {
    if (disco.livreBytes < 2 * 1024 ** 3) {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "falha", {
          codigo: "E_VALIDACAO",
          mensagem: `O disco tem apenas ${disco.livreGiB} GiB livres.`,
          dica: "Libere espaço antes de continuar.",
          comando: "df -h /",
          documentacao: `${DOCUMENTACAO}#estado-durável`,
        }),
      });
    } else if (disco.livreBytes < 5 * 1024 ** 3) {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "aviso", {
          codigo: "A_DISCO",
          mensagem: `O disco tem ${disco.livreGiB} GiB livres.`,
          dica: "Acompanhe o espaço antes da próxima atualização.",
          comando: "df -h /",
          documentacao: `${DOCUMENTACAO}#estado-durável`,
        }),
      });
    } else {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "ok", {
          mensagem: `${disco.livreGiB} GiB livres de ${disco.totalGiB} GiB.`,
        }),
      });
    }
  }

  const detalhes = {
    estado: resumoEstado(estadoResultado),
    atualizador: estadoAtualizador.estado,
    canal: canalInfo,
    docker: resumoDocker(deteccao),
    containers: coleta.containers,
    saude,
    banco: bancoVerificado,
    timers,
    backup: backup.backup,
    disco,
  };
  const etapa = etapaSomenteLeitura("situacao", verificacoes, avisos, erros, detalhes, agora);
  return montarDocumento({
    comando: "situacao",
    configuracao: opcoes.configuracao,
    estado: estadoResultado.estado,
    deteccao,
    dryRun: Boolean(opcoes.dryRun),
    etapas: [etapa],
    avisos,
    erros,
    proximos: proximosLeitura(estadoResultado, erros, "situacao"),
  });
}

function verificarPacotes(auditoria) {
  if (!auditoria) {
    return {
      estado: "falha",
      codigo: "E_PACOTE",
      mensagem: "A auditoria de pacotes não pôde ser concluída.",
      dica: "Confira o gerenciador de pacotes do host.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  const pacotes = Array.isArray(auditoria.pacotes) ? auditoria.pacotes : [];
  const ausentes = pacotes
    .filter((pacote) => PACOTES_OBRIGATORIOS.has(pacote.pacote) && pacote.acao !== "nenhuma")
    .map((pacote) => pacote.nome);
  if (ausentes.length) {
    return {
      estado: "falha",
      codigo: "E_PACOTE",
      mensagem: `Pacotes obrigatórios ausentes ou desatualizados: ${ausentes.join(", ")}.`,
      dica: "Execute o planejamento para ver a ação de cada pacote.",
      comando: "sudo ./instalar.sh planejar --json --nao-interativo",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  const opcionais = pacotes
    .filter(
      (pacote) =>
        !PACOTES_OBRIGATORIOS.has(pacote.pacote) &&
        !["docker", "compose"].includes(pacote.pacote) &&
        pacote.acao !== "nenhuma",
    )
    .map((pacote) => pacote.nome);
  if (opcionais.length) {
    return {
      estado: "aviso",
      codigo: "A_PACOTE_OPCIONAL",
      mensagem: `Pacotes opcionais ausentes: ${opcionais.join(", ")}.`,
      dica: "Instale os pacotes exigidos pelo perfil de backup adotado.",
      comando: "sudo ./instalar.sh planejar --json --nao-interativo",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  return { estado: "ok", mensagem: "Os pacotes obrigatórios estão presentes.", comando: null };
}

function verificarDocker(deteccao) {
  const docker = deteccao?.docker ?? { presente: false, daemon: "ausente" };
  if (!docker.presente) {
    return {
      estado: "falha",
      codigo: "E_DOCKER",
      mensagem: "Docker não encontrado neste host.",
      dica: "Instale o Docker Engine e o plugin Compose.",
      comando: "sudo ./instalar.sh planejar --json --nao-interativo",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  if (docker.daemon !== "ativo") {
    const semPermissao = docker.daemon === "sem-permissao";
    return {
      estado: "falha",
      codigo: "E_DOCKER",
      mensagem: semPermissao
        ? "A conta atual não pode consultar o daemon do Docker."
        : docker.daemon === "parado"
          ? "O daemon do Docker não está ativo."
          : "O daemon do Docker não respondeu.",
      dica: semPermissao
        ? "Use uma conta com acesso ao daemon do Docker."
        : "Inicie o serviço do Docker e repita o diagnóstico.",
      comando: semPermissao ? null : "sudo systemctl start docker",
      documentacao: `${DOCUMENTACAO}#segurança`,
    };
  }
  if (!docker.composePresente) {
    return {
      estado: "falha",
      codigo: "E_COMPOSE",
      mensagem: "Docker Compose não encontrado.",
      dica: "Instale o plugin Docker Compose 2.24 ou superior.",
      comando: "docker compose version",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  if (!docker.composeSuficiente) {
    return {
      estado: "falha",
      codigo: "E_COMPOSE",
      mensagem: `Docker Compose ${docker.composeVersao} está abaixo da versão mínima 2.24.`,
      dica: "Atualize o plugin Docker Compose.",
      comando: "docker compose version",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
    };
  }
  return {
    estado: "ok",
    mensagem: `Docker ${docker.versao} e Compose ${docker.composeVersao} estão disponíveis.`,
    comando: null,
  };
}

function verificarPortas(estadoPresente, executar, comandoExiste) {
  if (typeof comandoExiste !== "function" || !comandoExiste("ss")) {
    return {
      estado: "aviso",
      codigo: "A_PORTAS",
      mensagem: "O comando ss não está disponível para conferir as portas.",
      dica: "Confira as portas 80 e 443 com a ferramenta do host.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  const resultado = executar("ss", ["-ltn"]);
  if (resultado.status !== 0) {
    return {
      estado: "aviso",
      codigo: "A_PORTAS",
      mensagem: "Não foi possível consultar as portas em escuta.",
      dica: "Confira o comando ss e a permissão da conta.",
      comando: "ss -ltn",
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  const texto = String(resultado.stdout ?? "");
  const ocupadas = ["80", "443"].filter((porta) => new RegExp(`[:.]${porta}(?:\\s|$)`).test(texto));
  if (!estadoPresente && ocupadas.length) {
    return {
      estado: "aviso",
      codigo: "A_PORTA_OCUPADA",
      mensagem: `As portas ${ocupadas.join(" e ")} já estão em uso antes da instalação.`,
      dica: "Confira qual processo ocupa as portas públicas.",
      comando: "ss -ltn",
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  if (estadoPresente && ocupadas.length === 0) {
    return {
      estado: "aviso",
      codigo: "A_PORTA_FECHADA",
      mensagem: "As portas 80 e 443 não estão em escuta.",
      dica: "Confira o proxy e a pilha do Compose.",
      comando: "ss -ltn",
      documentacao: `${DOCUMENTACAO}#situacao`,
    };
  }
  return {
    estado: "ok",
    mensagem: ocupadas.length
      ? `As portas ${ocupadas.join(" e ")} estão em escuta.`
      : "As portas 80 e 443 estão livres.",
    comando: null,
  };
}

function verificarDns(configuracao, executar, comandoExiste) {
  const dominio = configuracao?.dominio;
  if (!dominio) {
    return {
      estado: "aviso",
      codigo: "A_DNS",
      mensagem: "Nenhum domínio foi configurado para conferir o DNS.",
      dica: "Informe --dominio para habilitar a verificação.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  if (typeof comandoExiste !== "function" || !comandoExiste("getent")) {
    return {
      estado: "aviso",
      codigo: "A_DNS",
      mensagem: "O comando getent não está disponível para conferir o DNS.",
      dica: "Confira o registro DNS do domínio no provedor.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  const resultado = executar("getent", ["ahosts", dominio]);
  if (resultado.status !== 0 || !String(resultado.stdout ?? "").trim()) {
    return {
      estado: "falha",
      codigo: "E_REDE",
      mensagem: `O domínio ${dominio} não resolveu para um endereço.`,
      dica: "Confira o registro DNS e a propagação.",
      comando: `getent ahosts ${dominio}`,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  return { estado: "ok", mensagem: `O domínio ${dominio} resolveu.`, comando: null };
}

function verificarTls(configuracao, estadoPresente, executar, comandoExiste) {
  const dominio = configuracao?.dominio;
  if (!estadoPresente || configuracao?.tls !== "acme" || !dominio) {
    return {
      estado: "ok",
      mensagem: "A verificação TLS público não se aplica a este estado.",
      comando: null,
    };
  }
  if (typeof comandoExiste !== "function" || !comandoExiste("openssl")) {
    return {
      estado: "aviso",
      codigo: "A_TLS",
      mensagem: "O comando openssl não está disponível para conferir o TLS.",
      dica: "Confira o certificado no proxy.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  const resultado = executar(
    "openssl",
    ["s_client", "-connect", `${dominio}:443`, "-servername", dominio, "-verify_return_error"],
    { input: "Q\n", timeout: 10000 },
  );
  if (resultado.status !== 0) {
    return {
      estado: "falha",
      codigo: "E_REDE",
      mensagem: `O TLS de ${dominio} não respondeu com certificado válido.`,
      dica: "Confira o proxy, o certificado e as portas públicas.",
      comando: `openssl s_client -connect ${dominio}:443 -servername ${dominio}`,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  return { estado: "ok", mensagem: `O TLS de ${dominio} respondeu.`, comando: null };
}

function verificarRelogio(configuracao, executar, comandoExiste) {
  if (typeof comandoExiste !== "function" || !comandoExiste("timedatectl")) {
    return {
      estado: "aviso",
      codigo: "A_RELOGIO",
      mensagem: "O comando timedatectl não está disponível para conferir relógio e fuso.",
      dica: "Confira o relógio e o fuso do host.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  const resultado = executar("timedatectl", [
    "show",
    "--property=NTPSynchronized",
    "--property=Timezone",
  ]);
  if (resultado.status !== 0) {
    return {
      estado: "aviso",
      codigo: "A_RELOGIO",
      mensagem: "Não foi possível consultar relógio e fuso do host.",
      dica: "Confira o timedatectl e o serviço de sincronização.",
      comando: "timedatectl show",
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  const texto = String(resultado.stdout ?? "");
  const sincronizado = /NTPSynchronized=yes/i.test(texto);
  const fuso = /Timezone=(.+)/i.exec(texto)?.[1]?.trim() ?? "";
  if (!sincronizado) {
    return {
      estado: "aviso",
      codigo: "A_RELOGIO",
      mensagem: "O relógio do host não está sincronizado.",
      dica: "Ative a sincronização de horário do sistema.",
      comando: "timedatectl set-ntp true",
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  if (fuso && configuracao?.fuso && fuso !== configuracao.fuso) {
    return {
      estado: "aviso",
      codigo: "A_FUSO",
      mensagem: `O fuso do host é ${fuso}, diferente de ${configuracao.fuso}.`,
      dica: "Ajuste o fuso do host ou a configuração do instalador.",
      comando: "timedatectl show --property=Timezone",
      documentacao: `${DOCUMENTACAO}#flags`,
    };
  }
  return {
    estado: "ok",
    mensagem: `Relógio sincronizado no fuso ${fuso || "do host"}.`,
    comando: null,
  };
}

function verificarControlador(estadoResultado) {
  const controlador = estadoResultado?.estado?.controlador;
  if (!controlador?.adotado) {
    return { estado: "ok", mensagem: "O controlador não foi adotado.", comando: null };
  }
  if (controlador.readocaoPendente) {
    return {
      estado: "falha",
      codigo: "E_CONTROLADOR",
      mensagem: "O controlador exige readoção depois da troca de canal.",
      dica: "Revise o journal e os pins antes de reativar o controlador.",
      comando: "sudo ./instalar.sh aplicar --perfil controlador --sim",
      documentacao: `${DOCUMENTACAO}#controlador`,
    };
  }
  if (!controlador.migradorSha256) {
    return {
      estado: "aviso",
      codigo: "A_CONTROLADOR",
      mensagem: "O controlador está adotado sem hash do migrador registrado.",
      dica: "Confira o marcador do controlador e o estado da instalação.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#controlador`,
    };
  }
  return { estado: "ok", mensagem: "O controlador está adotado e estável.", comando: null };
}

const FERRAMENTAS_POSTGRES = ["psql", "pg_dump", "pg_restore"];

function verificarMigracoes(app, executar) {
  if (!app) {
    return {
      estado: "aviso",
      codigo: "A_MIGRACOES",
      mensagem: "O status das migrações não foi verificado sem o container da aplicação.",
      dica: "Confira o container da aplicação e repita o diagnóstico.",
      comando: "docker ps",
      documentacao: `${DOCUMENTACAO}#situacao`,
      detalhes: { verificavel: false, estado: "nao-verificado" },
    };
  }
  const resultado = executar(
    "docker",
    ["exec", app.nome, "./node_modules/.bin/prisma", "migrate", "status"],
    { timeout: 30000 },
  );
  const texto = `${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}`;
  const falha =
    /P3009|P3018|failed migration|migration .* failed|migrate found failed|failed to apply/i.test(
      texto,
    );
  const pendente = /not yet been applied|following migrations?/i.test(texto);
  const atualizado = /no pending migrations|database schema is up to date|already in sync/i.test(
    texto,
  );
  const comando = `docker exec ${app.nome} ./node_modules/.bin/prisma migrate status`;
  if (falha) {
    return {
      estado: "falha",
      codigo: "E_SAUDE",
      mensagem: "Há migração do Prisma com falha.",
      dica: "Confira o log da migração e o banco antes de repetir.",
      comando,
      documentacao: `${DOCUMENTACAO}#situacao`,
      detalhes: { verificavel: true, estado: "falha" },
    };
  }
  if (atualizado) {
    return {
      estado: "ok",
      mensagem: "O schema do banco está atualizado.",
      detalhes: { verificavel: true, estado: "atualizado" },
    };
  }
  if (pendente) {
    return {
      estado: "falha",
      codigo: "E_SAUDE",
      mensagem: "Há migrações do Prisma pendentes.",
      dica: "Aplique as migrações pelo fluxo de implantação e confira a saúde.",
      comando,
      documentacao: `${DOCUMENTACAO}#situacao`,
      detalhes: { verificavel: true, estado: "pendente" },
    };
  }
  if (resultado.status === 0) {
    return {
      estado: "aviso",
      codigo: "A_MIGRACOES",
      mensagem: "O status das migrações foi consultado, mas não foi possível interpretar a saída.",
      dica: "Confira o comando de migração no container da aplicação.",
      comando,
      documentacao: `${DOCUMENTACAO}#situacao`,
      detalhes: { verificavel: true, estado: "indefinido" },
    };
  }
  if (resultado.status === 127 || /not found|no such file|executable file not found/i.test(texto)) {
    return {
      estado: "aviso",
      codigo: "A_MIGRACOES",
      mensagem: "O Prisma CLI não foi encontrado no container da aplicação.",
      dica: "Confira a imagem e o diretório node_modules do container.",
      comando,
      documentacao: `${DOCUMENTACAO}#situacao`,
      detalhes: { verificavel: true, estado: "cli-ausente" },
    };
  }
  return {
    estado: "aviso",
    codigo: "A_MIGRACOES",
    mensagem: "Não foi possível consultar o status das migrações.",
    dica: "Confira o banco e o Prisma no container da aplicação.",
    comando,
    documentacao: `${DOCUMENTACAO}#situacao`,
    detalhes: { verificavel: true, estado: "indisponivel" },
  };
}

function verificarJournal(executar, comandoExiste) {
  if (typeof comandoExiste !== "function" || !comandoExiste("journalctl")) {
    return {
      estado: "aviso",
      codigo: "A_JOURNAL",
      mensagem: "O journalctl não está disponível neste host.",
      dica: "Confira o systemd e o serviço systemd-journald.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#agendador`,
      detalhes: { disponivel: false, acessivel: false },
    };
  }
  const resultado = executar("journalctl", ["--no-pager", "-n", "0", "-q"], { timeout: 10000 });
  if (resultado.status === 0) {
    return {
      estado: "ok",
      mensagem: "O journal está acessível.",
      detalhes: { disponivel: true, acessivel: true },
    };
  }
  return {
    estado: "aviso",
    codigo: "A_JOURNAL",
    mensagem: "O journal não está acessível para a conta atual.",
    dica: "Confira o systemd-journald e a permissão da conta.",
    comando: "journalctl --no-pager -n 0",
    documentacao: `${DOCUMENTACAO}#agendador`,
    detalhes: { disponivel: true, acessivel: false },
  };
}

function lerCron(executar, comandoExiste) {
  if (typeof comandoExiste !== "function" || !comandoExiste("crontab")) {
    return { disponivel: false, linhas: 0, erro: null };
  }
  const resultado = executar("crontab", ["-l"], { timeout: 10000 });
  const stderr = String(resultado.stderr ?? "");
  if (resultado.status !== 0) {
    const semCrontab = /no crontab|no crontab for/i.test(stderr);
    return {
      disponivel: true,
      linhas: 0,
      erro: semCrontab ? null : "Não foi possível ler o crontab.",
    };
  }
  const linhas = String(resultado.stdout ?? "")
    .split(/\r?\n/)
    .filter((linha) =>
      /frequenciapp|backup-banco|backup-planilhas|renovar-certificado|instalar-rotinas|agenda\.sh/i.test(
        linha,
      ),
    ).length;
  return { disponivel: true, linhas, erro: null };
}

function verificarFerramentasPostgres(configuracao, executar, comandoExiste) {
  if (configuracao?.modoBackup !== "url") return null;
  const versoes = {};
  const problemas = [];
  for (const nome of FERRAMENTAS_POSTGRES) {
    if (typeof comandoExiste !== "function" || !comandoExiste(nome)) {
      problemas.push(`${nome} ausente`);
      continue;
    }
    const resultado = executar(nome, ["--version"], { timeout: 10000 });
    const texto = `${resultado.stdout ?? ""}\n${resultado.stderr ?? ""}`;
    const combinacao = /(\d+)\.(\d+)/.exec(texto);
    if (resultado.status !== 0 || !combinacao) {
      problemas.push(`${nome} sem versão reconhecida`);
      continue;
    }
    const versao = `${combinacao[1]}.${combinacao[2]}`;
    versoes[nome] = versao;
    if (Number(combinacao[1]) < 17) problemas.push(`${nome} ${versao} abaixo de 17`);
  }
  if (problemas.length) {
    return {
      estado: "falha",
      codigo: "E_BACKUP",
      mensagem: `Ferramentas do modo URL com problema: ${problemas.join("; ")}.`,
      dica: "Instale o cliente PostgreSQL 17 e repita o diagnóstico.",
      comando: "psql --version",
      documentacao: `${DOCUMENTACAO}#auditoria-de-pacotes`,
      detalhes: { modo: "url", versoes, problemas },
    };
  }
  return {
    estado: "ok",
    mensagem: "psql, pg_dump e pg_restore 17 estão disponíveis.",
    detalhes: { modo: "url", versoes, problemas: [] },
  };
}

function verificarRclone(configuracao, comandoExiste) {
  const destino = configuracao?.destino || process.env.BACKUP_REMOTO || "";
  const caminho = configuracao?.configRclone || process.env.BACKUP_RCLONE_CONFIG || "";
  if (!destino && !caminho) return null;
  const dados = {
    configurado: true,
    destino: Boolean(destino),
    caminho,
    presente: false,
    modo: null,
    seguro: false,
  };
  const problemas = [];
  if (typeof comandoExiste !== "function" || !comandoExiste("rclone")) {
    problemas.push("rclone ausente");
  }
  if (!caminho) {
    problemas.push("caminho do rclone.conf ausente");
  } else {
    try {
      const informacao = fs.lstatSync(caminho);
      dados.presente = true;
      if (informacao.isSymbolicLink() || !informacao.isFile()) {
        problemas.push("rclone.conf não é arquivo regular");
      } else {
        dados.modo = (informacao.mode & 0o777).toString(8).padStart(3, "0");
        dados.seguro = (informacao.mode & 0o077) === 0;
      }
    } catch {
      problemas.push("rclone.conf não encontrado");
    }
  }
  if (problemas.length) {
    return {
      estado: "falha",
      codigo: "E_BACKUP",
      mensagem: `Backup remoto com problema: ${problemas.join("; ")}.`,
      dica: "Confira o rclone e o arquivo de configuração com modo 600.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#backup`,
      detalhes: dados,
    };
  }
  if (!dados.seguro) {
    return {
      estado: "aviso",
      codigo: "A_RCLONE_PERMISSAO",
      mensagem: "O rclone.conf tem permissão mais ampla que 600.",
      dica: "Ajuste o modo do arquivo para 600.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#segurança`,
      detalhes: dados,
    };
  }
  return {
    estado: "ok",
    mensagem: "O rclone.conf existe com modo 600.",
    detalhes: dados,
  };
}

function verificarDropbox(configuracao) {
  const caminho = configuracao?.configDropbox || process.env.BACKUP_DROPBOX_CONFIG || "";
  const perfil = configuracao?.perfil;
  const perfilDropbox = perfil === "dropbox" || perfil === "completo";
  if (!caminho && !perfilDropbox) return null;
  const dados = {
    configurado: Boolean(caminho),
    perfil,
    adotado: perfilDropbox,
    caminho,
    presente: false,
    modo: null,
    seguro: false,
    comToken: Boolean(configuracao?.arquivoTokenDropbox),
  };
  const problemas = [];
  const avisos = [];
  if (!caminho) {
    problemas.push("configuração Dropbox ausente");
  } else {
    try {
      const informacao = fs.lstatSync(caminho);
      dados.presente = true;
      if (informacao.isSymbolicLink() || (!informacao.isFile() && !informacao.isDirectory())) {
        problemas.push("configuração Dropbox não é arquivo ou diretório");
      } else {
        dados.modo = (informacao.mode & 0o777).toString(8).padStart(3, "0");
        dados.seguro = (informacao.mode & 0o077) === 0;
      }
    } catch {
      problemas.push("configuração Dropbox não encontrada");
    }
  }
  const token = configuracao?.arquivoTokenDropbox;
  if (token) {
    try {
      const informacao = fs.lstatSync(token);
      if (informacao.isSymbolicLink() || !informacao.isFile()) {
        problemas.push("arquivo de token Dropbox inválido");
      } else if ((informacao.mode & 0o077) !== 0) {
        avisos.push("A_DROPBOX_PERMISSAO");
      }
    } catch {
      problemas.push("arquivo de token Dropbox não encontrado");
    }
  } else if (perfilDropbox) {
    avisos.push("A_DROPBOX_TOKEN");
  }
  if (problemas.length) {
    return {
      estado: "falha",
      codigo: "E_DROPBOX",
      mensagem: `Configuração Dropbox com problema: ${problemas.join("; ")}.`,
      dica: "Confira o caminho, o token e o perfil Dropbox.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#perfis`,
      detalhes: dados,
    };
  }
  if (!perfilDropbox) {
    return {
      estado: "aviso",
      codigo: "A_DROPBOX_ADOCAO",
      mensagem: "Há configuração Dropbox sem o perfil Dropbox adotado.",
      dica: "Use --perfil dropbox ou --perfil completo, ou remova a configuração.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#perfis`,
      detalhes: dados,
    };
  }
  if (!dados.seguro) {
    return {
      estado: "aviso",
      codigo: "A_DROPBOX_PERMISSAO",
      mensagem: "A configuração Dropbox tem permissão mais ampla que 600.",
      dica: "Ajuste o modo do arquivo para 600.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#segurança`,
      detalhes: dados,
    };
  }
  if (avisos.includes("A_DROPBOX_PERMISSAO")) {
    return {
      estado: "aviso",
      codigo: "A_DROPBOX_PERMISSAO",
      mensagem: "O arquivo de token Dropbox tem permissão mais ampla que 600.",
      dica: "Ajuste o modo do arquivo para 600.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#segurança`,
      detalhes: dados,
    };
  }
  if (avisos.includes("A_DROPBOX_TOKEN")) {
    return {
      estado: "aviso",
      codigo: "A_DROPBOX_TOKEN",
      mensagem: "O perfil Dropbox não informa arquivo de token.",
      dica: "Informe --arquivo-token-dropbox ou confira a configuração.",
      comando: null,
      documentacao: `${DOCUMENTACAO}#flags`,
      detalhes: dados,
    };
  }
  return {
    estado: "ok",
    mensagem: "O perfil Dropbox está adotado com configuração presente.",
    detalhes: dados,
  };
}

// Monta o diagnóstico somente leitura de dependências, rede, banco e backup.
export function montarDiagnostico(opcoes) {
  const deteccao = opcoes.deteccao;
  const estadoResultado = opcoes.estadoResultado ?? { presente: false };
  const auditoria = opcoes.auditoria ?? null;
  const executar = opcoes.executar ?? executarPadrao;
  const comandoExiste = opcoes.comandoExiste;
  const configuracao = opcoes.configuracao ?? {};
  const agora = opcoes.agora ?? agoraPadrao();
  const raiz = opcoes.raiz ?? "/";
  const verificacoes = [];
  const erros = [];
  const avisos = [...(deteccao?.avisos ?? []), ...(estadoResultado.avisos ?? [])];
  const estadoAtualizador = lerEstadoAtualizador({ raiz });
  const canalInfo = resumoCanal(estadoResultado, estadoAtualizador, configuracao, executar);

  if (deteccao?.tier === 3) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("distro", "Distribuição", "falha", erroDistro(deteccao)),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("distro", "Distribuição", "ok", {
        mensagem: `${deteccao?.distro ?? "desconhecida"} ${
          deteccao?.versaoDistro ?? ""
        } no Tier ${deteccao?.tier ?? 3}.`.trim(),
      }),
    });
  }

  const pacotes = verificarPacotes(auditoria);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "pacotes",
      "Pacotes e dependências",
      pacotes.estado,
      pacotes.estado === "ok" ? { mensagem: pacotes.mensagem } : pacotes,
    ),
  });

  const ferramentasPostgres = verificarFerramentasPostgres(configuracao, executar, comandoExiste);
  if (ferramentasPostgres) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao(
        "ferramentas-postgres",
        "Ferramentas PostgreSQL do modo URL",
        ferramentasPostgres.estado,
        ferramentasPostgres.estado === "ok"
          ? { mensagem: ferramentasPostgres.mensagem }
          : ferramentasPostgres,
      ),
    });
  }

  const docker = verificarDocker(deteccao);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "docker",
      "Docker e Compose",
      docker.estado,
      docker.estado === "ok" ? { mensagem: docker.mensagem } : docker,
    ),
  });

  let coleta = { erro: null, containers: [] };
  let saude = { estado: "aviso", codigo: "A_SEM_APLICACAO", mensagem: "Não verificada." };
  let bancoVerificado = { estado: "aviso", codigo: "A_SEM_BANCO", mensagem: "Não verificado." };
  let migracoes = {
    estado: "aviso",
    codigo: "A_MIGRACOES",
    mensagem: "Status das migrações não verificado.",
    detalhes: { verificavel: false, estado: "nao-verificado" },
  };
  if (docker.estado !== "ok") {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("containers", "Containers", "aviso", {
        codigo: "A_CONTAINERS",
        mensagem: "Os containers não foram consultados porque o Docker não está disponível.",
        dica: "Corrija o Docker e repita o diagnóstico.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#situacao`,
      }),
    });
  } else {
    coleta = coletarContainers(deteccao, executar);
    if (coleta.erro) {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("containers", "Containers", "falha", coleta.erro),
      });
    } else {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("containers", "Containers", "ok", {
          mensagem: `${coleta.containers.length} container(s) em execução.`,
        }),
      });
      const app = identificarAplicacao(coleta.containers);
      const banco = identificarBanco(coleta.containers);
      saude = verificarSaude(app, executar, estadoResultado.presente);
      registrar(verificacoes, erros, avisos, {
        ...verificacao(
          "saude",
          "Saúde da aplicação",
          saude.estado,
          saude.estado === "ok" ? { mensagem: saude.mensagem } : saude,
        ),
      });
      bancoVerificado = verificarBanco(banco, executar, estadoResultado.presente);
      registrar(verificacoes, erros, avisos, {
        ...verificacao(
          "banco",
          "Banco de dados",
          bancoVerificado.estado,
          bancoVerificado.estado === "ok"
            ? { mensagem: bancoVerificado.mensagem }
            : bancoVerificado,
        ),
      });
      migracoes = verificarMigracoes(app, executar);
      registrar(verificacoes, erros, avisos, {
        ...verificacao(
          "migracoes",
          "Migrações do Prisma",
          migracoes.estado,
          migracoes.estado === "ok" ? { mensagem: migracoes.mensagem } : migracoes,
        ),
      });
    }
  }

  registrarCanal(verificacoes, erros, avisos, canalInfo, estadoAtualizador);

  if (estadoResultado.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "falha", {
        codigo: estadoResultado.erro.codigo,
        mensagem: estadoResultado.erro.message,
        dica: estadoResultado.erro.dica,
        comando: estadoResultado.erro.comando,
        documentacao: estadoResultado.erro.documentacao,
      }),
    });
  } else if (!estadoResultado.presente) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "aviso", {
        codigo: "A_SEM_INSTALACAO",
        mensagem: "Nenhuma instalação registrada foi encontrada.",
        dica: "Execute o planejamento antes de aplicar.",
        comando: "sudo ./instalar.sh planejar --json --nao-interativo",
        documentacao: `${DOCUMENTACAO}#estado-durável`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("estado", "Estado da instalação", "ok", {
        mensagem: "O estado da instalação foi lido com sucesso.",
      }),
    });
  }

  const portas = verificarPortas(estadoResultado.presente, executar, comandoExiste);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "portas",
      "Portas públicas",
      portas.estado,
      portas.estado === "ok" ? { mensagem: portas.mensagem } : portas,
    ),
  });
  const dns = verificarDns(configuracao, executar, comandoExiste);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "dns",
      "DNS",
      dns.estado,
      dns.estado === "ok" ? { mensagem: dns.mensagem } : dns,
    ),
  });
  const tls = verificarTls(configuracao, estadoResultado.presente, executar, comandoExiste);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "tls",
      "TLS",
      tls.estado,
      tls.estado === "ok" ? { mensagem: tls.mensagem } : tls,
    ),
  });
  const relogio = verificarRelogio(configuracao, executar, comandoExiste);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "relogio",
      "Relógio e fuso",
      relogio.estado,
      relogio.estado === "ok" ? { mensagem: relogio.mensagem } : relogio,
    ),
  });

  const disco = lerDisco(raiz);
  if (disco) {
    if (disco.livreBytes < 2 * 1024 ** 3) {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "falha", {
          codigo: "E_VALIDACAO",
          mensagem: `O disco tem apenas ${disco.livreGiB} GiB livres.`,
          dica: "Libere espaço antes de continuar.",
          comando: "df -h /",
          documentacao: `${DOCUMENTACAO}#estado-durável`,
        }),
      });
    } else if (disco.livreBytes < 5 * 1024 ** 3) {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "aviso", {
          codigo: "A_DISCO",
          mensagem: `O disco tem ${disco.livreGiB} GiB livres.`,
          dica: "Acompanhe o espaço antes da próxima atualização.",
          comando: "df -h /",
          documentacao: `${DOCUMENTACAO}#estado-durável`,
        }),
      });
    } else {
      registrar(verificacoes, erros, avisos, {
        ...verificacao("disco", "Espaço em disco", "ok", {
          mensagem: `${disco.livreGiB} GiB livres de ${disco.totalGiB} GiB.`,
        }),
      });
    }
  }
  const memoriaTotal = os.totalmem();
  if (memoriaTotal < 2 * 1024 ** 3) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("memoria", "Memória", "aviso", {
        codigo: "A_MEMORIA",
        mensagem: `O host tem ${(memoriaTotal / 1024 ** 3).toFixed(1)} GiB de memória.`,
        dica: "Confira o consumo da pilha e o limite do host.",
        comando: "free -h",
        documentacao: `${DOCUMENTACAO}#situacao`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("memoria", "Memória", "ok", {
        mensagem: `${(memoriaTotal / 1024 ** 3).toFixed(1)} GiB de memória.`,
      }),
    });
  }

  const firewall = verificacao("firewall", "Firewall", "ok", {
    mensagem: `Firewall detectado: ${deteccao?.firewall ?? "nenhum"}.`,
  });
  registrar(verificacoes, erros, avisos, firewall);
  const selinux = verificacao("selinux", "SELinux", "ok", {
    mensagem: `SELinux: ${deteccao?.selinux ?? "ausente"}.`,
  });
  registrar(verificacoes, erros, avisos, selinux);
  const apparmor = verificacao("apparmor", "AppArmor", "ok", {
    mensagem: `AppArmor: ${deteccao?.apparmor ?? "ausente"}.`,
  });
  registrar(verificacoes, erros, avisos, apparmor);

  const controlador = verificarControlador(estadoResultado);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "controlador",
      "Controlador",
      controlador.estado,
      controlador.estado === "ok" ? { mensagem: controlador.mensagem } : controlador,
    ),
  });

  const backup = verificarBackup(estadoResultado.presente, raiz, agora);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "backup",
      "Backup",
      backup.estado,
      backup.estado === "ok" ? { mensagem: backup.mensagem } : backup,
    ),
  });

  const rclone = verificarRclone(configuracao, comandoExiste);
  if (rclone) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao(
        "rclone",
        "Configuração do rclone",
        rclone.estado,
        rclone.estado === "ok" ? { mensagem: rclone.mensagem } : rclone,
      ),
    });
  }

  const dropbox = verificarDropbox(configuracao);
  if (dropbox) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao(
        "dropbox",
        "Adoção do Dropbox",
        dropbox.estado,
        dropbox.estado === "ok" ? { mensagem: dropbox.mensagem } : dropbox,
      ),
    });
  }

  const timers = lerTimers(executar, comandoExiste);
  if (!timers.disponivel) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "aviso", {
        codigo: "A_TIMERS",
        mensagem: "O systemd não está disponível para consultar os timers.",
        dica: "Confira o agendador do perfil adotado.",
        comando: null,
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else if (timers.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "aviso", {
        codigo: "A_TIMERS",
        mensagem: timers.erro,
        dica: "Confira o systemd e as units do FrequenciApp.",
        comando: "systemctl list-timers --all",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("timers", "Agendador", "ok", {
        mensagem: `${timers.quantidade} timer(s) encontrado(s).`,
      }),
    });
  }

  const journal = verificarJournal(executar, comandoExiste);
  registrar(verificacoes, erros, avisos, {
    ...verificacao(
      "journal",
      "Journal do systemd",
      journal.estado,
      journal.estado === "ok" ? { mensagem: journal.mensagem } : journal,
    ),
  });

  const cron = lerCron(executar, comandoExiste);
  const timersAtivos = timers.disponivel && timers.quantidade > 0;
  if (cron.erro) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("cron", "Linhas de cron", "aviso", {
        codigo: "A_CRON",
        mensagem: cron.erro,
        dica: "Confira o crontab da conta de implantação.",
        comando: "crontab -l",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else if (cron.linhas > 0) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("cron", "Linhas de cron", "ok", {
        mensagem: `${cron.linhas} linha(s) de cron do FrequenciApp encontrada(s).`,
      }),
    });
  } else if (timersAtivos) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("cron", "Linhas de cron", "ok", {
        mensagem: "Nenhuma linha de cron; os timers do systemd estão ativos.",
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("cron", "Linhas de cron", "aviso", {
        codigo: "A_CRON",
        mensagem: "Nenhuma linha de cron do FrequenciApp foi encontrada.",
        dica: "Confira o agendador do perfil adotado.",
        comando: "crontab -l",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  }

  const agendadorAtivo = timersAtivos ? "systemd" : cron.linhas > 0 ? "cron" : "nenhum";
  const agendadorEsperado = configuracao?.agendador ?? "auto";
  const agendador = {
    esperado: agendadorEsperado,
    ativo: agendadorAtivo,
    timers: timers.quantidade,
    linhasCron: cron.linhas,
  };
  if (agendadorAtivo === "nenhum") {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("agendador", "Agendador ativo", "aviso", {
        codigo: "A_AGENDADOR",
        mensagem: "Nenhum agendador do FrequenciApp está ativo.",
        dica: "Confira os timers do systemd e as linhas de cron.",
        comando: "systemctl list-timers --all",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else if (agendadorEsperado !== "auto" && agendadorEsperado !== agendadorAtivo) {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("agendador", "Agendador ativo", "aviso", {
        codigo: "A_AGENDADOR_DIVERGENTE",
        mensagem: `O agendador ativo é ${agendadorAtivo}, diferente de ${agendadorEsperado}.`,
        dica: "Ajuste a configuração do agendador ou a instalação das rotinas.",
        comando: "systemctl list-timers --all",
        documentacao: `${DOCUMENTACAO}#agendador`,
      }),
    });
  } else {
    registrar(verificacoes, erros, avisos, {
      ...verificacao("agendador", "Agendador ativo", "ok", {
        mensagem: `Agendador ativo: ${agendadorAtivo}.`,
      }),
    });
  }

  const detalhes = {
    estado: resumoEstado(estadoResultado),
    atualizador: estadoAtualizador.estado,
    canal: canalInfo,
    docker: resumoDocker(deteccao),
    containers: coleta.containers,
    saude,
    banco: bancoVerificado,
    migracoes: migracoes.detalhes,
    timers,
    journal,
    cron,
    agendador,
    ferramentasPostgres: ferramentasPostgres?.detalhes ?? {
      modo: configuracao?.modoBackup ?? "compose",
      verificavel: false,
    },
    configuracaoRclone: rclone?.detalhes ?? null,
    adocaoDropbox: dropbox?.detalhes ?? null,
    backup: backup.backup,
    disco,
    memoria: { totalBytes: memoriaTotal },
    firewall: deteccao?.firewall ?? "nenhum",
    selinux: deteccao?.selinux ?? "ausente",
    apparmor: deteccao?.apparmor ?? "ausente",
  };
  priorizarErro(erros, estadoResultado.erro);
  const etapa = etapaSomenteLeitura("diagnostico", verificacoes, avisos, erros, detalhes, agora);
  return montarDocumento({
    comando: "diagnosticar",
    configuracao,
    estado: estadoResultado.estado,
    deteccao,
    dryRun: Boolean(opcoes.dryRun),
    etapas: [etapa],
    avisos,
    erros,
    proximos: proximosLeitura(estadoResultado, erros, "diagnosticar"),
  });
}

export { SCHEMA_SAIDA, SCHEMA_ESTADO, codigoSaida };
