// Reconhece somente argv/env/cwd do snapshot e usa socket privado, sem Docker interno.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Cliente } from "./atualizacao-integracao-adaptador.mjs";
import {
  exigir,
  iguais,
  pedidoPara,
  receitaBanco,
  hash,
} from "./atualizacao-integracao-receitas.mjs";
import { git, raizCompose } from "./atualizacao-integracao-fontes.mjs";

export function reconhecer(m, bin, argv, env, cwd, ids) {
  const v = m.vertical;
  exigir(cwd === v.raiz, "CWD");
  const permitidas = new Set(
    "PATH HOME TMPDIR GIT_CONFIG_NOSYSTEM GIT_CONFIG_GLOBAL GIT_ALLOW_PROTOCOL PWD OLDPWD SHLVL _ COMPOSE_PROJECT_NAME COMPOSE_ARQUIVOS BACKUP_PLANILHAS_HABILITADO ATUALIZAR_MODO ATUALIZAR_PERMITIR_BACKUP_LOCAL ATUALIZAR_ESPACO_MINIMO_MB ATUALIZAR_SAUDE_URL ATUALIZAR_VERIFICAR_SAUDE_PUBLICA APP_IMAGEM_REPOSITORIO APP_IMAGEM_BACKUP_REPOSITORIO BACKUP_CRIPTOGRAFIA BACKUP_AGE_DESTINATARIOS BACKUP_AGE_DESTINATARIOS_SHA256 BACKUP_ESPACO_MINIMO_MB BACKUP_REMOTO BACKUP_RCLONE_CONFIG POSTGRES_DB POSTGRES_USER APP_IMAGEM APP_IMAGEM_BACKUP COMMIT_SHA SERVIDOR_SCRIPTS_DIR SERVIDOR_ALVO_CHAVE SERVIDOR_LOCK_HERDADO SERVIDOR_USUARIO SERVIDOR_AMBIENTE_INJETADO SERVIDOR_CONTROLADOR_PERFIL SERVIDOR_CONTROLADOR_PREPARACAO SERVIDOR_CONTROLADOR_OPERACAO SERVIDOR_CONTROLADOR_ACAO APP_DIR APP_ENV_FILE OPS_ENV_FILE SERVIDOR_IDENTIDADE_ARQUIVO SERVIDOR_CONFIG_DIR ESTADO_DIR LOG_DIR BACKUP_DIR BACKUP_BANCO_DIR SERVIDOR_LOCK_DIR BACKUP_MODO BACKUP_RETER_DIAS BACKUP_RETER_MINIMO BACKUP_CATALOGO_PERSISTENTE BACKUP_EXIGIR_REMOTO DATABASE_SCHEMA BACKUP_DESTINATARIO_VERIFICADO BACKUP_BANCO_VERIFICADO".split(
      " ",
    ),
  );
  exigir(
    Object.keys(env).every((n) => permitidas.has(n)),
    "AMBIENTE",
  );
  for (const n of Object.keys(env))
    exigir(!/^(NODE_|LD_|DYLD_|DOCKER_|BASH_FUNC_)/.test(n), "AMBIENTE");
  for (const [n, val] of Object.entries({
    POSTGRES_DB: m.banco,
    POSTGRES_USER: m.usuario,
    DATABASE_SCHEMA: m.schema,
    BACKUP_MODO: "compose",
    SERVIDOR_USUARIO: "root",
    BACKUP_CRIPTOGRAFIA: "age",
  }))
    if (env[n]) exigir(env[n] === val, "AMBIENTE");
  const commit = env.COMMIT_SHA || git(v.app, ["rev-parse", "HEAD"]);
  const rev = Object.keys(m.revisoes).find((r) => m.revisoes[r].commit === commit);
  exigir(rev, "COMMIT");
  const imagem = m.revisoes[rev].imagem;
  if (env.APP_IMAGEM) exigir(env.APP_IMAGEM === imagem, "AMBIENTE");
  if (env.APP_IMAGEM_BACKUP)
    exigir(env.APP_IMAGEM_BACKUP === `ensaio/backup:main-${commit.slice(0, 12)}`, "AMBIENTE");
  exigir(!env.DATABASE_URL && !env.DIRECT_URL && !env.BACKUP_DATABASE_URL, "AMBIENTE");
  let nome,
    revisaoPedido = rev;
  if (bin === "curl") {
    exigir(
      iguais(argv, [
        "-fsS",
        "--retry",
        "12",
        "--retry-delay",
        "5",
        "--retry-all-errors",
        "--max-time",
        "15",
        "https://sintetico.invalid/api/saude",
      ]),
      "ARGV",
    );
    nome = "http-commit";
  } else {
    exigir(bin === "docker", "ARGV");
    // A imagem consultada pode ser B enquanto o checkout/ambiente ainda é A.
    // Somente as duas referências exatas do manifesto podem selecionar o alvo.
    const revisaoImagem = Object.keys(m.revisoes).find((r) => m.revisoes[r].imagem === argv[4]),
      revisaoLeitor = Object.keys(m.revisoes).find((r) => m.revisoes[r].imagem === argv[11]);
    if (iguais(argv, ["info", "--format", "{{json .}}"])) nome = "daemon";
    else if (
      iguais(argv, [
        "inspect",
        ids[fs.existsSync(`${v.raiz}/subiu`) ? "B" : "A"],
        ids.db,
        ids.caddy,
      ])
    )
      nome = "inspecionar";
    else if (
      revisaoImagem &&
      iguais(argv, [
        "image",
        "inspect",
        "--format",
        '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
        m.revisoes[revisaoImagem].imagem,
      ])
    ) {
      nome = "revisao-imagem";
      revisaoPedido = revisaoImagem;
    } else if (
      revisaoLeitor &&
      iguais(argv, [
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
        m.revisoes[revisaoLeitor].imagem,
        "/app/docker/app/migrar.mjs",
      ])
    ) {
      nome = "validar-imagem";
      revisaoPedido = revisaoLeitor;
    } else {
      exigir(
        argv[0] === "compose" &&
          argv[1] === "--project-name" &&
          argv[2] === m.projeto &&
          argv[3] === "--project-directory",
        "ARGV",
      );
      raizCompose(m, argv[4], rev);
      exigir(
        iguais(argv.slice(5, 9), [
          "--env-file",
          `${v.config}/app.env`,
          "--env-file",
          `${v.config}/ops.env`,
        ]),
        "ARGV",
      );
      exigir(argv[9] === "-f", "ARGV");
      const adotado = fs.existsSync(`${v.prefixo}/perfil.json`)
        ? `${v.prefixo}/snapshot/compose/0.yml`
        : `${v.app}/compose.yml`;
      exigir(
        argv[10] === adotado && hash(fs.readFileSync(adotado)) === v.composeSha256,
        "SNAPSHOT",
      );
      const a = argv.slice(11);
      if (iguais(a, ["config", "--format", "json"])) nome = "config";
      else if (iguais(a, ["config", "--quiet"])) nome = "config-quiet";
      else if (iguais(a, ["--profile", "backup", "config", "--services"])) nome = "servicos";
      else if (iguais(a, ["ps", "-aq"])) nome = "ids";
      else if (iguais(a, ["build", "app"])) nome = "construir";
      else if (iguais(a, ["up", "-d", "--wait", "--wait-timeout", "180"])) nome = "subir";
      else if (
        iguais(a, [
          "exec",
          "-T",
          "db",
          "psql",
          "-X",
          "-U",
          m.usuario,
          "-d",
          m.banco,
          "-v",
          "ON_ERROR_STOP=1",
          "-tAc",
          "SELECT current_database();",
        ])
      )
        nome = "identidade-banco";
      else
        for (const n of ["dump", "listar-dump", "sentinela"]) {
          if (iguais(a, ["exec", "-T", "db", ...receitaBanco(m, n).argv])) nome = n;
        }
      exigir(nome, "ARGV");
    }
  }
  return pedidoPara(m, nome, revisaoPedido);
}
export async function executarShim(arquivo, bin, argv) {
  const m = JSON.parse(fs.readFileSync(arquivo)),
    v = m.vertical,
    ids = JSON.parse(fs.readFileSync(`${v.raiz}/ids.json`));
  const pedido = reconhecer(m, bin, argv, process.env, process.cwd(), ids);
  // O cat finito do migrador é readonly; o CLI original reconstrói seu ambiente
  // sem campos de autoridade. Isso não concede autoridade a outros pedidos.
  const mutante = ["construir", "subir", "dump"].includes(pedido.receita);
  let fd9 = null;
  if (process.env.SERVIDOR_LOCK_HERDADO) {
    const s = fs.fstatSync(9),
      l = fs.statSync(process.env.SERVIDOR_LOCK_HERDADO);
    exigir(s.dev === l.dev && s.ino === l.ino, "TRAVA");
    fd9 = { dev: s.dev, ino: s.ino };
  }
  if (mutante) {
    exigir(fd9, "TRAVA");
    const { autorizar } = await import(
      pathToFileURL(`${v.prefixo}/snapshot/scripts/servidor/controlador/contrato.mjs`).href
    );
    autorizar(`${v.prefixo}/perfil.json`, "atualizar");
  }
  fs.appendFileSync(
    `${v.raiz}/shims.ndjson`,
    JSON.stringify({
      bin,
      argv,
      cwd: process.cwd(),
      receita: pedido.receita,
      revisao: pedido.revisao,
      fd9,
      pid: process.pid,
      ppid: process.ppid,
    }) + "\n",
    { mode: 0o600 },
  );
  const socket = net.createConnection(v.socket);
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const cliente = new Cliente(socket, socket);
  // Não terminar stdout/stderr físicos do processo quando uma operação conclui.
  const { Writable } = await import("node:stream");
  const destino = (stream) =>
    new Writable({
      write(b, _e, cb) {
        stream.write(b, cb);
      },
    });
  try {
    const r = await cliente.executar(pedido, {
      entrada: pedido.receita === "listar-dump" ? process.stdin : null,
      saida: destino(process.stdout),
      erro: destino(process.stderr),
    });
    await cliente.fechar();
    if (pedido.receita === "subir" && r.codigo === 0)
      fs.writeFileSync(`${v.raiz}/subiu`, "B\n", { flag: "wx", mode: 0o600 });
    return r.codigo;
  } catch (e) {
    await cliente.fechar().catch(() => {});
    throw e;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await executarShim(process.argv[2], process.argv[3], process.argv.slice(4));
  } catch (e) {
    process.stderr.write(`Adaptador recusou: ${e.code ?? e.message}\n`);
    process.exitCode = 78;
  }
}
