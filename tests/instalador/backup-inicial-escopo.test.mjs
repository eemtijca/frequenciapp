// Exercita aplicar com Git, Bash e recibos reais; serviços, banco e cifra usam transportes fechados.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { principal } from "../../scripts/instalador/cli.mjs";

const REPO = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ler = (arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8"));
const gravar = (arquivo, texto) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, texto, { mode: 0o600 });
};
const json = (arquivo, dados) => gravar(arquivo, JSON.stringify(dados) + "\n");
const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });

function fotografar(diretorios) {
  const mapa = new Map();
  const visitar = (caminho) => {
    let info;
    try {
      info = fs.lstatSync(caminho);
    } catch {
      return;
    }
    if (info.isSymbolicLink()) {
      mapa.set(caminho, `link:${fs.readlinkSync(caminho)}`);
      return;
    }
    if (!info.isDirectory()) {
      const hash = createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
      mapa.set(caminho, `arquivo:${info.mode & 0o777}:${hash}:${info.mtimeMs}`);
      return;
    }
    mapa.set(caminho, `diretorio:${info.mode & 0o777}:${info.mtimeMs}`);
    for (const nome of fs.readdirSync(caminho).sort()) visitar(path.join(caminho, nome));
  };
  for (const diretorio of diretorios) visitar(diretorio);
  return mapa;
}

// Os binários falsos recusam operações desconhecidas e nunca alcançam daemon ou rede.
const CLIENTE = `#!/usr/bin/node
import fs from 'node:fs'; import path from 'node:path';
const nome=path.basename(process.argv[1]), a=process.argv.slice(2);
const base=path.dirname(process.argv[1]), arquivo=path.join(base,'fixture.json');
const d=JSON.parse(fs.readFileSync(arquivo,'utf8'));
const negar=()=>{process.stderr.write('Transporte falso recusou operação desconhecida: '+nome+'\\n');process.exit(91);};
const evento=(tipo)=>fs.appendFileSync(d.eventos,JSON.stringify({tipo,args:a})+'\\n');
if(nome==='docker') {
  if(a[0]==='info') process.stdout.write(JSON.stringify(d.daemon));
  else if(a[0]==='inspect') process.stdout.write(JSON.stringify(d.containers));
  else if(a[0]==='compose') {
    const x=a.indexOf('exec');
    if(a.includes('config')) {
      if(a.includes('--services')) process.stdout.write('app\\ndb\\ncaddy\\n');
      else if(a.includes('--format')) process.stdout.write(JSON.stringify(d.config));
      else if(!a.includes('--quiet')) negar();
    } else if(a.includes('ps')) process.stdout.write('db-falso\\napp-falso\\n');
    else if(x>=0 && a[x+3]==='psql' && a.at(-1)==='SELECT current_database();') {evento('banco');process.stdout.write(d.banco+'\\n');}
    else if(x>=0 && a[x+3]==='pg_dump') {evento('dump');process.stdout.write('DUMP FALSO, sem PostgreSQL\\n');}
    else if(x>=0 && a[x+3]==='pg_restore' && a.at(-1)==='-l') fs.readFileSync(0);
    else negar();
  } else negar();
} else if(nome==='psql' || nome==='pg_dump' || nome==='pg_restore') {
  if(nome!=='pg_restore') {
    const semArquivo=process.env.PGSERVICEFILE===undefined;
    const permitidas=semArquivo
      ? ['PATH','HOME','PGPASSWORD','PGHOST','PGPORT','PGDATABASE','PGUSER','PGSSLMODE','PGAPPNAME','PGCONNECT_TIMEOUT','PGOPTIONS','PGTARGETSESSIONATTRS']
      : ['PATH','HOME','PGSERVICEFILE','PGSERVICE','PGPASSWORD'];
    if(Object.keys(process.env).some(n=>!permitidas.includes(n)) || process.env.PGPASSWORD!==(d.senhaUrl??'senha-url-sintetica')) negar();
    if(semArquivo) {
      if(process.env.PGSERVICEFILE!==undefined || process.env.PGSERVICE!==undefined ||
        process.env.PGHOST!=='banco.invalid' || process.env.PGDATABASE!=='frequencia' || process.env.PGUSER!=='operador') negar();
    } else {
      if(process.env.PGSERVICE!=='backup') negar();
      const s=fs.statSync(process.env.PGSERVICEFILE), texto=fs.readFileSync(process.env.PGSERVICEFILE,'utf8');
      if((s.mode&0o777)!==0o600 || !texto.includes('host=banco.invalid\\n') || !texto.includes('dbname=frequencia\\n') || texto.includes('schema=') || texto.includes('password=')) negar();
      if(d.parametrosUrl && (Object.entries(d.parametrosUrl).some(([k,v])=>!texto.split('\\n').includes(k+'='+v)) || texto.includes('\\nssl='))) negar();
    }
    if(a.some(v=>v.includes('postgresql://') || v.includes('postgres://') || v.includes(d.senhaUrl??'senha-url-sintetica'))) negar();
    if(d.falharBancoUrl) {process.stderr.write('senha-url-sintetica: conexão recusada\\n');process.exit(45);}
  }
  if(nome==='pg_restore' && a.length===1 && a[0]==='-l') fs.readFileSync(0);
  else if(nome==='psql' && a.at(-1)==='SELECT current_database();') {
    evento('banco-url');process.stdout.write(d.bancoUrl??'frequencia');
  } else if(nome==='psql' && a.at(-1)==='SELECT system_identifier::text FROM pg_control_system();') {
    evento('cluster-url');
    if(d.falharClusterUrl) {process.stderr.write('senha-url-sintetica: permission denied for function pg_control_system\\n');process.exit(46);}
    process.stdout.write(d.clusterUrl??'7300000000000000011');
  } else if(nome==='pg_dump' && a.includes('-Fc')) {evento('dump-url');process.stdout.write('DUMP URL FALSO, sem PostgreSQL\\n');}
  else negar();
} else if(nome==='age') {
  if(a.length!==4||a[0]!=='--recipients-file'||a[2]!=='--output') negar();
  fs.writeFileSync(a[3],Buffer.concat([Buffer.from('CIFRA FALSA\\n'),fs.readFileSync(0)]));
} else if(nome==='jq') {
  if(a[0]!=='-er'||a[1]!=='--arg'||a[2]!=='campo') negar();
  const valor=JSON.parse(fs.readFileSync(a.at(-1),'utf8'))[a[3]]??'';
  if(typeof valor!=='string') negar(); process.stdout.write(valor+'\\n');
} else if(nome==='rclone') {
  const remoto=n=>{if(!n.startsWith('falso:copias/')) negar();const b=n.slice(13);if(!b||b.includes('/')||b==='..') negar();return path.join(d.remoto,b);};
  evento('remoto');
  if(d.falharRemoto && a[0]==='copyto' && a[1].startsWith('falso:')) {process.stderr.write('Remoto sintético indisponível hoje\\n');process.exit(44);}
  if(a[0]==='copy' && a[2]==='falso:copias' && a.includes('--immutable')) {
    for(const n of fs.readdirSync(a[1])) fs.copyFileSync(path.join(a[1],n),remoto(a[2]+'/'+n));
  } else if(a[0]==='copyto' && a.length===3) {
    if(a[1].startsWith('falso:')) fs.copyFileSync(remoto(a[1]),a[2]);
    else fs.copyFileSync(a[1],remoto(a[2]));
  } else if(a[0]==='cat' && a.length===2) {
    process.stdout.write(fs.readFileSync(remoto(a[1])));
  } else negar();
} else negar();
`;

function preparar(t, ajustes = {}) {
  assert.equal(process.getuid(), 1000);
  const usuarioServico = os.userInfo().username;
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "backup-inicial-escopo-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const appDir = path.join(raiz, "opt/frequenciapp");
  fs.cpSync(path.join(REPO, "tests/instalador/fixtures/aplicar/repo"), appDir, { recursive: true });
  fs.cpSync(path.join(REPO, "scripts/servidor"), path.join(appDir, "scripts/servidor"), {
    recursive: true,
  });
  fs.cpSync(
    path.join(REPO, "src/infra/schema-postgres.mjs"),
    path.join(appDir, "src/infra/schema-postgres.mjs"),
    { recursive: true },
  );
  const bin = path.join(raiz, "bin");
  fs.mkdirSync(bin);
  gravar(path.join(bin, "cliente.mjs"), CLIENTE);
  fs.chmodSync(path.join(bin, "cliente.mjs"), 0o700);
  for (const nome of ["docker", "age", "jq", "rclone", "psql", "pg_dump", "pg_restore"])
    fs.symlinkSync("cliente.mjs", path.join(bin, nome));
  const eventos = path.join(raiz, "eventos.jsonl");
  gravar(eventos, "");
  const remoto = path.join(raiz, "remoto");
  fs.mkdirSync(remoto);
  const config = {
    name: "frequenciapp-teste",
    services: { app: {}, db: { volumes: [{ type: "volume", source: "dados", target: "/db" }] } },
    volumes: { dados: { name: "volume-sintetico" } },
  };
  const containers = ["app", "db"].map((servico) => ({
    Id: `${servico}-falso`,
    Config: {
      Labels: { "com.docker.compose.project": config.name, "com.docker.compose.service": servico },
    },
    Mounts:
      servico === "db"
        ? [
            {
              Type: "volume",
              Name: "volume-sintetico",
              Source: "/FALSO/volume",
              Destination: "/db",
            },
          ]
        : [],
  }));
  json(path.join(bin, "fixture.json"), {
    config,
    containers,
    daemon: { ID: "daemon-sintetico" },
    banco: "frequencia",
    eventos,
    remoto,
  });
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: raiz, TMPDIR: raiz };
  const real = (comando, args, opcoes = {}) => {
    const resultado = spawnSync(comando, args, {
      ...opcoes,
      encoding: "utf8",
      env: opcoes.env ?? env,
    });
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    return resultado;
  };
  for (const args of [
    ["init", "--initial-branch=main", appDir],
    ["-C", appDir, "config", "user.name", "Fixture Local"],
    ["-C", appDir, "config", "user.email", "fixture@example.invalid"],
    ["-C", appDir, "add", "."],
    [
      "-C",
      appDir,
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "test: prepara fonte sintética",
    ],
    ["-C", appDir, "tag", "v1.0.0"],
  ])
    assert.equal(real("git", args).status, 0);
  const commit = real("git", ["-C", appDir, "rev-parse", "HEAD"]).stdout.trim();
  let commitAlvo = commit;
  if (ajustes.segundaRevisao) {
    fs.appendFileSync(path.join(appDir, "LEIA.md"), "\nSegunda revisão sintética.\n");
    for (const args of [
      ["-C", appDir, "add", "."],
      ["-C", appDir, "-c", "commit.gpgsign=false", "commit", "-m", "test: prepara alvo seguinte"],
      ["-C", appDir, "tag", "v1.1.0"],
    ])
      assert.equal(real("git", args).status, 0);
    commitAlvo = real("git", ["-C", appDir, "rev-parse", "HEAD"]).stdout.trim();
  }
  const destinatarios = path.join(raiz, "destinatarios.age");
  gravar(destinatarios, "DESTINATARIO FALSO, sem chave privada\n");
  const senha = path.join(raiz, "senha-admin");
  gravar(senha, "SenhaSintetica123\n");
  const chamadas = [];
  const resultadosBackup = [];
  let saudavel = false;
  const deps = {
    raiz,
    uid: () => 1000,
    usuarioServico,
    raizRepositorio: appDir,
    agora: () => "2026-11-11T12:00:00Z",
    esperar() {},
    lerDisco: () => ({ livreBytes: 50 * 1024 ** 3, livreGiB: 50, totalGiB: 100 }),
    memoriaTotal: () => 8 * 1024 ** 3,
    detectar: () => deteccao(),
    detectarBasico: () => deteccao(),
    auditarPacotes: () => ({
      gerenciador: "apt",
      familia: "debian",
      pacotes: [],
      resumo: { total: 0, presentes: 0, faltantes: 0, desatualizados: 0 },
      avisos: [],
    }),
    comandoExiste: (nome) => ["systemctl", "timedatectl"].includes(nome),
    consultarDigest: () => `sha256:${"c".repeat(64)}`,
    adquirirTrava: () => ({ liberar() {} }),
    executar(comando, args = [], opcoes = {}) {
      chamadas.push({ comando, args, env: opcoes.env });
      if (comando === "git" || comando === "node") return real(comando, args, opcoes);
      if (comando === "id") return ok(args[0] === "-nG" ? `${usuarioServico} docker` : "1000");
      if (comando === "timedatectl") return ok("Timezone=America/Fortaleza");
      if (comando === "systemctl") return ok("active");
      if (comando === "docker") {
        if (args[0] === "--version") return ok("Docker version 29.8.2");
        if (args[0] === "info") return ok("29.8.2");
        if (args[0] === "compose" && args[1] === "version") return ok("2.39.1");
        if (args[0] === "exec" && args[2] === "pg_isready") return ok("accepting");
        if (args[0] === "exec" && args[2] === "postgres") return ok("postgres (PostgreSQL) 17.4");
        if (args[0] === "exec" && args[2] === "psql") return ok("1\n");
      }
      if (comando === "bash") {
        const script = String(args[0]);
        if (script.endsWith("identidade.sh") || script.endsWith("backup-banco.sh")) {
          const resultado = real(comando, args, {
            ...opcoes,
            env: { ...opcoes.env, PATH: env.PATH },
          });
          if (script.endsWith("backup-banco.sh")) {
            resultadosBackup.push({ ...resultado, args });
            if (resultado.status === 0 && !args.includes("--verificar")) ajustes.depoisProduzir?.();
          }
          return resultado;
        }
        if (script.endsWith("compose.sh")) {
          const a = args.slice(1);
          if (a[0] === "config") return ok(a[1] === "--hash" ? `caddy ${"a".repeat(64)}\n` : "");
          if (a[0] === "up") {
            saudavel = true;
            return ok();
          }
          if (a[0] === "ps")
            return ok(
              a.includes("-q")
                ? "db-falso\n"
                : saudavel
                  ? JSON.stringify([
                      { Service: "app", State: "running", Health: "healthy" },
                      { Service: "db", State: "running", Health: "healthy" },
                      {
                        Service: "caddy",
                        Project: "frequenciapp-teste",
                        State: "running",
                        Labels: `com.docker.compose.service=caddy,com.docker.compose.project=frequenciapp-teste,com.docker.compose.config-hash=${"a".repeat(64)}`,
                      },
                    ])
                  : "[]",
            );
          if (a[0] === "exec" && a.includes("./docker/app/migrar.mjs"))
            return ok("Banco já está na última revisão.");
          if (a[0] === "exec" && a.includes("psql")) return ok("1\n");
          if (a[0] === "exec" && a.includes("-e"))
            return ok(JSON.stringify({ ok: true, versao: "1.0.0", commit }));
        }
      }
      throw new Error(`Comando fora do transporte autorizado: ${comando} ${args.join(" ")}`);
    },
  };
  const args = [
    "aplicar",
    "--sim",
    "--modo-teste",
    "--json",
    "--nao-interativo",
    "--canal",
    "release",
    "--tag",
    "v1.0.0",
    "--dominio",
    "frequencia.teste",
    "--email-acme",
    "admin@escola.teste",
    "--email-admin",
    "direcao@escola.teste",
    "--arquivo-senha-admin",
    senha,
    "--criptografia",
    "age",
    "--destinatarios-age",
    destinatarios,
    "--diretorio-fonte",
    "/opt/frequenciapp",
  ];
  const executarAplicar = (argumentos) => {
    let stdout = "",
      stderr = "";
    const codigo = principal(
      argumentos,
      {
        stdout: {
          write: (s) => {
            stdout += s;
          },
        },
        stderr: {
          write: (s) => {
            stderr += s;
          },
        },
      },
      deps,
    );
    return { codigo, stdout, stderr, dados: JSON.parse(stdout) };
  };
  const aplicar = (extras = []) => executarAplicar([...args, ...extras]);
  const aplicarTag = (tag, extras = []) =>
    executarAplicar([...args.map((valor) => (valor === "v1.0.0" ? tag : valor)), ...extras]);
  const canal = (extras = []) => {
    let stdout = "",
      stderr = "";
    const codigo = principal(
      ["canal", "definir", "release", ...extras, "--json"],
      {
        stdout: {
          write: (s) => {
            stdout += s;
          },
        },
        stderr: {
          write: (s) => {
            stderr += s;
          },
        },
      },
      deps,
    );
    return { codigo, stdout, stderr, dados: JSON.parse(stdout) };
  };
  const estadoDir = path.join(raiz, "var/lib/frequenciapp");
  const backupDir = path.join(raiz, "var/backups/frequenciapp/banco");
  const ponteiro = path.join(estadoDir, "ultimo-backup.json");
  const transporte = path.join(bin, "fixture.json");
  const mudarTransporte = (dados) => json(transporte, { ...ler(transporte), ...dados });
  const rclone = path.join(raiz, "rclone.conf");
  gravar(rclone, "[falso]\ntype = local\n");
  const remotoArgs = ["--destino", "falso:copias", "--config-rclone", rclone];
  const backup = (args = [], extras = {}) => {
    const chamada = chamadas.find(
      (c) => c.comando === "bash" && c.args[0].endsWith("backup-banco.sh"),
    );
    return real("bash", [path.join(appDir, "scripts/servidor/backup-banco.sh"), ...args], {
      env: { ...chamada.env, PATH: env.PATH, ...extras },
    });
  };
  const configurarUrl = () => {
    const ops = path.join(raiz, "etc/frequenciapp/ops.env");
    gravar(ops, fs.readFileSync(ops, "utf8").replace(/^BACKUP_MODO=.*$/m, "BACKUP_MODO=url"));
    const app = path.join(raiz, "etc/frequenciapp/app.env");
    gravar(
      app,
      fs
        .readFileSync(app, "utf8")
        .replace(
          /^(DATABASE_URL|DIRECT_URL)=.*$/gm,
          "$1='postgresql://operador:senha-url-sintetica@banco.invalid/frequencia?schema=public'",
        ),
    );
  };
  return {
    raiz,
    appDir,
    aplicar,
    aplicarTag,
    canal,
    commits: { atual: commit, alvo: commitAlvo },
    deps,
    chamadas,
    eventos,
    real,
    estadoDir,
    backupDir,
    ponteiro,
    resultadosBackup,
    mudarTransporte,
    remotoArgs,
    remoto,
    backup,
    configurarUrl,
  };
}

function deteccao() {
  return {
    distro: "ubuntu",
    versaoDistro: "26.04",
    codename: "resolute",
    idLike: ["debian"],
    familia: "debian",
    tier: 1,
    motivoTier: "",
    arquitetura: "amd64",
    gerenciador: "apt",
    iniciador: "systemd",
    iniciadorOrigem: "sistema",
    container: false,
    firewall: "ausente",
    selinux: "ausente",
    apparmor: "enforcing",
    docker: {
      presente: true,
      versao: "29.8.2",
      daemon: "ativo",
      composePresente: true,
      composeVersao: "2.39.1",
      composeSuficiente: true,
      usuarioNoGrupo: true,
    },
    instalacao: { existente: false },
    avisos: [],
  };
}

test("primeiro aplicar aceita recibo íntegro do alvo efetivo e alcança o agendador", (t) => {
  const f = preparar(t);
  const resultado = f.aplicar();
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.dados.erros));
  const estadoDir = path.join(f.raiz, "var/lib/frequenciapp");
  const ponteiro = ler(path.join(estadoDir, "ultimo-backup.json"));
  const recibo = ler(path.join(estadoDir, "recibos", ponteiro.recibo));
  assert.equal(recibo.artefatos.length, 4);
  assert.equal(recibo.etapas.recuperacaoExercitada, false);
  t.diagnostic(
    JSON.stringify({
      codigo: resultado.codigo,
      erro: resultado.dados.erros,
      artefatos: recibo.artefatos.length,
      recuperacaoExercitada: recibo.etapas.recuperacaoExercitada,
    }),
  );
  assert.equal(resultado.dados.etapas.find((e) => e.id === "agendador").estado, "concluida");
  assert.ok(fs.existsSync(path.join(f.raiz, "etc/systemd/system/frequenciapp-backup-banco.timer")));
});

test("conferência somente leitura não altera estado, backup, trava nem cria temporários", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  const diretorios = [f.estadoDir, f.backupDir, path.join(f.raiz, "var/lock/frequenciapp")];
  const antes = fotografar(diretorios);
  const resultado = f.backup(["--verificar", "--sem-escrita"]);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual([...fotografar(diretorios)], [...antes]);
});

test("comando backup usa verificador real e não herda escopo do processo pai", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.chamadas.length = 0;
  const deps = {
    ...f.deps,
    ambienteBase: {
      ...(f.deps.ambienteBase ?? {}),
      SERVIDOR_ALVO_CHAVE: "alvo-forjado",
      BACKUP_BANCO_VERIFICADO: "banco-forjado",
      SEGREDO_FORA_DO_CONTRATO: "sentinela-fora-do-contrato",
    },
  };
  let stdout = "",
    stderr = "";
  const codigo = principal(
    ["backup", "--modo-teste", "--sim", "--json"],
    {
      stdout: { write: (texto) => (stdout += texto) },
      stderr: { write: (texto) => (stderr += texto) },
    },
    deps,
  );
  assert.equal(codigo, 0, stderr);
  const conferencias = f.chamadas.filter(
    (chamada) =>
      chamada.comando === "bash" &&
      String(chamada.args[0]).endsWith("backup-banco.sh") &&
      chamada.args.includes("--verificar"),
  );
  assert.equal(conferencias.length, 1);
  for (const chave of [
    "SERVIDOR_ALVO_CHAVE",
    "BACKUP_BANCO_VERIFICADO",
    "SEGREDO_FORA_DO_CONTRATO",
  ]) {
    assert.equal(Object.hasOwn(conferencias[0].env, chave), false, chave);
  }
});

test("conferência somente leitura com remoto não altera diretórios nem baixa arquivos", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar(f.remotoArgs).codigo, 0);
  const diretorios = [
    f.estadoDir,
    f.backupDir,
    path.join(f.raiz, "var/lock/frequenciapp"),
    f.remoto,
  ];
  const antes = fotografar(diretorios);
  const resultado = f.backup(["--verificar", "--sem-escrita"]);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual([...fotografar(diretorios)], [...antes]);
});

test("conferência somente leitura recusa adulteração sem alterar o estado", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  const ponteiro = ler(f.ponteiro);
  fs.appendFileSync(path.join(f.backupDir, ponteiro.arquivo), "ADULTERADO\n");
  const diretorios = [f.estadoDir, f.backupDir, path.join(f.raiz, "var/lock/frequenciapp")];
  const antes = fotografar(diretorios);
  const resultado = f.backup(["--verificar", "--sem-escrita"]);
  assert.equal(resultado.status, 1);
  assert.match(resultado.stderr, /Recibo, escopo ou artefatos/);
  assert.deepEqual([...fotografar(diretorios)], [...antes]);
});

test("planejamento de canal usa autoridade real e não altera backup, trava ou remoto", (t) => {
  const f = preparar(t, { segundaRevisao: true });
  const aplicado = f.aplicarTag("v1.1.0", [...f.remotoArgs, "--pular-saude"]);
  assert.equal(aplicado.codigo, 0, JSON.stringify(aplicado.dados.erros));
  const diretorios = [
    f.backupDir,
    path.join(f.raiz, "var/lock/frequenciapp"),
    path.join(f.raiz, "etc/frequenciapp"),
    f.remoto,
  ];
  const antes = fotografar(diretorios);
  const resultado = f.canal(["--tag", "v1.0.0", "--permitir-downgrade", "--sim", "--planejar"]);
  assert.equal(resultado.codigo, 0, resultado.stderr);
  assert.equal(resultado.dados.dry_run, true);
  const estado = ler(path.join(f.raiz, "var/lib/frequenciapp/instalacao.json"));
  assert.equal(estado.commit, f.commits.alvo);
  assert.equal(estado.tag, "v1.0.0");
  assert.deepEqual([...fotografar(diretorios)], [...antes]);
});

test("repetição íntegra verifica sem novo dump e mantém ambiente do filho em allowlist", (t) => {
  const anterior = process.env.SEGREDO_FORA_DO_CONTRATO;
  process.env.SEGREDO_FORA_DO_CONTRATO = "nao-herdar-este-sentinela";
  t.after(() => {
    if (anterior === undefined) delete process.env.SEGREDO_FORA_DO_CONTRATO;
    else process.env.SEGREDO_FORA_DO_CONTRATO = anterior;
  });
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  const antes = fs.readFileSync(f.ponteiro);
  const resultado = f.aplicar();
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.dados.erros));
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  assert.equal(f.resultadosBackup.filter((r) => !r.args.includes("--verificar")).length, 1);
  assert.equal(f.resultadosBackup.filter((r) => r.args.includes("--verificar")).length, 2);
  for (const c of f.chamadas.filter(
    (c) => c.comando === "bash" && c.args[0].endsWith("backup-banco.sh"),
  )) {
    for (const chave of [
      "SEGREDO_FORA_DO_CONTRATO",
      "DATABASE_URL",
      "POSTGRES_PASSWORD",
      "SERVIDOR_ALVO_CHAVE",
      "BACKUP_BANCO_VERIFICADO",
    ])
      assert.equal(Object.hasOwn(c.env, chave), false, chave);
  }
  assert.equal((resultado.stdout + resultado.stderr).includes("nao-herdar-este-sentinela"), false);
});

test("retomada em backup-inicial revalida o conjunto íntegro sem novo dump", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  const antes = fs.readFileSync(f.ponteiro);
  const resultado = f.aplicar(["--retomar", "--desde-etapa", "backup-inicial"]);
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.dados.erros));
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  assert.equal(
    fs
      .readFileSync(f.eventos, "utf8")
      .split("\n")
      .filter((l) => l && JSON.parse(l).tipo === "dump").length,
    1,
  );
  assert.equal(
    resultado.dados.etapas.find((e) => e.id === "backup-inicial").detalhes.semMudancas,
    true,
  );
});

test("remoto explícito íntegro é consultado novamente mesmo sem confirmação antiga", (t) => {
  const f = preparar(t, {
    depoisProduzir() {
      const p = ler(f.ponteiro);
      json(f.ponteiro, { ...p, verificadoRemoto: false });
      for (const dir of [f.backupDir, path.join(f.estadoDir, "recibos"), f.remoto]) {
        const arquivo = path.join(dir, p.recibo);
        const r = ler(arquivo);
        r.etapas.remotoVerificado = false;
        json(arquivo, r);
      }
    },
  });
  const resultado = f.aplicar(f.remotoArgs);
  assert.equal(resultado.codigo, 0, JSON.stringify(resultado.dados.erros));
  assert.equal(resultado.dados.etapas.find((e) => e.id === "backup-inicial").detalhes.remoto, true);
  assert.equal(f.resultadosBackup.length, 2);
  assert.match(f.resultadosBackup[1].stdout, /Backup confirmado:/);
  assert.equal(f.resultadosBackup[1].status, 0);
});

test("conferência atual recusa sidecar remoto adulterado apesar da confirmação antiga", (t) => {
  const f = preparar(t, {
    depoisProduzir() {
      const p = ler(f.ponteiro);
      assert.equal(p.verificadoRemoto, true);
      fs.appendFileSync(path.join(f.remoto, p.arquivo + ".sha256"), "ADULTERADO\n");
    },
  });
  const resultado = f.aplicar(f.remotoArgs);
  assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
  assert.equal(resultado.dados.codigo, "E_BACKUP");
  assert.equal(f.resultadosBackup.at(-1).status, 1);
  assert.match(f.resultadosBackup.at(-1).stderr, /remota.*diverge do hash local/);
  assert.equal(ler(f.ponteiro).verificadoRemoto, true);
  assert.ok(fs.existsSync(path.join(f.backupDir, ler(f.ponteiro).arquivo)));
});

test("URL produz escopo de banco comprovado e verifica sem credenciais no argv", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.configurarUrl();
  const produzido = f.backup();
  assert.equal(produzido.status, 0, produzido.stderr);
  const p = ler(f.ponteiro);
  const r = ler(path.join(f.backupDir, p.recibo));
  assert.equal(r.escopo.banco, "frequencia");
  assert.equal(r.escopo.alvo, "url-cluster-7300000000000000011");
  assert.equal(r.etapas.recuperacaoExercitada, false);
  const antes = fs.readFileSync(f.ponteiro);
  const verificado = f.backup(["--verificar"], { BACKUP_BANCO_VERIFICADO: "autoridade-forjada" });
  assert.equal(verificado.status, 0, verificado.stderr);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  const eventos = fs.readFileSync(f.eventos, "utf8");
  assert.equal(eventos.includes("senha-url-sintetica"), false);
  assert.equal(
    eventos.split("\n").filter((l) => l && JSON.parse(l).tipo === "banco-url").length,
    2,
  );
});

test("URL confere em modo somente leitura sem alterar o estado nem criar temporários", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.configurarUrl();
  assert.equal(f.backup().status, 0);
  const diretorios = [f.estadoDir, f.backupDir, path.join(f.raiz, "var/lock/frequenciapp")];
  const antes = fotografar(diretorios);
  const resultado = f.backup(["--verificar", "--sem-escrita"]);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.deepEqual([...fotografar(diretorios)], [...antes]);
});

test("URL preserva ssl=true e + literal da URI libpq sem segredo no argv", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.configurarUrl();
  const app = path.join(f.raiz, "etc/frequenciapp/app.env");
  gravar(
    app,
    fs
      .readFileSync(app, "utf8")
      .replaceAll(
        "?schema=public",
        "?schema=public&ssl=true&application_name=backup+noturno%2B17&password=senha+url%2B17",
      ),
  );
  f.mudarTransporte({
    senhaUrl: "senha+url+17",
    parametrosUrl: { sslmode: "require", application_name: "backup+noturno+17" },
  });
  const produzido = f.backup();
  assert.equal(produzido.status, 0, produzido.stderr);
  const antes = fs.readFileSync(f.ponteiro);
  const verificado = f.backup(["--verificar"]);
  assert.equal(verificado.status, 0, verificado.stderr);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  const eventos = fs.readFileSync(f.eventos, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(eventos.filter((e) => e.tipo === "banco-url").length, 2);
  assert.equal(eventos.filter((e) => e.tipo === "dump-url").length, 1);
  assert.equal(JSON.stringify(eventos).includes("senha+url+17"), false);
  assert.equal(
    (produzido.stdout + produzido.stderr + verificado.stdout + verificado.stderr).includes(
      "senha+url+17",
    ),
    false,
  );
});

test("URL recusa recibo de cluster homônimo e identidade indisponível sem aceitar autoridade herdada", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.configurarUrl();
  assert.equal(f.backup().status, 0);
  const antes = fs.readFileSync(f.ponteiro);
  const p = ler(f.ponteiro);
  const recibo = fs.readFileSync(path.join(f.backupDir, p.recibo));
  const alvoAnterior = ler(path.join(f.backupDir, p.recibo)).escopo.alvo;
  f.mudarTransporte({ clusterUrl: "7300000000000000022" });
  const outro = f.backup(["--verificar"], {
    SERVIDOR_ALVO_CHAVE: alvoAnterior,
    BACKUP_BANCO_VERIFICADO: "frequencia",
  });
  assert.equal(outro.status, 1, outro.stderr);
  assert.match(outro.stderr, /Recibo, escopo ou artefatos/);
  for (const ajuste of [
    { falharClusterUrl: true },
    { falharClusterUrl: false, clusterUrl: "" },
    { clusterUrl: "0" },
    { clusterUrl: "cluster-nao-comprovado" },
    { clusterUrl: "7300000000000000011\n7300000000000000022" },
  ]) {
    f.mudarTransporte(ajuste);
    for (const args of [[], ["--verificar"]]) {
      const falhou = f.backup(args, { SERVIDOR_ALVO_CHAVE: alvoAnterior });
      assert.equal(falhou.status, 1, falhou.stderr);
      assert.match(falhou.stderr, /Não foi possível comprovar a identidade do cluster/);
      assert.equal((falhou.stdout + falhou.stderr).includes("senha-url-sintetica"), false);
    }
  }
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  assert.deepEqual(fs.readFileSync(path.join(f.backupDir, p.recibo)), recibo);
  assert.ok(fs.existsSync(path.join(f.backupDir, p.arquivo)));
  f.mudarTransporte({ clusterUrl: "7300000000000000011" });
  const mesmo = f.backup(["--verificar"]);
  assert.equal(mesmo.status, 0, mesmo.stderr);
  const eventos = fs.readFileSync(f.eventos, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(eventos.filter((e) => e.tipo === "dump-url").length, 1);
  alterarRecibo(f, (r) => {
    r.escopo.alvo = "url-conservador";
  });
  const legado = f.backup(["--verificar"]);
  assert.equal(legado.status, 1, legado.stderr);
  assert.match(legado.stderr, /Recibo, escopo ou artefatos/);
  assert.equal(eventos.filter((e) => e.tipo === "cluster-url").length, 13);
});

test("URL mantém retenção local e remota conservadora apesar do cluster identificado", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar(f.remotoArgs).codigo, 0);
  f.configurarUrl();
  assert.equal(f.backup().status, 0);
  const p = ler(f.ponteiro);
  const r = ler(path.join(f.backupDir, p.recibo));
  r.em = "2020-01-01T00:00:00Z";
  for (const dir of [f.backupDir, path.join(f.estadoDir, "recibos"), f.remoto])
    json(path.join(dir, p.recibo), r);
  const arquivos = [
    path.join(f.estadoDir, "recibos", p.recibo),
    ...[f.backupDir, f.remoto].flatMap((dir) =>
      [...r.artefatos.map((a) => a.nome), p.recibo].map((n) => path.join(dir, n)),
    ),
  ];
  const antes = arquivos.map((a) => fs.readFileSync(a));
  const ops = path.join(f.raiz, "etc/frequenciapp/ops.env");
  const valores = { BACKUP_RETER_DIAS: "1", BACKUP_RETER_MINIMO: "0", BACKUP_RETER_REMOTO: "true" };
  let texto = fs.readFileSync(ops, "utf8");
  for (const [chave, valor] of Object.entries(valores)) {
    texto = texto.replace(new RegExp(`^${chave}=.*\\n?`, "gm"), "");
    texto += `\n${chave}=${valor}\n`;
  }
  gravar(ops, texto);
  const novo = f.backup();
  assert.equal(novo.status, 0, novo.stderr);
  assert.notEqual(ler(f.ponteiro).recibo, p.recibo);
  assert.match(novo.stdout, /Reten.*conservadora/);
  assert.match(novo.stdout, /Expurgo remoto suspenso/);
  arquivos.forEach((a, i) => assert.deepEqual(fs.readFileSync(a), antes[i], a));
});

test("URL recusa banco efetivo divergente e falha de conexão sem alterar o ponteiro", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  f.configurarUrl();
  assert.equal(f.backup().status, 0);
  const antes = fs.readFileSync(f.ponteiro);
  f.mudarTransporte({ bancoUrl: "outro-banco" });
  for (const args of [[], ["--verificar"]]) {
    const r = f.backup(args, { BACKUP_BANCO_VERIFICADO: "outro-banco" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /Banco efetivo diverge do banco solicitado/);
    assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  }
  f.mudarTransporte({ bancoUrl: "frequencia", falharBancoUrl: true });
  const falhou = f.backup(["--verificar"]);
  assert.equal(falhou.status, 1);
  assert.match(falhou.stderr, /Não foi possível comprovar o banco selecionado/);
  assert.equal((falhou.stdout + falhou.stderr).includes("senha-url-sintetica"), false);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  f.mudarTransporte({ falharBancoUrl: false });
  assert.equal(f.backup(["--verificar"]).status, 0);
});

function alterarRecibo(f, alterar) {
  const p = ler(f.ponteiro);
  for (const dir of [f.backupDir, path.join(f.estadoDir, "recibos")]) {
    const arquivo = path.join(dir, p.recibo);
    const r = ler(arquivo);
    alterar(r);
    json(arquivo, r);
  }
}

const adulteracoes = [
  [
    "dump",
    (f) => fs.appendFileSync(path.join(f.backupDir, ler(f.ponteiro).arquivo), "ADULTERADO\n"),
  ],
  [
    "sidecar",
    (f) =>
      fs.appendFileSync(
        path.join(f.backupDir, ler(f.ponteiro).arquivo + ".sha256"),
        "ADULTERADO\n",
      ),
  ],
  ["ponteiro", (f) => json(f.ponteiro, { ...ler(f.ponteiro), sha256: "0".repeat(64) })],
  [
    "alvo",
    (f) =>
      alterarRecibo(f, (r) => {
        r.escopo.alvo = "outro-alvo";
      }),
  ],
  [
    "banco",
    (f) =>
      alterarRecibo(f, (r) => {
        r.escopo.banco = "outro-banco";
      }),
  ],
  [
    "schema",
    (f) =>
      alterarRecibo(f, (r) => {
        r.escopo.schema = "outro-schema";
      }),
  ],
  [
    "destino",
    (f) =>
      alterarRecibo(f, (r) => {
        r.remoto = "outro:destino";
      }),
  ],
];

for (const [nome, adulterar] of adulteracoes) {
  test(`primeiro aplicar recusa ${nome} divergente e preserva artefatos e estado`, (t) => {
    let antes;
    const f = preparar(t, {
      depoisProduzir() {
        adulterar(f);
        antes = fs.readFileSync(f.ponteiro);
      },
    });
    const resultado = f.aplicar();
    assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
    assert.equal(resultado.dados.codigo, "E_BACKUP");
    assert.match(resultado.dados.erros[0].mensagem, /checksum|integridade/);
    assert.equal(resultado.dados.etapas.find((e) => e.id === "backup-inicial").estado, "falhou");
    assert.equal(
      resultado.dados.etapas.some((e) => e.id === "agendador"),
      false,
    );
    assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
    const p = ler(f.ponteiro);
    assert.ok(fs.existsSync(path.join(f.backupDir, p.arquivo)));
    assert.ok(fs.existsSync(path.join(f.estadoDir, "recibos", p.recibo)));
    assert.equal(ler(path.join(f.estadoDir, "instalacao.json")).backup.ultimoRecibo, null);
    const conferencia = f.backup(["--verificar"], {
      SERVIDOR_ALVO_CHAVE: "outro-alvo",
      BACKUP_BANCO_VERIFICADO: "outro-banco",
    });
    assert.equal(conferencia.status, 1, conferencia.stderr);
    assert.match(conferencia.stderr, /Recibo, escopo ou artefatos/);
    assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  });
}

test("banco compose observado diferente é recusado antes da leitura do recibo", (t) => {
  const f = preparar(t, {
    depoisProduzir() {
      f.mudarTransporte({ banco: "outro-banco" });
    },
  });
  const resultado = f.aplicar();
  assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
  assert.equal(f.resultadosBackup.at(-1).status, 1);
  assert.match(f.resultadosBackup.at(-1).stderr, /Banco efetivo diverge do banco solicitado/);
});

test("remoto indisponível hoje impede repetição e retomada apesar de flag confirmada", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar(f.remotoArgs).codigo, 0);
  const antes = fs.readFileSync(f.ponteiro);
  assert.equal(ler(f.ponteiro).verificadoRemoto, true);
  f.mudarTransporte({ falharRemoto: true });
  const resultado = f.aplicar(["--retomar", "--desde-etapa", "backup-inicial", ...f.remotoArgs]);
  assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
  assert.equal(resultado.dados.codigo, "E_BACKUP");
  assert.equal(f.resultadosBackup.at(-1).status, 1);
  assert.match(f.resultadosBackup.at(-1).stderr, /Remoto sintético indisponível hoje/);
  assert.match(f.resultadosBackup.at(-1).stderr, /baixar.*destino remoto/);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  f.mudarTransporte({ falharRemoto: false });
  assert.equal(f.aplicar(["--retomar", ...f.remotoArgs]).codigo, 0);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
});

for (const tipo of ["dump", "recibo"]) {
  test(`conferência atual recusa ${tipo} remoto adulterado`, (t) => {
    const f = preparar(t, {
      depoisProduzir() {
        const p = ler(f.ponteiro);
        fs.appendFileSync(
          path.join(f.remoto, tipo === "dump" ? p.arquivo : p.recibo),
          "ADULTERADO\n",
        );
      },
    });
    const resultado = f.aplicar(f.remotoArgs);
    assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
    assert.equal(resultado.dados.codigo, "E_BACKUP");
    assert.equal(f.resultadosBackup.at(-1).status, 1);
    assert.match(f.resultadosBackup.at(-1).stderr, /remota.*diverge do hash local/);
    assert.equal(ler(f.ponteiro).verificadoRemoto, true);
  });
}

for (const extras of [["--retomar"], ["--desde-etapa", "agendador"]]) {
  test(`retomada posterior ${extras[0]} não aceita backup confirmado agora adulterado`, (t) => {
    const f = preparar(t);
    assert.equal(f.aplicar().codigo, 0);
    const ponteiroIntegro = fs.readFileSync(f.ponteiro);
    const antesIntegro = f.resultadosBackup.length;
    const integro = f.aplicar(extras);
    assert.equal(integro.codigo, 0, JSON.stringify(integro.dados.erros));
    assert.equal(f.resultadosBackup.length - antesIntegro, 1);
    assert.deepEqual(fs.readFileSync(f.ponteiro), ponteiroIntegro);
    const p = ler(f.ponteiro);
    fs.appendFileSync(path.join(f.backupDir, p.arquivo + ".sha256"), "ADULTERADO\n");
    const antes = f.resultadosBackup.length;
    const resultado = f.aplicar(extras);
    t.diagnostic(
      JSON.stringify({
        codigo: resultado.codigo,
        conferenciasNovas: f.resultadosBackup.length - antes,
      }),
    );
    assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
    assert.equal(resultado.dados.codigo, "E_BACKUP");
    assert.equal(f.resultadosBackup.length - antes, 1);
    assert.equal(
      resultado.dados.etapas.find((etapa) => etapa.id === "backup-inicial").estado,
      "falhou",
    );
    assert.equal(
      fs
        .readFileSync(f.eventos, "utf8")
        .split("\n")
        .filter((linha) => linha && JSON.parse(linha).tipo === "dump").length,
      1,
    );
  });
}

test("repetição revalida backup já confirmado e recusa dump agora adulterado sem recriá-lo", (t) => {
  const f = preparar(t);
  assert.equal(f.aplicar().codigo, 0);
  const p = ler(f.ponteiro);
  const dump = path.join(f.backupDir, p.arquivo);
  fs.appendFileSync(dump, "ADULTERADO\n");
  const antes = fs.readFileSync(f.ponteiro);
  const resultado = f.aplicar();
  assert.equal(resultado.codigo, 10, JSON.stringify(resultado.dados.erros));
  assert.equal(resultado.dados.codigo, "E_BACKUP");
  assert.match(resultado.dados.erros[0].mensagem, /checksum|integridade/);
  assert.deepEqual(fs.readFileSync(f.ponteiro), antes);
  assert.match(fs.readFileSync(dump, "utf8"), /ADULTERADO/);
  assert.equal(
    fs
      .readFileSync(f.eventos, "utf8")
      .split("\n")
      .filter((l) => l && JSON.parse(l).tipo === "dump").length,
    1,
  );
});
