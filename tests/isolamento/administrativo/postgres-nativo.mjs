// Fecha imagem, receita, projeção Engine e a única consulta PostgreSQL desta prova.
import { request, Agent } from "node:http";
import { Duplex } from "node:stream";
import { isDeepStrictEqual as igual } from "node:util";

export const PIN_POSTGRES =
  "postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac";
const DATA = "/var/lib/postgresql/data";
const TMPFS = Object.freeze({
  [DATA]: "rw,nosuid,nodev,noexec,size=536870912,mode=1777",
  "/var/run/postgresql": "rw,nosuid,nodev,noexec,size=16777216,mode=1777",
  "/tmp": "rw,nosuid,nodev,noexec,size=16777216,mode=1777",
});
const ID = /^[a-f0-9]{64}$/;
const objeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const vazio = (v) =>
  v == null || (Array.isArray(v) ? v.length === 0 : objeto(v) && Object.keys(v).length === 0);
function exigir(ok, mensagem) {
  if (!ok) throw new Error(mensagem);
}
function jsonEngine(bytes) {
  const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const valor = JSON.parse(texto);
  let p = 0;
  const espaco = () => {
    while (/\s/.test(texto[p] ?? "") && p < texto.length) p++;
  };
  const string = () => {
    const inicio = p++;
    while (p < texto.length) {
      const c = texto[p++];
      if (c === "\\") p++;
      else if (c === '"') return JSON.parse(texto.slice(inicio, p));
    }
    throw new Error("String JSON Engine truncada.");
  };
  const percorrer = (profundidade) => {
    exigir(profundidade <= 64, "JSON Engine profundo demais.");
    espaco();
    const c = texto[p];
    if (c === '"') {
      string();
      return;
    }
    if (c === "{" || c === "[") {
      p++;
      espaco();
      const fim = c === "{" ? "}" : "]";
      const chaves = new Set();
      while (texto[p] !== fim) {
        if (c === "{") {
          const chave = string();
          exigir(!chaves.has(chave), "Chave JSON Engine duplicada.");
          chaves.add(chave);
          espaco();
          p++;
        }
        percorrer(profundidade + 1);
        espaco();
        if (texto[p] === ",") {
          p++;
          espaco();
        } else break;
      }
      p++;
      return;
    }
    while (p < texto.length && !/[\s,}\]]/.test(texto[p])) p++;
  };
  percorrer(0);
  espaco();
  exigir(p === texto.length, "JSON Engine com cauda inesperada.");
  return valor;
}
function ambienteUnico(env) {
  const nomes = new Set();
  exigir(
    Array.isArray(env) &&
      env.every((e) => {
        const m = typeof e === "string" && /^([A-Za-z_][A-Za-z0-9_]*)=([^\r\n]*)$/.exec(e);
        if (!m || e.includes("\0") || nomes.has(m[1])) return false;
        nomes.add(m[1]);
        return true;
      }),
    "Ambiente nativo inválido ou duplicado.",
  );
  return [...env].sort();
}
export function aprovarImagemPostgres(raw) {
  exigir(
    objeto(raw) &&
      /^sha256:[a-f0-9]{64}$/.test(raw.Id) &&
      raw.RepoDigests?.includes(PIN_POSTGRES.replace(":17-alpine", "")),
    "Imagem local não corresponde ao pin PostgreSQL.",
  );
  const c = raw.Config;
  exigir(
    objeto(c) &&
      igual(c.Entrypoint, ["docker-entrypoint.sh"]) &&
      igual(c.Cmd, ["postgres"]) &&
      c.User === "" &&
      c.WorkingDir === "/" &&
      igual(c.Volumes, { [DATA]: {} }) &&
      vazio(c.OnBuild) &&
      !c.Healthcheck &&
      vazio(c.Labels) &&
      vazio(c.Shell) &&
      (vazio(c.ExposedPorts) || igual(c.ExposedPorts, { "5432/tcp": {} })),
    "Propriedades herdadas da imagem recusadas.",
  );
  const env = ambienteUnico(c.Env);
  exigir(
    env.every(
      (e) =>
        /^(PATH|LANG|PG_MAJOR|PG_VERSION|PG_SHA256|PGDATA|GOSU_VERSION)=.+$/.test(e) ||
        e === "DOCKER_PG_LLVM_DEPS=llvm21-dev \t\tclang21",
    ) &&
      env.includes("DOCKER_PG_LLVM_DEPS=llvm21-dev \t\tclang21") &&
      env.includes("PG_MAJOR=17") &&
      env.includes(`PGDATA=${DATA}`),
    "Ambiente herdado não autorizado.",
  );
  return { perfil: "postgres-nativo", id: raw.Id, config: structuredClone(c), volumes: [DATA] };
}
export function receitaPostgres(rodada, imagem, senha) {
  exigir(
    /^[a-f0-9]{32}$/.test(rodada) && imagem?.perfil === "postgres-nativo" && ID.test(senha),
    "Identidade nativa inválida.",
  );
  const banco = `ft_${rodada}`;
  const env = imagem.config.Env.filter((e) =>
    /^(PATH|LANG|PG_MAJOR|PG_VERSION|PG_SHA256|GOSU_VERSION)=/.test(e),
  );
  return {
    Image: imagem.id,
    Hostname: `fadm-${rodada}`,
    User: "postgres",
    Entrypoint: ["docker-entrypoint.sh"],
    WorkingDir: "/",
    Cmd: ["postgres", "-c", "listen_addresses=127.0.0.1"],
    Env: [
      ...env,
      `PGDATA=${DATA}/pgdata`,
      `POSTGRES_DB=${banco}`,
      `POSTGRES_USER=${banco}`,
      `POSTGRES_PASSWORD=${senha}`,
      "POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=scram-sha-256",
      "DOCKER_PG_LLVM_DEPS=",
    ].sort(),
    Labels: { "br.frequenciapp.isolamento": rodada, "br.frequenciapp.isolamento.tipo": "banco" },
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 536870912,
      NanoCpus: 1000000000,
      PidsLimit: 128,
      ReadonlyRootfs: true,
      Tmpfs: { ...TMPFS },
      LogConfig: {
        Type: "local",
        Config: { "max-size": "1m", "max-file": "1", compress: "false" },
      },
    },
  };
}
export function validarReceitaPostgres(s, rodada, imagem) {
  const senha = s?.Env?.find((e) => e.startsWith("POSTGRES_PASSWORD="))?.slice(18);
  exigir(igual(s, receitaPostgres(rodada, imagem, senha)), "Receita nativa não autorizada.");
}
// Valores neutros conhecidos da API 1.47, nunca sobrescritos por valores esperados.
const NEUTROS = {
  Binds: null,
  ContainerIDFile: "",
  PortBindings: {},
  Privileged: false,
  PublishAllPorts: false,
  AutoRemove: false,
  VolumeDriver: "",
  VolumesFrom: null,
  CapAdd: null,
  Dns: [],
  DnsOptions: [],
  DnsSearch: [],
  ExtraHosts: null,
  GroupAdd: null,
  Links: null,
  Mounts: null,
  Devices: [],
  DeviceRequests: null,
  DeviceCgroupRules: null,
  Cgroup: "",
  CgroupParent: "",
  CgroupnsMode: "private",
  PidMode: "",
  UTSMode: "",
  UsernsMode: "",
  IpcMode: "private",
  Isolation: "",
  Runtime: "runc",
  CpuShares: 0,
  CpuPeriod: 0,
  CpuQuota: 0,
  CpuRealtimePeriod: 0,
  CpuRealtimeRuntime: 0,
  CpuCount: 0,
  CpuPercent: 0,
  IOMaximumIOps: 0,
  IOMaximumBandwidth: 0,
  CpusetCpus: "",
  CpusetMems: "",
  MemoryReservation: 0,
  MemorySwappiness: null,
  KernelMemory: 0,
  OomKillDisable: false,
  OomScoreAdj: 0,
  BlkioWeight: 0,
  BlkioWeightDevice: [],
  BlkioDeviceReadBps: [],
  BlkioDeviceWriteBps: [],
  BlkioDeviceReadIOps: [],
  BlkioDeviceWriteIOps: [],
  Ulimits: [],
  RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
  StorageOpt: null,
  Sysctls: null,
  ShmSize: 67108864,
  Init: false,
  ConsoleSize: [0, 0],
  Annotations: null,
};
const MASKED = [
  "/proc/asound",
  "/proc/acpi",
  "/proc/interrupts",
  "/proc/kcore",
  "/proc/keys",
  "/proc/latency_stats",
  "/proc/timer_list",
  "/proc/timer_stats",
  "/proc/sched_debug",
  "/proc/scsi",
  "/sys/firmware",
  "/sys/devices/virtual/powercap",
];
const READONLY = ["/proc/bus", "/proc/fs", "/proc/irq", "/proc/sys", "/proc/sysrq-trigger"];
export function normalizarPostgres(raw, spec, imagem, id) {
  exigir(
    objeto(raw) && raw.Id === id && raw.Image === imagem.id && raw.Name === `/${spec.Hostname}`,
    "Identidade física divergente.",
  );
  const h = raw.HostConfig;
  exigir(objeto(h) && h.Privileged === false, "HostConfig nativo inválido.");
  exigir(
    Object.hasOwn(h, "MaskedPaths") &&
      Array.isArray(h.MaskedPaths) &&
      h.MaskedPaths.length === MASKED.length &&
      [...h.MaskedPaths].every((p) => typeof p === "string" && MASKED.includes(p)) &&
      new Set(h.MaskedPaths).size === MASKED.length,
    "Máscaras nativas divergentes.",
  );
  exigir(
    Object.hasOwn(h, "ReadonlyPaths") && igual(h.ReadonlyPaths, READONLY),
    "Paths nativos divergentes.",
  );
  exigir(
    Object.hasOwn(h, "MemorySwap") && h.MemorySwap === spec.HostConfig.Memory * 2,
    "Swap nativo divergente.",
  );
  for (const [k, v] of Object.entries(h)) {
    if (Object.hasOwn(spec.HostConfig, k))
      exigir(igual(v, spec.HostConfig[k]), "Recurso nativo divergente.");
    else if (["MemorySwap", "MaskedPaths", "ReadonlyPaths"].includes(k)) continue;
    else
      exigir(
        Object.hasOwn(NEUTROS, k) && (igual(v, NEUTROS[k]) || (vazio(v) && vazio(NEUTROS[k]))),
        "Opção Engine não autorizada.",
      );
  }
  for (const [k, v] of Object.entries(spec.HostConfig))
    exigir(igual(h[k], v), "Restrição nativa ausente.");
  const c = raw.Config;
  exigir(
    objeto(c) && igual(c.Volumes, imagem.config.Volumes),
    "Config nativa ou volume herdado divergente.",
  );
  const env = ambienteUnico(c.Env);
  exigir(igual(env, ambienteUnico(spec.Env)), "Ambiente nativo divergente.");
  for (const [k, v] of Object.entries(spec))
    if (k !== "HostConfig" && k !== "Env") exigir(igual(c[k], v), "Config nativa divergente.");
  const defaults = {
    Domainname: "",
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
    OpenStdin: false,
    StdinOnce: false,
    StopSignal: imagem.config.StopSignal ?? "SIGINT",
    StopTimeout: null,
    Healthcheck: null,
    OnBuild: null,
    Shell: null,
    ExposedPorts: imagem.config.ExposedPorts ?? null,
    Volumes: imagem.config.Volumes,
    ArgsEscaped: false,
    NetworkDisabled: false,
    MacAddress: "",
  };
  for (const [k, v] of Object.entries(c))
    if (!Object.hasOwn(spec, k))
      exigir(
        Object.hasOwn(defaults, k) && (igual(v, defaults[k]) || (vazio(v) && vazio(defaults[k]))),
        "Config herdada divergente.",
      );
  exigir(
    Array.isArray(raw.Mounts) &&
      raw.Mounts.every(
        (m) =>
          objeto(m) &&
          m.Type === "tmpfs" &&
          Object.hasOwn(TMPFS, m.Destination) &&
          !m.Source &&
          m.RW === true &&
          !m.Name &&
          !m.Driver &&
          !m.Propagation &&
          Object.keys(m).every((k) =>
            ["Type", "Destination", "Source", "Mode", "RW", "Propagation"].includes(k),
          ),
      ) &&
      new Set(raw.Mounts.map((m) => m.Destination)).size === raw.Mounts.length,
    "Mount Engine não autorizado.",
  );
  const n = raw.NetworkSettings;
  exigir(
    objeto(n) && vazio(n.Ports) && objeto(n.Networks) && igual(Object.keys(n.Networks), ["none"]),
    "Rede nativa não confinada.",
  );
  const endpoint = n.Networks.none;
  exigir(
    objeto(endpoint) &&
      ["IPAddress", "GlobalIPv6Address", "Gateway", "IPv6Gateway", "MacAddress"].every(
        (k) => !endpoint[k],
      ) &&
      vazio(endpoint.Aliases) &&
      vazio(endpoint.Links) &&
      vazio(endpoint.DriverOpts) &&
      vazio(endpoint.IPAMConfig) &&
      !n.Bridge &&
      !n.Gateway &&
      !n.IPAddress &&
      !n.GlobalIPv6Address &&
      !n.IPv6Gateway,
    "Endereço ou rota nativa recusada.",
  );
  exigir(
    typeof raw.State?.Running === "boolean" &&
      Number.isInteger(raw.State.ExitCode) &&
      raw.State.ExitCode >= 0 &&
      raw.State.ExitCode <= 255 &&
      Number.isInteger(raw.State.Pid) &&
      (raw.State.Running ? raw.State.Pid > 0 : raw.State.Pid === 0),
    "Estado nativo inválido.",
  );
  // Projeta somente campos validados do raw; apenas a ordem de Env é normalizada.
  const hostConfig = Object.fromEntries(
    Object.keys(spec.HostConfig).map((k) => [k, structuredClone(h[k])]),
  );
  return {
    Id: id,
    Config: Object.fromEntries(
      Object.keys(spec).map((k) => [
        k,
        k === "HostConfig" ? hostConfig : k === "Env" ? env : structuredClone(c[k]),
      ]),
    ),
    HostConfig: hostConfig,
    Mounts: [],
    State: { Running: raw.State.Running, ExitCode: raw.State.ExitCode },
  };
}
function rota(m, p) {
  return (
    (m === "GET" && p === `/images/${encodeURIComponent(PIN_POSTGRES)}/json`) ||
    (m === "POST" && p === "/containers/create") ||
    (m === "GET" && /^\/containers\/[a-f0-9]{64}\/json$/.test(p)) ||
    (m === "POST" && /^\/containers\/[a-f0-9]{64}\/(start|stop|exec)$/.test(p)) ||
    (m === "DELETE" && /^\/containers\/[a-f0-9]{64}$/.test(p)) ||
    (m === "POST" && /^\/exec\/[a-f0-9]{64}\/start$/.test(p)) ||
    (m === "GET" && /^\/exec\/[a-f0-9]{64}\/json$/.test(p))
  );
}
export function criarClienteEngine({ iniciar, nome, prazoMs = 5000 }) {
  exigir(
    typeof iniciar === "function" &&
      /^fadm-[a-f0-9]{32}$/.test(nome) &&
      Number.isInteger(prazoMs) &&
      prazoMs > 0 &&
      prazoMs <= 5000,
    "Cliente nativo inválido.",
  );
  return async (metodo, caminho, corpo) => {
    exigir(rota(metodo, caminho), "Rota nativa não autorizada.");
    const bytes = corpo === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(corpo));
    exigir(bytes.length <= 16384, "Pedido Engine excedido.");
    const filho = iniciar();
    return new Promise((resolve, reject) => {
      let causa,
        resposta,
        encerrado = false,
        finalizado = false,
        diagnostico = 0;
      const socket = Duplex.from({ readable: filho.stdout, writable: filho.stdin });
      const terminar = () => {
        if (finalizado || !encerrado || resposta === undefined) return;
        finalizado = true;
        clearTimeout(timer);
        if (causa) reject(causa);
        else resolve(resposta);
      };
      const falhar = (e) => {
        causa ??= e;
        req.destroy();
        socket.destroy();
        filho.kill("SIGKILL");
      };
      const agent = new Agent({ keepAlive: false });
      agent.createConnection = () => socket;
      const req = request(
        {
          method: metodo,
          path: `/v1.47${caminho}${caminho === "/containers/create" ? `?name=${nome}` : ""}`,
          host: "docker",
          maxHeaderSize: 4096,
          agent,
          headers: {
            Connection: "close",
            "Content-Type": "application/json",
            "Content-Length": bytes.length,
          },
        },
        (res) => {
          const chunks = [];
          let total = 0;
          res.on("error", falhar);
          res.on("data", (b) => {
            total += b.length;
            if (total > 131072) falhar(new Error("Resposta Engine excedida."));
            else chunks.push(b);
          });
          res.on("end", () => {
            try {
              exigir(res.complete, "Resposta Engine incompleta.");
              // O middleware anuncia o máximo do daemon, não a versão do path atendido.
              const versoes = res.headersDistinct["api-version"];
              const versao = versoes?.length === 1 && /^1\.(0|[1-9]\d*)$/.exec(versoes[0]);
              exigir(
                versoes === undefined ||
                  (versao && Number.isSafeInteger(Number(versao[1])) && Number(versao[1]) >= 47),
                "Versão Engine incompatível.",
              );
              const b = Buffer.concat(chunks);
              if (res.statusCode === 404) {
                const id =
                  metodo === "GET" && /^\/containers\/([a-f0-9]{64})\/json$/.exec(caminho)?.[1];
                exigir(
                  res.headers["content-type"] === "application/json",
                  "Tipo de ausência Engine inválido.",
                );
                const erro = jsonEngine(b);
                exigir(
                  id &&
                    objeto(erro) &&
                    igual(Object.keys(erro), ["message"]) &&
                    erro.message === `No such container: ${id}`,
                  "Ausência Engine sem identidade confirmada.",
                );
                resposta = null;
              } else if (metodo === "GET") {
                exigir(
                  res.statusCode === 200 && res.headers["content-type"] === "application/json",
                  "Inspeção Engine inválida.",
                );
                resposta = jsonEngine(b);
                exigir(objeto(resposta), "Objeto Engine inválido.");
              } else if (caminho.endsWith("/start") && caminho.startsWith("/exec/")) {
                exigir(
                  res.statusCode === 200 &&
                    res.headers["content-type"] === "application/vnd.docker.raw-stream",
                  "Stream exec Engine inválido.",
                );
                resposta = b;
              } else if (caminho === "/containers/create" || caminho.endsWith("/exec")) {
                exigir(
                  res.statusCode === 201 && res.headers["content-type"] === "application/json",
                  "Criação Engine não confirmada.",
                );
                resposta = jsonEngine(b);
                exigir(objeto(resposta) && ID.test(resposta.Id), "Criação Engine sem ID.");
              } else {
                exigir(res.statusCode === 204 && b.length === 0, "Mutação Engine não confirmada.");
                resposta = null;
              }
              terminar();
            } catch (e) {
              falhar(e);
            }
          });
        },
      );
      req.on("error", (e) => {
        causa ??= e;
        filho.kill("SIGKILL");
      });
      filho.on("error", (e) => {
        causa ??= e;
      });
      filho.stderr.on("data", (b) => {
        diagnostico += b.length;
        if (diagnostico > 4096) falhar(new Error("Diagnóstico Engine excedido."));
      });
      filho.stdin.on("error", falhar);
      filho.stdout.on("error", falhar);
      filho.stderr.on("error", falhar);
      filho.once("close", (codigo, sinal) => {
        encerrado = true;
        if (codigo !== 0 || sinal !== null)
          causa ??= new Error("Cliente Engine sem conclusão local.");
        if (resposta === undefined) causa ??= new Error("Engine sem resposta completa.");
        if (causa) {
          finalizado = true;
          clearTimeout(timer);
          reject(causa);
        } else terminar();
      });
      const timer = setTimeout(() => {
        falhar(new Error("Prazo Engine excedido; efeito incerto."));
        if (!finalizado) {
          finalizado = true;
          reject(causa);
        }
      }, prazoMs);
      req.end(bytes);
    });
  };
}
export function comandoIdentidade(spec) {
  const banco = spec.Env.find((e) => e.startsWith("POSTGRES_DB=")).slice(12);
  const senha = spec.Env.find((e) => e.startsWith("POSTGRES_PASSWORD=")).slice(18);
  return {
    AttachStdin: false,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Privileged: false,
    User: "postgres",
    Env: [
      `PGPASSWORD=${senha}`,
      "PGCONNECT_TIMEOUT=2",
      "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=2000 -c lock_timeout=1000",
    ],
    Cmd: [
      "psql",
      "--no-psqlrc",
      "--no-password",
      "--host=127.0.0.1",
      `--username=${banco}`,
      `--dbname=${banco}`,
      "--set=ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--command=SELECT current_database(), current_user, (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')), current_setting('transaction_read_only')",
    ],
  };
}
export async function consultarIdentidadePostgres({
  id,
  spec,
  requisitar,
  conferir,
  persistir,
  signal,
  autorizar,
}) {
  const comando = comandoIdentidade(spec);
  const banco = spec.Env.find((e) => e.startsWith("POSTGRES_DB=")).slice(12);
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    exigir(!signal?.aborted, "Consulta nativa interrompida.");
    autorizar();
    await conferir();
    exigir(!signal?.aborted, "Consulta interrompida antes de criar exec.");
    autorizar();
    const exec = await requisitar("POST", `/containers/${id}/exec`, comando);
    exigir(ID.test(exec?.Id), "Exec sem identidade; não repetir.");
    await persistir(exec.Id);
    exigir(!signal?.aborted, "Consulta interrompida antes de iniciar exec.");
    autorizar();
    const bytes = await requisitar("POST", `/exec/${exec.Id}/start`, { Detach: false, Tty: false });
    exigir(Buffer.isBuffer(bytes) && bytes.length <= 16384, "Saída nativa inválida.");
    const estado = await requisitar("GET", `/exec/${exec.Id}/json`);
    exigir(
      estado?.ID === exec.Id &&
        estado.ContainerID === id &&
        estado.Running === false &&
        estado.Pid === 0 &&
        Number.isInteger(estado.ExitCode) &&
        igual(estado.ProcessConfig, {
          privileged: false,
          user: "postgres",
          tty: false,
          entrypoint: comando.Cmd[0],
          arguments: comando.Cmd.slice(1),
        }),
      "Exec remoto sem término ou comando confirmado.",
    );
    const saidas = [[], []];
    for (let p = 0; p < bytes.length;) {
      exigir(
        p + 8 <= bytes.length &&
          [1, 2].includes(bytes[p]) &&
          bytes[p + 1] === 0 &&
          bytes[p + 2] === 0 &&
          bytes[p + 3] === 0,
        "Frame exec inválido.",
      );
      const tamanho = bytes.readUInt32BE(p + 4);
      exigir(p + 8 + tamanho <= bytes.length, "Frame exec truncado.");
      saidas[bytes[p] - 1].push(bytes.subarray(p + 8, p + 8 + tamanho));
      p += 8 + tamanho;
    }
    const stdout = Buffer.concat(saidas[0]).toString("utf8");
    const stderr = Buffer.concat(saidas[1]).toString("utf8");
    if (estado.ExitCode === 0) {
      exigir(
        stdout === `${banco}|${banco}|0|on\n` && stderr === "",
        "Identidade, vazio ou leitura PostgreSQL divergente.",
      );
      await conferir();
      autorizar();
      return { banco, papel: banco, objetos: 0, somenteLeitura: true };
    }
    // psql 2 só é readiness quando o erro é de conexão ao loopback fixo; SQL nunca é repetido.
    exigir(
      estado.ExitCode === 2 &&
        stdout === "" &&
        stderr.startsWith('psql: error: connection to server at "127.0.0.1", port 5432 failed:') &&
        /Connection refused|the database system is starting up/.test(stderr) &&
        tentativa < 9,
      "Consulta PostgreSQL falhou; sem retry autorizado.",
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Identidade PostgreSQL indisponível.");
}
