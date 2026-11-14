// Confere Compose/Caddy reais e HTTPS sem SNI, sem emissão ACME nem serviços da instalação.
// Executar: setpriv --no-new-privs node tests/servidor/caddy-integracao.mjs [--caddyfile-ipv4 caminho].
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--caddyfile-ipv4"));
assert.ok(process.getuid() !== 0 && process.getuid() === process.geteuid(), "Executar sem root.");
assert.match(readFileSync("/proc/self/status", "utf8"), /NoNewPrivs:\s+1\b/, "Exige NoNewPrivs=1.");
process.umask(0o077);
const pasta = mkdtempSync(join(tmpdir(), "frequenciapp-caddy-"));
const rodada = randomUUID();
const label = "br.org.frequenciapp.teste-caddy";
const imagemCaddy =
  "caddy:2.11-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9";
const imagemNode =
  "node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68";
const ip = "203.0.113.10";
const email = "admin@example.invalid";
const ca = "https://acme.example.invalid/directory";
const ambiente = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  HOME: pasta,
  DOCKER_CONFIG: join(pasta, "docker-config"),
  TMPDIR: pasta,
  LANG: "C.UTF-8",
};
const recursos = [];

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
const inspecionar = (id) => JSON.parse(docker("inspect", id))[0];
const salvar = (nome, conteudo) => writeFileSync(join(pasta, nome), conteudo, { mode: 0o600 });

function conferirRecurso(recurso) {
  const atual = inspecionar(recurso.id);
  assert.equal(atual.Id, recurso.id);
  assert.equal(atual.Name, `/${recurso.nome}`);
  assert.equal(atual.Config.Labels[label], rodada);
  assert.equal(atual.Config.Image, recurso.imagem);
  assert.equal(atual.Image, recurso.imagemId);
  assert.equal(atual.Config.User, `${process.getuid()}:${process.getgid()}`);
  assert.equal(atual.HostConfig.ReadonlyRootfs, true);
  assert.equal(atual.HostConfig.NetworkMode, recurso.rede);
  assert.deepEqual(atual.HostConfig.CapDrop, ["ALL"]);
  assert.ok(!atual.HostConfig.CapAdd?.length);
  assert.deepEqual(atual.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(atual.HostConfig.Privileged, false);
  assert.equal(atual.HostConfig.PublishAllPorts, false);
  assert.equal(Object.keys(atual.HostConfig.PortBindings ?? {}).length, 0);
  assert.ok(!atual.HostConfig.PidMode && !atual.HostConfig.IpcMode.includes("host"));
  assert.deepEqual(
    atual.Mounts.map(({ Type, Source, Destination, RW }) => ({ Type, Source, Destination, RW })),
    [{ Type: "bind", Source: pasta, Destination: "/fixture", RW: false }],
  );
  const envImagem = JSON.parse(docker("image", "inspect", recurso.imagem))[0].Config.Env ?? [];
  assert.deepEqual([...atual.Config.Env].sort(), [...envImagem, ...recurso.env].sort());
  return atual;
}

function criar(tipo, imagem, comando, env = [], rede = "none") {
  if (rede !== "none") {
    const servidor = recursos.find((item) => `container:${item.id}` === rede);
    assert.ok(
      servidor && conferirRecurso(servidor).State.Running,
      "Rede deve pertencer ao Caddy deste ensaio.",
    );
    assert.equal(servidor.rede, "none");
  }
  const nome = `frequenciapp-caddy-${rodada}-${recursos.length}-${tipo}`;
  const imagemId = JSON.parse(docker("image", "inspect", imagem))[0].Id;
  const receita = [
    "create",
    "--pull",
    "never",
    "--name",
    nome,
    "--label",
    `${label}=${rodada}`,
    "--network",
    rede,
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
    ...["/tmp", "/data", "/config"].flatMap((destino) => [
      "--tmpfs",
      `${destino}:rw,noexec,nosuid,nodev,size=16777216,mode=700,uid=${process.getuid()},gid=${process.getgid()}`,
    ]),
    ...(rede === "none" ? ["--add-host", "app:127.0.0.1"] : []),
    ...env.flatMap((valor) => ["--env", valor]),
    "--entrypoint",
    imagem === imagemCaddy ? "caddy" : "node",
    imagem,
    ...comando,
  ];
  salvar(`${nome}.receita.json`, JSON.stringify(receita, null, 2));
  const id = docker(...receita);
  assert.match(id, /^[a-f0-9]{64}$/);
  const recurso = { id, nome, imagem, imagemId, env, rede };
  recursos.push(recurso);
  salvar(`${nome}.criado.json`, JSON.stringify(conferirRecurso(recurso), null, 2));
  return recurso;
}

function terminar(recurso) {
  const codigo = Number(docker("wait", recurso.id));
  const atual = conferirRecurso(recurso);
  assert.equal(atual.State.Running, false);
  assert.equal(atual.State.ExitCode, codigo);
  salvar(`${recurso.nome}.terminado.json`, JSON.stringify(atual, null, 2));
  assert.equal(codigo, 0, `Contêiner ${recurso.nome}: código ${codigo}.`);
}

function rodar(recurso) {
  try {
    const saida = docker("start", "--attach", recurso.id);
    terminar(recurso);
    return saida;
  } catch (erro) {
    const codigo = Number(docker("wait", recurso.id));
    const atual = conferirRecurso(recurso);
    assert.equal(atual.State.Running, false);
    assert.equal(atual.State.ExitCode, codigo);
    salvar(`${recurso.nome}.terminado.json`, JSON.stringify(atual, null, 2));
    salvar(`${recurso.nome}.log`, docker("logs", recurso.id));
    throw erro;
  }
}

function limpar() {
  for (const recurso of [...recursos].reverse()) {
    let atual = conferirRecurso(recurso);
    if (atual.State.Running) {
      docker("stop", "--time", "3", recurso.id);
      docker("wait", recurso.id);
      atual = conferirRecurso(recurso);
    }
    assert.equal(atual.State.Running, false);
    salvar(`${recurso.nome}.limpeza.json`, JSON.stringify(atual, null, 2));
    docker("rm", recurso.id);
    const inventario = docker("ps", "-aq", "--no-trunc").split("\n").filter(Boolean);
    assert.ok(inventario.every((id) => /^[a-f0-9]{64}$/.test(id)));
    assert.ok(!inventario.includes(recurso.id));
    process.stdout.write(`Removido e ausência conferida: ${recurso.id}\n`);
    recursos.splice(recursos.indexOf(recurso), 1);
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

function adaptar(arquivo, dominio) {
  const variaveis = {
    AUTH_SECRET: "segredo-sintetico-sem-uso-na-aplicacao",
    APP_ENV_FILE: join(pasta, "vazio.env"),
    OPS_ENV_FILE: join(pasta, "vazio.env"),
    SERVIDOR_CONFIG_DIR: pasta,
    BACKUP_HOST_DIR: pasta,
    DOMINIO: dominio,
    ACME_EMAIL: email,
    ACME_CA: ca,
    CADDYFILE: `infra/servidor/${arquivo}`,
  };
  salvar(
    "compose.env",
    Object.entries(variaveis)
      .map(([nome, valor]) => `${nome}=${valor}`)
      .join("\n"),
  );
  const efetivo = JSON.parse(
    docker(
      "compose",
      "--project-directory",
      pasta,
      "--env-file",
      join(pasta, "compose.env"),
      "--project-name",
      `caddy-${rodada}`,
      ...["compose.yml", "compose.servidor.yml", "compose.servidor-caddy.yml"].flatMap((nome) => [
        "-f",
        join(pasta, nome),
      ]),
      "config",
      "--format",
      "json",
    ),
  );
  salvar(`${arquivo}-${dominio}.compose.json`, JSON.stringify(efetivo, null, 2));
  const servico = efetivo.services.caddy;
  assert.equal(servico.image, imagemCaddy);
  assert.deepEqual(servico.environment, { DOMINIO: dominio, ACME_EMAIL: email, ACME_CA: ca });
  const montagem = servico.volumes.find((volume) => volume.target === "/etc/caddy/Caddyfile");
  assert.equal(montagem.type, "bind");
  assert.equal(montagem.read_only, true);
  assert.equal(montagem.source, join(pasta, "infra/servidor", arquivo));
  const adaptado = JSON.parse(
    rodar(
      criar(
        "adaptar",
        servico.image,
        ["adapt", "--config", `/fixture/infra/servidor/${arquivo}`, "--adapter", "caddyfile"],
        Object.entries(servico.environment).map(([nome, valor]) => `${nome}=${valor}`),
      ),
    ),
  );
  salvar(`${arquivo}-${dominio}.adaptado.json`, JSON.stringify(adaptado, null, 2));
  return adaptado;
}

function conferirAcme(politica, perfil) {
  assert.ok(politica, "Política TLS ausente.");
  assert.equal(
    politica.issuers?.length,
    1,
    "IPv4 exige emissor ACME explícito, sem fallback interno.",
  );
  assert.equal(politica.issuers[0].module, "acme");
  assert.equal(politica.issuers[0].ca, ca);
  assert.equal(politica.issuers[0].email, email);
  assert.equal(politica.issuers[0].profile, perfil);
}

try {
  process.stdout.write(`Evidências sintéticas preservadas em ${pasta}\n`);
  for (const imagem of [imagemCaddy, imagemNode]) {
    const info = JSON.parse(docker("image", "inspect", imagem))[0];
    salvar(
      imagem === imagemCaddy ? "imagem-caddy.json" : "imagem-node.json",
      JSON.stringify(info, null, 2),
    );
  }
  const versao = rodar(criar("versao", imagemCaddy, ["version"]));
  assert.match(versao, /^v2\.11\.9\b/);
  salvar("versao-caddy.txt", versao);
  process.stdout.write(`Caddy real: ${versao}\n`);
  salvar("vazio.env", "");
  mkdirSync(join(pasta, "infra/servidor"), { recursive: true });
  for (const nome of [
    "compose.yml",
    "compose.servidor.yml",
    "compose.servidor-caddy.yml",
    "infra/servidor/Caddyfile",
    "infra/servidor/Caddyfile.interno",
  ]) {
    copyFileSync(join(repo, nome), join(pasta, nome));
  }
  const fonteIpv4 = args[1] ? resolve(args[1]) : join(repo, "infra/servidor/Caddyfile.ipv4");
  copyFileSync(fonteIpv4, join(pasta, "infra/servidor/Caddyfile.ipv4"));
  process.stdout.write(`Caddyfile IPv4 sob teste: ${fonteIpv4}\n`);
  const dns = adaptar("Caddyfile", "frequencia.example.invalid");
  conferirAcme(
    dns.apps.tls.automation.policies.find(
      (p) => !p.subjects || p.subjects.includes("frequencia.example.invalid"),
    ),
    undefined,
  );
  for (const dominio of ["frequencia.example.invalid", ip]) {
    const interno = adaptar("Caddyfile.interno", dominio);
    assert.equal(
      interno.apps.tls.automation.policies.find((p) => !p.subjects || p.subjects.includes(dominio))
        .issuers[0].module,
      "internal",
    );
  }
  process.stdout.write("Compose e adaptação: FQDN ACME e TLS interno (FQDN/IPv4) preservados.\n");
  const ipv4 = adaptar("Caddyfile.ipv4", ip);
  const politica = ipv4.apps.tls.automation.policies.find((p) => p.subjects?.includes(ip));
  process.stdout.write(`Política IPv4 observada: ${JSON.stringify(politica)}\n`);
  conferirAcme(politica, "shortlived");
  const servidores = Object.values(ipv4.apps.http.servers);
  const servidor = servidores.find((s) => s.listen?.includes(":443"));
  assert.ok(servidor, "Servidor HTTPS ausente.");
  assert.ok(
    servidor.tls_connection_policies.some((p) => p.default_sni === ip),
    "IPv4 exige default_sni.",
  );
  process.stdout.write(
    "IPv4: emissor ACME explícito, perfil shortlived e default_sni conferidos.\n",
  );

  // Fixture: porta alta, certificado local e saúde ativa desligada para evitar a corrida do backend.
  // As políticas TLS/default_sni e o roteamento do proxy continuam vindo da adaptação real.
  function desativarSaudeAtiva(valor) {
    if (!valor || typeof valor !== "object") return;
    if (valor.handler === "reverse_proxy") delete valor.health_checks;
    for (const filho of Object.values(valor)) desativarSaudeAtiva(filho);
  }
  desativarSaudeAtiva(servidor);
  ipv4.apps.http.servers = { ensaio: servidor };
  servidor.listen = [":8443"];
  servidor.automatic_https = { disable: true };
  ipv4.apps.tls = {
    certificates: {
      load_files: [{ certificate: "/fixture/servidor.pem", key: "/fixture/servidor.key" }],
    },
  };
  salvar(
    "extensoes.cnf",
    `subjectAltName=IP:${ip}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
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
    "/CN=CA sintetica do ensaio",
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
    "/CN=servidor sintetico",
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
  copyFileSync(join(repo, "tests/servidor/caddy-cliente.mjs"), join(pasta, "cliente.mjs"));
  for (const negativo of [false, true]) {
    const config = structuredClone(ipv4);
    if (negativo)
      for (const p of config.apps.http.servers.ensaio.tls_connection_policies) delete p.default_sni;
    const nome = negativo ? "sem-default-sni" : "com-default-sni";
    salvar(`${nome}.json`, JSON.stringify(config, null, 2));
    const caddy = criar(nome, imagemCaddy, ["run", "--config", `/fixture/${nome}.json`]);
    docker("start", caddy.id);
    assert.equal(conferirRecurso(caddy).State.Running, true);
    process.stdout.write(
      `${rodar(
        criar("cliente", imagemNode, ["/fixture/cliente.mjs", nome], [], `container:${caddy.id}`),
      )}\n`,
    );
    docker("stop", "--time", "3", caddy.id);
    terminar(caddy);
  }
  process.stdout.write(
    "Ensaio aprovado. CA de fixture não comprova emissão, renovação ou confiança pública.\n",
  );
} catch (erro) {
  console.error(erro);
  process.exitCode = erro.exitCode ?? 1;
} finally {
  try {
    limpar();
  } catch (erro) {
    console.error("Limpeza não comprovada; preservar IDs das evidências.", erro);
    process.exitCode ||= 1;
  }
}
