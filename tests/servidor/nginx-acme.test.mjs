// Verifica a entrada e o ciclo fechado Nginx sem disponibilizar daemon ao driver.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";

const raiz = path.resolve(import.meta.dirname, "../..");
test("entrada recusa argumentos sem chamar Docker nem instalar limpeza mutante", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "nginx-contrato-"));
  try {
    const log = path.join(pasta, "docker.log");
    fs.writeFileSync(
      path.join(pasta, "docker"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CHAMADAS"\nexit 42\n',
    );
    fs.chmodSync(path.join(pasta, "docker"), 0o755);
    const r = spawnSync("bash", [path.join(raiz, "tests/servidor/nginx-acme.sh"), "--invalido"], {
      encoding: "utf8",
      timeout: 10000,
      env: { PATH: `${pasta}:/usr/bin:/bin`, TMPDIR: pasta, CHAMADAS: log },
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(
      fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "",
      "",
      "nenhuma chamada Docker sem autorização",
    );
    assert.equal(r.status, 78);
    assert.match(r.stderr, /uso:/);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

async function modulo() {
  const arquivo = path.join(import.meta.dirname, "nginx-acme-harness.mjs");
  assert.equal(
    fs.existsSync(arquivo),
    true,
    "perfil ainda não dispõe de um ciclo fechado por IDs próprios",
  );
  return import(arquivo);
}

const imagem = `sha256:${"a".repeat(64)}`;
const ferramentas = `sha256:${"b".repeat(64)}`;
const rodada = "a12d0a0f-0b2e-40f0-8000-111111111111";
// Campos observados nos inspects preservados parent-inspect-{nginx,cliente}.json.
// Identidades/captura são parametrizadas; Config/HostConfig não ecoam a receita.
const defaults = {
  Env: ["PATH=/bin"],
  Labels: {},
  Entrypoint: ["/docker-entrypoint.sh"],
  Cmd: ["nginx", "-g", "daemon off;"],
  WorkingDir: "/",
  StopSignal: "SIGQUIT",
};

function produtor(receita, id, estado = "created", codigo = 0) {
  const nginx = receita.papel === "nginx";
  return {
    Id: id,
    Image: receita.imagem,
    Config: {
      User: nginx ? "101:101" : "1000:1000",
      Hostname: !nginx && estado === "created" ? id.slice(0, 12) : `nginx-${receita.rodada}`,
      Domainname: "",
      WorkingDir: "/repo",
      Entrypoint: nginx ? ["/bin/sh"] : ["node"],
      Cmd: nginx
        ? ["/repo/nginx-bootstrap.sh"]
        : [
            "tests/servidor/nginx-acme-real.mjs",
            "--netns=net:[12345]",
            `--rodada=${receita.rodada}`,
          ],
      Env: [
        "PATH=/bin",
        `HOME=${nginx ? "/run" : "/scratch"}`,
        `TMPDIR=${nginx ? "/run" : "/scratch"}`,
        `HOSTNAME=${receita.papel}-${receita.rodada}`,
      ],
      Labels: {
        "frequenciapp.ensaio.perfil": "nginx-acme-v1",
        "frequenciapp.ensaio.rodada": receita.rodada,
        "frequenciapp.ensaio.papel": receita.papel,
      },
      StopSignal: nginx ? "SIGQUIT" : "SIGTERM",
      StopTimeout: 15,
      Volumes: null,
      Healthcheck: { Test: ["NONE"] },
    },
    HostConfig: {
      NetworkMode: nginx ? "none" : `container:${"c".repeat(64)}`,
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      CapAdd: null,
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
      Tmpfs: nginx
        ? Object.fromEntries(
            [
              "/run",
              "/var/cache/nginx",
              "/etc/nginx/conf.d",
              "/etc/letsencrypt",
              "/var/www/certbot",
            ].map((d) => [d, "rw,nosuid,nodev,noexec,uid=101,gid=101,mode=0755,size=32m"]),
          )
        : { "/scratch": "rw,nosuid,nodev,noexec,uid=1000,gid=1000,mode=0700,size=32m" },
      LogConfig: { Type: "json-file", Config: { "max-size": "2m", "max-file": "2" } },
      ExtraHosts: nginx ? ["app:127.0.0.1"] : null,
      Dns: nginx ? ["127.0.0.1"] : null,
      Sysctls: nginx ? { "net.ipv4.ip_unprivileged_port_start": "0" } : undefined,
    },
    Mounts: [{ Type: "bind", Source: receita.captura, Destination: "/repo", RW: false }],
    NetworkSettings: { Networks: nginx ? { none: {} } : {}, Ports: {} },
    State: {
      Status: estado,
      Running: estado === "running",
      ExitCode: codigo,
      OOMKilled: false,
      Error: "",
      StartedAt: estado === "created" ? "0001-01-01T00:00:00Z" : "2026-11-10T00:00:00Z",
      FinishedAt: estado === "exited" ? "2026-11-10T00:00:00Z" : "0001-01-01T00:00:00Z",
    },
  };
}

function transporte(receitas, alterar = () => {}) {
  // IDs são emitidos pelo produtor, não extraídos dos argumentos do consumidor.
  const ids = ["c".repeat(64), "d".repeat(64)];
  const estados = new Map();
  const chamadas = [];
  let criacoes = 0;
  const ok = (stdout = "") => ({ status: 0, signal: null, stdout, stderr: "" });
  const cliente = async (args) => {
    chamadas.push(args);
    alterar(args);
    if (args[0] === "create") {
      const i = criacoes++;
      assert.deepEqual(args, receitas[i].args);
      estados.set(ids[i], { receita: receitas[i], estado: "created" });
      return ok(ids[i] + "\n");
    }
    const id = args[0] === "exec" ? args[1] : args.at(-1),
      c = estados.get(id);
    assert.ok(c, "comando deve usar o ID emitido pelo create correspondente");
    if (args[0] === "inspect")
      return c.estado === "removed"
        ? { status: 1, signal: null, stdout: "[]\n", stderr: `error: no such object: ${id}\n` }
        : ok(JSON.stringify([produtor(c.receita, id, c.estado)]));
    if (args[0] === "start") {
      assert.equal(c.estado, "created");
      c.estado = c.receita.papel === "nginx" ? "running" : "exited";
      return ok(
        c.receita.papel === "nginx"
          ? id
          : JSON.stringify({
              tipo: "nginx-resultado",
              rodada,
              positivo: {
                token80: true,
                redirecionamento301: true,
                tls443: true,
                tokenSha256: "f".repeat(64),
                location: "https://nginx.invalid/caminho%20sintetico/sub?origem=ensaio&item=2",
                tls: { status: 502, autorizado: true, protocolo: "TLSv1.3" },
              },
              negativo: { tokenAusente: true, status: 404, causa: "ETOKEN_AUSENTE" },
              runtime: { netns: "net:[12345]" },
            }) + "\n",
      );
    }
    if (args[0] === "logs") return ok("NGINX_GATE net:[12345]\n");
    if (args[0] === "stop") {
      c.estado = "exited";
      return ok(id);
    }
    if (args[0] === "wait") {
      assert.equal(c.estado, "exited");
      return ok("0\n");
    }
    if (args[0] === "exec") return ok(JSON.stringify({ modelo: receitas[0].modeloHash }));
    if (args[0] === "rm") {
      assert.equal(c.estado, "exited");
      c.estado = "removed";
      return ok(id);
    }
    throw new Error(`operação não prevista: ${args[0]}`);
  };
  cliente.seguir = (args) => {
    chamadas.push(args);
    return Promise.resolve({ ...ok("NGINX_GATE net:[12345]\n"), fechado: true });
  };
  return { cliente, chamadas, ids };
}

async function fixture() {
  const m = await modulo();
  const nginx = m.receitaNginx({
    imagem,
    captura: "/captura",
    rodada,
    defaults,
    modeloHash: "e".repeat(64),
  });
  const cliente = m.receitaCliente({
    imagem: ferramentas,
    captura: "/captura",
    rodada,
    defaults: { Env: ["PATH=/bin"], Labels: {} },
    nginxId: "c".repeat(64),
    netns: "net:[12345]",
  });
  return { m, nginx, cliente };
}

test("ciclo fechado prova HTTP e TLS antes de confirmar término e ausência por ID", async () => {
  const { m, nginx, cliente } = await fixture();
  const t = transporte([nginx, cliente]);
  const resultado = await m.executarCiclo({
    nginx,
    criarCliente: (id, netns) => {
      assert.equal(id, t.ids[0]);
      assert.equal(netns, "net:[12345]");
      return cliente;
    },
    cliente: t.cliente,
  });
  assert.equal(resultado.estado, "aprovado");
  assert.deepEqual(resultado.ids, t.ids);
  assert.equal(resultado.ausentes, true);
  for (const id of t.ids) {
    const comandos = t.chamadas.filter((a) => a.at(-1) === id).map((a) => a[0]);
    assert.ok(comandos.indexOf("wait") >= 0);
    assert.ok(comandos.indexOf("rm") > comandos.indexOf("wait"));
    assert.equal(comandos.at(-1), "inspect");
  }
  assert.ok(t.chamadas.every((a) => !a.includes("-f") && !a.includes("run")));
});

test("ausência aceita caixa observada sem aceitar erro de permissão, outro ID ou sinal", async () => {
  const { m } = await fixture();
  const id = "c".repeat(64);
  const bom = { status: 1, signal: null, stdout: "[]\n", stderr: `error: no such object: ${id}\n` };
  assert.equal(m.conferirAusencia(bom, id), true);
  assert.equal(m.conferirAusencia({ ...bom, stderr: `Error: No such container: ${id}` }, id), true);
  for (const r of [
    { ...bom, status: 0 },
    { ...bom, signal: "SIGTERM" },
    { ...bom, stdout: "{}" },
    { ...bom, stderr: `permission denied ${id}` },
    { ...bom, stderr: `no such object: ${"d".repeat(64)}` },
    { ...bom, error: { code: "ENOENT" } },
    { ...bom, stderr: `error: no such object: ${id}\npermission denied` },
  ])
    assert.throws(() => m.conferirAusencia(r, id));
});

test("receitas e inspeção recusam rede, capabilities, ambiente e mounts extras", async () => {
  const { m, nginx } = await fixture();
  assert.equal(nginx.host.NetworkMode, "none");
  assert.equal(nginx.config.User, "101:101");
  assert.deepEqual(nginx.host.CapDrop, ["ALL"]);
  const id = "c".repeat(64),
    original = produtor(nginx, id);
  m.conferirContainer(original, nginx, id);
  const adulteracoes = [
    (c) => {
      c.Id = "d".repeat(64);
    },
    (c) => {
      c.HostConfig.NetworkMode = "bridge";
    },
    (c) => {
      c.HostConfig.CapAdd = ["NET_BIND_SERVICE"];
    },
    (c) => {
      c.HostConfig.Privileged = true;
    },
    (c) => {
      c.HostConfig.PortBindings = { "80/tcp": [{ HostPort: "80" }] };
    },
    (c) => {
      c.Config.Env.push("HTTP_PROXY=http://externo");
    },
    (c) => {
      c.Mounts.push({
        Type: "bind",
        Source: "/var/run/docker.sock",
        Destination: "/socket",
        RW: false,
      });
    },
  ];
  for (const adulterar of adulteracoes) {
    const c = structuredClone(original);
    adulterar(c);
    assert.throws(() => m.conferirContainer(c, nginx, id));
  }
});

test("cancelamento durante inspeção revoga partida e não remove recurso incerto", async () => {
  const { m, nginx, cliente } = await fixture();
  let cancelado = false;
  const t = transporte([nginx, cliente], (args) => {
    if (args[0] === "inspect") cancelado = true;
  });
  await assert.rejects(
    m.executarCiclo({
      nginx,
      criarCliente: () => cliente,
      cliente: t.cliente,
      cancelado: () => cancelado,
    }),
    /cancelado/,
  );
  assert.equal(
    t.chamadas.some((a) => ["start", "exec", "stop", "rm"].includes(a[0])),
    false,
  );
});

test("falha de acompanhamento preserva recibo e nunca vira ausência aprovada", async () => {
  const { m, nginx, cliente } = await fixture();
  const t = transporte([nginx, cliente]);
  t.cliente.seguir = () =>
    Promise.resolve({
      status: 1,
      signal: null,
      stdout: "",
      stderr: "acompanhamento falhou",
      fechado: true,
    });
  await assert.rejects(
    m.executarCiclo({ nginx, criarCliente: () => cliente, cliente: t.cliente }),
    /acompanhamento/,
  );
  assert.equal(
    t.chamadas.some((a) => a[0] === "rm"),
    false,
  );
});

test("hostname do cliente distingue criação sem partida de running e exited", async () => {
  const { m, cliente } = await fixture();
  const id = "d".repeat(64);
  for (const estado of ["created", "running", "exited"])
    m.conferirContainer(produtor(cliente, id, estado), cliente, id);
  for (const [estado, alterar] of [
    [
      "created",
      (c) => {
        c.Config.Hostname = `nginx-${rodada}`;
      },
    ],
    [
      "created",
      (c) => {
        c.Config.Hostname = "e".repeat(12);
      },
    ],
    [
      "created",
      (c) => {
        c.State.StartedAt = "2026-11-10T00:00:00Z";
      },
    ],
    [
      "running",
      (c) => {
        c.Config.Hostname = id.slice(0, 12);
      },
    ],
    [
      "exited",
      (c) => {
        c.Config.Hostname = id.slice(0, 12);
      },
    ],
    [
      "exited",
      (c) => {
        c.State.StartedAt = "0001-01-01T00:00:00Z";
      },
    ],
    [
      "created",
      (c) => {
        c.HostConfig.NetworkMode = `container:${"e".repeat(64)}`;
      },
    ],
  ]) {
    const c = produtor(cliente, id, estado);
    alterar(c);
    assert.throws(() => m.conferirContainer(c, cliente, id));
  }
});

for (const modo of ["falha", "cancelamento"])
  test(`observador próprio fecha pipes antes de retornar em ${modo}`, async () => {
    const { m, nginx, cliente } = await fixture();
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "nginx-follow-"));
    let filho,
      fechado = false,
      entrou = false,
      cancelado = false;
    let pronto;
    const entrada = new Promise((resolve) => {
      pronto = resolve;
    });
    const unhandled = [];
    const aoRejeitar = (erro) => unhandled.push(erro);
    process.on("unhandledRejection", aoRejeitar);
    const t = transporte([nginx, cliente]);
    const real = m.clienteDocker(pasta, (bin, args, opcoes) => {
      assert.equal(bin, "/usr/bin/docker");
      assert.deepEqual(args, ["logs", "--follow", t.ids[0]]);
      filho = spawn(
        process.execPath,
        ["-e", 'process.stdout.write("FOLLOW_ENTROU\\n"); setInterval(() => {}, 1000);'],
        opcoes,
      );
      filho.stdout.on("data", (b) => {
        if (b.toString().includes("FOLLOW_ENTROU")) {
          entrou = true;
          pronto();
        }
      });
      filho.once("close", () => {
        fechado = true;
      });
      return filho;
    });
    const transporteOriginal = t.cliente;
    const invocar = async (args) => {
      if (args[0] === "logs" && args.length === 2) {
        await entrada;
        if (modo === "falha") throw new Error("falha causal após entrada no follow");
        cancelado = true;
      }
      return transporteOriginal(args);
    };
    invocar.seguir = real.seguir;
    try {
      let erro;
      await assert.rejects(
        m.executarCiclo({
          nginx,
          criarCliente: () => cliente,
          cliente: invocar,
          cancelado: () => cancelado,
        }),
        (e) => {
          erro = e;
          return modo === "falha" ? /falha causal/.test(e.message) : /cancelado/.test(e.message);
        },
      );
      assert.equal(entrou, true, "filho entrou no follow pendente");
      assert.equal(fechado, true, "retorno exige close real do observador próprio");
      assert.equal(erro.recibo.observador.fechado, true);
      assert.equal(erro.recibo.observador.pid, filho.pid);
      assert.equal(erro.recibo.estado, "preservado");
      assert.equal(erro.recibo.ausentes, false);
      assert.equal(
        t.chamadas.some((a) => ["exec", "stop", "rm"].includes(a[0])),
        false,
      );
      assert.equal(t.chamadas.filter((a) => a[0] === "start").length, 1);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandled, []);
    } finally {
      if (filho && !fechado) {
        const fim = once(filho, "close");
        filho.kill("SIGKILL");
        await fim;
      }
      process.removeListener("unhandledRejection", aoRejeitar);
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  });

test("observador do token tem recusa causal e não aceita qualquer erro", async () => {
  await modulo();
  const { conferirToken } = await import("./nginx-acme-real.mjs");
  assert.equal(conferirToken({ status: 200, corpo: "token\n" }, "token\n"), true);
  assert.throws(() => conferirToken({ status: 404, corpo: "ausente" }, "token\n"), {
    code: "ETOKEN_AUSENTE",
  });
  assert.throws(() => conferirToken({ status: 500, corpo: "falha" }, "token\n"), {
    code: "EHTTP_TOKEN",
  });
});
