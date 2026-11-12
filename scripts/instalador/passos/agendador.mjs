// Etapa do agendador: instala timers do systemd ou o fallback cron com notificação de falha.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acao,
  avisoEtapa,
  executarEtapa,
  falha,
  garantirDiretorio,
  lerEnv,
  sobRaiz,
} from "./contexto.mjs";

export const id = "agendador";
export const titulo = "Instala systemd timers ou cron";
export const limiteSegundos = 600;

const PREFIXO = "frequenciapp";
const DIRETORIO_UNIDADES = "/etc/systemd/system";
const DIRETORIO_CRON = "/etc/cron.d/frequenciapp";
const RAIZ_MODELOS = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export const CALENDARIOS = new Map([
  ["agenda", "*-*-* *:0/5:00"],
  ["backup-banco", "*-*-* 02:30:00"],
  ["backup-planilhas", "*-*-* 03:00:00"],
  ["atualizar", "*-*-* 04:30:00"],
  ["certificado", "*-*-* 02:15:00"],
]);

const ATRASOS = new Map([
  ["agenda", "30s"],
  ["backup-banco", "5min"],
  ["backup-planilhas", "5min"],
  ["atualizar", "15min"],
  ["certificado", "5min"],
]);

const SERVICOS = [
  { id: "agenda", titulo: "agenda" },
  { id: "backup-banco", titulo: "backup do banco" },
  { id: "backup-planilhas", titulo: "backup das planilhas" },
  { id: "atualizar", titulo: "atualização" },
  { id: "certificado", titulo: "renovação do certificado" },
];

function deveInstalar(servico, ctx) {
  const ambiente = ambienteDosArquivos(ctx);
  if (servico.id === "agenda") return ambiente.AGENDA_HABILITADA !== "false";
  if (servico.id === "backup-banco") return ambiente.BACKUP_HABILITADO !== "false";
  if (servico.id === "backup-planilhas") {
    return ambiente.BACKUP_PLANILHAS_HABILITADO !== "false";
  }
  if (servico.id === "atualizar") return Boolean(ctx.configuracao.habilitarAtualizacoes);
  if (servico.id === "certificado") {
    return ctx.configuracao.proxy === "nginx" && ctx.configuracao.tls === "acme";
  }
  return false;
}

function resolverAgendador(ctx) {
  const escolhido = ctx.configuracao.agendador ?? "auto";
  const systemdDisponivel =
    ctx.deteccao?.iniciador === "systemd" &&
    typeof ctx.comandoExiste === "function" &&
    ctx.comandoExiste("systemctl");
  if (escolhido === "systemd") {
    if (!systemdDisponivel) {
      throw falha("E_VALIDACAO", "O systemd não está disponível neste host.", {
        dica: "Use --agendador cron ou inicie o systemd antes de repetir o comando.",
        documentacao: "docs/instalador.md#agendador",
      });
    }
    return "systemd";
  }
  if (escolhido === "cron") return validarCron(ctx);
  if (systemdDisponivel) return "systemd";
  return validarCron(ctx);
}

function validarCron(ctx) {
  const temCrontab = typeof ctx.comandoExiste === "function" && ctx.comandoExiste("crontab");
  const temDaemon =
    typeof ctx.comandoExiste === "function" &&
    (ctx.comandoExiste("cron") || ctx.comandoExiste("crond"));
  if (!temCrontab || !temDaemon) {
    throw falha("E_VALIDACAO", "O cron não está instalado neste host.", {
      dica: "Instale o cron da distribuição ou use --agendador systemd.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  return "cron";
}

function validarAtualizacoes(ctx) {
  const referencia = String(ctx.configuracao.refAtualizacao ?? "");
  if (referencia && !/^[A-Za-z0-9._/-]+$/.test(referencia)) {
    throw falha("E_USO", "A referência da atualização agendada é inválida.", {
      dica: "Use um ramo, uma tag ou um commit com letras, números, ponto, hífen ou barra.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  if (ctx.configuracao.canalAtualizacao !== "main") return;
  if (ctx.permitirInstavel) return;
  throw falha("E_CANAL", "O canal main exige confirmação explícita.", {
    dica: "Repita o comando com --permitir-instavel para usar o canal main.",
    documentacao: "docs/instalador.md#canal-release-e-main",
  });
}

function lerFusoHost(ctx) {
  if (typeof ctx.comandoExiste !== "function" || !ctx.comandoExiste("timedatectl")) {
    return { host: "", verificado: false };
  }
  const resultado = executarEtapa(ctx, "timedatectl", ["show", "--property=Timezone"], {
    timeout: 15000,
  });
  if (resultado.status !== 0) return { host: "", verificado: false };
  const host = /Timezone=(.+)/i.exec(String(resultado.stdout ?? ""))?.[1]?.trim() ?? "";
  return { host, verificado: Boolean(host) };
}

function conferirFuso(ctx, agendador) {
  const esperado = String(ctx.configuracao.fuso ?? "");
  const lido = lerFusoHost(ctx);
  const avisos = [];
  if (!lido.verificado) {
    avisos.push(
      avisoEtapa(
        "A_FUSO_NAO_VERIFICADO",
        "Não foi possível confirmar o fuso do host pelo timedatectl.",
        "docs/instalador.md#agendador",
      ),
    );
    return { host: lido.host, esperado, confirmado: false, avisos };
  }
  if (esperado && lido.host !== esperado) {
    const cronTz =
      agendador === "cron" ? process.env.CRON_TZ || ambienteDosArquivos(ctx).CRON_TZ || "" : "";
    const confirmado = Boolean(ctx.permitirFusoDivergente) || Boolean(cronTz);
    if (!confirmado) {
      throw falha("E_VALIDACAO", `O fuso do host é ${lido.host}, diferente de ${esperado}.`, {
        dica: "Ajuste o fuso com timedatectl ou confirme a divergência com INSTALADOR_PERMITIR_FUSO_DIVERGENTE=1.",
        documentacao: "docs/instalador.md#agendador",
      });
    }
    avisos.push(
      avisoEtapa(
        "A_FUSO_DIVERGENTE_CONFIRMADO",
        `O fuso do host é ${lido.host}, diferente de ${esperado}, com divergência confirmada.`,
        "docs/instalador.md#agendador",
      ),
    );
  }
  return { host: lido.host, esperado, confirmado: true, avisos };
}

function validarCalendarios(ctx, avisos) {
  if (typeof ctx.comandoExiste !== "function" || !ctx.comandoExiste("systemd-analyze")) {
    avisos.push(
      avisoEtapa(
        "A_SYSTEMD_ANALYZE",
        "O systemd-analyze não está disponível; as expressões de agenda não foram validadas.",
        "docs/instalador.md#agendador",
      ),
    );
    return;
  }
  for (const [nome, expressao] of CALENDARIOS) {
    const resultado = executarEtapa(ctx, "systemd-analyze", ["calendar", expressao], {
      timeout: 15000,
    });
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", `A expressão de agenda de ${nome} não é válida.`, {
        dica: "Confira o modelo da unidade e a versão do systemd.",
        documentacao: "docs/instalador.md#agendador",
      });
    }
  }
}

function diretorioModelos(ctx) {
  const preferido = path.join(ctx.raizRepositorio ?? RAIZ_MODELOS, "infra", "servidor", "systemd");
  if (fs.existsSync(preferido)) return preferido;
  return path.join(RAIZ_MODELOS, "infra", "servidor", "systemd");
}

function valoresComuns(ctx) {
  return {
    "@USUARIO@": ctx.usuarioServico,
    "@APP_DIR@": ctx.caminhos.appDir,
    "@CONFIG_DIR@": ctx.caminhos.configDir,
    "@ESTADO_DIR@": ctx.caminhos.estadoDir,
    "@LOG_DIR@": ctx.caminhos.logDir,
    "@BACKUP_DIR@": ctx.caminhos.backupDir,
    "@LOCK_DIR@": ctx.caminhos.lockDir,
  };
}

function renderizar(texto, valores) {
  let saida = texto;
  for (const [marcador, valor] of Object.entries(valores)) {
    const bruto = String(valor);
    if (/[\r\n]/.test(bruto)) {
      throw falha("E_VALIDACAO", "Um valor da unidade do systemd tem quebra de linha.", {
        documentacao: "docs/instalador.md#agendador",
      });
    }
    // O systemd expande especificadores em todas as diretivas; %% preserva o literal.
    saida = saida.split(marcador).join(bruto.split("%").join("%%"));
  }
  const restante = /@[A-Z0-9_]+@/.exec(saida);
  if (restante) {
    throw falha("E_VALIDACAO", `O modelo de unidade tem o marcador ${restante[0]} sem valor.`, {
      documentacao: "docs/instalador.md#agendador",
    });
  }
  return saida;
}

function lerModelo(diretorio, nome) {
  const caminho = path.join(diretorio, nome);
  try {
    return fs.readFileSync(caminho, "utf8");
  } catch {
    throw falha("E_VALIDACAO", `O modelo de unidade ${nome} não foi encontrado.`, {
      dica: "Confira o checkout em infra/servidor/systemd.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
}

function lerArquivoRegular(caminho) {
  let informacao;
  try {
    informacao = fs.lstatSync(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return null;
    throw falha("E_VALIDACAO", "Não foi possível consultar uma unidade do systemd.", {
      documentacao: "docs/instalador.md#agendador",
    });
  }
  if (informacao.isSymbolicLink() || !informacao.isFile()) {
    throw falha("E_VALIDACAO", "Uma unidade do systemd precisa ser um arquivo regular.", {
      dica: "Remova o link simbólico antes de repetir a instalação.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  return fs.readFileSync(caminho, "utf8");
}

function gravarUnidade(ctx, caminho, conteudo) {
  const existente = lerArquivoRegular(caminho);
  if (existente === conteudo) {
    const modo = fs.statSync(caminho).mode & 0o777;
    if (modo !== 0o644) fs.chmodSync(caminho, 0o644);
    return false;
  }
  ctx.gravarArquivoAtomico(caminho, conteudo, { modo: 0o644 });
  fs.chmodSync(caminho, 0o644);
  return true;
}

function systemctl(ctx, argumentos, opcoes = {}) {
  const resultado = executarEtapa(ctx, "systemctl", argumentos, {
    timeout: opcoes.timeout ?? 30000,
  });
  if (resultado.status === 0 || opcoes.ignorarFalha) return resultado;
  const texto = `${resultado.stderr}\n${resultado.stdout}`;
  if (/not been booted|Failed to connect to bus/i.test(texto)) {
    throw falha("E_VALIDACAO", "O systemd não está em execução neste host.", {
      dica: "Use --agendador cron ou inicie o systemd antes de repetir o comando.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  throw falha("E_VALIDACAO", `Não foi possível ${opcoes.rotulo ?? "configurar o systemd"}.`, {
    documentacao: "docs/instalador.md#agendador",
  });
}

function timerAtivo(ctx, nome) {
  const resultado = systemctl(ctx, ["is-active", nome], { ignorarFalha: true });
  return resultado.status === 0 && String(resultado.stdout ?? "").trim() === "active";
}

function timerHabilitado(ctx, nome) {
  const resultado = systemctl(ctx, ["is-enabled", nome], { ignorarFalha: true });
  return resultado.status === 0;
}

function removerPar(ctx, nome) {
  const diretorio = sobRaiz(ctx.raiz, DIRETORIO_UNIDADES);
  const timer = `${PREFIXO}-${nome}.timer`;
  const servico = `${PREFIXO}-${nome}.service`;
  let removeu = false;
  for (const [arquivo, unidade] of [
    [path.join(diretorio, timer), timer],
    [path.join(diretorio, servico), null],
  ]) {
    if (!fs.existsSync(arquivo)) continue;
    if (unidade) systemctl(ctx, ["disable", "--now", unidade], { ignorarFalha: true });
    fs.unlinkSync(arquivo);
    removeu = true;
  }
  return removeu;
}

function instalarSystemd(ctx, fuso, avisos) {
  const modelos = diretorioModelos(ctx);
  const diretorio = sobRaiz(ctx.raiz, DIRETORIO_UNIDADES);
  garantirDiretorio(diretorio, 0o755);
  validarCalendarios(ctx, avisos);

  const acoes = [];
  const arquivos = [];
  const timers = [];
  let alterouArquivos = false;

  for (const servico of SERVICOS) {
    const instalar = deveInstalar(servico, ctx);
    if (!instalar) {
      if (removerPar(ctx, servico.id)) {
        alterouArquivos = true;
        acoes.push(acao(`Remove o agendamento de ${servico.titulo}`, null, true));
      }
      continue;
    }
    const nomeServico = `${PREFIXO}-${servico.id}.service`;
    const nomeTimer = `${PREFIXO}-${servico.id}.timer`;
    const extras = {
      "@ON_CALENDAR@": CALENDARIOS.get(servico.id),
      "@RANDOMIZED_DELAY@": ATRASOS.get(servico.id),
      "@MODO_ATUALIZACAO@": ctx.configuracao.canalAtualizacao ?? "release",
      "@REF_ATUALIZACAO@": ctx.configuracao.refAtualizacao || "origin/main",
    };
    const servicoTexto = renderizar(lerModelo(modelos, nomeServico), {
      ...valoresComuns(ctx),
      ...extras,
    });
    const timerTexto = renderizar(lerModelo(modelos, nomeTimer), {
      ...valoresComuns(ctx),
      ...extras,
    });
    const alterouServico = gravarUnidade(ctx, path.join(diretorio, nomeServico), servicoTexto);
    const alterouTimer = gravarUnidade(ctx, path.join(diretorio, nomeTimer), timerTexto);
    if (alterouServico || alterouTimer) alterouArquivos = true;
    arquivos.push(nomeServico, nomeTimer);
    timers.push({ nome: nomeTimer, alterado: alterouTimer });
  }

  const falhaTexto = renderizar(
    lerModelo(modelos, `${PREFIXO}-falha@.service`),
    valoresComuns(ctx),
  );
  if (gravarUnidade(ctx, path.join(diretorio, `${PREFIXO}-falha@.service`), falhaTexto)) {
    alterouArquivos = true;
  }
  arquivos.push(`${PREFIXO}-falha@.service`);

  if (alterouArquivos) {
    systemctl(ctx, ["daemon-reload"], { rotulo: "recarregar o systemd" });
    acoes.push(acao("Recarrega as unidades do systemd", "systemctl daemon-reload", true));
  }

  let alterouTimer = false;
  for (const timer of timers) {
    if (!timerHabilitado(ctx, timer.nome)) {
      systemctl(ctx, ["enable", timer.nome], { rotulo: `habilitar ${timer.nome}` });
      acoes.push(acao(`Habilita o timer ${timer.nome}`, `systemctl enable ${timer.nome}`, true));
      alterouTimer = true;
    }
    if (!timerAtivo(ctx, timer.nome)) {
      systemctl(ctx, ["start", timer.nome], { rotulo: `iniciar ${timer.nome}` });
      acoes.push(acao(`Inicia o timer ${timer.nome}`, `systemctl start ${timer.nome}`, true));
      alterouTimer = true;
    } else if (timer.alterado) {
      systemctl(ctx, ["restart", timer.nome], { rotulo: `reiniciar ${timer.nome}` });
      acoes.push(acao(`Reinicia o timer ${timer.nome}`, `systemctl restart ${timer.nome}`, true));
      alterouTimer = true;
    }
  }

  const semMudancas = !alterouArquivos && !alterouTimer;
  if (semMudancas) {
    acoes.push(acao("Os timers do FrequenciApp já estão ativos", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas,
      agendador: "systemd",
      fuso,
      atualizacoes: Boolean(ctx.configuracao.habilitarAtualizacoes),
      certificado: ctx.configuracao.proxy === "nginx" && ctx.configuracao.tls === "acme",
      arquivos,
      timers: timers.map((timer) => timer.nome),
      calendarios: Object.fromEntries(CALENDARIOS),
    },
  };
}

function limparSystemd(ctx) {
  const diretorio = sobRaiz(ctx.raiz, DIRETORIO_UNIDADES);
  let removeu = false;
  let entradas;
  try {
    entradas = fs.readdirSync(diretorio);
  } catch {
    return false;
  }
  for (const nome of entradas) {
    if (
      !new RegExp(
        `^${PREFIXO}-(agenda|backup-banco|backup-planilhas|atualizar|certificado)\\.(service|timer)$`,
      ).test(nome)
    ) {
      continue;
    }
    if (nome.endsWith(".timer") && typeof ctx.comandoExiste === "function") {
      if (ctx.comandoExiste("systemctl")) {
        systemctl(ctx, ["disable", "--now", nome], { ignorarFalha: true });
      }
    }
    fs.unlinkSync(path.join(diretorio, nome));
    removeu = true;
  }
  if (removeu && typeof ctx.comandoExiste === "function" && ctx.comandoExiste("systemctl")) {
    systemctl(ctx, ["daemon-reload"], { ignorarFalha: true });
  }
  return removeu;
}

function ambienteDosArquivos(ctx) {
  const ambiente = {};
  for (const caminho of [ctx.caminhos.appEnv, ctx.caminhos.opsEnv]) {
    let texto;
    try {
      texto = fs.readFileSync(caminho, "utf8");
    } catch {
      continue;
    }
    const { mapa } = lerEnv(texto);
    for (const [chave, valor] of mapa) ambiente[chave] = valor;
  }
  return ambiente;
}

function ajustarLinhaAtualizacao(ctx, caminho) {
  let texto;
  try {
    texto = fs.readFileSync(caminho, "utf8");
  } catch {
    throw falha("E_VALIDACAO", "O arquivo de cron do FrequenciApp não foi encontrado.", {
      dica: "Confira a execução de scripts/servidor/instalar-rotinas.sh.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  const modo = ctx.configuracao.canalAtualizacao === "main" ? "main" : "release";
  const linhas = texto.split("\n");
  let encontrou = false;
  let alterou = false;
  for (let indice = 0; indice < linhas.length; indice += 1) {
    if (/^\s*#/.test(linhas[indice])) continue;
    if (!/atualizar\.sh/.test(linhas[indice])) continue;
    encontrou = true;
    if (/--modo\s+/.test(linhas[indice])) continue;
    const nova = linhas[indice].replace(/(atualizar\.sh["']?)/, `$1 --modo ${modo}`);
    if (nova !== linhas[indice]) {
      linhas[indice] = nova;
      alterou = true;
    }
  }
  if (!encontrou) {
    throw falha("E_VALIDACAO", "O instalar-rotinas.sh não gerou a linha de atualização.", {
      dica: "Confira ATUALIZAR_HABILITADO e o modelo de cron.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  if (alterou) {
    ctx.gravarArquivoAtomico(caminho, linhas.join("\n"), { modo: 0o644 });
    fs.chmodSync(caminho, 0o644);
  }
  return alterou;
}

function instalarCron(ctx, fuso, avisos) {
  const caminhoCron = sobRaiz(ctx.raiz, DIRETORIO_CRON);
  const removeuSystemd = limparSystemd(ctx);
  const anterior = fs.existsSync(caminhoCron) ? fs.readFileSync(caminhoCron, "utf8") : null;
  const ambiente = {
    ...ambienteDosArquivos(ctx),
    SERVIDOR_AMBIENTE_INJETADO: "true",
    APP_DIR: ctx.caminhos.appDir,
    APP_ENV_FILE: ctx.caminhos.appEnv,
    OPS_ENV_FILE: ctx.caminhos.opsEnv,
    SERVIDOR_CONFIG_DIR: ctx.caminhos.configDir,
    ESTADO_DIR: ctx.caminhos.estadoDir,
    LOG_DIR: ctx.caminhos.logDir,
    BACKUP_DIR: ctx.caminhos.backupDir,
    BACKUP_BANCO_DIR: ctx.caminhos.backupBancoDir,
    BACKUP_PLANILHAS_DIR: ctx.caminhos.backupPlanilhasDir,
    SERVIDOR_LOCK_DIR: ctx.caminhos.lockDir,
    SERVIDOR_USUARIO: ctx.usuarioServico,
    COMPOSE_PROJECT_NAME: ctx.caminhos.projetoCompose,
    PROXY_TIPO: ctx.configuracao.proxy ?? "caddy",
    TLS_MODO: ctx.configuracao.tls ?? "acme",
    ATUALIZAR_HABILITADO: String(Boolean(ctx.configuracao.habilitarAtualizacoes)),
    ATUALIZAR_MODO: ctx.configuracao.canalAtualizacao ?? "release",
    ATUALIZAR_REF: ctx.configuracao.refAtualizacao || "origin/main",
    TZ_APP: ctx.configuracao.fuso ?? "",
    CRON_TZ: process.env.CRON_TZ ?? "",
    MAILTO: process.env.MAILTO ?? "",
  };
  const resultado = executarEtapa(
    ctx,
    "bash",
    [path.join(ctx.caminhos.appDir, "scripts", "servidor", "instalar-rotinas.sh")],
    { timeout: 300000, env: ambiente },
  );
  if (resultado.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível instalar as rotinas no cron.", {
      dica: "Confira o cron, o fuso do host e o log da instalação.",
      documentacao: "docs/instalador.md#agendador",
    });
  }
  if (ctx.configuracao.habilitarAtualizacoes) {
    ajustarLinhaAtualizacao(ctx, caminhoCron);
  }
  const depois = fs.existsSync(caminhoCron) ? fs.readFileSync(caminhoCron, "utf8") : null;
  const alterou = removeuSystemd || anterior !== depois;
  const acoes = [];
  if (removeuSystemd) {
    acoes.push(acao("Remove os timers antigos do systemd", null, true));
  }
  acoes.push(
    acao(
      "Instala as rotinas do FrequenciApp no cron",
      "scripts/servidor/instalar-rotinas.sh",
      alterou,
    ),
  );
  if (alterou && ctx.configuracao.habilitarAtualizacoes) {
    acoes.push(
      acao(
        `Ajusta a atualização agendada para o canal ${ctx.configuracao.canalAtualizacao}`,
        null,
        true,
      ),
    );
  }
  if (!alterou) {
    acoes.push(acao("As rotinas do FrequenciApp já estão no cron", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: !alterou,
      agendador: "cron",
      fuso,
      atualizacoes: Boolean(ctx.configuracao.habilitarAtualizacoes),
      certificado: ctx.configuracao.proxy === "nginx" && ctx.configuracao.tls === "acme",
      cronArquivo: caminhoCron,
      linhas: fs.existsSync(caminhoCron)
        ? fs.readFileSync(caminhoCron, "utf8").split("\n").filter(Boolean).length
        : 0,
    },
  };
}

export function executar(ctx) {
  const agendador = resolverAgendador(ctx);
  validarAtualizacoes(ctx);
  const fuso = conferirFuso(ctx, agendador);
  const avisos = [...fuso.avisos];
  if (agendador === "systemd") return instalarSystemd(ctx, fuso, avisos);
  return instalarCron(ctx, fuso, avisos);
}
