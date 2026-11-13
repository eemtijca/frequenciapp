// Instala e executa operações de um snapshot protegido, com journal e pins físicos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  exigir,
  protegido,
  json,
  hash,
  sincronizar,
  exclusivo,
  operador,
  perfil,
  lerAmbiente,
  verificarEstadoLegado,
  verificarCheckout,
  verificarJournal,
  verificarPin,
  autorizar,
} from "./contrato.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pathSistema = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
function mkdir(nome) {
  fs.mkdirSync(nome, { mode: 0o700 });
  sincronizar(path.dirname(nome));
}
function resultado(r, mensagem) {
  exigir(!r.error && !r.signal && r.status === 0, mensagem);
  return r.stdout;
}
function comando(bin, args, env, fd = false) {
  return spawnSync(bin, args, {
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: fd
      ? ["ignore", "pipe", "pipe", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", 9]
      : undefined,
  });
}
function shell(p, env, codigo, args = [], fd = false) {
  return comando(
    "/bin/bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      'set -Eeuo pipefail; . "$1"; shift; ' + codigo,
      "operacao",
      `${p.snapshot}/scripts/servidor/comum.sh`,
      ...args,
    ],
    env,
    fd,
  );
}
function opcoes(args) {
  const o = {};
  while (args.length) {
    const n = args.shift();
    exigir(
      [
        "--fonte",
        "--app",
        "--config",
        "--prefixo",
        "--operador",
        "--bin-dir",
        "--plano",
        "--confirmar",
      ].includes(n),
      "Opção de instalação desconhecida.",
    );
    exigir(!Object.hasOwn(o, n), "Opção repetida.");
    o[n] = ["--plano", "--confirmar"].includes(n) ? true : args.shift();
  }
  exigir(Boolean(o["--plano"]) !== Boolean(o["--confirmar"]), "Escolher --plano ou --confirmar.");
  return o;
}
function inventariar(raiz, relativo, arquivos) {
  const nome = path.join(raiz, relativo),
    s = protegido(nome, fs.lstatSync(nome).isDirectory() ? "diretorio" : "arquivo");
  if (s.isDirectory())
    for (const n of fs.readdirSync(nome).sort())
      inventariar(raiz, path.join(relativo, n), arquivos);
  else arquivos[relativo] = fs.readFileSync(nome);
}
function validarOperadorEConfig(p) {
  operador(p.operador);
  protegido(p.app, "diretorio");
  protegido(p.config, "diretorio", true);
  for (const n of ["appEnv", "opsEnv", "identidade"]) protegido(p[n], "arquivo", true);
  const i = json(p.identidade);
  exigir(
    i.fase === "adotada" && /^[a-f0-9]{64}$/.test(i.trava),
    "Perfil Compose requer identidade explicitamente adotada.",
  );
  p.alvo = i.trava;
  p.projeto = i.projeto;
  p.identidadeSha256 = hash(fs.readFileSync(p.identidade));
  p.appEnvSha256 = hash(fs.readFileSync(p.appEnv));
  p.opsEnvSha256 = hash(fs.readFileSync(p.opsEnv));
}
function instalar(args) {
  exigir(process.getuid() === 0, "A instalação requer root.");
  const o = opcoes([...args]);
  const fonte = o["--fonte"],
    prefixo = o["--prefixo"] ?? "/opt/frequenciapp-controlador";
  exigir(
    typeof fonte === "string" &&
      typeof o["--app"] === "string" &&
      typeof o["--config"] === "string",
    "Informar --fonte, --app e --config.",
  );
  exigir(!fs.existsSync(prefixo), "Prefixo já existe; não sobrescrever controlador ou journal.");
  protegido(path.dirname(prefixo), "diretorio");
  const p = {
    versao: 1,
    tipo: "compose-host",
    prefixo,
    app: o["--app"],
    config: o["--config"],
    operador: o["--operador"],
    dados: `${prefixo}/dados`,
    snapshot: `${prefixo}/snapshot`,
    path: pathSistema,
    node: process.execPath,
  };
  for (const n of [fonte, p.app, p.config, prefixo])
    exigir(
      path.isAbsolute(n) && path.resolve(n) === n && !/[\s'"%]/.test(n),
      "Caminhos canônicos sem espaços ou metacaracteres são exigidos neste perfil.",
    );
  exigir(
    !p.app.startsWith(prefixo + "/") &&
      !prefixo.startsWith(p.app + "/") &&
      !fonte.startsWith(prefixo + "/"),
    "Snapshot e dados precisam estar fora do checkout.",
  );
  if (o["--bin-dir"]) {
    protegido(o["--bin-dir"], "diretorio");
    for (const n of fs.readdirSync(o["--bin-dir"])) protegido(`${o["--bin-dir"]}/${n}`);
    p.path = `${o["--bin-dir"]}:${p.path}`;
  }
  p.appEnv = `${p.config}/app.env`;
  p.opsEnv = `${p.config}/ops.env`;
  p.identidade = `${p.config}/identidade.json`;
  for (const n of ["estado", "backups", "logs", "locks"]) p[n] = `${p.dados}/${n}`;
  validarOperadorEConfig(p);
  const arquivos = {};
  inventariar(fonte, "scripts/servidor", arquivos);
  inventariar(fonte, "docker/app/migrar.mjs", arquivos);
  for (const n of ["cli.mjs", "contrato.mjs", "trancar.sh"])
    exigir(arquivos[`scripts/servidor/controlador/${n}`], "Fonte operacional incompleta.");
  // O instalador também funciona quando chamado de uma cópia revisada dos scripts.
  p.migradorSha256 = hash(arquivos["docker/app/migrar.mjs"]);
  const env = lerAmbiente(p, true);
  verificarEstadoLegado(p);
  verificarCheckout(p);
  exigir(
    (env.BACKUP_MODO ?? "compose") === "compose" &&
      !env.DATABASE_URL &&
      !env.DIRECT_URL &&
      !env.BACKUP_DATABASE_URL,
    "Primeiro perfil aceita apenas banco interno Compose sem conexões URL paralelas.",
  );
  const composes = env.COMPOSE_ARQUIVOS
    ? env.COMPOSE_ARQUIVOS.split(":")
    : ["compose.yml", "compose.servidor.yml", `compose.servidor-${env.PROXY_TIPO ?? "caddy"}.yml`];
  p.compose = composes.map((n, i) => {
    const original = path.isAbsolute(n) ? n : `${p.app}/${n}`;
    protegido(original);
    arquivos[`compose/${i}.yml`] = fs.readFileSync(original);
    return `${p.snapshot}/compose/${i}.yml`;
  });
  // A captura somente leitura precisa conferir a identidade atual antes de qualquer instalação.
  const pre = { ...p, snapshot: fonte };
  const conferencia = shell(
    pre,
    {
      ...env,
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      APP_DIR: p.app,
      SERVIDOR_SCRIPTS_DIR: `${fonte}/scripts/servidor`,
      COMPOSE_ARQUIVOS: composes.map((n) => (path.isAbsolute(n) ? n : `${p.app}/${n}`)).join(":"),
    },
    'montar_compose; conferir_identidade conferir; [ "$SERVIDOR_ALVO_CHAVE" = "$1" ]',
    [p.alvo],
  );
  exigir(
    conferencia.status === 0,
    "Identidade Compose efetiva não confere; nenhuma instalação aplicada.",
  );
  if (o["--plano"]) {
    console.log(
      JSON.stringify({
        plano: true,
        prefixo,
        app: p.app,
        operador: p.operador,
        alvo: p.alvo,
        snapshotArquivos: Object.keys(arquivos).length,
        cron: "não instalado",
        sudo: "não instalado",
      }),
    );
    return;
  }
  mkdir(prefixo);
  mkdir(p.snapshot);
  mkdir(p.dados);
  for (const n of ["estado", "backups", "logs", "locks", "journal", "pins"])
    mkdir(`${p.dados}/${n}`);
  const manifesto = {};
  for (const [nome, bytes] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(`${p.snapshot}/${nome}`), { recursive: true, mode: 0o700 });
    exclusivo(`${p.snapshot}/${nome}`, bytes);
    if (nome.endsWith(".sh")) {
      fs.chmodSync(`${p.snapshot}/${nome}`, 0o700);
      sincronizar(`${p.snapshot}/${nome}`);
    }
    manifesto[nome] = hash(bytes);
  }
  exclusivo(`${p.snapshot}/manifesto.json`, manifesto);
  p.manifestoSha256 = hash(fs.readFileSync(`${p.snapshot}/manifesto.json`));
  exclusivo(`${prefixo}/perfil.json`, p);
  const entrada = `#!/bin/sh\n# Entrada fixa: não carrega ambiente do chamador.\nexec /usr/bin/env -i PATH=${pathSistema} ${p.node} ${p.snapshot}/scripts/servidor/controlador/cli.mjs executar ${prefixo}/perfil.json "$@"\n`;
  exclusivo(`${prefixo}/executar`, Buffer.from(entrada));
  fs.chmodSync(`${prefixo}/executar`, 0o700);
  sincronizar(`${prefixo}/executar`);
  sincronizar(prefixo);
  perfil(`${prefixo}/perfil.json`);
  verificarJournal(p);
  console.log(
    JSON.stringify({
      instalado: true,
      entrada: `${prefixo}/executar`,
      perfil: `${prefixo}/perfil.json`,
      cron: "não instalado",
      sudo: "não instalado",
    }),
  );
}
function observar(p, env) {
  const ids = resultado(
    shell(p, env, "montar_compose; compose ps -aq", [], true),
    "Não foi possível observar os IDs Compose.",
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  exigir(
    ids.length > 0 && ids.every((id) => /^[a-zA-Z0-9_.-]+$/.test(id)),
    "IDs Compose indisponíveis.",
  );
  const raw = JSON.parse(
    resultado(comando("docker", ["inspect", ...ids], env, true), "Inspeção dos recursos falhou."),
  );
  exigir(Array.isArray(raw) && raw.length === ids.length, "Inspeção incompleta.");
  return raw.map((c) => {
    exigir(
      ids.includes(c.Id) &&
        c.Config?.Labels?.["com.docker.compose.project"] === p.projeto &&
        typeof c.Image === "string" &&
        typeof c.State?.Running === "boolean",
      "Recurso observado sem identidade/estado físico.",
    );
    return {
      id: c.Id,
      imagem: c.Image,
      servico: c.Config.Labels["com.docker.compose.service"],
      executando: c.State.Running,
      saude: c.State.Health?.Status ?? null,
    };
  });
}
async function fixar(p, env, operacao) {
  autorizar(`${p.prefixo}/perfil.json`, "atualizar");
  const origem = `${p.backups}/banco`,
    ponteiro = json(`${p.estado}/ultimo-backup.json`);
  exigir(
    /^frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}\.confirmado\.json$/.test(ponteiro.recibo ?? ""),
    "Atualização exige recibo confirmado.",
  );
  const { validarRecibo, conferirArtefatos } = await import(
    pathToFileURL(`${p.snapshot}/scripts/servidor/recibos.mjs`).href
  );
  const recibo = validarRecibo(json(`${origem}/${ponteiro.recibo}`));
  exigir(
    recibo.escopo.alvo === p.alvo &&
      recibo.escopo.banco === (env.POSTGRES_DB ?? "frequencia") &&
      recibo.escopo.schema === (env.DATABASE_SCHEMA ?? "public") &&
      recibo.remoto === (env.BACKUP_REMOTO ?? ""),
    "Recibo não corresponde ao alvo, banco, schema e destino adotados.",
  );
  if (env.BACKUP_REMOTO)
    exigir(
      recibo.etapas.remotoVerificado && ponteiro.verificadoRemoto === true,
      "Backup remoto não confirmado.",
    );
  else
    exigir(env.ATUALIZAR_PERMITIR_BACKUP_LOCAL === "true", "Backup local exige decisão explícita.");
  conferirArtefatos(origem, recibo);
  exigir(
    recibo.artefatos.some((a) => a.nome === ponteiro.arquivo && a.sha256 === ponteiro.sha256),
    "Ponteiro diverge do recibo.",
  );
  const pasta = `${p.dados}/pins/${operacao}`;
  mkdir(pasta);
  const arquivos = [];
  for (const n of [...recibo.artefatos.map((a) => a.nome), ponteiro.recibo]) {
    protegido(`${origem}/${n}`, "arquivo", true);
    const bytes = fs.readFileSync(`${origem}/${n}`);
    exclusivo(`${pasta}/${n}`, bytes);
    arquivos.push({ nome: n, sha256: hash(bytes) });
  }
  const bytes = fs.readFileSync(`${p.estado}/ultimo-backup.json`);
  exclusivo(`${pasta}/ponteiro.json`, bytes);
  arquivos.push({ nome: "ponteiro.json", sha256: hash(bytes) });
  exclusivo(`${pasta}/pin.json`, { versao: 1, operacao, alvo: p.alvo, arquivos });
  verificarPin(p, operacao);
}
const acoes = {
  atualizar: "atualizar.sh",
  "backup-banco": "backup-banco.sh",
  restaurar: "restaurar.sh",
  "backup-planilhas": "backup-planilhas.sh",
  agenda: "agenda.sh",
  "renovar-certificado": "renovar-certificado.sh",
  retencao: "controlador/retencao.sh",
};
function classificarAtualizacao(opcoes) {
  let ajuda = false,
    simular = false,
    registrar = false;
  for (let i = 0; i < opcoes.length; i++) {
    const n = opcoes[i];
    if (n === "--ajuda" || n === "-h") ajuda = true;
    else if (n === "--simular") simular = true;
    else if (n === "--registrar") registrar = true;
    else if (n === "--modo")
      exigir(["auto", "release", "main"].includes(opcoes[++i]), "Modo de atualização inválido.");
    else
      exigir(
        ["--forcar", "--permitir-migracoes"].includes(n),
        "Opção de atualização desconhecida.",
      );
  }
  exigir(!(simular && registrar), "--simular e --registrar são incompatíveis.");
  return ajuda ? "ajuda" : simular ? "simular" : registrar ? "registrar-atualizacao" : "preparar";
}
function iniciarIntencao(p, env, operacao, acao) {
  const pasta = `${p.dados}/journal/${operacao}`;
  mkdir(pasta);
  exclusivo(`${pasta}/intencao.json`, {
    versao: 1,
    operacao,
    alvo: p.alvo,
    acao,
    snapshot: p.manifestoSha256,
    em: new Date().toISOString(),
  });
  exclusivo(`${pasta}/observado-antes.json`, observar(p, env));
}
async function executar(arquivo, args, trancado) {
  const p = perfil(arquivo),
    env = lerAmbiente(p),
    acao = args[0],
    opcoes = args.slice(1);
  // O wrapper público do checkout é só um despachante. Nunca executa código
  // antigo do prefixo nem transfere sua autorização para uma geração obsoleta.
  if (
    !trancado &&
    acao === "instalar-rotinas" &&
    aqui !== `${p.snapshot}/scripts/servidor/controlador` &&
    !aqui.startsWith(`${p.prefixo}/`)
  ) {
    const r = spawnSync(`${p.prefixo}/executar`, args, {
      env: { PATH: pathSistema },
      stdio: "inherit",
    });
    process.exitCode = r.status ?? 1;
    return;
  }
  exigir(aqui === `${p.snapshot}/scripts/servidor/controlador`, "Geração obsoleta do controlador.");
  exigir(
    Object.hasOwn(acoes, acao) || ["estado", "instalar-rotinas"].includes(acao),
    "Operação não permitida; Compose arbitrário não é uma entrada do operador.",
  );
  const classe = acao === "atualizar" ? classificarAtualizacao(opcoes) : acao;
  env.COMPOSE_ARQUIVOS = p.compose.join(":");
  if (!trancado) {
    const r = spawnSync("/bin/bash", [`${aqui}/trancar.sh`, arquivo, ...args], {
      env,
      stdio: "inherit",
    });
    process.exitCode = r.status ?? 1;
    return;
  }
  autorizar(arquivo, acao);
  if (acao === "instalar-rotinas") {
    const { instalarRotinas } = await import("./cron.mjs");
    return instalarRotinas(p, opcoes);
  }
  if (acao === "estado") {
    console.log(JSON.stringify({ alvo: p.alvo, operacoes: verificarJournal(p), bloqueado: false }));
    return;
  }
  const leitura = ["ajuda", "simular"].includes(classe),
    preparar = classe === "preparar";
  if (leitura) env.SERVIDOR_CONTROLADOR_LEITURA = classe;
  const operacao = leitura ? "" : randomUUID(),
    pasta = `${p.dados}/journal/${operacao}`;
  if (preparar) env.SERVIDOR_CONTROLADOR_PREPARACAO = operacao;
  else if (!leitura) {
    env.SERVIDOR_CONTROLADOR_OPERACAO = operacao;
    env.SERVIDOR_CONTROLADOR_ACAO = classe;
  }
  env.SERVIDOR_ALVO_CHAVE = p.alvo;
  env.SERVIDOR_LOCK_HERDADO = `${p.locks}/operacoes-${p.alvo}.lock`;
  let status = 1,
    sinal = null;
  try {
    if (!leitura && !preparar) iniciarIntencao(p, env, operacao, classe);
    const filho = spawn("/bin/bash", [`${p.snapshot}/scripts/servidor/${acoes[acao]}`, ...opcoes], {
      env,
      stdio: [
        "inherit",
        "inherit",
        "inherit",
        "ignore",
        "ignore",
        "ignore",
        "ignore",
        "ignore",
        "ignore",
        9,
      ],
    });
    // Sinal não prova conclusão do filho ou quiescência do Docker. Não matar nem parar serviços.
    let interrompido = false;
    const sinais = ["SIGINT", "SIGTERM", "SIGHUP"];
    const receber = () => {
      interrompido = true;
    };
    for (const s of sinais) process.on(s, receber);
    try {
      [status, sinal] = await new Promise((resolve, reject) => {
        filho.once("error", reject);
        filho.once("close", (code, signal) => resolve([code, signal]));
      });
    } finally {
      for (const s of sinais) process.off(s, receber);
    }
    // Código interno 10 só classifica no-op enquanto não houve intenção. Não
    // transforma falha de atualização iniciada em sucesso nem fabrica um pin.
    const semMudanca = preparar && status === 10 && !fs.existsSync(pasta);
    exigir(
      (status === 0 || semMudanca) && !sinal && !interrompido,
      "Filho não concluiu com sucesso confirmado; estado incerto.",
    );
    exigir(
      !preparar || semMudanca || fs.existsSync(pasta),
      "Atualizador não informou aplicação nem no-op.",
    );
    if (!leitura && !semMudanca) {
      const observado = observar(p, env);
      exclusivo(`${pasta}/observado-depois.json`, observado);
      if (preparar) {
        exigir(
          observado.some(
            (c) =>
              c.servico === (env.SERVIDOR_SERVICO_APP ?? "app") &&
              c.executando &&
              c.saude === "healthy",
          ),
          "Saúde física não confirmada.",
        );
        verificarPin(p, operacao);
      }
      exclusivo(`${pasta}/concluida.json`, {
        versao: 1,
        operacao,
        alvo: p.alvo,
        intencaoSha256: hash(fs.readFileSync(`${pasta}/intencao.json`)),
        em: new Date().toISOString(),
        status: 0,
      });
    }
    process.exitCode = 0;
  } catch (e) {
    if (!leitura && fs.existsSync(pasta)) {
      let observado;
      try {
        observado = { confirmado: true, recursos: observar(p, env) };
      } catch {
        observado = { confirmado: false };
      }
      try {
        exclusivo(`${pasta}/incerta.json`, {
          versao: 1,
          operacao,
          alvo: p.alvo,
          status,
          sinal,
          observado,
          motivo: "Não foi possível confirmar a conclusão durável. Não é prova de quiescência.",
        });
      } catch {
        try {
          fs.writeFileSync(`${pasta}/incerta.json`, '{"bloqueado":true}\n', {
            flag: "wx",
            mode: 0o600,
          });
        } catch {}
      }
    }
    console.error(
      `[controlador] ${e.message} Nenhum rollback ou parada automática foi autorizado.`,
    );
    process.exitCode = Number.isInteger(status) && status > 0 ? status : 1;
  }
}
async function principal() {
  const [acao, arquivo, ...args] = process.argv.slice(2);
  if (acao === "instalar") return instalar(process.argv.slice(3));
  if (acao === "consultar-compose") {
    exigir(
      ["config", "ps", "images", "version", "logs"].includes(args[0]),
      "Consulta Compose não permitida.",
    );
    const p = perfil(arquivo);
    const env = {
      ...lerAmbiente(p),
      COMPOSE_ARQUIVOS: p.compose.join(":"),
      SERVIDOR_CONTROLADOR_LEITURA: "compose",
    };
    const r = spawnSync("/bin/bash", [`${p.snapshot}/scripts/servidor/compose.sh`, ...args], {
      env,
      stdio: "inherit",
    });
    process.exitCode = r.error ? 78 : (r.status ?? 1);
    return;
  }
  if (acao === "reconfigurar-rotinas") {
    const { reconfigurarRotinas } = await import("./reconfigurar.mjs");
    return reconfigurarRotinas(arquivo, args);
  }
  if (acao === "executar" || acao === "trancado")
    return executar(arquivo, args, acao === "trancado");
  const p = autorizar(arquivo, "atualizar"),
    env = lerAmbiente(p);
  if (acao === "iniciar") {
    const preparacao = process.env.SERVIDOR_CONTROLADOR_PREPARACAO;
    exigir(
      /^[a-f0-9-]{36}$/.test(preparacao ?? "") && !process.env.SERVIDOR_CONTROLADOR_OPERACAO,
      "Preparação de atualização ausente.",
    );
    env.COMPOSE_ARQUIVOS = p.compose.join(":");
    iniciarIntencao(p, env, preparacao, "atualizar");
    return;
  }
  const operacao = process.env.SERVIDOR_CONTROLADOR_OPERACAO;
  exigir(operacao, "Intenção de atualização ausente.");
  if (acao === "fixar") return fixar(p, env, operacao);
  if (acao === "validar-fonte") {
    protegido(`${args[0]}/docker/app/migrar.mjs`);
    exigir(
      hash(fs.readFileSync(`${args[0]}/docker/app/migrar.mjs`)) === p.migradorSha256,
      "Migrador alvo diverge do guard aprovado; adoção administrativa necessária.",
    );
    return;
  }
  if (acao === "validar-imagem") {
    const bytes = resultado(
      comando(
        "docker",
        [
          "run",
          "--rm",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--user",
          "65534:65534",
          "--entrypoint",
          "/bin/cat",
          args[0],
          "/app/docker/app/migrar.mjs",
        ],
        env,
        true,
      ),
      "Não foi possível ler o guard da imagem isolada.",
    );
    exigir(
      hash(Buffer.from(bytes)) === p.migradorSha256,
      "Imagem não contém o guard de migração aprovado.",
    );
    return;
  }
  throw new Error("Ação interna inválida.");
}
principal().catch((e) => {
  console.error(`[controlador] ${e.message}`);
  process.exitCode = 78;
});
