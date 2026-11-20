// Ensina proxy externo separado: rede publica, vhosts sintéticos, CA própria e backend autenticado.
// Executar: setpriv --no-new-privs node tests/servidor/proxy-externo.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = join(repo, "tests/servidor/proxy-externo");
assert.ok(process.getuid() !== 0 && process.getuid() === process.geteuid(), "Executar sem root.");
assert.match(readFileSync("/proc/self/status", "utf8"), /NoNewPrivs:\s+1\b/, "Exige NoNewPrivs=1.");
process.umask(0o077);

const pasta = mkdtempSync(join(tmpdir(), "frequenciapp-proxy-externo-"));
const rodada = randomUUID();
const sufixo = rodada.slice(0, 8);
const label = "br.org.frequenciapp.teste-proxy-externo";
const redeInterna = `frequenciapp-externo-interna-${sufixo}`;
const redePublica = `frequenciapp-externo-publica-${sufixo}`;
const imagemCaddy =
  "caddy:2.11-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9";
const imagemNode =
  "node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1";
const imagemBlackbox =
  "prom/blackbox-exporter:v0.29.1@sha256:ea1c7aa3ef3f307cd03e85f34abb604478ccb90b567fc690da0cd9776da76b13";
const token = "token-sintetico-de-ensaio-com-32-caracteres";
const ambiente = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: pasta,
  DOCKER_CONFIG: join(pasta, "docker-config"),
  TMPDIR: pasta,
  LANG: "C.UTF-8",
};
const recursos = [];
const redes = [];

function executar(binario, parametros, prazo = 30000) {
  const resultado = spawnSync(binario, parametros, {
    cwd: pasta,
    env: ambiente,
    encoding: "utf8",
    timeout: prazo,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (resultado.error || resultado.signal || resultado.status !== 0) {
    const erro = new Error(
      `${binario} ${parametros[0]} falhou: ${resultado.error?.message ?? resultado.stderr ?? resultado.signal}`,
    );
    erro.exitCode = resultado.status || 1;
    throw erro;
  }
  return resultado.stdout.trim();
}
const docker = (...parametros) =>
  executar("docker", ["--host", "unix:///var/run/docker.sock", ...parametros]);
const logs = (id) => {
  const resultado = spawnSync("docker", ["--host", "unix:///var/run/docker.sock", "logs", id], {
    cwd: pasta,
    env: ambiente,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`;
};
const salvar = (nome, conteudo) => writeFileSync(join(pasta, nome), conteudo, { mode: 0o600 });

function conferirRecurso(id) {
  const atual = JSON.parse(docker("inspect", id))[0];
  assert.equal(atual.Config.Labels[label], rodada);
  assert.equal(atual.Config.User, `${process.getuid()}:${process.getgid()}`);
  assert.equal(atual.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(atual.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(atual.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(atual.HostConfig.Privileged, false);
  assert.equal(atual.HostConfig.PublishAllPorts, false);
  assert.equal(Object.keys(atual.HostConfig.PortBindings ?? {}).length, 0);
  return atual;
}

function criar(papel, imagem, comando, redesDoRecurso, env = []) {
  const nome = `frequenciapp-externo-${sufixo}-${papel}`;
  const apelido = papel === "blackbox" ? "blackbox-exporter" : papel;
  const tmpfs = imagem === imagemCaddy ? ["/tmp", "/data", "/config"] : ["/tmp"];
  const receita = [
    "create",
    "--pull",
    "never",
    "--name",
    nome,
    "--label",
    `${label}=${rodada}`,
    "--network",
    redesDoRecurso[0],
    "--network-alias",
    apelido,
    "--read-only",
    "--user",
    `${process.getuid()}:${process.getgid()}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--pids-limit",
    "128",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=1m",
    "--log-opt",
    "max-file=1",
    "--mount",
    `type=bind,src=${pasta},dst=/fixture,readonly`,
    ...tmpfs.flatMap((destino) => [
      "--tmpfs",
      `${destino}:rw,noexec,nosuid,nodev,size=16777216,mode=700,uid=${process.getuid()},gid=${process.getgid()}`,
    ]),
    ...env.flatMap((valor) => ["--env", valor]),
    "--entrypoint",
    imagem === imagemCaddy ? "caddy" : imagem === imagemNode ? "node" : "/bin/blackbox_exporter",
    imagem,
    ...comando,
  ];
  const id = docker(...receita);
  assert.match(id, /^[a-f0-9]{64}$/);
  for (const rede of redesDoRecurso.slice(1))
    docker("network", "connect", "--alias", apelido, rede, id);
  recursos.push({ id, nome, redes: redesDoRecurso });
  conferirRecurso(id);
  docker("start", id);
  const atual = conferirRecurso(id);
  assert.equal(atual.State.Running, true, `Contêiner ${nome} não iniciou:\n${logs(id)}`);
  return id;
}

function diagnosticar() {
  for (const recurso of recursos) {
    try {
      process.stderr.write(`--- ${recurso.nome} ---\n${logs(recurso.id)}\n`);
    } catch {
      // O contêiner pode já ter sido removido; a limpeza continua.
    }
  }
}

function limpar() {
  for (const recurso of [...recursos].reverse()) {
    try {
      const atual = conferirRecurso(recurso.id);
      if (atual.State.Running) {
        docker("stop", "--time", "3", recurso.id);
        docker("wait", recurso.id);
      }
      docker("rm", recurso.id);
    } catch (erro) {
      console.error(`Limpeza pendente do contêiner ${recurso.nome}.`, erro.message);
      process.exitCode ||= 1;
    }
  }
  for (const rede of [...redes].reverse()) {
    try {
      docker("network", "rm", rede);
    } catch (erro) {
      console.error(`Limpeza pendente da rede ${rede}.`, erro.message);
      process.exitCode ||= 1;
    }
  }
}

for (const [sinal, codigo] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(sinal, () => {
    process.exitCode = codigo;
    try {
      limpar();
    } catch (erro) {
      console.error(erro);
    }
    process.exit(codigo);
  });
}

try {
  process.stdout.write(`Evidências sintéticas preservadas em ${pasta}\n`);
  for (const imagem of [imagemCaddy, imagemNode, imagemBlackbox]) {
    const info = JSON.parse(docker("image", "inspect", imagem))[0];
    salvar(`imagem-${info.Id.slice(7, 19)}.json`, JSON.stringify(info, null, 2));
  }
  docker("network", "create", "--internal", "--label", `${label}=${rodada}`, redeInterna);
  redes.push(redeInterna);
  docker("network", "create", "--label", `${label}=${rodada}`, redePublica);
  redes.push(redePublica);

  for (const nome of ["Caddyfile", "blackbox.yml", "app-sintetica.mjs", "cliente-sintetico.mjs"]) {
    copyFileSync(join(fixture, nome), join(pasta, nome));
  }
  salvar(
    "extensoes.cnf",
    "subjectAltName=DNS:frequencia.exemplo.invalid,DNS:painel.exemplo.invalid\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n",
  );
  executar("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=CA sintetica do proxy externo",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
  ]);
  executar("openssl", [
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-subj",
    "/CN=frequencia exemplo",
    "-keyout",
    "servidor.key",
    "-out",
    "servidor.csr",
  ]);
  executar("openssl", [
    "x509",
    "-req",
    "-in",
    "servidor.csr",
    "-CA",
    "ca.pem",
    "-CAkey",
    "ca.key",
    "-set_serial",
    "2",
    "-days",
    "1",
    "-extfile",
    "extensoes.cnf",
    "-out",
    "servidor.pem",
  ]);

  criar(
    "app",
    imagemNode,
    ["/fixture/app-sintetica.mjs"],
    [redeInterna, redePublica],
    [`METRICAS_TOKEN=${token}`],
  );
  criar(
    "proxy",
    imagemCaddy,
    ["run", "--config", "/fixture/Caddyfile", "--adapter", "caddyfile"],
    [redePublica],
  );
  criar(
    "blackbox",
    imagemBlackbox,
    ["--config.file=/fixture/blackbox.yml"],
    [redeInterna, redePublica],
  );
  const cliente = criar(
    "cliente",
    imagemNode,
    ["/fixture/cliente-sintetico.mjs"],
    [redeInterna, redePublica],
    [`METRICAS_TOKEN=${token}`],
  );
  const codigo = Number(docker("wait", cliente));
  assert.equal(codigo, 0, `Cliente do ensaio falhou:\n${logs(cliente)}`);
  process.stdout.write(`${logs(cliente)}\n`);
  process.stdout.write(
    "Ensaio aprovado: proxy separado, vhosts sintéticos, CA da fixture e backend autenticado.\n",
  );
} catch (erro) {
  console.error(erro);
  diagnosticar();
  process.exitCode = erro.exitCode ?? 1;
} finally {
  limpar();
}
