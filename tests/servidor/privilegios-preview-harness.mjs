// Confina o ensaio preview a um único PostgreSQL descartável e preserva recibos por ID.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ambienteMapa, inspecionarImagem } from "./imagens-ensaio.mjs";
import { nomesRelatoriosPreview } from "./privilegios-preview-real.mjs";

export const imagemPreview =
  "sha256:9e18784ce1ab6414c110d0fe23efaa32d127a2d7cbdf4a231a57c7caf46ce4da";
export const fontesPreview = [
  "tests/servidor/privilegios-preview.sh",
  "tests/servidor/privilegios-preview-harness.mjs",
  "tests/servidor/privilegios-preview-real.mjs",
  "tests/servidor/privilegios-preview.test.mjs",
  "tests/servidor/imagens-ensaio.mjs",
  "scripts/banco/provisionar-preview.sql",
  "tests/apoio/privilegios-preview.mjs",
];
const raiz = path.resolve(import.meta.dirname, "../..");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const salvar = (p, valor) =>
  fs.writeFileSync(p, JSON.stringify(valor, null, 2) + "\n", { mode: 0o600 });

export function receitaPreview({ imagem, captura, rodada, fase, defaults, labels = {} }) {
  assert.match(imagem, /^sha256:[a-f0-9]{64}$/);
  assert.match(rodada, /^[a-f0-9-]{36}$/);
  assert.ok(["vertical", "restante", "completo"].includes(fase));
  assert.ok(path.isAbsolute(captura) && !/[,:\n\r]/.test(captura));
  const usuario = "999:999";
  const cmd = ["node", "tests/servidor/privilegios-preview-real.mjs", `--fase=${fase}`];
  const hostname = `preview-${rodada}`;
  const ambiente = {
    ...ambienteMapa(defaults),
    HOSTNAME: hostname,
    HOME: "/ensaio",
    TMPDIR: "/ensaio",
    PREVIEW_ENSAIO_RODADA: rodada,
  };
  const rotulos = {
    ...labels,
    "frequenciapp.ensaio.perfil": "preview-pg17-v1",
    "frequenciapp.ensaio.rodada": rodada,
  };
  const tmpfs = {
    "/ensaio": "rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=512m",
    "/var/lib/postgresql/data": "rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=16m",
  };
  const args = [
    "create",
    "--hostname",
    hostname,
    "--network",
    "none",
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
    "768m",
    "--memory-swap",
    "768m",
    "--pids-limit",
    "128",
    "--ipc",
    "private",
    "--stop-timeout",
    "15",
    "--stop-signal",
    "SIGTERM",
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=2m",
    "--log-opt",
    "max-file=2",
    "--workdir",
    "/app",
    "--mount",
    `type=bind,src=${captura},dst=/app,readonly`,
  ];
  for (const [k, v] of Object.entries(tmpfs)) args.push("--tmpfs", `${k}:${v}`);
  for (const [k, v] of Object.entries(rotulos)) args.push("--label", `${k}=${v}`);
  for (const [k, v] of Object.entries(ambiente)) args.push("--env", `${k}=${v}`);
  args.push(imagem, ...cmd);
  return { imagem, captura, rodada, fase, usuario, cmd, ambiente, rotulos, tmpfs, args, hostname };
}

export function conferirContainer(c, receita, id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(c.Id, id, "ID divergente");
  assert.equal(c.Image, receita.imagem, "imagem divergente");
  assert.deepEqual(c.Config.Labels, receita.rotulos, "ownership divergente");
  assert.equal(c.Config.User, receita.usuario, "UID divergente");
  assert.equal(c.Config.Hostname, receita.hostname);
  assert.equal(c.Config.Domainname, "");
  assert.deepEqual(c.Config.Cmd, receita.cmd, "comando divergente");
  assert.deepEqual(c.Config.Entrypoint ?? [], [], "entrypoint inesperado");
  assert.equal(c.Config.WorkingDir, "/app");
  assert.equal(c.Config.StopSignal, "SIGTERM");
  assert.equal(c.Config.StopTimeout, 15);
  assert.ok(!c.Config.Healthcheck);
  assert.deepEqual(ambienteMapa(c.Config.Env), receita.ambiente, "ambiente divergente");
  const h = c.HostConfig;
  assert.equal(h.NetworkMode, "none", "rede divergente");
  assert.deepEqual(h.PortBindings ?? {}, {});
  assert.equal(h.PublishAllPorts, false);
  assert.equal(h.ReadonlyRootfs, true);
  assert.equal(h.Privileged, false);
  assert.deepEqual(h.CapDrop, ["ALL"]);
  assert.deepEqual(h.CapAdd ?? [], []);
  assert.deepEqual(h.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(h.NanoCpus, 1000000000);
  assert.equal(h.Memory, 805306368);
  assert.equal(h.MemorySwap, 805306368);
  assert.equal(h.PidsLimit, 128);
  assert.equal(h.IpcMode, "private");
  for (const k of ["PidMode", "UTSMode", "UsernsMode"]) assert.equal(h[k] || "", "");
  for (const k of [
    "Binds",
    "VolumesFrom",
    "Devices",
    "DeviceRequests",
    "GroupAdd",
    "ExtraHosts",
    "Dns",
    "DnsSearch",
    "Links",
  ])
    assert.deepEqual(h[k] ?? [], [], k);
  assert.deepEqual(h.Tmpfs, receita.tmpfs);
  assert.deepEqual(h.LogConfig, {
    Type: "json-file",
    Config: { "max-size": "2m", "max-file": "2" },
  });
  assert.equal(h.AutoRemove, false);
  const binds = c.Mounts.filter((m) => m.Type === "bind");
  assert.equal(binds.length, 1);
  assert.equal(binds[0].Source, receita.captura);
  assert.equal(binds[0].Destination, "/app");
  assert.equal(binds[0].RW, false);
  assert.ok(
    c.Mounts.every(
      (m) =>
        m.Type === "bind" || (m.Type === "tmpfs" && Object.hasOwn(receita.tmpfs, m.Destination)),
    ),
    "volume ou montagem extra",
  );
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), ["none"]);
  for (const p of Object.values(c.NetworkSettings.Ports ?? {})) assert.equal(p, null);
  return c;
}

// A leitura do frame só acontece após attach, wait e State terminal conciliados.
export function lerExportacao(stdout, receita, codigo) {
  assert.ok(typeof stdout === "string" && Buffer.byteLength(stdout) <= 8 * 1048576);
  const linhas = stdout.split("\n").filter((s) => s.startsWith("PREVIEW_EVIDENCIAS_V1"));
  assert.equal(linhas.length, 1, "exportação ausente ou duplicada");
  const m = /^PREVIEW_EVIDENCIAS_V1 ([a-f0-9]{64}) ([A-Za-z0-9+/]+={0,2})$/.exec(linhas[0]);
  assert.ok(m, "exportação truncada");
  const corpo = Buffer.from(m[2], "base64");
  assert.ok(corpo.length <= 1048576);
  assert.equal(corpo.toString("base64"), m[2]);
  assert.equal(hash(corpo), m[1], "hash da exportação divergiu");
  const quadro = JSON.parse(corpo);
  assert.equal(quadro.rodada, receita.rodada);
  assert.equal(quadro.fase, receita.fase);
  assert.ok(
    Array.isArray(quadro.arquivos) && quadro.arquivos.length <= nomesRelatoriosPreview.length,
  );
  const relatorios = {},
    manifesto = {},
    conteudos = {};
  for (const a of quadro.arquivos) {
    assert.ok(
      nomesRelatoriosPreview.includes(a.nome) && !Object.hasOwn(relatorios, a.nome),
      "relatório extra ou duplicado",
    );
    assert.equal(typeof a.base64, "string");
    const b = Buffer.from(a.base64, "base64");
    assert.ok(b.length <= 262144);
    assert.equal(b.toString("base64"), a.base64);
    assert.equal(hash(b), a.sha256, "hash de relatório divergiu");
    relatorios[a.nome] = JSON.parse(b);
    conteudos[a.nome] = a.base64;
    manifesto[a.nome] = { sha256: a.sha256, bytes: b.length };
  }
  for (const n of ["isolamento.json", "resultado.json", "comandos.json"])
    assert.ok(Object.hasOwn(relatorios, n), "relatório obrigatório ausente");
  const resultado = relatorios["resultado.json"];
  assert.equal(resultado.rodada, receita.rodada);
  assert.equal(resultado.fase, receita.fase);
  assert.equal(resultado.estado, codigo === 0 ? "aprovado" : "falhou");
  assert.deepEqual(resultado.fontes, receita.fontes);
  assert.deepEqual(relatorios["isolamento.json"].fontes, receita.fontes);
  assert.ok(Array.isArray(resultado.casos));
  if (codigo === 0) {
    for (const n of [
      "readiness.json",
      "casos.json",
      ...(receita.fase === "vertical" ? [] : ["privilegios.json", "rollback.json"]),
    ])
      assert.ok(Object.hasOwn(relatorios, n), "relatório positivo incompleto");
    assert.equal(relatorios["casos.json"].rodada, receita.rodada);
    assert.equal(relatorios["casos.json"].fase, receita.fase);
    assert.deepEqual(relatorios["casos.json"].casos, resultado.casos);
    assert.ok(resultado.casos.length > 0);
    assert.equal(Object.hasOwn(relatorios, "falha.json"), false);
  }
  return { relatorios, manifesto, conteudos, sha256: m[1] };
}
// O transporte injetável só recebe a receita fechada deste perfil, nunca comandos do driver.
export async function executarCiclo({
  receita,
  cliente,
  registrar = () => {},
  cancelado = () => false,
}) {
  const recibo = {
    rodada: receita.rodada,
    fase: receita.fase,
    estado: "criando",
    id: null,
    removido: false,
    ausente: false,
  };
  let c,
    attach,
    terminal = false,
    causa;
  const invocar = async (args) => {
    const r = await cliente(args);
    registrar("cliente", {
      operacao: args[0],
      status: r.status,
      sinal: r.signal,
      erro: r.error?.code ?? null,
    });
    return r;
  };
  const sucesso = (r) => {
    assert.equal(r.error, undefined, "erro do cliente");
    assert.equal(r.signal, null, "sinal no cliente");
    assert.equal(r.status, 0, "status do cliente");
    return r.stdout;
  };
  const inspecionar = async () => {
    const lista = JSON.parse(sucesso(await invocar(["inspect", recibo.id])));
    assert.equal(lista.length, 1);
    c = conferirContainer(lista[0], receita, recibo.id);
    registrar("container", c);
    return c;
  };
  try {
    assert.equal(cancelado(), false, "cancelado antes de criar");
    const criado = await invocar(receita.args);
    // Persistir a resposta inclusive se não puder ser aceita; não procurar por nome depois.
    registrar("criado", criado);
    recibo.id = sucesso(criado).trim();
    assert.match(recibo.id, /^[a-f0-9]{64}$/);
    registrar("recibo", recibo);
    await inspecionar();
    assert.equal(c.State.Status, "created");
    assert.equal(c.State.Running, false);
    assert.equal(cancelado(), false, "cancelado antes de partir");
    await inspecionar();
    assert.equal(c.State.Status, "created");
    assert.equal(cancelado(), false, "cancelado na inspeção anterior à partida");
    recibo.estado = "partindo";
    registrar("recibo", recibo);
    attach = await invocar(["start", "-a", recibo.id]);
    registrar("attach", attach);
    const espera = await invocar(["wait", recibo.id]);
    registrar("wait", espera);
    const codigo = sucesso(espera).trim();
    assert.match(codigo, /^(0|[1-9]\d{0,2})$/);
    await inspecionar();
    assert.equal(c.State.Running, false);
    assert.equal(c.State.Status, "exited");
    assert.equal(c.State.ExitCode, Number(codigo));
    assert.equal(c.State.OOMKilled, false);
    assert.equal(c.State.Error, "");
    assert.ok(c.State.FinishedAt && !c.State.FinishedAt.startsWith("0001-"));
    terminal = true;
    assert.equal(attach.error, undefined, "acompanhamento incerto");
    assert.equal(attach.signal, null, "acompanhamento interrompido");
    assert.equal(attach.status, Number(codigo), "cliente e tarefa divergem");
    assert.equal(cancelado(), false, "cancelado durante execução");
    recibo.estado = Number(codigo) === 0 ? "aprovado" : "falhou";
    recibo.exitCode = Number(codigo);
  } catch (erro) {
    causa = erro;
    recibo.estado = "preservado";
    registrar("falha", { nome: erro.name, mensagem: erro.message });
  }
  // Somente uma execução observada até o término permite coleta e remoção.
  if (terminal && !causa) {
    try {
      await inspecionar();
      assert.equal(c.State.Running, false);
      assert.equal(c.State.Status, "exited");
      assert.equal(c.State.ExitCode, recibo.exitCode);
      const exportado = lerExportacao(attach.stdout, receita, recibo.exitCode);
      registrar("exportado", exportado);
      recibo.exportacaoSha256 = exportado.sha256;
      registrar("coletado", { id: recibo.id, manifesto: exportado.manifesto });
      await inspecionar();
      assert.equal(c.State.Running, false);
      assert.equal(c.State.Status, "exited");
      sucesso(await invocar(["rm", recibo.id]));
      recibo.removido = true;
      const ausencia = await invocar(["inspect", recibo.id]);
      registrar("ausencia", ausencia);
      assert.equal(ausencia.error, undefined);
      assert.equal(ausencia.signal, null);
      assert.equal(ausencia.status, 1);
      assert.deepEqual(JSON.parse(ausencia.stdout), [], "ausência sem JSON vazio");
      const diagnostico = /^error: no such (?:object|container): ([a-f0-9]{64})\s*$/i.exec(
        ausencia.stderr,
      );
      assert.ok(diagnostico, "diagnóstico de ausência não exclusivo");
      assert.equal(diagnostico[1], recibo.id, "ausência pertence a outro ID");
      recibo.ausente = true;
    } catch (erro) {
      causa = erro;
      recibo.estado = "preservado";
      registrar("falha", { nome: erro.name, mensagem: erro.message });
    }
  }
  registrar("recibo", recibo);
  if (causa)
    throw Object.assign(new Error("Lifecycle preview incerto; recurso e recibos preservados"), {
      cause: causa,
      recibo,
    });
  return recibo;
}

function clienteDocker(destino) {
  let sequencia = 0;
  return (args) =>
    new Promise((resolve) => {
      const indice = ++sequencia;
      const std = { stdout: "", stderr: "" };
      const filho = spawn("docker", args, {
        env: {
          PATH: process.env.PATH,
          HOME: destino,
          DOCKER_CONFIG: path.join(destino, "docker-config"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let erro;
      const prazo = setTimeout(() => {
        erro = Object.assign(new Error("prazo do cliente"), { code: "ETIMEDOUT" });
        filho.kill("SIGTERM");
      }, 180000);
      filho.on("error", (e) => {
        erro = e;
      });
      for (const canal of ["stdout", "stderr"])
        filho[canal].on("data", (b) => {
          if (std[canal].length + b.length <= 8 * 1048576) std[canal] += b;
          else {
            erro = Object.assign(new Error("limite de saída"), { code: "EOUTPUTLIMIT" });
            filho.kill("SIGTERM");
          }
        });
      filho.on("close", (status, signal) => {
        clearTimeout(prazo);
        const r = {
          ...std,
          status,
          signal,
          ...(erro ? { error: { code: erro.code, message: erro.message } } : {}),
        };
        salvar(path.join(destino, `docker-${indice}.json`), { args, ...r });
        resolve(r);
      });
    });
}

export async function principal(args = process.argv.slice(2)) {
  assert.equal(
    args[0],
    "--executar",
    "uso: privilegios-preview-harness.mjs --executar [--fase=vertical|restante|completo] [--evidencias=/pasta-nova]",
  );
  assert.ok(args.length <= 3);
  const opcoes = {};
  for (const a of args.slice(1)) {
    const m = /^(--fase|--evidencias)=(.+)$/.exec(a);
    assert.ok(m && !Object.hasOwn(opcoes, m[1]), "opção inválida ou duplicada");
    opcoes[m[1]] = m[2];
  }
  for (const k of Object.keys(process.env))
    assert.ok(
      !/^DOCKER_(HOST|CONTEXT|TLS|CERT_PATH|CONFIG)/.test(k),
      "override Docker não autorizado",
    );
  const fase = opcoes["--fase"] ?? "completo";
  assert.ok(["vertical", "restante", "completo"].includes(fase));
  if (opcoes["--evidencias"])
    assert.ok(path.isAbsolute(opcoes["--evidencias"]), "destino precisa ser absoluto");
  const info = inspecionarImagem(imagemPreview, "origem");
  assert.equal(info.Id, imagemPreview);
  assert.equal(info.Config.User, "999:999");
  assert.deepEqual(info.Config.Entrypoint ?? [], []);
  const rodada = randomUUID();
  const destino = opcoes["--evidencias"] ?? path.join(os.tmpdir(), `preview-${rodada}`);
  assert.ok(path.isAbsolute(destino));
  fs.mkdirSync(destino, { mode: 0o700 });
  process.stdout.write(
    JSON.stringify({ evidencias: destino, rodada, fase, estado: "preparando" }) + "\n",
  );
  const captura = path.join(destino, "captura");
  fs.mkdirSync(captura, { mode: 0o755 });
  fs.chmodSync(captura, 0o755);
  const fontes = {};
  for (const nome of fontesPreview) {
    const origem = path.join(raiz, nome),
      alvo = path.join(captura, nome);
    assert.ok(fs.lstatSync(origem).isFile(), "fonte precisa ser arquivo regular");
    const bytes = fs.readFileSync(origem);
    fontes[nome] = hash(bytes);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    for (let d = path.dirname(alvo); d !== captura; d = path.dirname(d)) fs.chmodSync(d, 0o755);
    fs.writeFileSync(alvo, bytes);
    fs.chmodSync(alvo, fs.statSync(origem).mode & 0o111 ? 0o555 : 0o444);
  }
  const receita = receitaPreview({
    imagem: info.Id,
    captura,
    rodada,
    fase,
    defaults: info.Config.Env,
    labels: info.Config.Labels,
  });
  receita.destinoColeta = path.join(destino, "driver");
  receita.fontes = fontes;
  const manifesto = { rodada, fase, fontes, ambiente: receita.ambiente };
  salvar(path.join(captura, "preview-fontes.json"), manifesto);
  fs.chmodSync(path.join(captura, "preview-fontes.json"), 0o444);
  salvar(path.join(destino, "imagem.json"), info);
  salvar(path.join(destino, "receita.json"), receita);
  let interrompido = false;
  const cancelar = () => {
    interrompido = true;
  };
  process.on("SIGTERM", cancelar);
  process.on("SIGINT", cancelar);
  let indice = 0;
  try {
    const recibo = await executarCiclo({
      receita,
      cliente: clienteDocker(destino),
      cancelado: () => interrompido,
      registrar: (tipo, dado) => {
        salvar(path.join(destino, `${++indice}-${tipo}.json`), dado);
        if (tipo === "recibo") salvar(path.join(destino, "lifecycle.json"), dado);
        if (tipo === "exportado") {
          fs.mkdirSync(receita.destinoColeta, { mode: 0o700 });
          for (const [nome, base64] of Object.entries(dado.conteudos))
            fs.writeFileSync(
              path.join(receita.destinoColeta, nome),
              Buffer.from(base64, "base64"),
              { mode: 0o600, flag: "wx" },
            );
          salvar(path.join(receita.destinoColeta, "manifesto-transporte.json"), {
            sha256: dado.sha256,
            arquivos: dado.manifesto,
          });
        }
      },
    });
    for (const [nome, sha] of Object.entries(fontes))
      assert.equal(
        hash(fs.readFileSync(path.join(raiz, nome))),
        sha,
        "fonte mudou durante a prova",
      );
    assert.equal(interrompido, false);
    salvar(path.join(destino, "resultado.json"), { ...recibo, fontes });
    process.stdout.write(JSON.stringify({ evidencias: destino, ...recibo }) + "\n");
    return recibo.exitCode;
  } finally {
    process.removeListener("SIGTERM", cancelar);
    process.removeListener("SIGINT", cancelar);
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
