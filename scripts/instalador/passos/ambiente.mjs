// Etapa de ambiente: gera app.env e ops.env com segredos e permissões corretas.
import fs from "node:fs";
import path from "node:path";
import {
  acao,
  atualizarEnv,
  avisoEtapa,
  executarEtapa,
  falha,
  gravarArquivoPrivado,
  lerEnv,
  lerSegredo,
  senhaAleatoria,
  segredoAleatorio,
  sha256Arquivo,
} from "./contexto.mjs";
import { contemSegredo } from "../redigir.mjs";

export const id = "ambiente";
export const titulo = "Gera app.env e ops.env com segredos e permissões corretas";
export const limiteSegundos = 300;

function textoExistente(caminho, rotulo) {
  try {
    const info = fs.lstatSync(caminho);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw falha("E_VALIDACAO", `O arquivo de ${rotulo} precisa ser um arquivo regular.`, {
        documentacao: "docs/instalador.md#segurança",
      });
    }
    return fs.readFileSync(caminho, "utf8");
  } catch (erro) {
    if (erro.code === "ENOENT") return "";
    throw erro;
  }
}

function valor(mapa, chave, padrao) {
  const atual = mapa.get(chave);
  return atual && atual.trim() ? atual : padrao;
}

function ajustarProprietario(ctx, caminho) {
  if (ctx.modoTeste || ctx.uid !== 0) return false;
  const usuario = ctx.usuarioServico;
  const uid = executarEtapa(ctx, "id", ["-u", usuario], { timeout: 10000 });
  const gid = executarEtapa(ctx, "id", ["-g", usuario], { timeout: 10000 });
  if (uid.status !== 0 || gid.status !== 0) return false;
  const numeroUid = Number(String(uid.stdout).trim());
  const numeroGid = Number(String(gid.stdout).trim());
  if (!Number.isFinite(numeroUid) || !Number.isFinite(numeroGid)) return false;
  const informacao = fs.statSync(caminho);
  if (informacao.uid === numeroUid && informacao.gid === numeroGid) return false;
  const resultado = executarEtapa(ctx, "chown", [`${numeroUid}:${numeroGid}`, caminho], {
    timeout: 30000,
  });
  if (resultado.status !== 0) {
    throw falha(
      "E_VALIDACAO",
      "Não foi possível ajustar o proprietário de um arquivo de ambiente.",
      {
        dica: "Confira a conta de implantação e a permissão de root.",
        documentacao: "docs/instalador.md#segurança",
        saida: 5,
      },
    );
  }
  return true;
}

function imagemAplicacao(configuracao) {
  const base = configuracao.imagem || "ghcr.io/eemtijca/frequenciapp";
  if (configuracao.imagemDigest) return `${base}@${configuracao.imagemDigest}`;
  if (configuracao.tag) return `${base}:${configuracao.tag}`;
  if (base.includes(":")) return base;
  return "frequenciapp:local";
}

function acmeCa(configuracao) {
  return configuracao.acmeStaging
    ? "https://acme-staging-v02.api.letsencrypt.org/directory"
    : "https://acme-v02.api.letsencrypt.org/directory";
}

function lerArquivoGoogle(caminho) {
  if (!caminho) return new Map();
  return lerEnv(lerSegredo(caminho, "credencial do Google")).mapa;
}

function prepararSenha(ctx, email, arquivoInformado, rotulo, chave) {
  if (!email) return { caminho: "", senha: "", gerada: false };
  if (arquivoInformado) {
    const senha = lerSegredo(arquivoInformado, `senha de ${rotulo}`);
    ctx.segredos.push(senha);
    return { caminho: arquivoInformado, senha, gerada: false };
  }
  const caminho = path.join(ctx.caminhos.configDir, `senha-${chave}`);
  if (fs.existsSync(caminho)) {
    const senha = lerSegredo(caminho, `senha de ${rotulo}`);
    ctx.segredos.push(senha);
    return { caminho, senha, gerada: false };
  }
  const senha = senhaAleatoria();
  ctx.segredos.push(senha);
  gravarArquivoPrivado(caminho, `${senha}\n`, ctx.gravarArquivoAtomico);
  return { caminho, senha, gerada: true };
}

export function executar(ctx) {
  const configuracao = ctx.configuracao;
  const appExistente = textoExistente(ctx.caminhos.appEnv, "app.env");
  const opsExistente = textoExistente(ctx.caminhos.opsEnv, "ops.env");
  const appAtual = lerEnv(appExistente).mapa;
  const acoes = [];
  const avisos = [];

  const postgresUsuario = valor(appAtual, "POSTGRES_USER", "frequencia");
  const postgresBanco = valor(appAtual, "POSTGRES_DB", "frequencia");
  let senhaBanco = valor(appAtual, "POSTGRES_PASSWORD", "");
  let authSecret = valor(appAtual, "AUTH_SECRET", "");
  let cronSecret = valor(appAtual, "CRON_SECRET", "");
  const gerados = [];
  if (!senhaBanco) {
    senhaBanco = segredoAleatorio(24)
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 40);
    gerados.push("POSTGRES_PASSWORD");
  }
  if (!authSecret || authSecret.length < 32) {
    authSecret = segredoAleatorio(32);
    gerados.push("AUTH_SECRET");
  }
  if (!cronSecret || cronSecret.length < 32) {
    cronSecret = segredoAleatorio(32);
    gerados.push("CRON_SECRET");
  }
  ctx.segredos.push(senhaBanco, authSecret, cronSecret);

  const usuarioUrl = encodeURIComponent(postgresUsuario);
  const senhaUrl = encodeURIComponent(senhaBanco);
  const bancoUrl = `postgresql://${usuarioUrl}:${senhaUrl}@db:5432/${encodeURIComponent(postgresBanco)}`;
  const commit = ctx.commitDetectado || configuracao.commit || ctx.estado?.commit || "local";
  const google = lerArquivoGoogle(configuracao.arquivoGoogle);

  const appDesejado = new Map([
    ["POSTGRES_USER", postgresUsuario],
    ["POSTGRES_PASSWORD", senhaBanco],
    ["POSTGRES_DB", postgresBanco],
    ["DATABASE_URL", bancoUrl],
    ["DIRECT_URL", bancoUrl],
    ["AUTH_SECRET", authSecret],
    ["CRON_SECRET", cronSecret],
    ["COMMIT_SHA", commit],
    ["TZ_APP", configuracao.fuso],
    ["PERMITIR_HTTP", "false"],
    ["MIGRAR_NA_PARTIDA", "true"],
    ["AGENDA_URL", "http://127.0.0.1:3000"],
    ["AGENDA_TIMEOUT", "300"],
    ["AGENDA_NOTIFICACOES", "true"],
    ["AGENDA_PLANILHAS", "true"],
    ["AGENDA_INDICADORES", "true"],
  ]);
  for (const [chave, item] of google) appDesejado.set(chave, item);

  const dominio = configuracao.dominio;
  const tls = configuracao.tls;
  const proxy = configuracao.proxy;
  const fingerprintGpg = (
    process.env.BACKUP_GPG_FINGERPRINT ||
    configuracao.destinatarioGpg ||
    ""
  ).toUpperCase();
  const portaHttp = String(configuracao.portaHttp);
  const portaHttps = String(configuracao.portaHttps);
  const caddyfile =
    tls === "interno" ? "infra/servidor/Caddyfile.interno" : "infra/servidor/Caddyfile";
  const opsDesejado = new Map([
    ["PROXY_TIPO", proxy],
    ["TLS_MODO", tls],
    ["DOMINIO", dominio],
    ["ACME_EMAIL", configuracao.emailAcme || ""],
    ["ACME_CA", acmeCa(configuracao)],
    ["PROXY_HTTP_PORTA", portaHttp],
    ["PROXY_HTTPS_PORTA", portaHttps],
    ["CADDYFILE", caddyfile],
    ["CERTBOT_CERTS_DIR", `${ctx.caminhos.appDir}/infra/servidor/nginx/certificados`],
    ["APP_DIR", ctx.caminhos.appDir],
    ["APP_ENV_FILE", ctx.caminhos.appEnv],
    ["OPS_ENV_FILE", ctx.caminhos.opsEnv],
    ["SERVIDOR_CONFIG_DIR", ctx.caminhos.configDir],
    ["ESTADO_DIR", ctx.caminhos.estadoDir],
    ["LOG_DIR", ctx.caminhos.logDir],
    ["BACKUP_DIR", ctx.caminhos.backupDir],
    ["BACKUP_BANCO_DIR", ctx.caminhos.backupBancoDir],
    ["BACKUP_PLANILHAS_DIR", ctx.caminhos.backupPlanilhasDir],
    ["SERVIDOR_USUARIO", ctx.usuarioServico],
    ["SERVIDOR_IDENTIDADE_ARQUIVO", ctx.caminhos.identidade],
    ["SERVIDOR_LOCK_DIR", ctx.caminhos.lockDir],
    ["COMPOSE_PROJECT_NAME", ctx.caminhos.projetoCompose],
    ["APP_IMAGEM", imagemAplicacao(configuracao)],
    ["APP_IMAGEM_BACKUP", "frequenciapp-backup:local"],
    ["BACKUP_MODO", configuracao.modoBackup],
    ["BACKUP_CRIPTOGRAFIA", configuracao.criptografia],
    ["BACKUP_GPG_DESTINATARIO", fingerprintGpg],
    ["BACKUP_GPG_FINGERPRINT", fingerprintGpg],
    [
      "BACKUP_GPG_CHAVE_PUBLICA",
      process.env.BACKUP_GPG_CHAVE_PUBLICA ||
        path.join(ctx.caminhos.configDir, "backup-publica.asc"),
    ],
    ["GPG_BASE_CURTA", "/tmp"],
    ["BACKUP_AGE_DESTINATARIOS", configuracao.destinatariosAge || ""],
    ["BACKUP_AGE_DESTINATARIOS_SHA256", ""],
    ["BACKUP_CATALOGO_PERSISTENTE", "true"],
    [
      "BACKUP_RCLONE_CONFIG",
      configuracao.configRclone || path.join(ctx.caminhos.configDir, "rclone.conf"),
    ],
    ["BACKUP_REMOTO", configuracao.destino || ""],
    ["BACKUP_VERIFICAR_REMOTO", "true"],
    ["BACKUP_RETER_DIAS", String(configuracao.retencaoDias)],
    ["BACKUP_RETER_MINIMO", String(configuracao.retencaoMinimo)],
    ["BACKUP_RETER_REMOTO", "false"],
    ["BACKUP_ESPACO_MINIMO_MB", "512"],
    ["BACKUP_INCLUIR_AMBIENTE", "true"],
    ["BACKUP_AMBIENTE_ARQUIVO", ctx.caminhos.appEnv],
    ["BACKUP_PLANILHAS_HABILITADO", configuracao.destino ? "true" : "false"],
    ["ATUALIZAR_HABILITADO", "false"],
    ["ATUALIZAR_MODO", "auto"],
    ["ATUALIZAR_REF", "origin/main"],
    ["ATUALIZAR_REMOTO", "origin"],
    ["ATUALIZAR_BACKUP_ANTES", "true"],
    ["ATUALIZAR_PERMITIR_MIGRACOES", "false"],
    ["ATUALIZAR_VERIFICAR_IMAGEM", "true"],
    ["ATUALIZAR_SAUDE_URL", `https://${dominio}/api/saude`],
    ["ATUALIZAR_TIMEOUT_SAUDE", "180"],
    ["ATUALIZAR_ESPACO_MINIMO_MB", "2048"],
    ["AGENDA_HABILITADA", "true"],
    ["AGENDA_NOTIFICACOES", "true"],
    ["AGENDA_PLANILHAS", "true"],
    ["AGENDA_INDICADORES", "true"],
    ["AGENDA_URL", "http://127.0.0.1:3000"],
    ["AGENDA_TIMEOUT", "300"],
    ["AGENDA_HORARIO", "*/5 * * * *"],
    ["BACKUP_HORARIO", "30 2 * * *"],
    ["BACKUP_PLANILHAS_HORARIO", "0 3 * * *"],
    ["ATUALIZAR_HORARIO", "30 4 * * *"],
    ["CERTBOT_RENOVAR_HORARIO", "15 2 * * *"],
    ["TZ_APP", configuracao.fuso],
  ]);
  if (configuracao.criptografia === "age" && configuracao.destinatariosAge) {
    const arquivo = configuracao.destinatariosAge;
    if (!fs.existsSync(arquivo)) {
      throw falha("E_BACKUP", "O arquivo de destinatários age não foi encontrado.", {
        documentacao: "docs/instalador.md#backup",
      });
    }
    opsDesejado.set("BACKUP_AGE_DESTINATARIOS_SHA256", sha256Arquivo(arquivo));
  }

  const app = atualizarEnv(
    appExistente,
    appDesejado,
    "# FrequenciApp. Ambiente da aplicação gerado pelo instalador. Não editar à mão.\n# Este arquivo contém segredos e deve permanecer com modo 600.",
  );
  const ops = atualizarEnv(
    opsExistente,
    opsDesejado,
    "# FrequenciApp. Ambiente operacional gerado pelo instalador. Não editar à mão.\n# Este arquivo contém configuração do host e deve permanecer com modo 600.",
  );
  const modoApp = fs.existsSync(ctx.caminhos.appEnv)
    ? fs.statSync(ctx.caminhos.appEnv).mode & 0o777
    : null;
  const modoOps = fs.existsSync(ctx.caminhos.opsEnv)
    ? fs.statSync(ctx.caminhos.opsEnv).mode & 0o777
    : null;
  if (app.alterou || modoApp !== 0o600) {
    gravarArquivoPrivado(ctx.caminhos.appEnv, app.texto, ctx.gravarArquivoAtomico);
    acoes.push(acao("Grava o app.env com modo 600", "install -m 600 app.env", true));
  } else {
    acoes.push(acao("O app.env já está atualizado com modo 600", null, false));
  }
  if (ops.alterou || modoOps !== 0o600) {
    gravarArquivoPrivado(ctx.caminhos.opsEnv, ops.texto, ctx.gravarArquivoAtomico);
    acoes.push(acao("Grava o ops.env com modo 600", "install -m 600 ops.env", true));
  } else {
    acoes.push(acao("O ops.env já está atualizado com modo 600", null, false));
  }
  if (ajustarProprietario(ctx, ctx.caminhos.appEnv)) {
    acoes.push(
      acao(
        `Ajusta o app.env para a conta ${ctx.usuarioServico}`,
        `chown ${ctx.usuarioServico}:${ctx.usuarioServico} app.env`,
        true,
      ),
    );
  }
  if (ajustarProprietario(ctx, ctx.caminhos.opsEnv)) {
    acoes.push(
      acao(
        `Ajusta o ops.env para a conta ${ctx.usuarioServico}`,
        `chown ${ctx.usuarioServico}:${ctx.usuarioServico} ops.env`,
        true,
      ),
    );
  }

  const chavesConfig = [
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
  const configuracaoEfetiva = {};
  for (const chave of chavesConfig) {
    const valor = configuracao[chave];
    if (valor === undefined || valor === null || valor === "") continue;
    configuracaoEfetiva[chave] = valor;
  }
  if (contemSegredo(configuracaoEfetiva)) {
    throw falha("E_VALIDACAO", "A configuração efetiva contém um valor que parece segredo.", {
      documentacao: "docs/instalador.md#segurança",
    });
  }
  const caminhoConfig = path.join(ctx.caminhos.configDir, "instalador.json");
  const textoConfig = `${JSON.stringify(configuracaoEfetiva, null, 2)}\n`;
  const configExistente = fs.existsSync(caminhoConfig)
    ? fs.readFileSync(caminhoConfig, "utf8")
    : "";
  const modoConfig = fs.existsSync(caminhoConfig) ? fs.statSync(caminhoConfig).mode & 0o777 : null;
  if (configExistente !== textoConfig || modoConfig !== 0o600) {
    gravarArquivoPrivado(caminhoConfig, textoConfig, ctx.gravarArquivoAtomico);
    acoes.push(acao("Grava a configuração efetiva em instalador.json com modo 600", null, true));
  } else {
    acoes.push(acao("A configuração efetiva já está gravada com modo 600", null, false));
  }

  const senhaAdmin = configuracao.pularContas
    ? { caminho: "", senha: "", gerada: false }
    : prepararSenha(
        ctx,
        configuracao.emailAdmin,
        configuracao.arquivoSenhaAdmin,
        "administração",
        "admin",
      );
  const senhaCoordenacao = configuracao.pularContas
    ? { caminho: "", senha: "", gerada: false }
    : prepararSenha(
        ctx,
        configuracao.emailCoordenacao,
        configuracao.arquivoSenhaCoordenacao,
        "coordenação",
        "coordenacao",
      );
  if (senhaAdmin.gerada) {
    acoes.push(acao("Gera a senha inicial da administração em arquivo 600", null, true));
  }
  if (senhaCoordenacao.gerada) {
    acoes.push(acao("Gera a senha inicial da coordenação em arquivo 600", null, true));
  }
  if (senhaAdmin.caminho) {
    avisos.push(
      avisoEtapa(
        "A_SENHA_ARQUIVO",
        `A senha inicial da administração está em ${senhaAdmin.caminho}; remova o arquivo após o primeiro acesso.`,
        "docs/instalador.md#segurança",
      ),
    );
  }
  if (senhaCoordenacao.caminho) {
    avisos.push(
      avisoEtapa(
        "A_SENHA_ARQUIVO",
        `A senha inicial da coordenação está em ${senhaCoordenacao.caminho}; remova o arquivo após o primeiro acesso.`,
        "docs/instalador.md#segurança",
      ),
    );
  }
  for (const nome of gerados) {
    avisos.push(
      avisoEtapa(
        "A_SEGREDO_GERADO",
        `O segredo ${nome} foi gerado e gravado apenas nos arquivos de ambiente com modo 600.`,
        "docs/instalador.md#segurança",
      ),
    );
  }
  ctx.senhas = { admin: senhaAdmin, coordenacao: senhaCoordenacao };
  ctx.ambiente = new Map([...appDesejado, ...opsDesejado]);
  ctx.ambienteBase = {
    ...(ctx.ambienteBase ?? {}),
    APP_DIR: ctx.caminhos.appDir,
    APP_ENV_FILE: ctx.caminhos.appEnv,
    OPS_ENV_FILE: ctx.caminhos.opsEnv,
    SERVIDOR_CONFIG_DIR: ctx.caminhos.configDir,
    ESTADO_DIR: ctx.caminhos.estadoDir,
    LOG_DIR: ctx.caminhos.logDir,
    BACKUP_DIR: ctx.caminhos.backupDir,
    BACKUP_BANCO_DIR: ctx.caminhos.backupBancoDir,
    SERVIDOR_LOCK_DIR: ctx.caminhos.lockDir,
    SERVIDOR_USUARIO: ctx.usuarioServico,
    COMPOSE_PROJECT_NAME: ctx.caminhos.projetoCompose,
    SERVIDOR_IDENTIDADE_ARQUIVO: ctx.caminhos.identidade,
  };
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: acoes.every((item) => !item.altera),
      gerados,
      appEnv: ctx.caminhos.appEnv,
      opsEnv: ctx.caminhos.opsEnv,
      arquivoAdmin: senhaAdmin.caminho || null,
      arquivoCoordenacao: senhaCoordenacao.caminho || null,
    },
  };
}
