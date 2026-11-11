// Cria somente os dois contêineres fechados Nginx/cliente e concilia cada ID até a ausência.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { inicializadorNginx } from "./nginx-acme-real.mjs";

export const imagemNginx =
  "sha256:4f8a761349fa3bc94f99b8b07b517535bf7c39fff02020f74625313af305af5a";
export const imagemCliente =
  "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614";
export const fontesNginx = [
  "tests/servidor/nginx-acme.sh",
  "tests/servidor/nginx-acme.test.mjs",
  "tests/servidor/nginx-acme-harness.mjs",
  "tests/servidor/nginx-acme-real.mjs",
  "infra/servidor/nginx/Dockerfile",
  "infra/servidor/nginx/.dockerignore",
  "infra/servidor/nginx/docker-entrypoint.d/50-frequenciapp.sh",
  "infra/servidor/nginx/frequenciapp-http.conf",
  "infra/servidor/nginx/frequenciapp-https.conf",
];
const raiz = path.resolve(import.meta.dirname, "../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const salvar = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
function ambiente(lista = []) {
  const mapa = {};
  for (const texto of lista) {
    const i = texto.indexOf("=");
    assert.ok(i > 0);
    const k = texto.slice(0, i);
    assert.ok(!Object.hasOwn(mapa, k), "ambiente duplicado");
    mapa[k] = texto.slice(i + 1);
  }
  return mapa;
}

function receita({ imagem, captura, rodada, defaults, papel, nginxId, netns, modeloHash }) {
  assert.match(imagem, /^sha256:[a-f0-9]{64}$/);
  assert.match(rodada, /^[a-f0-9-]{36}$/);
  assert.ok(path.isAbsolute(captura) && !/[,\r\n]/.test(captura));
  if (papel === "cliente") {
    assert.match(nginxId, /^[a-f0-9]{64}$/);
    assert.match(netns, /^net:\[\d+\]$/);
  }
  const usuario = papel === "nginx" ? "101:101" : "1000:1000";
  const hostname = `nginx-${rodada}`;
  const env = {
    ...ambiente(defaults.Env),
    HOME: papel === "nginx" ? "/run" : "/scratch",
    TMPDIR: papel === "nginx" ? "/run" : "/scratch",
    HOSTNAME: `${papel}-${rodada}`,
  };
  const tmpfs =
    papel === "nginx"
      ? Object.fromEntries(
          [
            "/run",
            "/var/cache/nginx",
            "/etc/nginx/conf.d",
            "/etc/letsencrypt",
            "/var/www/certbot",
          ].map((d) => [d, "rw,nosuid,nodev,noexec,uid=101,gid=101,mode=0755,size=32m"]),
        )
      : { "/scratch": "rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=32m" };
  const config = {
    User: usuario,
    Hostname: hostname,
    Domainname: "",
    WorkingDir: "/repo",
    Entrypoint: papel === "nginx" ? ["/bin/sh"] : ["node"],
    Cmd:
      papel === "nginx"
        ? ["/repo/nginx-bootstrap.sh"]
        : ["tests/servidor/nginx-acme-real.mjs", `--netns=${netns}`, `--rodada=${rodada}`],
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    Labels: {
      ...defaults.Labels,
      "frequenciapp.ensaio.perfil": "nginx-acme-v1",
      "frequenciapp.ensaio.rodada": rodada,
      "frequenciapp.ensaio.papel": papel,
    },
    StopSignal: papel === "nginx" ? "SIGQUIT" : "SIGTERM",
    StopTimeout: 15,
  };
  const host = {
    NetworkMode: papel === "nginx" ? "none" : `container:${nginxId}`,
    ReadonlyRootfs: true,
    CapDrop: ["ALL"],
    CapAdd: [],
    SecurityOpt: ["no-new-privileges:true"],
    Privileged: false,
    PortBindings: {},
    PublishAllPorts: false,
    AutoRemove: false,
    NanoCpus: 1000000000,
    Memory: 268435456,
    MemorySwap: 268435456,
    PidsLimit: 64,
    IpcMode: "private",
    Tmpfs: tmpfs,
    LogConfig: { Type: "json-file", Config: { "max-size": "2m", "max-file": "2" } },
    ExtraHosts: papel === "nginx" ? ["app:127.0.0.1"] : [],
    Dns: papel === "nginx" ? ["127.0.0.1"] : [],
    Sysctls: papel === "nginx" ? { "net.ipv4.ip_unprivileged_port_start": "0" } : {},
  };
  const binds = [[captura, "/repo"]];
  const args = [
    "create",
    "--network",
    host.NetworkMode,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--user",
    usuario,
    "--cpus",
    "1",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--pids-limit",
    "64",
    "--ipc",
    "private",
    "--stop-timeout",
    "15",
    "--stop-signal",
    config.StopSignal,
    "--no-healthcheck",
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=2m",
    "--log-opt",
    "max-file=2",
    "--workdir",
    "/repo",
    "--mount",
    `type=bind,src=${captura},dst=/repo,readonly`,
    "--entrypoint",
    config.Entrypoint[0],
  ];
  if (papel === "nginx")
    args.push(
      "--hostname",
      hostname,
      "--add-host",
      "app:127.0.0.1",
      "--dns",
      "127.0.0.1",
      "--sysctl",
      "net.ipv4.ip_unprivileged_port_start=0",
    );
  for (const [k, v] of Object.entries(tmpfs)) args.push("--tmpfs", `${k}:${v}`);
  for (const [k, v] of Object.entries(config.Labels)) args.push("--label", `${k}=${v}`);
  for (const v of config.Env) args.push("--env", v);
  args.push(imagem, ...config.Cmd);
  return { imagem, captura, rodada, papel, config, host, binds, args, modeloHash };
}
export const receitaNginx = (opcoes) => receita({ ...opcoes, papel: "nginx" });
export const receitaCliente = (opcoes) => receita({ ...opcoes, papel: "cliente" });

export function conferirContainer(c, r, id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(c.Id, id, "ID divergente");
  assert.equal(c.Image, r.imagem);
  for (const k of [
    "User",
    "Domainname",
    "WorkingDir",
    "Entrypoint",
    "Cmd",
    "Labels",
    "StopSignal",
    "StopTimeout",
  ])
    assert.deepEqual(c.Config[k], r.config[k], `Config.${k}`);
  // Moby copia o hostname do alvo na inicialização, não durante docker create.
  let hostname = r.config.Hostname;
  if (r.papel === "cliente") {
    const criado =
      c.State.Status === "created" &&
      c.State.Running === false &&
      c.State.StartedAt === "0001-01-01T00:00:00Z";
    const iniciado =
      ["running", "exited"].includes(c.State.Status) &&
      c.State.Running === (c.State.Status === "running") &&
      typeof c.State.StartedAt === "string" &&
      c.State.StartedAt !== "" &&
      !c.State.StartedAt.startsWith("0001-");
    assert.ok(criado || iniciado, "estado do hostname do cliente não comprovado");
    if (criado) hostname = id.slice(0, 12);
  }
  assert.equal(c.Config.Hostname, hostname, "Config.Hostname por estado");
  assert.deepEqual(ambiente(c.Config.Env), ambiente(r.config.Env));
  assert.ok(!c.Config.Volumes || Object.keys(c.Config.Volumes).length === 0);
  assert.ok(!c.Config.Healthcheck || c.Config.Healthcheck.Test?.[0] === "NONE");
  for (const [k, v] of Object.entries(r.host)) {
    const raw = c.HostConfig[k];
    const real = ["CapAdd", "ExtraHosts", "Dns"].includes(k)
      ? (raw ?? [])
      : k === "Sysctls"
        ? (raw ?? {})
        : raw;
    assert.deepEqual(real, v, `HostConfig.${k}`);
  }
  for (const k of [
    "Binds",
    "Devices",
    "DeviceRequests",
    "DeviceCgroupRules",
    "VolumesFrom",
    "GroupAdd",
    "DnsOptions",
    "DnsSearch",
    "Links",
  ])
    assert.deepEqual(c.HostConfig[k] ?? [], [], k);
  for (const k of ["PidMode", "UTSMode", "UsernsMode", "CgroupParent", "ContainerIDFile"])
    assert.equal(c.HostConfig[k] || "", "", k);
  assert.ok(!c.HostConfig.RestartPolicy || c.HostConfig.RestartPolicy.Name === "no");
  const binds = c.Mounts.filter((m) => m.Type === "bind");
  assert.deepEqual(
    binds.map((m) => [m.Source, m.Destination]),
    r.binds,
  );
  assert.ok(binds.every((m) => m.RW === false));
  assert.ok(
    c.Mounts.every(
      (m) =>
        m.Type === "bind" || (m.Type === "tmpfs" && Object.hasOwn(r.host.Tmpfs, m.Destination)),
    ),
    "mount extra",
  );
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), r.papel === "nginx" ? ["none"] : []);
  for (const p of Object.values(c.NetworkSettings.Ports ?? {})) assert.equal(p, null);
  return c;
}
export function conferirAusencia(r, id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout), []);
  assert.match(
    r.stderr,
    new RegExp(
      `^(?:Error(?: response from daemon)?: |error: )?no such (?:object|container): ${id}\\s*$`,
      "i",
    ),
  );
  return true;
}
const sucesso = (r, nome = "cliente") => {
  assert.equal(r.error, undefined, `${nome}: erro`);
  assert.equal(r.signal, null, `${nome}: sinal`);
  assert.equal(r.status, 0, `${nome}: status`);
  return r.stdout;
};
const exportarModelo = `printf '{"modelo":"%s"}\\n' "$(sha256sum /etc/nginx/conf.d/default.conf | cut -d' ' -f1)"`;

export async function executarCiclo({
  nginx,
  criarCliente,
  cliente,
  registrar = () => {},
  cancelado = () => false,
  hostNetns,
}) {
  const recursos = [],
    recibo = { rodada: nginx.rodada, estado: "preparando", ids: [], ausentes: false };
  let acompanhamento;
  const abortarObservador = new AbortController();
  const concluirObservador = async () => {
    const r = await acompanhamento;
    recibo.observador = {
      pid: r.pid ?? null,
      fechado: r.fechado === true,
      status: r.status,
      signal: r.signal,
      ...(r.error ? { error: r.error } : {}),
    };
    registrar("acompanhamento", r);
    return r;
  };
  const ativo = () => assert.equal(cancelado(), false, "cancelado: autorização revogada");
  const invocar = async (args) => {
    const r = await cliente(args);
    registrar("cliente", { args, ...r });
    return r;
  };
  const inspecionar = async (recurso) => {
    const lista = JSON.parse(sucesso(await invocar(["inspect", recurso.id])));
    assert.equal(lista.length, 1);
    const c = conferirContainer(lista[0], recurso.receita, recurso.id);
    registrar("inspect", c);
    return c;
  };
  const criar = async (r) => {
    ativo();
    const raw = await invocar(r.args);
    registrar("create", raw);
    const id = sucesso(raw).trim();
    assert.match(id, /^[a-f0-9]{64}$/);
    assert.ok(!recibo.ids.includes(id));
    const recurso = { id, receita: r };
    recursos.push(recurso);
    recibo.ids.push(id);
    registrar("lifecycle", recibo);
    const c = await inspecionar(recurso);
    assert.equal(c.State.Status, "created");
    assert.equal(c.State.Running, false);
    ativo();
    return recurso;
  };
  const partir = async (recurso, attach) => {
    const c = await inspecionar(recurso);
    assert.equal(c.State.Status, "created");
    assert.equal(c.State.Running, false);
    ativo();
    return invocar(attach ? ["start", "--attach", recurso.id] : ["start", recurso.id]);
  };
  const terminal = async (recurso, attach) => {
    const w = await invocar(["wait", recurso.id]);
    const texto = sucesso(w).trim();
    assert.match(texto, /^(0|[1-9]\d{0,2})$/);
    const c = await inspecionar(recurso);
    assert.equal(c.State.Running, false);
    assert.equal(c.State.Status, "exited");
    assert.equal(c.State.ExitCode, Number(texto));
    assert.equal(c.State.OOMKilled, false);
    assert.equal(c.State.Error, "");
    assert.ok(c.State.FinishedAt && !c.State.FinishedAt.startsWith("0001-"));
    recurso.terminal = true;
    recurso.exitCode = c.State.ExitCode;
    if (attach) {
      sucesso(attach, "acompanhamento");
      assert.equal(attach.status, recurso.exitCode);
    }
    assert.equal(recurso.exitCode, 0, "tarefa terminou com erro");
    return c;
  };
  try {
    const servidor = await criar(nginx);
    sucesso(await partir(servidor, false));
    ativo();
    acompanhamento = cliente.seguir(["logs", "--follow", servidor.id], {
      signal: abortarObservador.signal,
    });
    // A Promise é observada imediatamente; nunca há rejeição tardia abandonada.
    acompanhamento = Promise.resolve(acompanhamento).catch((e) => ({
      status: null,
      signal: null,
      error: { code: e.code ?? "EFOLLOW" },
      stdout: "",
      stderr: "acompanhamento rejeitado",
    }));
    let netns;
    for (let i = 0; i < 50; i++) {
      const logs = sucesso(await invocar(["logs", servidor.id]));
      const gates = [...logs.matchAll(/^NGINX_GATE (net:\[\d+\])$/gm)];
      assert.ok(gates.length <= 1, "gate duplicado");
      if (gates.length === 1) {
        netns = gates[0][1];
        break;
      }
      const c = await inspecionar(servidor);
      assert.equal(c.State.Running, true, "inicializador terminou antes do gate");
      ativo();
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(netns, "gate do namespace não foi exportado");
    if (hostNetns) assert.notEqual(netns, hostNetns, "namespace do host proibido");
    ativo();
    const rCliente = criarCliente(servidor.id, netns);
    const consumidor = await criar(rCliente);
    // O segundo ID e seu vínculo container:ID estão conferidos antes de qualquer fixture.
    const ligado = await inspecionar(servidor);
    assert.equal(ligado.State.Running, true);
    ativo();
    const attach = await partir(consumidor, true);
    registrar("driver-exportado", attach);
    // A prova veio por stdout enquanto /scratch ainda existia, não por cp após stop.
    await terminal(consumidor, attach);
    ativo();
    const linhas = attach.stdout.trim().split("\n");
    assert.equal(linhas.length, 1);
    const prova = JSON.parse(linhas[0]);
    assert.equal(prova.tipo, "nginx-resultado");
    assert.equal(prova.rodada, nginx.rodada);
    for (const k of ["token80", "redirecionamento301", "tls443"])
      assert.equal(prova.positivo[k], true);
    assert.equal(prova.negativo.tokenAusente, true);
    assert.equal(prova.runtime.netns, netns);
    assert.equal(
      prova.positivo.location,
      "https://nginx.invalid/caminho%20sintetico/sub?origem=ensaio&item=2",
    );
    assert.match(prova.positivo.tokenSha256, /^[a-f0-9]{64}$/);
    assert.equal(prova.positivo.tls.status, 502);
    assert.equal(prova.positivo.tls.autorizado, true);
    assert.ok(["TLSv1.2", "TLSv1.3"].includes(prova.positivo.tls.protocolo));
    assert.equal(prova.negativo.status, 404);
    assert.equal(prova.negativo.causa, "ETOKEN_AUSENTE");
    recibo.prova = prova;
    registrar("prova-pre-termino", prova);
    const antesExportar = await inspecionar(servidor);
    assert.equal(antesExportar.State.Running, true);
    ativo();
    const modelo = JSON.parse(
      sucesso(await invocar(["exec", servidor.id, "/bin/sh", "-ec", exportarModelo])),
    );
    assert.equal(
      modelo.modelo,
      nginx.modeloHash,
      "modelo HTTPS escolhido diverge dos bytes distribuídos",
    );
    registrar("modelo-exportado", modelo);
    const antesParar = await inspecionar(servidor);
    assert.equal(antesParar.State.Running, true);
    ativo();
    sucesso(await invocar(["stop", "--time", "15", servidor.id]));
    const fimLogs = await concluirObservador();
    assert.equal(fimLogs.fechado, true, "observador sem confirmação de close");
    await terminal(servidor, fimLogs);
    ativo();
    for (const recurso of [...recursos].reverse()) {
      const c = await inspecionar(recurso);
      assert.equal(c.State.Running, false);
      assert.equal(c.State.Status, "exited");
      assert.equal(c.State.ExitCode, recurso.exitCode);
      // Limpeza já autorizada de IDs próprios e terminais; não adota nem procura nomes.
      sucesso(await invocar(["rm", recurso.id]));
      const ausencia = await invocar(["inspect", recurso.id]);
      conferirAusencia(ausencia, recurso.id);
      recurso.ausente = true;
    }
    ativo();
    recibo.ausentes = recursos.every((r) => r.ausente);
    recibo.estado = "aprovado";
    registrar("lifecycle", recibo);
    return recibo;
  } catch (erro) {
    recibo.estado = "preservado";
    recibo.causa = erro.message;
    // Encerrar somente o cliente logs próprio; isso não prova término do contêiner.
    if (acompanhamento) {
      abortarObservador.abort();
      try {
        await concluirObservador();
      } catch (falha) {
        recibo.observador = { fechado: false, causa: falha.message };
      }
    }
    // Recusa ou resultado incerto não autoriza stop/rm automático. Coleta somente leitura.
    for (const r of recursos.filter((r) => !r.ausente)) {
      try {
        const c = await inspecionar(r);
        registrar("estado-preservado", { id: r.id, state: c.State });
      } catch {
        registrar("estado-incerto", { id: r.id });
      }
    }
    registrar("lifecycle", recibo);
    throw Object.assign(new Error(erro.message), { cause: erro, recibo });
  }
}

export function clienteDocker(destino, iniciar = spawn) {
  let indice = 0;
  const executar = (args, { signal } = {}) =>
    new Promise((resolve) => {
      const n = ++indice,
        saida = { stdout: "", stderr: "" };
      let error, prazoEncerramento;
      const filho = iniciar("/usr/bin/docker", args, {
        env: {
          PATH: "/usr/bin:/bin",
          HOME: destino,
          DOCKER_CONFIG: path.join(destino, "docker-config"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const encerrar = (code) => {
        error ??= { code };
        filho.kill("SIGTERM");
        // Prazo menor, limitado ao filho próprio; nunca sinaliza contêineres.
        prazoEncerramento ??= setTimeout(() => filho.kill("SIGKILL"), 1000);
      };
      const aoAbortar = () => encerrar("ECANCELADO");
      const prazo = setTimeout(() => encerrar("ETIMEDOUT"), 180000);
      signal?.addEventListener("abort", aoAbortar, { once: true });
      if (signal?.aborted) aoAbortar();
      filho.on("error", (e) => {
        error ??= { code: e.code };
      });
      for (const canal of ["stdout", "stderr"])
        filho[canal].on("data", (b) => {
          if (Buffer.byteLength(saida[canal]) + b.length <= 2 * 1048576) saida[canal] += b;
          else {
            encerrar("EOUTPUTLIMIT");
          }
        });
      filho.on("close", (status, sinal) => {
        clearTimeout(prazo);
        clearTimeout(prazoEncerramento);
        signal?.removeEventListener("abort", aoAbortar);
        const r = {
          ...saida,
          status,
          signal: sinal,
          pid: filho.pid ?? null,
          fechado: true,
          ...(error ? { error } : {}),
        };
        salvar(path.join(destino, `docker-${n}.json`), { args, ...r });
        resolve(r);
      });
    });
  executar.seguir = executar;
  return executar;
}

export async function principal(args = process.argv.slice(2)) {
  assert.ok(
    args[0] === "--executar" && args.length <= 2,
    "uso: nginx-acme.sh --executar [--evidencias=/pasta-nova]",
  );
  const destinoPedido = args[1] ? /^--evidencias=(\/[^\r\n,]+)$/.exec(args[1])?.[1] : null;
  assert.ok(args.length === 1 || destinoPedido, "opção não permitida");
  assert.equal(process.getuid(), 1000);
  assert.equal(process.getgid(), 1000);
  for (const k of Object.keys(process.env))
    assert.ok(
      !/^DOCKER_(HOST|CONTEXT|TLS|CERT_PATH|CONFIG)/.test(k),
      "override Docker não autorizado",
    );
  process.umask(0o077);
  const rodada = randomUUID(),
    destino = destinoPedido ?? path.join(os.tmpdir(), `nginx-acme-${rodada}`);
  fs.mkdirSync(destino, { mode: 0o700 });
  process.stdout.write(
    JSON.stringify({ evidencias: destino, rodada, estado: "preparando" }) + "\n",
  );
  const cliente = clienteDocker(destino);
  const infoNginx = JSON.parse(sucesso(await cliente(["image", "inspect", imagemNginx])))[0];
  const infoCliente = JSON.parse(sucesso(await cliente(["image", "inspect", imagemCliente])))[0];
  assert.equal(infoNginx.Id, imagemNginx);
  assert.equal(infoCliente.Id, imagemCliente);
  assert.deepEqual(infoNginx.Config.Entrypoint, ["/docker-entrypoint.sh"]);
  assert.deepEqual(infoNginx.Config.Cmd, ["nginx", "-g", "daemon off;"]);
  assert.equal(infoNginx.Config.User || "", "");
  assert.equal(infoNginx.Config.StopSignal, "SIGQUIT");
  assert.deepEqual(ambiente(infoNginx.Config.Env), {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    NGINX_VERSION: "1.30.6",
    PKG_RELEASE: "1",
    DYNPKG_RELEASE: "1",
    NJS_VERSION: "1.0.2",
    NJS_RELEASE: "1",
    ACME_VERSION: "0.4.1",
  });
  assert.deepEqual(infoCliente.Config.Entrypoint ?? [], []);
  assert.equal(infoCliente.Config.User, "1000:1000");
  assert.deepEqual(ambiente(infoCliente.Config.Env), {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    NODE_VERSION: "24.22.2",
    YARN_VERSION: "1.22.22",
    HOME: "/tmp",
    TMPDIR: "/tmp",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ALLOW_PROTOCOL: "file",
    HELM_BIN: "/usr/local/bin/helm",
  });
  for (const i of [infoNginx, infoCliente]) {
    assert.ok(!i.Config.Volumes);
    assert.ok(!i.Config.Healthcheck);
  }
  const captura = path.join(destino, "captura");
  fs.mkdirSync(captura, { mode: 0o755 });
  fs.chmodSync(captura, 0o755);
  const fontes = {};
  for (const nome of fontesNginx) {
    const origem = path.join(raiz, nome),
      alvo = path.join(captura, nome);
    assert.ok(fs.lstatSync(origem).isFile());
    const bytes = fs.readFileSync(origem);
    fontes[nome] = hash(bytes);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    for (let d = path.dirname(alvo); d !== captura; d = path.dirname(d)) fs.chmodSync(d, 0o755);
    fs.writeFileSync(alvo, bytes);
    fs.chmodSync(alvo, nome.endsWith(".sh") ? 0o555 : 0o444);
  }
  const distribuido = {
    "infra/servidor/nginx/Dockerfile":
      "f3847adff4748b70d5b2017260d7e0a4307af06273c086c9f3307c136f26f27c",
    "infra/servidor/nginx/.dockerignore":
      "8db53779fcd5f0cf3af3ff7d21dd9afce22872146331edd33e42bfe260a16c3b",
    "infra/servidor/nginx/docker-entrypoint.d/50-frequenciapp.sh":
      "2db69bca17c7c3ae49bc8349211b5dcada128f574b0f674647b6a44aac6de2be",
    "infra/servidor/nginx/frequenciapp-http.conf":
      "e1a246eb927642ed049dc2f60e38487ec357b16e3da5b678ccaea9b3bf77e6e2",
    "infra/servidor/nginx/frequenciapp-https.conf":
      "7891db13c32471ac35d30c6123b8eefb51101e9ce4218176c7ab360d8b8fc445",
  };
  for (const [nome, sha] of Object.entries(distribuido))
    assert.equal(fontes[nome], sha, "fonte distribuída mudou desde o build comprovado");
  fs.writeFileSync(path.join(captura, "nginx-bootstrap.sh"), inicializadorNginx);
  fs.chmodSync(path.join(captura, "nginx-bootstrap.sh"), 0o555);
  salvar(path.join(destino, "fontes.json"), {
    fontes,
    distribuido,
    inicializadorSha256: hash(inicializadorNginx),
  });
  salvar(path.join(destino, "imagens.json"), [infoNginx, infoCliente]);
  const nginx = receitaNginx({
    imagem: imagemNginx,
    captura,
    rodada,
    defaults: infoNginx.Config,
    modeloHash: distribuido["infra/servidor/nginx/frequenciapp-https.conf"],
  });
  salvar(path.join(destino, "receita-nginx.json"), nginx);
  let interrompido = false,
    n = 0;
  const cancelar = () => {
    interrompido = true;
  };
  process.on("SIGINT", cancelar);
  process.on("SIGTERM", cancelar);
  try {
    const resultado = await executarCiclo({
      nginx,
      cliente,
      cancelado: () => interrompido,
      hostNetns: fs.readlinkSync("/proc/self/ns/net"),
      criarCliente: (nginxId, netns) => {
        const r = receitaCliente({
          imagem: imagemCliente,
          captura,
          rodada,
          defaults: infoCliente.Config,
          nginxId,
          netns,
        });
        salvar(path.join(destino, "receita-cliente.json"), r);
        return r;
      },
      registrar: (tipo, dado) => {
        salvar(path.join(destino, `${++n}-${tipo}.json`), dado);
        if (tipo === "lifecycle") salvar(path.join(destino, "lifecycle.json"), dado);
      },
    });
    for (const [nome, sha] of Object.entries(fontes))
      assert.equal(
        hash(fs.readFileSync(path.join(raiz, nome))),
        sha,
        "fonte mudou durante a prova",
      );
    assert.equal(interrompido, false);
    salvar(path.join(destino, "resultado.json"), { ...resultado, fontes });
    assert.equal(interrompido, false);
    process.stdout.write(JSON.stringify({ evidencias: destino, ...resultado }) + "\n");
    return 0;
  } catch (erro) {
    salvar(path.join(destino, "falha.json"), {
      causa: erro.message,
      recibo: erro.recibo ?? null,
      fontes,
    });
    throw erro;
  } finally {
    process.removeListener("SIGINT", cancelar);
    process.removeListener("SIGTERM", cancelar);
  }
}
const direto =
  process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (direto)
  principal()
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((erro) => {
      process.stderr.write(`FALHOU: ${erro.message}\n`);
      process.exitCode = 1;
    });
