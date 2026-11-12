// Etapa de preflight: revalida o plano, o estado e os pré-requisitos antes de mutar o host.
import { erroUso, erroValidacao } from "../json.mjs";
import { acao, avisoEtapa, falha } from "./contexto.mjs";

export const id = "preflight";
export const titulo = "Confere distro, arquitetura, dependências, estado e portas";
export const limiteSegundos = 300;

function estadoDivergente(estado, configuracao) {
  if (!estado) return null;
  const campos = ["perfil", "canal", "tag", "commit", "imagem", "digest"];
  for (const campo of campos) {
    const desejado = String(configuracao[campo] ?? "");
    const atual = String(estado[campo] ?? "");
    if (desejado && atual && desejado !== atual) {
      return `O estado registra ${campo}=${atual}, diferente do plano ${desejado}.`;
    }
  }
  const origemAtual = estado.origem?.diretorioFonte;
  const origemDesejada = configuracao.diretorioFonte;
  if (origemAtual && origemDesejada && origemAtual !== origemDesejada) {
    return "O diretório de origem diverge do estado da instalação.";
  }
  return null;
}

function verificarPortas(ctx, estadoPresente) {
  if (typeof ctx.comandoExiste !== "function" || !ctx.comandoExiste("ss")) {
    return {
      avisos: [
        avisoEtapa(
          "A_PORTAS",
          "O comando ss não está disponível; as portas 80 e 443 não foram conferidas.",
        ),
      ],
      ocupadas: [],
      verificado: false,
    };
  }
  const resultado = ctx.executar("ss", ["-ltn"], { timeout: 10000 });
  if (resultado.status !== 0) {
    return {
      avisos: [avisoEtapa("A_PORTAS", "Não foi possível conferir as portas 80 e 443.")],
      ocupadas: [],
      verificado: false,
    };
  }
  const texto = String(resultado.stdout ?? "");
  const ocupadas = ["80", "443"].filter((porta) => new RegExp(`[:.]${porta}(?:\\s|$)`).test(texto));
  if (ocupadas.length && !estadoPresente) {
    throw falha(
      "E_REDE",
      `As portas ${ocupadas.join(" e ")} já estão em uso antes da instalação.`,
      {
        dica: "Libere as portas 80 e 443 ou remova o serviço que as ocupa.",
        documentacao: "docs/instalador.md#aplicar",
      },
    );
  }
  return { avisos: [], ocupadas, verificado: true };
}

export function executar(ctx) {
  const configuracao = ctx.configuracao;
  const deteccao = ctx.deteccao;
  const estadoResultado = ctx.estadoResultado ?? { presente: false, estado: null, avisos: [] };
  const acoes = [];
  const avisos = [...(estadoResultado.avisos ?? [])];

  if (!["simples", "controlador", "dropbox", "completo"].includes(configuracao.perfil)) {
    throw erroUso("O perfil informado não é reconhecido.", {
      dica: "Use simples, controlador, dropbox ou completo.",
      documentacao: "docs/instalador.md#perfis",
    });
  }
  const comControlador = ["controlador", "completo"].includes(configuracao.perfil);
  const comDropbox = ["dropbox", "completo"].includes(configuracao.perfil);
  if (comControlador && !configuracao.operadorControlador) {
    throw erroUso("O perfil com controlador exige uma conta de operação.", {
      dica: "Informe --operador-controlador com uma conta sem privilégio administrativo.",
      documentacao: "docs/controlador-manutencao.md#pré-requisitos",
    });
  }
  if (comDropbox) {
    for (const [campo, flag] of [
      [configuracao.configDropbox, "--config-dropbox"],
      [configuracao.arquivoTokenDropbox, "--arquivo-token-dropbox"],
      [configuracao.configRclone, "--config-rclone"],
      [configuracao.destino, "--destino"],
    ]) {
      if (!campo) {
        throw erroUso("O perfil Dropbox exige a configuração completa.", {
          dica: `Informe ${flag} junto das demais flags do perfil Dropbox.`,
          documentacao: "docs/dropbox-retencao.md#adoção",
        });
      }
    }
  }
  if (ctx.modoTeste && ctx.raiz === "/") {
    throw erroUso("O modo de teste exige um diretório de raiz isolado.", {
      dica: "Defina INSTALADOR_RAIZ para um diretório sintético.",
      documentacao: "docs/instalador.md#testes-em-docker",
    });
  }
  if (!ctx.sim && !ctx.modoTeste) {
    throw erroUso("O aplicar altera o sistema e exige confirmação explícita.", {
      dica: "Repita o comando com --sim.",
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  if (!ctx.modoTeste && ctx.uid !== 0) {
    throw erroValidacao("O aplicar exige root ou uma conta com sudo.", {
      dica: "Repita o comando com sudo.",
      documentacao: "docs/instalador.md#segurança",
      saida: 5,
    });
  }
  if (configuracao.canal === "main" && !ctx.permitirInstavel) {
    throw falha("E_CANAL", "O canal main exige confirmação explícita.", {
      dica: "Repita o comando com --permitir-instavel.",
      documentacao: "docs/instalador.md#canal-release-e-main",
    });
  }
  if (configuracao.canal === "release" && !configuracao.tag && !ctx.modoTeste) {
    throw erroUso("O canal release exige uma tag estável para aplicar.", {
      dica: "Informe --tag vX.Y.Z.",
      documentacao: "docs/instalador.md#canal-release-e-main",
    });
  }
  if (deteccao.tier === 3) {
    throw falha("E_DISTRO", `A distribuição ${deteccao.distro} não é suportada.`, {
      dica: "Use uma distribuição Tier 1 ou Tier 2 da matriz do instalador.",
      documentacao: "docs/instalador.md#tiers",
    });
  }
  if (deteccao.gerenciador === "desconhecido") {
    throw falha("E_PACOTE", "Nenhum gerenciador de pacotes reconhecido foi encontrado.", {
      dica: "Confira a instalação do apt, dnf, pacman, zypper ou apk.",
      documentacao: "docs/instalador.md#auditoria-de-pacotes",
    });
  }
  if (!configuracao.dominio) {
    throw erroUso("O domínio é obrigatório para configurar o proxy e o TLS.", {
      dica: "Informe --dominio.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (configuracao.tls === "acme" && !configuracao.emailAcme) {
    throw erroUso("O modo TLS acme exige um e-mail para a autoridade certificadora.", {
      dica: "Informe --email-acme.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (!configuracao.pularContas && !configuracao.emailAdmin) {
    throw erroUso("A criação do administrador exige um e-mail.", {
      dica: "Informe --email-admin ou use --pular-contas.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (configuracao.modoBackup !== "compose") {
    throw erroUso("O modo de backup url ainda não é aplicado pelo perfil simples.", {
      dica: "Use --modo-backup compose nesta versão.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  if (configuracao.seed) {
    avisos.push(
      avisoEtapa(
        "A_SEED",
        "A semente sintética não é criada pelo aplicar; use o comando de semente do projeto.",
        "docs/instalador.md#flags",
      ),
    );
  }
  if (configuracao.agendador !== "auto" || configuracao.habilitarAtualizacoes) {
    avisos.push(
      avisoEtapa(
        "A_AGENDADOR_LIMITADO",
        "O agendador e as atualizações automáticas ficam para a etapa de systemd e cron.",
        "docs/instalador.md#aplicar",
      ),
    );
  }
  if (configuracao.criptografia === "gpg" && !configuracao.destinatarioGpg) {
    throw falha("E_BACKUP", "A cifra GPG exige o fingerprint completo do destinatário.", {
      dica: "Informe --destinatario-gpg com o fingerprint completo.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  if (
    configuracao.criptografia === "gpg" &&
    configuracao.destinatarioGpg &&
    !/^(?:[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$/.test(configuracao.destinatarioGpg)
  ) {
    throw falha("E_BACKUP", "O fingerprint GPG informado não tem formato completo.", {
      dica: "Use 40 ou 64 caracteres hexadecimais.",
      documentacao: "docs/instalador.md#backup",
    });
  }
  if (configuracao.criptografia === "age" && !configuracao.destinatariosAge) {
    throw falha("E_BACKUP", "A cifra age exige um arquivo de destinatários.", {
      dica: "Informe --destinatarios-age.",
      documentacao: "docs/instalador.md#backup",
    });
  }

  const divergencia = estadoDivergente(estadoResultado.estado, configuracao);
  if (divergencia) {
    throw erroValidacao(divergencia, {
      dica: "Use atualizar ou refaça o plano com os mesmos valores do estado.",
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  if (ctx.estadoInvalido) {
    throw erroValidacao("O estado da instalação está corrompido e não pode ser reutilizado.", {
      dica: "Restaure o estado a partir do backup ou refaça a instalação em diretório limpo.",
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  if (ctx.desdeEtapa && !ctx.ordemEtapas.includes(ctx.desdeEtapa)) {
    throw erroUso(`A etapa ${ctx.desdeEtapa} não existe no perfil ${configuracao.perfil}.`, {
      dica: "Use uma etapa da ordem do perfil escolhido.",
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  if (ctx.desdeEtapa && estadoResultado.presente) {
    const indice = ctx.ordemEtapas.indexOf(ctx.desdeEtapa);
    for (const etapaAnterior of ctx.ordemEtapas.slice(0, indice)) {
      const registrada = estadoResultado.estado.etapas.find((item) => item.id === etapaAnterior);
      if (!registrada || !["concluida", "pulada"].includes(registrada.estado)) {
        throw erroValidacao(
          `A etapa anterior ${etapaAnterior} não está concluída no estado da instalação.`,
          {
            dica: "Execute o aplicar completo antes de retomar a partir de uma etapa.",
            documentacao: "docs/instalador.md#retomada",
          },
        );
      }
    }
  }
  if (ctx.forcar && ctx.estadoInvalido) {
    throw erroValidacao("O --forcar não transforma estado incerto em estado válido.", {
      documentacao: "docs/instalador.md#retomada",
    });
  }

  const disco = ctx.lerDisco(ctx.raiz);
  if (disco && disco.livreBytes < 2 * 1024 ** 3) {
    throw erroValidacao(`O disco tem apenas ${disco.livreGiB} GiB livres.`, {
      dica: "Libere espaço antes de aplicar a instalação.",
      documentacao: "docs/instalador.md#estado-durável",
    });
  }
  if (ctx.memoriaTotal() < 2 * 1024 ** 3) {
    avisos.push(
      avisoEtapa(
        "A_MEMORIA",
        `O host tem ${(ctx.memoriaTotal() / 1024 ** 3).toFixed(1)} GiB de memória.`,
      ),
    );
  }
  const portas = verificarPortas(ctx, estadoResultado.presente);
  avisos.push(...portas.avisos);
  acoes.push(
    acao("Revalida distribuição, arquitetura, gerenciador e iniciador", null, false),
    acao("Confere o estado durável e recusa divergência", null, false),
    acao("Confere espaço em disco, memória e portas públicas", null, false),
    acao("Confere a confirmação, o perfil, o canal e os pré-requisitos de backup", null, false),
  );
  if (configuracao.criptografia === "gpg") {
    avisos.push(
      avisoEtapa(
        "A_BACKUP_CHAVE",
        "O primeiro backup exige a chave pública GPG em BACKUP_GPG_CHAVE_PUBLICA.",
        "docs/instalador.md#backup",
      ),
    );
  }

  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      tier: deteccao.tier,
      gerenciador: deteccao.gerenciador,
      iniciador: deteccao.iniciador,
      estadoPresente: Boolean(estadoResultado.presente),
      portasOcupadas: portas.ocupadas,
      discoLivreGiB: disco?.livreGiB ?? null,
      modoTeste: Boolean(ctx.modoTeste),
      retomada: Boolean(ctx.retomar),
      desdeEtapa: ctx.desdeEtapa ?? null,
    },
  };
}
