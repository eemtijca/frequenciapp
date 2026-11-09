// Cria uma pilha exclusiva, sem portas nem rotas, e executa o comando informado.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { capturasReadme, criarDestinoArtefatos, extrairArtefato } from "./artefatos.mjs";
import { acompanharContainer } from "./lifecycle.mjs";
import { criarLedger } from "./ledger.mjs";
import { prepararManifesto } from "./manifesto.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const label = "br.frequenciapp.isolamento";
const postgres =
  "postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac";

export function validarContainer(info, rodada, tipo, rede) {
  const host = info.HostConfig;
  if (
    info.Config.Labels?.[label] !== rodada ||
    info.Config.Labels?.[`${label}.tipo`] !== tipo ||
    host.NetworkMode !== rede ||
    host.Privileged ||
    host.PublishAllPorts ||
    Object.keys(host.PortBindings ?? {}).length ||
    host.Binds?.length ||
    info.Mounts.length ||
    host.ExtraHosts?.length ||
    host.Devices?.length ||
    host.CapAdd?.length ||
    !host.SecurityOpt?.includes("no-new-privileges:true") ||
    (tipo !== "banco" && !host.CapDrop?.includes("ALL")) ||
    host.PidMode ||
    host.IpcMode === "host" ||
    host.UsernsMode === "host"
  ) {
    throw new Error("Recurso não pertence ao perímetro da rodada.");
  }
  const tmpfs = host.Tmpfs ?? {};
  if (Object.keys(tmpfs).some((nome) => tipo !== "banco" || nome !== "/var/lib/postgresql/data"))
    throw new Error("Mount não autorizado na rodada.");
  if (tipo === "banco" && !tmpfs["/var/lib/postgresql/data"])
    throw new Error("Banco sem armazenamento descartável.");
}

function fontePermitida(nome) {
  const partes = nome.split("/");
  if (
    partes.some(
      (parte) =>
        [
          ".git",
          ".hermes",
          ".next",
          "node_modules",
          ".auth",
          "test-results",
          "playwright-report",
        ].includes(parte) ||
        (parte.startsWith(".env") && nome !== ".env.example"),
    )
  )
    return false;
  if (
    path.posix.isAbsolute(nome) ||
    nome.includes("\\") ||
    partes.some((p) => !p || p === "." || p === "..")
  )
    return false;
  if (partes.length === 1)
    return (
      nome === "Dockerfile" ||
      nome === ".gitignore" ||
      nome === ".env.example" ||
      /\.(?:json|ya?ml|ts|mjs|md)$/.test(nome) ||
      nome.startsWith(".prettier")
    );
  return [
    "src",
    "tests",
    "scripts",
    "prisma",
    "docker",
    "public",
    "docs",
    "infra",
    "design",
    ".github",
  ].includes(partes[0]);
}

const fontesProprias = [
  "tests/isolamento/executar.mjs",
  "tests/isolamento/executar.d.mts",
  "tests/isolamento/artefatos.mjs",
  "tests/isolamento/artefatos.d.mts",
  "tests/isolamento/lifecycle.mjs",
  "tests/isolamento/lifecycle.d.mts",
  "tests/isolamento/ledger.mjs",
  "tests/isolamento/manifesto.mjs",
  "tests/isolamento/manifesto.d.mts",
  "tests/isolamento/dependencias.Dockerfile",
  "tests/isolamento/iniciar.mjs",
  "tests/isolamento/runtime.mjs",
  "tests/isolamento/negativos.mjs",
  "tests/isolamento/setup-api.ts",
  "tests/isolamento/setup-playwright.ts",
  "tests/helpers/isolamento.mjs",
  "tests/helpers/isolamento.d.mts",
];

/** Novos arquivos externos ao executor exigem lista exata e hash; não varre untracked. */
export function copiarFontes(destino, { raizFonte = raiz, fontesNovas = [], versionados } = {}) {
  if (!versionados) {
    const git = spawnSync("git", ["ls-files", "-z", "--cached"], {
      cwd: raizFonte,
      encoding: "utf8",
    });
    if (git.status !== 0) throw new Error("Não foi possível inventariar a fonte de testes.");
    versionados = git.stdout.split("\0").filter(Boolean);
  }
  if (!Array.isArray(fontesNovas)) throw new Error("Lista de fontes novas inválida.");
  const nomes = new Map(
    versionados.filter(fontePermitida).map((nome) => [nome, { origem: "git" }]),
  );
  for (const nome of fontesProprias)
    if (!nomes.has(nome) && lstatSync(path.join(raizFonte, nome), { throwIfNoEntry: false }))
      nomes.set(nome, { origem: "executor" });
  for (const item of fontesNovas) {
    if (
      !item ||
      typeof item.caminho !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? "") ||
      !fontePermitida(item.caminho) ||
      !/\.(?:[cm]?[jt]sx?|mts|css|sql|prisma|json|ya?ml|md|sh)$/.test(item.caminho) ||
      /(?:^|\/)(?:privad[oa]s?|secrets?|credenciais)(?:\/|$)/i.test(item.caminho) ||
      /(?:^|\/)[^/]*(?:segredo|secret|credencial|credential|token|privad|storage[-_]?state|session|sessao|sessoes)[^/]*\.(?:json|ya?ml|md)$/i.test(
        item.caminho,
      ) ||
      nomes.has(item.caminho)
    )
      throw new Error("Fonte nova inválida, privada ou duplicada.");
    nomes.set(item.caminho, { origem: "lista-explicita", sha256: item.sha256 });
  }
  const arquivos = [];
  for (const [nome, registro] of nomes) {
    let atual = raizFonte;
    for (const parte of nome.split("/")) {
      atual = path.join(atual, parte);
      if (lstatSync(atual).isSymbolicLink())
        throw new Error("Fonte de teste não aceita links em nenhum componente.");
    }
    if (!lstatSync(atual).isFile()) throw new Error("Fonte de teste deve ser arquivo regular.");
    const dados = readFileSync(atual);
    const sha256 = createHash("sha256").update(dados).digest("hex");
    if (registro.sha256 && registro.sha256 !== sha256)
      throw new Error("Hash da fonte nova diverge da lista autorizada.");
    arquivos.push({
      nome,
      dados,
      origem: registro.origem,
      sha256,
      modo: lstatSync(atual).mode & 0o111 ? 0o755 : 0o644,
    });
  }
  for (const arquivo of arquivos) {
    const alvo = path.join(destino, arquivo.nome);
    mkdirSync(path.dirname(alvo), { recursive: true });
    writeFileSync(alvo, arquivo.dados, { mode: arquivo.modo, flag: "wx" });
  }
  writeFileSync(
    path.join(destino, ".dockerignore"),
    ".git\n.hermes\n.env*\n!.env.example\nnode_modules\n.next\ntest-results\nplaywright-report\n",
  );
  return arquivos.map(({ nome, origem, sha256 }) => ({ caminho: nome, origem, sha256 }));
}

/** Executada por node dentro da imagem final, sem dependências ou scripts da imagem de testes. */
export async function ensaiarDistribuicao(prova, deps) {
  if (!deps) {
    const { readFileSync, readlinkSync, readdirSync } = await import("node:fs");
    const { execFileSync, spawn } = await import("node:child_process");
    const { default: pg } = await import("pg");
    const { default: net } = await import("node:net");
    const { setTimeout: esperar } = await import("node:timers/promises");
    deps = {
      async perimetro() {
        if (
          readlinkSync("/proc/self/ns/net") !== prova.rede ||
          readFileSync("/proc/net/dev", "utf8")
            .split("\n")
            .slice(2)
            .filter((s) => s.includes(":"))
            .some((s) => s.split(":")[0].trim() !== "lo")
        )
          throw new Error("Namespace da distribuição divergente.");
        await new Promise((resolve, reject) => {
          const s = net.connect({ host: prova.ipCanario, port: 4001 });
          s.setTimeout(1000, () => {
            s.destroy();
            reject(new Error("Canário sem recusa de rota."));
          });
          s.once("connect", () => {
            s.destroy();
            reject(new Error("Canário alcançável."));
          });
          s.once("error", (e) => (e.code === "ENETUNREACH" ? resolve() : reject(e)));
        });
      },
      async consultar(sql) {
        for (let tentativa = 0; tentativa < 60; tentativa++) {
          const c = new pg.Client({
            connectionString: process.env.DATABASE_URL,
            connectionTimeoutMillis: 1000,
          });
          try {
            try {
              await c.connect();
            } catch (erro) {
              if (!["ECONNREFUSED", "57P03", "ETIMEDOUT"].includes(erro.code)) throw erro;
              await esperar(500);
              continue;
            }
            return (await c.query(sql)).rows[0];
          } finally {
            await c.end();
          }
        }
        throw new Error("Banco da distribuição indisponível.");
      },
      async comando(programa, argumentos, ambiente) {
        execFileSync(programa, argumentos, { stdio: "inherit", env: ambiente });
      },
      async servidor(ambiente) {
        const url = new URL(ambiente.DATABASE_URL);
        url.searchParams.set("application_name", `distribuicao_${prova.rodada}`);
        const env = {
          ...ambiente,
          DATABASE_URL: url.href,
          MIGRAR_NA_PARTIDA: "true",
          HOSTNAME: "127.0.0.1",
          PORT: "3000",
          POOL_MAX_CONEXOES: "1",
        };
        const filho = spawn("./docker/app/entrypoint.sh", [], { env, stdio: "inherit" });
        let terminou = false;
        let erro;
        const fechado = new Promise((resolve) => {
          filho.once("error", (e) => {
            erro = e;
            terminou = true;
            resolve({ codigo: null, sinal: null });
          });
          filho.once("exit", (codigo, sinal) => {
            terminou = true;
            resolve({ codigo, sinal });
          });
        });
        const handlers = new Map(
          ["SIGHUP", "SIGINT", "SIGTERM"].map((sinal) => [sinal, () => filho.kill(sinal)]),
        );
        for (const [sinal, handler] of handlers) process.on(sinal, handler);
        return {
          async saude() {
            for (let i = 0; i < 60; i++) {
              if (terminou) throw erro ?? new Error("Entrypoint encerrou antes da saúde HTTP.");
              try {
                const r = await fetch("http://127.0.0.1:3000/api/saude", {
                  redirect: "error",
                  signal: AbortSignal.timeout(1000),
                });
                if (r.ok && (await r.json()).ok === true) return;
              } catch {
                /* A disponibilidade tem prazo, sem aceitar outra origem. */
              }
              await esperar(500);
            }
            throw new Error("Standalone distribuído não comprovou saúde HTTP.");
          },
          async ownership() {
            if (terminou || !filho.pid || readlinkSync(`/proc/${filho.pid}/ns/net`) !== prova.rede)
              throw new Error("Processo HTTP não pertence ao namespace da distribuição.");
            // O Next altera process.title e, portanto, o cmdline do processo.
            const executavel = readlinkSync(`/proc/${filho.pid}/exe`);
            const vars = new Map(
              readFileSync(`/proc/${filho.pid}/environ`, "utf8")
                .split("\0")
                .map((v) => {
                  const p = v.indexOf("=");
                  return [v.slice(0, p), v.slice(p + 1)];
                }),
            );
            if (
              executavel !== readlinkSync("/proc/self/exe") ||
              vars.get("DATABASE_URL") !== env.DATABASE_URL ||
              vars.get("DATABASE_SCHEMA") !== "public"
            )
              throw new Error("Standalone ou banco efetivo divergente do processo criado.");
            const inodes = ["tcp", "tcp6"].flatMap((nome) =>
              readFileSync(`/proc/net/${nome}`, "utf8")
                .trim()
                .split("\n")
                .slice(1)
                .map((l) => l.trim().split(/\s+/))
                .filter((c) => c[1].split(":").at(-1) === "0BB8" && c[3] === "0A")
                .map((c) => `socket:[${c[9]}]`),
            );
            const fds = readdirSync(`/proc/${filho.pid}/fd`).map((fd) => {
              try {
                return readlinkSync(`/proc/${filho.pid}/fd/${fd}`);
              } catch (e) {
                if (e.code === "ENOENT") return "";
                throw e;
              }
            });
            if (!inodes.length || !inodes.some((inode) => fds.includes(inode)))
              throw new Error("Listener HTTP sem ownership positivo do standalone criado.");
          },
          async encerrar() {
            try {
              if (terminou)
                throw erro ?? new Error("Standalone encerrou antes do término do ensaio.");
              filho.kill("SIGTERM");
              let prazo;
              const resultado = await Promise.race([
                fechado,
                new Promise((_, reject) => {
                  prazo = setTimeout(
                    () => reject(new Error("Standalone não encerrou no prazo.")),
                    10_000,
                  );
                }),
              ]).finally(() => clearTimeout(prazo));
              if (resultado.codigo !== 0 || resultado.sinal)
                throw new Error("Standalone não confirmou encerramento limpo.");
            } finally {
              if (!terminou) {
                filho.kill("SIGKILL");
                await fechado;
              }
              for (const [sinal, handler] of handlers) process.removeListener(sinal, handler);
            }
          },
        };
      },
    };
  }
  await deps.perimetro();
  const inicial = await deps.consultar(`select current_database() as banco, current_user as papel,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')) as objetos`);
  if (
    inicial?.banco !== `ft_${prova.rodada}` ||
    inicial?.papel !== `ft_${prova.rodada}` ||
    inicial?.objetos !== 0
  )
    throw new Error("Distribuição exige banco exclusivo vazio e identidade comprovada.");
  const ambiente = {
    ...process.env,
    ADMIN_EMAIL: "bootstrap@escola.exemplo",
    ADMIN_SENHA: "BootstrapFrequencia2026",
    ADMIN_NOME: "Bootstrap",
    CONTA_EMAIL: "demo@escola.exemplo",
    CONTA_SENHA: "DemoFrequencia2026",
    CONTA_NOME: "Demo",
    SEED_PERFIL: "leve",
  };
  await deps.comando("node", ["docker/app/migrar.mjs"], ambiente);
  await deps.comando(
    "node",
    ["scripts/administracao/criar-admin.mjs", "--somente-criar"],
    ambiente,
  );
  await deps.comando("node", ["scripts/administracao/criar-coordenacao.mjs"], ambiente);
  await deps.comando("node", ["scripts/seed/seed.mjs"], ambiente);
  const final = await deps.consultar(`select
    (select count(*)::int from usuarios where email='bootstrap@escola.exemplo' and papel='ADMIN' and ativo) as admin,
    (select count(*)::int from usuarios where email='demo@escola.exemplo' and papel='COORDENACAO' and ativo) as coordenacao,
    (select count(*)::int from turmas) as turmas, (select count(*)::int from alunos) as alunos`);
  if (final?.admin !== 1 || final?.coordenacao !== 1 || final?.turmas !== 9 || !(final?.alunos > 0))
    throw new Error("Administração ou seed da distribuição sem resultado persistido esperado.");
  if (!/^[a-f0-9]{32}$/.test(prova.rodada)) throw new Error("Identidade da distribuição inválida.");
  const servidor = await deps.servidor(ambiente);
  let original;
  try {
    await servidor.saude();
    await servidor.ownership();
    const runtime = await deps.consultar(`select current_database() as banco, current_user as papel,
      current_schema() as schema, (select count(*)::int from pg_stat_activity
      where application_name='distribuicao_${prova.rodada}' and datname=current_database()
      and usename=current_user and client_addr='127.0.0.1'::inet) as conexoes`);
    if (
      runtime?.banco !== inicial.banco ||
      runtime?.papel !== inicial.papel ||
      runtime?.schema !== "public" ||
      runtime?.conexoes !== 1
    )
      throw new Error("Runtime distribuído não comprovou o mesmo banco migrado e semeado.");
  } catch (erro) {
    original = erro;
  }
  try {
    await servidor.encerrar();
  } catch (erro) {
    original ??= erro;
  }
  if (original) throw original;
}

export async function executar(argv = process.argv.slice(2)) {
  const indice = argv.indexOf("--");
  const opcoes = new Map();
  const entradas = indice >= 0 ? argv.slice(0, indice) : argv;
  for (let i = 0; i < entradas.length; i++) {
    const chave = entradas[i];
    if (
      !["--preparar", "--validar-distribuicao", "--artefatos", "--fontes-novas"].includes(chave) ||
      opcoes.has(chave)
    )
      throw new Error("Opções do executor inválidas.");
    if (["--artefatos", "--fontes-novas"].includes(chave)) {
      const valor = entradas[++i];
      if (!valor || !path.isAbsolute(valor))
        throw new Error("Opção exige caminho absoluto explícito.");
      opcoes.set(chave, valor);
    } else opcoes.set(chave, true);
  }
  const preparar = opcoes.has("--preparar");
  const distribuicao = opcoes.has("--validar-distribuicao");
  const comando = indice >= 0 ? argv.slice(indice + 1) : [];
  const capturas = comando.some((arg) => arg.includes("imagens.spec.ts"));
  if (
    (preparar && distribuicao) ||
    ((preparar || distribuicao) && (comando.length || opcoes.has("--artefatos")))
  )
    throw new Error("Fases exclusivas não aceitam comando ou destino de artefatos da suíte.");
  if (!preparar && !distribuicao && !comando.length)
    throw new Error("Uso: node tests/isolamento/executar.mjs -- <programa> <argumentos>");
  if (
    Object.keys(process.env).some(
      (chave) =>
        /^(DATABASE_|DIRECT_URL$|APP_URL$|TEST_BASE_URL$|AUTH_SECRET$|GOOGLE_|PUSH_|CRON_SECRET$|NODE_OPTIONS$|PG|DOCKER_HOST$|DOCKER_CONTEXT$|COMPOSE_)/.test(
          chave,
        ) && process.env[chave],
    )
  )
    throw new Error(
      "Ambiente externo recusado. Iniciar o executor sem variáveis de conexão, segredos ou overrides.",
    );
  const rodada = randomBytes(16).toString("hex");
  const nome = `frequenciapp-teste-${rodada}`;
  const pasta = mkdtempSync(path.join(tmpdir(), "frequenciapp-isolamento-"));
  chmodSync(pasta, 0o700);
  const configDocker = path.join(pasta, "docker");
  mkdirSync(configDocker, { mode: 0o700 });
  const prefixo =
    process.env.FREQUENCIAPP_DOCKER_SUDO === "1" ? ["sudo", "-n", "docker"] : ["docker"];
  const envHost = { PATH: process.env.PATH, HOME: pasta };
  const dockerArgs = (...args) => [...prefixo.slice(1), "--config", configDocker, ...args];
  function docker(...args) {
    const r = spawnSync(prefixo[0], dockerArgs(...args), {
      env: envHost,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (r.error || r.status !== 0) {
      if (args[0] === "create" || (args[0] === "network" && args[1] === "create"))
        ledger.incerto(args[0] === "create" ? "container" : "rede");
      throw new Error(
        `Docker recusou ou falhou em ${args[0]}; operação interrompida. ${r.stderr?.trim().slice(-1000) ?? ""}`,
      );
    }
    return r.stdout.trim();
  }
  const ledger = criarLedger(path.join(pasta, "recursos.json"), rodada);
  const recursos = [];
  const imagens = [];
  let original;
  let status = 0;
  let tarefa;
  let clienteBuild;
  let clienteAtivo;
  let sinalRecebido;
  let redeCanario;
  let exportacao;
  const sinalizar = (sinal) => {
    if (sinalRecebido) return;
    sinalRecebido = sinal;
    status ||= { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[sinal];
    ledger.estado.sinal = sinal;
    ledger.estado.status = status;
    try {
      ledger.salvar();
    } catch (erro) {
      original ??= erro;
    }
    clienteBuild?.kill(sinal);
    if (tarefa) {
      try {
        const info = inspecionar(tarefa.id);
        validarContainer(info, rodada, tarefa.tipo, tarefa.rede);
        if (info.State.Running) {
          docker("kill", "--signal", sinal, tarefa.id);
          if (inspecionar(tarefa.id).State.Running)
            docker("stop", "--signal", sinal, "--time", "10", tarefa.id);
        }
      } catch (erro) {
        original ??= erro;
        clienteAtivo?.kill("SIGTERM");
        anotarProblema("sinal", tarefa.id);
      }
    }
  };
  function anotarProblema(fase, id) {
    try {
      ledger.problema(fase, id);
    } catch (erro) {
      original ??= erro;
      status ||= 1;
    }
  }
  const sinais = new Map(
    ["SIGHUP", "SIGINT", "SIGTERM"].map((sinal) => [sinal, () => sinalizar(sinal)]),
  );
  for (const [sinal, handler] of sinais) process.on(sinal, handler);
  const inspecionar = (id) => JSON.parse(docker("inspect", id))[0];
  function criar(tipo, rede, imagem, argumentos, ambiente = {}) {
    if (sinalRecebido) throw new Error("Execução interrompida.");
    const identificador = `${nome}-${tipo}`;
    if (docker("container", "ls", "-aq", "--filter", `name=^/${identificador}$`))
      throw new Error("Nome de recurso já existe; não será adotado.");
    const id = docker(
      "create",
      "--name",
      identificador,
      "--label",
      `${label}=${rodada}`,
      "--label",
      `${label}.tipo=${tipo}`,
      "--network",
      rede,
      "--init",
      "--security-opt",
      "no-new-privileges:true",
      ...(tipo === "banco"
        ? ["--tmpfs", "/var/lib/postgresql/data:rw,nosuid,noexec,size=536870912"]
        : ["--cap-drop", "ALL"]),
      "--memory",
      "2g",
      "--cpus",
      "2",
      "--pids-limit",
      "512",
      ...Object.entries(ambiente).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
      imagem,
      ...argumentos,
    );
    recursos.push({ id, tipo, rede });
    ledger.registrar("containers", { id, tipo, rede });
    validarContainer(inspecionar(id), rodada, tipo, rede);
    return id;
  }
  async function construir(imagem, contexto, arquivo) {
    if (sinalRecebido) throw new Error("Execução interrompida antes do build.");
    if (docker("image", "ls", "-q", "--filter", `reference=${imagem}`))
      throw new Error("Imagem já existe; não será substituída.");
    const r = await new Promise((resolve) => {
      const stdout = [],
        stderr = [];
      clienteBuild = spawn(
        prefixo[0],
        dockerArgs("build", "--label", `${label}=${rodada}`, "-f", arquivo, "-t", imagem, contexto),
        { env: envHost, stdio: ["ignore", "pipe", "pipe"] },
      );
      clienteBuild.stdout.on("data", (d) => stdout.push(d));
      clienteBuild.stderr.on("data", (d) => stderr.push(d));
      clienteBuild.once("error", (error) => {
        clienteBuild = undefined;
        resolve({ error });
      });
      clienteBuild.once("close", (status, signal) => {
        clienteBuild = undefined;
        resolve({
          status,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
    writeFileSync(
      path.join(pasta, `${imagem.split(":").at(-1)}.log`),
      `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
      { mode: 0o600 },
    );
    if (r.error || r.status !== 0 || r.signal) {
      ledger.incerto("imagem");
      throw new Error(`Preparo da imagem falhou. Evidências privadas em ${pasta}.`);
    }
    let info;
    try {
      info = JSON.parse(docker("image", "inspect", imagem))[0];
    } catch (erro) {
      ledger.incerto("imagem");
      throw erro;
    }
    imagens.push({ id: info.Id, nome: imagem });
    ledger.registrar("imagens", { id: info.Id, nome: imagem });
    if (info.Config.Labels?.[label] !== rodada) throw new Error("Imagem sem ownership da rodada.");
    return info.Id;
  }
  async function acompanhar(recurso) {
    const log = [];
    const cliente = (args, transmitir = false) =>
      new Promise((resolve, reject) => {
        const filho = spawn(prefixo[0], dockerArgs(...args), {
          env: envHost,
          stdio: ["ignore", "pipe", "pipe"],
        });
        clienteAtivo = filho;
        const saida = [];
        filho.stdout.on("data", (data) => saida.push(data));
        if (transmitir)
          for (const stream of [filho.stdout, filho.stderr])
            stream.on("data", (data) => {
              log.push(data);
              process.stdout.write(data);
            });
        const prazo = transmitir
          ? undefined
          : setTimeout(() => {
              filho.kill("SIGTERM");
              reject(new Error("Tempo de espera pelo encerramento da tarefa excedido."));
            }, 30_000);
        filho.once("error", (erro) => {
          clearTimeout(prazo);
          reject(erro);
        });
        filho.once("close", (codigo, sinal) => {
          clearTimeout(prazo);
          clienteAtivo = undefined;
          resolve({ codigo, sinal, saida: Buffer.concat(saida).toString("utf8") });
        });
      });
    try {
      return await acompanharContainer(recurso.id, {
        logs: (id) => cliente(["logs", "--follow", id], true),
        esperar: (id) => cliente(["wait", id]),
        inspecionar: (id) => {
          const info = inspecionar(id);
          validarContainer(info, rodada, recurso.tipo, recurso.rede);
          return info;
        },
      });
    } finally {
      writeFileSync(path.join(pasta, `${recurso.tipo}.log`), Buffer.concat(log), { mode: 0o600 });
    }
  }
  try {
    const destinoArtefatos =
      preparar || distribuicao
        ? undefined
        : criarDestinoArtefatos(opcoes.get("--artefatos") ?? path.join(pasta, "artefatos"), raiz);
    let fontesNovas = [];
    if (opcoes.has("--fontes-novas")) {
      const arquivoLista = opcoes.get("--fontes-novas");
      if (!lstatSync(arquivoLista).isFile() || lstatSync(arquivoLista).isSymbolicLink())
        throw new Error("Lista de fontes novas deve ser arquivo regular sem link.");
      fontesNovas = JSON.parse(readFileSync(arquivoLista, "utf8"));
    }
    docker("info", "--format", "{{.ServerVersion}}");
    const fonte = path.join(pasta, "fonte");
    mkdirSync(fonte);
    const fontesCopiadas = copiarFontes(fonte, { fontesNovas });
    writeFileSync(path.join(pasta, "fontes.json"), JSON.stringify(fontesCopiadas), { mode: 0o600 });
    // Não aceitar PNG versionado como resultado novo de uma captura ignorada ou falha.
    if (capturas)
      for (const arquivo of capturasReadme)
        rmSync(path.join(fonte, "docs/imagens", arquivo), { force: true });
    let appId;
    if (distribuicao) {
      for (const arquivos of [["compose.yml"], ["compose.yml", "compose.ci.yml"]]) {
        const r = spawnSync(
          prefixo[0],
          dockerArgs(
            "compose",
            "--project-directory",
            fonte,
            "--env-file",
            "/dev/null",
            "--project-name",
            nome,
            ...arquivos.flatMap((arquivo) => ["-f", path.join(fonte, arquivo)]),
            "config",
            "--quiet",
          ),
          {
            env: { ...envHost, AUTH_SECRET: randomBytes(32).toString("hex") },
            encoding: "utf8",
          },
        );
        if (r.error || r.status !== 0)
          throw new Error("Configuração Compose inválida; nenhum serviço será iniciado.");
      }
      appId = await construir(`${nome}:distribuicao`, fonte, path.join(fonte, "Dockerfile"));
    } else {
      const deps = path.join(pasta, "dependencias");
      mkdirSync(deps);
      for (const arquivo of [
        "package.json",
        "pnpm-lock.yaml",
        "prisma",
        "prisma.config.ts",
        "scripts/assets",
      ])
        cpSync(path.join(fonte, arquivo), path.join(deps, arquivo), { recursive: true });
      const depsId = await construir(
        `${nome}:deps`,
        deps,
        path.join(raiz, "tests/isolamento/dependencias.Dockerfile"),
      );
      if (preparar) {
        process.stdout.write(`[isolamento] dependências prontas: ${depsId}\n`);
        return status;
      }
      const dockerfile = path.join(pasta, "app.Dockerfile");
      writeFileSync(
        dockerfile,
        `# Build sintético sem segredos ou acesso a banco.\nFROM ${nome}:deps\nWORKDIR /work\nCOPY . .\nENV NEXT_TELEMETRY_DISABLED=1 CI=1 AUTH_SECRET=segredo-sintetico-de-build-com-32-bytes DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build PERMITIR_HTTP=true\nRUN node scripts/assets/copiar-swagger-ui.mjs && node node_modules/next/dist/bin/next build\nRUN mkdir -m 700 /run/frequenciapp-isolamento && touch /run/frequenciapp-isolamento/runtime.log && chmod 600 /run/frequenciapp-isolamento/runtime.log && mkdir -p /work/test-results /work/playwright-report\n`,
      );
      appId = await construir(`${nome}:app`, fonte, dockerfile);
    }
    const nomeRede = `${nome}-canario`;
    if (docker("network", "ls", "-q", "--filter", `name=^${nomeRede}$`))
      throw new Error("Rede já existe; não será adotada.");
    redeCanario = docker(
      "network",
      "create",
      "--internal",
      "--label",
      `${label}=${rodada}`,
      nomeRede,
    );
    ledger.registrar("redes", { id: redeCanario });
    const redeInfo = JSON.parse(docker("network", "inspect", redeCanario))[0];
    if (!redeInfo.Internal || redeInfo.Labels?.[label] !== rodada)
      throw new Error("Rede do canário não pertence à rodada.");
    const canario = criar("canario", redeCanario, appId, [
      "node",
      "-e",
      `const fs=require('node:fs');let total=0;fs.writeFileSync('/tmp/frequenciapp-canario','${rodada}:0');require('node:net').createServer(s=>{fs.writeFileSync('/tmp/frequenciapp-canario','${rodada}:'+ ++total);s.end()}).listen(4001,'0.0.0.0');`,
    ]);
    docker("start", canario);
    const ipCanario = inspecionar(canario).NetworkSettings.Networks[nomeRede].IPAddress;
    // As imagens estão prontas. A partir daqui nenhum contêiner tem egress.
    const banco = criar("banco", "none", postgres, [], {
      POSTGRES_USER: `ft_${rodada}`,
      POSTGRES_DB: `ft_${rodada}`,
      POSTGRES_PASSWORD: randomBytes(32).toString("hex"),
    });
    docker("start", banco);
    const rede = docker("exec", banco, "readlink", "/proc/self/ns/net");
    const segredoDb = inspecionar(banco)
      .Config.Env.find((item) => item.startsWith("POSTGRES_PASSWORD="))
      .slice("POSTGRES_PASSWORD=".length);
    const databaseUrl = `postgresql://ft_${rodada}:${segredoDb}@127.0.0.1:5432/ft_${rodada}?schema=public`;
    const prova = {
      versao: 1,
      rodada,
      rede,
      databaseUrl,
      appUrl: "http://127.0.0.1:3000",
      marcador: randomBytes(32).toString("hex"),
      ipCanario,
    };
    if (distribuicao) {
      const scriptDistribuicao = `(${ensaiarDistribuicao.toString()})(${JSON.stringify({ rodada, rede, ipCanario })}).catch(e=>{console.error(e.message);process.exitCode=1})`;
      const validador = criar(
        "distribuicao",
        `container:${banco}`,
        appId,
        ["node", "-e", scriptDistribuicao],
        {
          DATABASE_URL: databaseUrl,
          DIRECT_URL: databaseUrl,
          DATABASE_SCHEMA: "public",
          AUTH_SECRET: randomBytes(32).toString("hex"),
          TZ_APP: "America/Fortaleza",
          NODE_ENV: "production",
        },
      );
      tarefa = recursos.find((r) => r.id === validador);
      docker("start", validador);
      const codigo = await acompanhar(tarefa);
      status ||= codigo;
      if (status !== 0)
        throw new Error(
          "Distribuição falhou ou foi interrompida; consultar distribuicao.log privado.",
        );
      if (
        docker(
          "exec",
          canario,
          "node",
          "-p",
          "require('node:fs').readFileSync('/tmp/frequenciapp-canario','utf8')",
        ) !== `${rodada}:0`
      )
        throw new Error("Canário sintético recebeu tráfego indevido.");
      writeFileSync(
        path.join(pasta, "distribuicao.json"),
        JSON.stringify({
          imagem: appId,
          rodada,
          portasHost: 0,
          mountsHost: 0,
          canarioPreservado: true,
          validado: true,
        }),
        { mode: 0o600 },
      );
    } else {
      const runner = criar(
        "execucao",
        `container:${banco}`,
        appId,
        [
          "node",
          "--input-type=module",
          "-e",
          `await (${prepararManifesto.toString()})(${JSON.stringify(prova)});process.argv=[process.execPath,'tests/isolamento/iniciar.mjs',...${JSON.stringify(comando)}];await import('./tests/isolamento/iniciar.mjs');`,
        ],
        {
          FREQUENCIAPP_ISOLAMENTO: "1",
          DATABASE_URL: databaseUrl,
          DIRECT_URL: databaseUrl,
          DATABASE_SCHEMA: "public",
          APP_URL: prova.appUrl,
          TEST_BASE_URL: prova.appUrl,
          AUTH_SECRET: randomBytes(32).toString("hex"),
          NODE_ENV: "production",
          TZ_APP: "America/Fortaleza",
          PLAYWRIGHT_SKIP_WEBSERVER: "1",
          NEXT_TELEMETRY_DISABLED: "1",
          CI: "1",
          CRON_SECRET: randomBytes(32).toString("hex"),
          GOOGLE_CLIENT_ID: "cliente-sintetico",
          GOOGLE_CLIENT_SECRET: "segredo-sintetico",
          GOOGLE_REDIRECT_URI: `${prova.appUrl}/api/planilha/google/retorno`,
          GOOGLE_PICKER_API_KEY: "picker-sintetico",
          GOOGLE_PROJECT_NUMBER: "123456789",
        },
      );
      const manifesto = path.join(pasta, "manifesto.json");
      exportacao = { runner, banco, destinoArtefatos };
      writeFileSync(manifesto, JSON.stringify(prova), { mode: 0o600 });
      // A prova do host é evidência privada. O runner cria sua cópia como o UID efetivo.
      validarContainer(inspecionar(banco), rodada, "banco", "none");
      validarContainer(inspecionar(runner), rodada, "execucao", `container:${banco}`);
      writeFileSync(
        path.join(pasta, "perimetro.json"),
        JSON.stringify({ rodada, banco, runner, rede, portasHost: 0, mountsHost: 0 }),
        { mode: 0o600 },
      );
      process.stdout.write(
        `[isolamento] rodada ${rodada}; namespace sem interfaces externas, zero portas e binds.\n`,
      );
      tarefa = recursos.find((r) => r.id === runner);
      docker("start", runner);
      const codigo = await acompanhar(tarefa);
      status ||= codigo;
      const estadoCanario = docker(
        "exec",
        canario,
        "node",
        "-p",
        "require('node:fs').readFileSync('/tmp/frequenciapp-canario','utf8')",
      );
      if (estadoCanario !== `${rodada}:0`)
        throw new Error("Canário sintético recebeu tráfego indevido.");
      writeFileSync(
        path.join(pasta, "canario.json"),
        JSON.stringify({ preservado: true, conexoes: 0 }),
        { mode: 0o600 },
      );
    }
  } catch (erro) {
    original ??= erro;
    status ||= 1;
  } finally {
    if (tarefa) {
      try {
        const recurso = tarefa;
        const info = inspecionar(recurso.id);
        validarContainer(info, rodada, recurso.tipo, recurso.rede);
        if (info.State.Running) {
          docker("kill", "--signal", sinalRecebido ?? "SIGTERM", recurso.id);
          docker("stop", "--time", "10", recurso.id);
        }
        if (inspecionar(recurso.id).State.Running !== false)
          throw new Error("Tarefa ativa; coleta e remoção não comprovam conclusão.");
        const logs = spawnSync(prefixo[0], dockerArgs("logs", recurso.id), {
          env: envHost,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
        if (logs.error || logs.status !== 0 || logs.signal)
          throw new Error("Falha ao coletar logs finais da tarefa encerrada.");
        writeFileSync(
          path.join(pasta, `${recurso.tipo}-final.log`),
          `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`,
          { mode: 0o600 },
        );
      } catch (erro) {
        original ??= erro;
        status ||= 1;
        anotarProblema("encerrar-coletar-tarefa", tarefa.id);
      }
    }
    if (exportacao) {
      const { runner, banco, destinoArtefatos } = exportacao;
      const inventario = [];
      for (const [alvo, destino] of [
        ["/run/frequenciapp-isolamento/runtime.log", "runtime.log"],
        ["/work/test-results", "test-results"],
        ["/work/playwright-report", "playwright-report"],
        ...(capturas
          ? capturasReadme.map((arquivo) => [
              `/work/docs/imagens/${arquivo}`,
              `docs/imagens/${arquivo}`,
            ])
          : []),
      ]) {
        try {
          validarContainer(inspecionar(runner), rodada, "execucao", `container:${banco}`);
          const arquivo = spawnSync(prefixo[0], dockerArgs("cp", `${runner}:${alvo}`, "-"), {
            env: envHost,
            maxBuffer: 128 * 1024 * 1024,
          });
          if (arquivo.error || arquivo.status !== 0)
            throw new Error(`Artefato obrigatório indisponível: ${destino}.`);
          const encontrados = extrairArtefato(arquivo.stdout, destinoArtefatos, alvo, destino);
          if (
            !["test-results", "playwright-report"].includes(destino) &&
            (encontrados.length !== 1 || encontrados[0] !== destino)
          )
            throw new Error(`Artefato obrigatório sem arquivo regular: ${destino}.`);
          inventario.push(...encontrados);
        } catch (erro) {
          original ??= erro;
          status ||= 1;
        }
      }
      try {
        writeFileSync(path.join(destinoArtefatos, "inventario.json"), JSON.stringify(inventario), {
          flag: "wx",
          mode: 0o600,
        });
      } catch (erro) {
        original ??= erro;
        status ||= 1;
      }
      process.stdout.write(`[isolamento] artefatos recuperáveis: ${destinoArtefatos}\n`);
    }
    for (const recurso of [...recursos].reverse()) {
      try {
        const info = inspecionar(recurso.id);
        validarContainer(info, rodada, recurso.tipo, recurso.rede);
        if (info.State.Running) docker("stop", "--time", "10", recurso.id);
        if (inspecionar(recurso.id).State.Running !== false)
          throw new Error("Container ativo ou estado desconhecido; remoção recusada.");
        docker("rm", recurso.id);
        if (docker("container", "ls", "-aq", "--filter", `id=${recurso.id}`))
          throw new Error("Recurso da rodada não foi removido.");
        ledger.removido("containers", recurso.id);
      } catch (erro) {
        original ??= erro;
        status ||= 1;
        anotarProblema("remover-container", recurso.id);
      }
    }
    if (redeCanario) {
      try {
        const redeInfo = JSON.parse(docker("network", "inspect", redeCanario))[0];
        if (redeInfo.Labels?.[label] !== rodada || Object.keys(redeInfo.Containers ?? {}).length)
          throw new Error("Rede da rodada divergente; remoção recusada.");
        docker("network", "rm", redeCanario);
        if (docker("network", "ls", "-q", "--filter", `id=${redeCanario}`))
          throw new Error("Rede própria não foi removida.");
        ledger.removido("redes", redeCanario);
      } catch (erro) {
        original ??= erro;
        status ||= 1;
        anotarProblema("remover-rede", redeCanario);
      }
    }
    if (!preparar)
      for (const imagem of [...imagens].reverse()) {
        try {
          const info = JSON.parse(docker("image", "inspect", imagem.id))[0];
          if (info.Id !== imagem.id || info.Config.Labels?.[label] !== rodada)
            throw new Error("Remoção de imagem alheia recusada.");
          docker("image", "rm", imagem.id);
          const restante = spawnSync(prefixo[0], dockerArgs("image", "inspect", imagem.id), {
            env: envHost,
            encoding: "utf8",
          });
          if (restante.status === 0) throw new Error("ID da imagem própria continua presente.");
          if (
            restante.error ||
            restante.signal ||
            restante.status !== 1 ||
            !/No such image|No such object/i.test(restante.stderr ?? "")
          )
            throw new Error("Ausência da imagem própria não comprovada.");
          ledger.removido("imagens", imagem.id);
        } catch (erro) {
          original ??= erro;
          status ||= 1;
          anotarProblema("remover-imagem", imagem.id);
        }
      }
    // Só a cópia allowlist é descartada; evidências privadas não entram no build.
    for (const nomePasta of ["fonte", "dependencias"])
      rmSync(path.join(pasta, nomePasta), { recursive: true, force: true });
    for (const [sinal, handler] of sinais) process.removeListener(sinal, handler);
    ledger.estado.status = status;
    try {
      ledger.salvar();
    } catch (erro) {
      original ??= erro;
      status ||= 1;
    }
    const residuos = [
      ...ledger.estado.containers,
      ...ledger.estado.redes,
      ...(!preparar ? ledger.estado.imagens : []),
    ].filter((r) => r.estado !== "removido");
    if (residuos.length || ledger.estado.incertos.length)
      process.stdout.write(
        `[isolamento] resíduos ou criação incerta: consultar ${path.join(pasta, "recursos.json")}\n`,
      );
    process.stdout.write(`[isolamento] evidências privadas: ${pasta}\n`);
  }
  if (original) {
    original.exitCode = status || 1;
    throw original;
  }
  return status;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  executar()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((erro) => {
      console.error(erro.message);
      process.exitCode = erro.exitCode || 1;
    });
}
