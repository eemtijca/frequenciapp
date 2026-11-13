// Valida o perfil protegido, o snapshot e o journal do controlador de um host Compose.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function exigir(ok, mensagem) {
  if (!ok) throw new Error(mensagem);
}
export function protegido(nome, tipo = "arquivo", privado = false) {
  exigir(
    path.isAbsolute(nome) && path.resolve(nome) === nome,
    "Caminho absoluto canônico obrigatório.",
  );
  let atual = "/";
  for (const parte of nome.split("/").filter(Boolean)) {
    atual = path.join(atual, parte);
    const s = fs.lstatSync(atual);
    exigir(
      !s.isSymbolicLink() && s.uid === 0,
      "Caminho precisa pertencer a root e não conter links.",
    );
    exigir(
      (s.mode & 0o022) === 0 || (s.isDirectory() && (s.mode & 0o1000) !== 0),
      "Caminho permite escrita por ator não administrativo.",
    );
  }
  const s = fs.lstatSync(nome);
  exigir(tipo === "diretorio" ? s.isDirectory() : s.isFile(), "Tipo de entrada inválido.");
  if (privado)
    exigir((s.mode & 0o077) === 0, "Configuração e journal precisam ser privados de root.");
  return s;
}
export function json(nome, privado = true) {
  const s = protegido(nome, "arquivo", privado);
  exigir(s.size <= 4 * 1024 * 1024, "Metadado excede limite.");
  return JSON.parse(fs.readFileSync(nome, "utf8"));
}
function arvoreProtegida(raiz) {
  const visitar = (nome) => {
    const s = fs.lstatSync(nome);
    exigir(
      s.uid === 0 &&
        (s.mode & 0o022) === 0 &&
        !s.isSymbolicLink() &&
        (s.isDirectory() || s.isFile()),
      "Checkout/metadado Git permite escrita por outro ator ou contém entrada não protegida.",
    );
    if (s.isDirectory()) for (const n of fs.readdirSync(nome)) visitar(path.join(nome, n));
  };
  protegido(raiz, "diretorio");
  exigir(fs.realpathSync(raiz) === raiz, "Raiz Git não canônica.");
  visitar(raiz);
}
export function verificarCheckout(p) {
  // Conferir antes de invocar Git: hooks, refs, config e objetos não podem ser
  // substituídos pelo operador, inclusive nos metadados de worktrees ligadas.
  arvoreProtegida(p.app);
  const entrada = `${p.app}/.git`,
    s = fs.lstatSync(entrada);
  let gitdir = entrada;
  if (s.isFile()) {
    const m = /^gitdir: ([^\r\n]+)\n?$/.exec(fs.readFileSync(entrada, "utf8"));
    exigir(m, "Ponteiro Git inválido.");
    gitdir = path.resolve(p.app, m[1]);
  }
  arvoreProtegida(gitdir);
  const comumArquivo = `${gitdir}/commondir`;
  let comum = gitdir;
  if (fs.existsSync(comumArquivo)) {
    const valor = fs.readFileSync(comumArquivo, "utf8").trim();
    exigir(valor && !/[\r\n\0]/.test(valor), "Common dir Git inválido.");
    comum = path.resolve(gitdir, valor);
    arvoreProtegida(comum);
  }
  // Stores alternativos permitem leituras fora das árvores conferidas. Este
  // perfil não os adota implicitamente nem tenta corrigir suas permissões.
  exigir(
    !fs.existsSync(`${comum}/objects/info/alternates`) &&
      !fs.existsSync(`${comum}/objects/info/http-alternates`),
    "Objetos Git externos requerem revisão e não são aceitos neste perfil.",
  );
  const env = {
    PATH: "/usr/bin:/bin",
    HOME: p.dados,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
  const r = spawnSync(
    "/usr/bin/git",
    ["-C", p.app, "config", "--null", "--list", "--show-origin", "--includes"],
    { env, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  exigir(!r.error && !r.signal && r.status === 0, "Configuração Git não pôde ser inventariada.");
  const campos = r.stdout.split("\0");
  exigir(
    campos.pop() === "" && campos.length % 2 === 0,
    "Inventário da configuração Git incompleto.",
  );
  for (let i = 0; i < campos.length; i += 2) {
    exigir(campos[i].startsWith("file:"), "Origem de configuração Git não permitida.");
    const origem = path.resolve(p.app, campos[i].slice(5));
    protegido(origem);
    const [chave, ...valor] = campos[i + 1].split("\n"),
      v = valor.join("\n");
    if (chave === "include.path" || /^includeif\..*\.path$/.test(chave)) {
      exigir(v && !/[\r\n\0~]/.test(v), "Include Git inválido.");
      protegido(path.resolve(path.dirname(origem), v));
    }
    if (chave === "core.hookspath") {
      exigir(v && !/[\r\n\0~]/.test(v), "Caminho de hooks Git inválido.");
      arvoreProtegida(path.resolve(p.app, v));
    }
    if (chave === "core.worktree")
      exigir(path.resolve(gitdir, v) === p.app, "Git aponta para outro checkout.");
    if (chave === "core.fsmonitor")
      exigir(v === "false", "Monitor Git externo não é adotado por este perfil.");
  }
}
export function sincronizar(nome) {
  const fd = fs.openSync(nome, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
export function exclusivo(nome, objeto) {
  const bytes = Buffer.isBuffer(objeto) ? objeto : Buffer.from(JSON.stringify(objeto) + "\n");
  const fd = fs.openSync(
    nome,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  sincronizar(path.dirname(nome));
  exigir(fs.readFileSync(nome).equals(bytes), "Persistência não conferida.");
}
export function operador(nome) {
  exigir(/^[a-z_][a-z0-9_-]*[$]?$/.test(nome ?? ""), "Operador inválido.");
  const id = spawnSync("/usr/bin/id", ["-u", nome], { encoding: "utf8" });
  const grupos = spawnSync("/usr/bin/id", ["-Gn", nome], { encoding: "utf8" });
  exigir(
    id.status === 0 && grupos.status === 0 && Number(id.stdout) > 0,
    "Operador não pode ser root.",
  );
  exigir(
    !grupos.stdout
      .trim()
      .split(/\s+/)
      .some((g) => ["root", "docker", "sudo", "wheel", "lxd", "disk", "containerd"].includes(g)),
    "Operador possui grupo administrativo ou acesso direto ao daemon.",
  );
  // A ausência em grupos não comprova políticas sudo/polkit externas; a adoção é administrativa.
  for (const socket of ["/var/run/docker.sock", "/run/docker.sock"]) {
    if (!fs.existsSync(socket)) continue;
    const s = fs.statSync(socket),
      gids = spawnSync("/usr/bin/id", ["-G", nome], { encoding: "utf8" });
    exigir(gids.status === 0, "Grupos do operador indisponíveis.");
    const acesso =
      s.uid === Number(id.stdout)
        ? s.mode & 0o200
        : gids.stdout.trim().split(/\s+/).includes(String(s.gid))
          ? s.mode & 0o020
          : s.mode & 0o002;
    exigir(!acesso, "Operador tem escrita direta no socket Docker.");
  }
}
export function lerAmbiente(p, capturarLegado = false) {
  protegido(p.appEnv, "arquivo", true);
  protegido(p.opsEnv, "arquivo", true);
  const r = spawnSync(
    "/bin/bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      'set -Eeuo pipefail; set -a; . "$1"; . "$2"; /usr/bin/env -0',
      "ambiente",
      p.appEnv,
      p.opsEnv,
    ],
    {
      env: { PATH: p.path, HOME: p.dados, TMPDIR: p.dados },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  exigir(r.status === 0, "Não foi possível carregar a configuração protegida.");
  const env = Object.fromEntries(
    r.stdout
      .toString()
      .split("\0")
      .filter(Boolean)
      .map((s) => {
        const n = s.indexOf("=");
        return [s.slice(0, n), s.slice(n + 1)];
      }),
  );
  if (capturarLegado) p.estadoLegado = env.ESTADO_DIR || "/var/lib/frequenciapp";
  for (const n of Object.keys(env))
    if (
      /^(?:NODE_|BASH_|BASH_FUNC_|LD_|DYLD_|GIT_|SERVIDOR_CONTROLADOR|SERVIDOR_LOCK_HERDADO)/.test(
        n,
      ) ||
      ["ENV", "SHELLOPTS", "BASHOPTS", "CDPATH", "DOCKER_HOST", "DOCKER_CONTEXT"].includes(n)
    )
      delete env[n];
  Object.assign(env, {
    PATH: p.path,
    HOME: p.dados,
    TMPDIR: p.dados,
    APP_DIR: p.app,
    APP_ENV_FILE: p.appEnv,
    OPS_ENV_FILE: p.opsEnv,
    SERVIDOR_CONFIG_DIR: p.config,
    SERVIDOR_IDENTIDADE_ARQUIVO: p.identidade,
    ESTADO_DIR: p.estado,
    LOG_DIR: p.logs,
    BACKUP_DIR: p.backups,
    BACKUP_BANCO_DIR: `${p.backups}/banco`,
    SERVIDOR_LOCK_DIR: p.locks,
    SERVIDOR_USUARIO: "root",
    SERVIDOR_AMBIENTE_INJETADO: "true",
    SERVIDOR_SCRIPTS_DIR: `${p.snapshot}/scripts/servidor`,
    SERVIDOR_CONTROLADOR_PERFIL: `${p.prefixo}/perfil.json`,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  });
  return env;
}
export function verificarEstadoLegado(p) {
  const raiz = p.estadoLegado;
  exigir(
    typeof raiz === "string" && path.isAbsolute(raiz) && path.resolve(raiz) === raiz,
    "ESTADO_DIR legado precisa ser absoluto e canônico.",
  );
  let existente = raiz;
  while (!fs.existsSync(existente)) {
    exigir(
      !fs.lstatSync(existente, { throwIfNoEntry: false })?.isSymbolicLink(),
      "Estado legado contém link inválido.",
    );
    existente = path.dirname(existente);
  }
  protegido(existente, "diretorio");
  if (existente !== raiz) return;
  const marcador = `${raiz}/atualizacao-em-andamento.json`;
  exigir(
    !fs.lstatSync(marcador, { throwIfNoEntry: false }),
    "Estado legado em andamento ou incerto; reconciliação administrativa obrigatória antes da adoção.",
  );
  const falha = `${raiz}/falha.json`;
  if (fs.lstatSync(falha, { throwIfNoEntry: false })) {
    const f = json(falha);
    exigir(
      f.migracoesPossivelmenteAplicadas === false &&
        typeof f.ref === "string" &&
        f.ref.length > 0 &&
        typeof f.commit === "string" &&
        f.commit.length > 0,
      "Falha legada indeterminada; reconciliação administrativa obrigatória.",
    );
  }
  for (const dir of [`${raiz}/journal`, `${path.dirname(raiz)}/journal`]) {
    if (!fs.lstatSync(dir, { throwIfNoEntry: false })) continue;
    protegido(dir, "diretorio", true);
    exigir(
      fs.readdirSync(dir).length === 0,
      "Journal anterior não reconciliado; um novo prefixo não autoriza adoção.",
    );
  }
}
export function perfil(arquivo, conferirSnapshot = true) {
  return conferirPerfil(arquivo, json(arquivo), conferirSnapshot);
}
function conferirPerfil(arquivo, p, conferirSnapshot = true, ambientes = null) {
  exigir(
    process.getuid() === 0,
    "Controlador requer entrada administrativa autorizada; não é setuid.",
  );
  exigir(
    [1, 2].includes(p.versao) &&
      p.tipo === "compose-host" &&
      arquivo === `${p.prefixo}/perfil.json`,
    "Perfil não adotado por este controlador.",
  );
  for (const nome of [
    "prefixo",
    "snapshot",
    "dados",
    "estado",
    "backups",
    "logs",
    "locks",
    "app",
    "config",
  ])
    protegido(p[nome], "diretorio");
  operador(p.operador);
  const identidade = json(p.identidade);
  exigir(
    identidade.fase === "adotada" &&
      identidade.trava === p.alvo &&
      hash(fs.readFileSync(p.identidade)) === p.identidadeSha256,
    "Identidade adotada mudou.",
  );
  for (const n of [p.appEnv, p.opsEnv]) protegido(n, "arquivo", true);
  exigir(
    p.versao !== 2 ||
      (p.snapshot === `${p.prefixo}/geracoes/${p.geracao}` && /^[a-f0-9-]{36}$/.test(p.geracao)),
    "Geração inválida no perfil.",
  );
  exigir(
    hash(ambientes?.get(p.appEnv) ?? fs.readFileSync(p.appEnv)) === p.appEnvSha256 &&
      hash(ambientes?.get(p.opsEnv) ?? fs.readFileSync(p.opsEnv)) === p.opsEnvSha256,
    "Configuração mudou; adoção explícita necessária.",
  );
  verificarEstadoLegado(p);
  verificarCheckout(p);
  if (conferirSnapshot) {
    const manifesto = json(`${p.snapshot}/manifesto.json`);
    exigir(
      hash(fs.readFileSync(`${p.snapshot}/manifesto.json`)) === p.manifestoSha256,
      "Manifesto do snapshot diverge do perfil.",
    );
    for (const [nome, sha] of Object.entries(manifesto)) {
      exigir(
        !path.isAbsolute(nome) && !nome.split("/").includes(".."),
        "Membro inválido no snapshot.",
      );
      protegido(`${p.snapshot}/${nome}`);
      exigir(
        hash(fs.readFileSync(`${p.snapshot}/${nome}`)) === sha,
        "Snapshot operacional alterado.",
      );
    }
  }
  return p;
}
export const SELETORES_ROTINAS = [
  "AGENDA_HABILITADA",
  "AGENDA_NOTIFICACOES",
  "AGENDA_PLANILHAS",
  "AGENDA_INDICADORES",
  "BACKUP_PLANILHAS_HABILITADO",
];
export function atualizarSeletores(bytes, seletores) {
  exigir(
    Object.keys(seletores).length === 5 &&
      SELETORES_ROTINAS.every((n) => ["true", "false"].includes(seletores[n])),
    "Informar somente os cinco seletores booleanos.",
  );
  const vistas = new Set();
  let texto = bytes
    .toString("utf8")
    .split(/(?<=\n)/)
    .map((linha) => {
      const nome = /^[ \t]*(?:export[ \t]+)?([A-Z_]+)[ \t]*=/.exec(linha)?.[1];
      if (!SELETORES_ROTINAS.includes(nome)) return linha;
      exigir(!vistas.has(nome), `Seletor ${nome} duplicado.`);
      vistas.add(nome);
      const m =
        /^([ \t]*(?:export[ \t]+)?[A-Z_]+[ \t]*=[ \t]*)("(?:true|false)"|'(?:true|false)'|true|false)([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/.exec(
          linha,
        );
      exigir(m, `Seletor ${nome} não é uma atribuição literal booleana.`);
      const aspas = ["'", '"'].includes(m[2][0]) ? m[2][0] : "";
      return `${m[1]}${aspas}${seletores[nome]}${aspas}${m[3]}${m[4] ?? ""}`;
    })
    .join("");
  for (const n of SELETORES_ROTINAS)
    if (!vistas.has(n)) {
      if (texto && !texto.endsWith("\n")) texto += "\n";
      texto += `${n}=${seletores[n]}\n`;
    }
  return Buffer.from(texto);
}

export function configuracaoRotinas(bytes, seletores) {
  const config = bytes === null ? {} : JSON.parse(bytes.toString("utf8"));
  exigir(
    config && typeof config === "object" && !Array.isArray(config),
    "Configuração do instalador inválida.",
  );
  const campos = [
    "agendaHabilitada",
    "agendaNotificacoes",
    "agendaPlanilhas",
    "agendaIndicadores",
    "backupPlanilhasHabilitado",
  ];
  for (const [indice, nome] of SELETORES_ROTINAS.entries())
    config[campos[indice]] = seletores[nome];
  return Buffer.from(JSON.stringify(config) + "\n");
}

// Somente esta leitura administrativa aceita uma publicação incompleta. Cada byte
// precisa pertencer aos estados antigo/novo de uma intenção durável e restrita.
export function retomadaRotinas(arquivo) {
  const prefixo = path.dirname(arquivo),
    atual = json(arquivo);
  exigir(
    atual.prefixo === prefixo && atual.dados === `${prefixo}/dados`,
    "Prefixo de retomada inválido.",
  );
  const raiz = `${prefixo}/dados/journal`;
  protegido(raiz, "diretorio", true);
  const pendentes = fs
    .readdirSync(raiz)
    .filter((n) => !fs.existsSync(`${raiz}/${n}/concluida.json`));
  if (!pendentes.length) return null;
  exigir(
    pendentes.length === 1 && /^[a-f0-9-]{36}$/.test(pendentes[0]),
    "Journal anterior incerto; reconfiguração recusada.",
  );
  const operacao = pendentes[0],
    pasta = `${raiz}/${operacao}`,
    i = json(`${pasta}/intencao.json`);
  exigir(
    i.versao === 1 &&
      i.operacao === operacao &&
      i.alvo === atual.alvo &&
      i.acao === "reconfigurar-rotinas" &&
      Array.isArray(i.arquivos),
    "Journal anterior incerto; reconfiguração recusada.",
  );
  exigir(!fs.existsSync(`${pasta}/incerta.json`), "Operação incerta bloqueia mutações.");
  const reg = i.arquivos.find((a) => a.caminho === arquivo);
  exigir(reg, "Transição sem perfil comprovado.");
  const p = JSON.parse(Buffer.from(reg.antes, "base64")),
    q = JSON.parse(Buffer.from(reg.depois, "base64"));
  exigir(
    p.prefixo === prefixo &&
      p.dados === `${prefixo}/dados` &&
      q.snapshot === `${prefixo}/geracoes/${operacao}` &&
      q.versao === 2 &&
      q.geracao === operacao,
    "Geração da transição inválida.",
  );
  const equivalencia = {
    ...q,
    versao: p.versao,
    snapshot: p.snapshot,
    compose: p.compose,
    manifestoSha256: p.manifestoSha256,
    appEnvSha256: p.appEnvSha256,
    opsEnvSha256: p.opsEnvSha256,
  };
  if (p.geracao === undefined) delete equivalencia.geracao;
  else equivalencia.geracao = p.geracao;
  exigir(
    JSON.stringify(equivalencia) === JSON.stringify(p),
    "Transição altera campos não autorizados do perfil.",
  );
  exigir(
    JSON.stringify(q.compose) ===
      JSON.stringify(p.compose.map((n) => q.snapshot + n.slice(p.snapshot.length))),
    "Compose da geração diverge.",
  );
  protegido(i.destino, "diretorio");
  const permitidos = new Map([
    [p.appEnv, 0o600],
    [p.opsEnv, 0o600],
    [arquivo, 0o600],
    [`${prefixo}/executar`, 0o700],
    [`${i.destino}/cron.d/frequenciapp`, 0o644],
    [`${i.destino}/logrotate.d/frequenciapp`, 0o644],
    [`${p.dados}/rotinas.json`, 0o600],
    [`${p.config}/instalador.json`, 0o600],
  ]);
  exigir(i.arquivos.length === permitidos.size, "Arquivos incompletos na transição.");
  const antigos = new Map(),
    novos = new Map();
  for (const a of i.arquivos) {
    exigir(
      permitidos.get(a.caminho) === a.modo && !antigos.has(a.caminho),
      "Destino não autorizado na transição.",
    );
    const antes = a.antes === null ? null : Buffer.from(a.antes, "base64"),
      depois = Buffer.from(a.depois, "base64");
    exigir(
      (antes === null ? a.antesSha256 === null : hash(antes) === a.antesSha256) &&
        hash(depois) === a.depoisSha256,
      "Bytes da transição não conferem.",
    );
    const s = fs.lstatSync(a.caminho, { throwIfNoEntry: false });
    if (s) protegido(a.caminho, "arquivo", a.modo === 0o600);
    const visivel = s ? fs.readFileSync(a.caminho) : null;
    exigir(
      visivel ? visivel.equals(depois) || (antes && visivel.equals(antes)) : antes === null,
      "Arquivo não corresponde ao estado antigo ou novo comprovado.",
    );
    antigos.set(a.caminho, antes);
    novos.set(a.caminho, depois);
  }
  for (const n of [p.appEnv, p.opsEnv])
    exigir(
      antigos.get(n) && atualizarSeletores(antigos.get(n), i.seletores).equals(novos.get(n)),
      "Transição modifica configuração além dos seletores.",
    );
  conferirPerfil(arquivo, p, true, antigos);
  const config = `${p.config}/instalador.json`;
  exigir(
    configuracaoRotinas(antigos.get(config), i.seletores).equals(novos.get(config)),
    "Transição altera configuração do instalador além dos seletores.",
  );
  conferirPerfil(arquivo, q, true, novos);
  verificarJournal(p, operacao);
  return { p, q, i, operacao, pasta };
}

export function verificarJournal(p, operacaoPermitida = "") {
  const raiz = `${p.dados}/journal`;
  protegido(raiz, "diretorio", true);
  const nomes = fs.readdirSync(raiz).sort();
  for (const n of nomes) {
    exigir(/^[a-f0-9-]{36}$/.test(n), "Entrada desconhecida no journal.");
    const pasta = `${raiz}/${n}`;
    protegido(pasta, "diretorio", true);
    const intent = json(`${pasta}/intencao.json`);
    exigir(
      intent.alvo === p.alvo && intent.operacao === n && intent.versao === 1,
      "Intenção inválida.",
    );
    exigir(
      !fs.existsSync(`${pasta}/incerta.json`),
      "Operação incerta bloqueia mutações. Revisão administrativa obrigatória.",
    );
    if (n === operacaoPermitida) continue;
    exigir(
      fs.existsSync(`${pasta}/concluida.json`),
      "Operação anterior em andamento ou incerta; mutações bloqueadas.",
    );
    const fim = json(`${pasta}/concluida.json`);
    exigir(
      fim.operacao === n &&
        fim.alvo === p.alvo &&
        fim.intencaoSha256 === hash(fs.readFileSync(`${pasta}/intencao.json`)),
      "Conclusão diverge da intenção.",
    );
    // A leitura não confia só na presença visível após falha de escrita.
    sincronizar(`${pasta}/concluida.json`);
    sincronizar(pasta);
    if (intent.acao === "atualizar") verificarPin(p, n);
  }
  return nomes;
}
export function verificarPin(p, operacao) {
  const pasta = `${p.dados}/pins/${operacao}`,
    r = json(`${pasta}/pin.json`);
  exigir(
    r.operacao === operacao &&
      r.alvo === p.alvo &&
      Array.isArray(r.arquivos) &&
      r.arquivos.length >= 4,
    "Pin incompleto.",
  );
  for (const a of r.arquivos) {
    exigir(typeof a.nome === "string" && path.basename(a.nome) === a.nome, "Nome inválido no pin.");
    protegido(`${pasta}/${a.nome}`, "arquivo", true);
    exigir(hash(fs.readFileSync(`${pasta}/${a.nome}`)) === a.sha256, "Backup fixado não confere.");
  }
  return r;
}
export function autorizar(arquivo, acao) {
  acao = { atualizacao: "atualizar", restauracao: "restaurar" }[acao] ?? acao;
  const p = perfil(arquivo);
  exigir(
    fileURLToPath(import.meta.url) === `${p.snapshot}/scripts/servidor/controlador/contrato.mjs`,
    "Geração obsoleta do controlador.",
  );
  exigir(process.env.SERVIDOR_ALVO_CHAVE === p.alvo, "Alvo da trava diverge do perfil adotado.");
  const s = fs.fstatSync(9),
    lock = fs.statSync(`${p.locks}/operacoes-${p.alvo}.lock`);
  exigir(
    s.ino === lock.ino && s.dev === lock.dev,
    "Trava herdada não corresponde ao alvo adotado.",
  );
  const token = process.env.SERVIDOR_CONTROLADOR_OPERACAO ?? "";
  if (token) {
    exigir(/^[a-f0-9-]{36}$/.test(token), "Identificador de operação inválido.");
    const i = json(`${p.dados}/journal/${token}/intencao.json`);
    exigir(
      i.alvo === p.alvo && i.acao === process.env.SERVIDOR_CONTROLADOR_ACAO,
      "Chamador não corresponde à intenção.",
    );
    exigir(
      acao === i.acao ||
        (i.acao === "atualizar" && acao === "backup-banco") ||
        (i.acao === "registrar-atualizacao" && acao === "atualizar"),
      "Operação filha não autorizada.",
    );
  } else if (process.env.SERVIDOR_CONTROLADOR_PREPARACAO) {
    exigir(
      acao === "atualizar" && /^[a-f0-9-]{36}$/.test(process.env.SERVIDOR_CONTROLADOR_PREPARACAO),
      "Preparação não autoriza operação filha.",
    );
  }
  verificarJournal(p, token);
  return p;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [, , acao, arquivo, nome] = process.argv;
    exigir(acao === "autorizar", "Ação inválida.");
    autorizar(arquivo, nome);
  } catch (e) {
    console.error(`[controlador] ${e.message}`);
    process.exitCode = 78;
  }
}
