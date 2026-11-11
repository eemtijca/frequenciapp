// Provisiona dois recursos sintéticos sem privilégios; preserva provas e IDs sem remoção.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inspecionarImagem, prepararImagemOrigem, postgresReferencia } from "./imagens-ensaio.mjs";

// INICIO_COLETA_URL
function perfilColetaUrl(perfil) {
  assert.ok(perfil === "db" || perfil === "runner", "COLETA_URL_PERFIL");
  const casos = "(positivo|mesma-base|alias|checksum|sem-permissao|erro-destino)";
  return perfil === "db"
    ? {
        uid: 999,
        pastas: /^$/,
        arquivos: /^(initdb\.log|pg-ctl\.log|postgres\.log)$/,
        obrigatorios: ["initdb.log", "pg-ctl.log", "postgres.log"],
      }
    : {
        uid: 1000,
        pastas: new RegExp(
          `^resultado-url(/auditoria(/${casos}(/(logs|estado(/ensaios-url(/rodada-[A-Za-z0-9]{6})?)?))?)?)?$`,
        ),
        arquivos: new RegExp(
          `^resultado-url/(identidade\\.json|resumo\\.json|execucoes\\.json|auditoria/${casos}/(execucao\\.log|estado/(ultima-restauracao\\.json|ensaios-url/rodada-[A-Za-z0-9]{6}/journal\\.json)))$`,
        ),
        obrigatorios: ["identidade.json", "resumo.json", "execucoes.json"]
          .map((n) => `resultado-url/${n}`)
          .concat(
            casos
              .slice(1, -1)
              .split("|")
              .map((n) => `resultado-url/auditoria/${n}/execucao.log`),
          ),
      };
}
function receitaColetaUrl(perfil) {
  const p = perfilColetaUrl(perfil);
  return `set -euo pipefail
recusar() { printf '%s\\n' COLETA_URL_PRODUTOR >&2; exit 78; }
[ "$(id -u):$(id -g)" = '${p.uid}:${p.uid}' ] || recusar
cd /tmp
pastas='${p.pastas.source.replaceAll("\\/", "/")}'
arquivos='${p.arquivos.source.replaceAll("\\/", "/")}'
printf 'URLCOLETA1\\n'
n=0; total=0
${perfil === "runner" ? "find resultado-url -xdev -maxdepth 6 -print0" : "printf '%s\\0' initdb.log pg-ctl.log postgres.log"} | while IFS= read -r -d '' nome; do
  n=$((n+1)); [ "$n" -le 128 ] || recusar
  [[ "$nome" =~ ^[A-Za-z0-9/._-]+$ ]] || recusar
  [ ! -L "$nome" ] || recusar
  meta=$(stat --printf='%u\\t%g\\t%a\\t%s' -- "$nome") || recusar
  IFS=$'\\t' read -r uid gid modo tamanho <<< "$meta"
  [ "$uid:$gid" = '${p.uid}:${p.uid}' ] || recusar
  if [ -d "$nome" ]; then
    [[ "$nome" =~ $pastas ]] || recusar
    [[ "$modo" = 700 || "$modo" = 750 ]] || recusar
    tipo=D; tamanho=0; sha='${hash(Buffer.alloc(0))}'
  elif [ -f "$nome" ]; then
    [[ "$nome" =~ $arquivos ]] || recusar
    [ "$modo" = 600 ] || recusar
    [ "$tamanho" -le 1048576 ] || recusar
    tipo=F; sha=$(sha256sum -- "$nome") || recusar; sha=\${sha%% *}
  else recusar; fi
  total=$((total+tamanho)); [ "$total" -le 4194304 ] || recusar
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$tipo" "$uid" "$gid" "$modo" "$tamanho" "$sha" "$nome"
  if [ "$tipo" = F ]; then cat -- "$nome"; fi
done
printf 'FIM\\n'
`;
}
function validarColetaUrl(perfil, bruto) {
  const p = perfilColetaUrl(perfil);
  const exigir = (ok, motivo) => assert.ok(ok, `COLETA_URL_${motivo}`);
  exigir(Buffer.isBuffer(bruto) && bruto.length <= 8 * 1048576, "CANAL");
  exigir(bruto.subarray(0, 11).equals(Buffer.from("URLCOLETA1\n")), "FORMATO");
  let posicao = 11,
    total = 0;
  const itens = [],
    vistos = new Map();
  while (!bruto.subarray(posicao, posicao + 4).equals(Buffer.from("FIM\n"))) {
    exigir(itens.length < 128, "CONTAGEM");
    const fim = bruto.indexOf(10, posicao);
    exigir(fim >= posicao && fim - posicao < 512, "CABECALHO");
    const linha = bruto.subarray(posicao, fim).toString("utf8");
    const m =
      /^([FD])\t([0-9]+)\t([0-9]+)\t(600|700|750)\t(0|[1-9][0-9]*)\t([a-f0-9]{64})\t([A-Za-z0-9/._-]+)$/.exec(
        linha,
      );
    exigir(m, "CABECALHO");
    const [, tipo, uid, gid, modo, tamanho, sha256, nome] = m;
    exigir(uid === String(p.uid) && gid === String(p.uid), "UID");
    exigir(!vistos.has(nome), "DUPLICADO");
    exigir((tipo === "D" ? p.pastas : p.arquivos).test(nome), "CAMINHO");
    exigir(tipo === "D" ? /^(700|750)$/.test(modo) && tamanho === "0" : modo === "600", "MODO");
    const bytes = Number(tamanho);
    exigir(Number.isSafeInteger(bytes) && bytes <= 1048576, "TAMANHO");
    total += bytes;
    exigir(total <= 4194304, "TOTAL");
    posicao = fim + 1;
    exigir(posicao + bytes <= bruto.length, "TRUNCADO");
    const dados = bruto.subarray(posicao, posicao + bytes);
    exigir(hash(dados) === sha256, "HASH");
    itens.push({ nome, tipo, dados, sha256 });
    vistos.set(nome, tipo);
    posicao += bytes;
  }
  exigir(posicao + 4 === bruto.length, "SOBRAS");
  for (const nome of p.obrigatorios) exigir(vistos.get(nome) === "F", "OBRIGATORIO");
  for (const { nome } of itens) {
    const pai = path.posix.dirname(nome);
    exigir(pai === "." || vistos.get(pai) === "D", "PAI");
  }
  return itens;
}
function coletarArtefatosUrl(perfil, id, destino, executarBinario) {
  assert.match(id, /^[a-f0-9]{64}$/, "COLETA_URL_ID");
  const p = perfilColetaUrl(perfil);
  const args = ["exec", "--user", `${p.uid}:${p.uid}`, id, "bash", "-c", receitaColetaUrl(perfil)];
  const r = executarBinario(args);
  assert.ok(
    !r.error &&
      r.signal === null &&
      r.status === 0 &&
      Buffer.isBuffer(r.stderr) &&
      r.stderr.length === 0,
    "COLETA_URL_CLIENTE",
  );
  const itens = validarColetaUrl(perfil, r.stdout);
  // Nenhuma gravação precede a validação integral; diretório novo, sem extração genérica.
  fs.mkdirSync(destino, { mode: 0o700 });
  for (const item of itens
    .filter((i) => i.tipo === "D")
    .sort((a, b) => a.nome.split("/").length - b.nome.split("/").length))
    fs.mkdirSync(path.join(destino, item.nome), { mode: 0o700 });
  for (const item of itens.filter((i) => i.tipo === "F"))
    fs.writeFileSync(path.join(destino, item.nome), item.dados, { mode: 0o600, flag: "wx" });
  return {
    stdoutSha256: hash(r.stdout),
    arquivos: itens
      .filter((i) => i.tipo === "F")
      .map(({ nome, sha256, dados }) => ({ nome, sha256, bytes: dados.length })),
  };
}
// FIM_COLETA_URL

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const token = randomBytes(16).toString("hex");
const label = "frequenciapp.synthetic.restore-url";
const nomes = [
  "scripts/servidor/restaurar.sh",
  "scripts/servidor/restauracao-url.mjs",
  "scripts/servidor/comum.sh",
  "scripts/servidor/validar-banco.mjs",
  "src/infra/schema-postgres.mjs",
  "tests/servidor/restauracao-url-real.mjs",
  "tests/servidor/restauracao-url-harness.mjs",
  "tests/servidor/imagens-ensaio.mjs",
];
const hash = (dados) => createHash("sha256").update(dados).digest("hex");
const dbCmd = ["-c", "trap 'exit 0' TERM INT; while :; do sleep 1; done"];
const runnerCmd = [
  "-c",
  'while [ ! -f /tmp/iniciar-url ]; do sleep 0.1; done; umask 077; node /repo/tests/servidor/restauracao-url-real.mjs & filho=$!; wait "$filho"; codigo=$?; printf \'%s:%s\\n\' "$filho" "$codigo" > /tmp/driver-fim; while [ ! -f /tmp/coleta-concluida ]; do sleep 0.1; done; exit "$codigo"',
];
const tmpfsDB = {
  "/var/lib/postgresql/data": "rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=268435456",
  "/var/run/postgresql": "rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=16777216",
  "/tmp": "rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=67108864",
};
const tmpfsRunner = {
  "/var/lib/postgresql/data": "rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=16777216",
  "/tmp": "rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=268435456",
};
const envMapa = (lista) => {
  assert.ok(Array.isArray(lista));
  const pares = lista.map((e) => {
    assert.ok(typeof e === "string" && e.indexOf("=") > 0, "ambiente inválido");
    return [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)];
  });
  assert.equal(new Set(pares.map(([k]) => k)).size, lista.length, "ambiente duplicado");
  return Object.fromEntries(pares);
};
let base, snapshot, manifesto, ids, dbEnv, runnerEnv;
let sequencia = 0;
function gravar(nome, conteudo) {
  fs.writeFileSync(path.join(base, nome), conteudo, { mode: 0o600 });
}
function salvar() {
  gravar("ids.json", JSON.stringify(ids, null, 2) + "\n");
}
const docker = (args, input) => {
  const numero = ++sequencia;
  gravar(
    `docker-${numero}.json`,
    JSON.stringify({ args, inputSha256: input === undefined ? null : hash(input) }) + "\n",
  );
  const r = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    timeout: 240000,
    maxBuffer: 8 * 1048576,
    env: {
      PATH: process.env.PATH,
      HOME: base,
      TMPDIR: base,
      DOCKER_CONFIG: path.join(base, "docker-config"),
    },
  });
  gravar(`docker-${numero}.log`, (r.stdout || "") + (r.stderr || ""));
  gravar(
    `docker-${numero}-fim.json`,
    JSON.stringify({ codigo: r.status, sinal: r.signal, erro: r.error?.code || null }) + "\n",
  );
  assert.equal(r.error, undefined, `docker ${args[0]} não executado`);
  assert.equal(r.signal, null, `docker ${args[0]} interrompido`);
  assert.equal(r.status, 0, `docker ${args[0]} falhou; resultado não autoriza limpeza`);
  return r.stdout.trim();
};
const dockerBinario = (args) => {
  const numero = ++sequencia;
  gravar(`docker-${numero}.json`, JSON.stringify({ args, binario: true }) + "\n");
  const r = spawnSync("docker", args, {
    timeout: 30000,
    maxBuffer: 8 * 1048576,
    env: {
      PATH: process.env.PATH,
      HOME: base,
      TMPDIR: base,
      DOCKER_CONFIG: path.join(base, "docker-config"),
    },
  });
  gravar(`docker-${numero}.stdout`, r.stdout || Buffer.alloc(0));
  gravar(`docker-${numero}.stderr`, r.stderr || Buffer.alloc(0));
  gravar(
    `docker-${numero}-fim.json`,
    JSON.stringify({
      codigo: r.status,
      sinal: r.signal,
      erro: r.error?.code || null,
      stdoutSha256: hash(r.stdout || Buffer.alloc(0)),
      stderrSha256: hash(r.stderr || Buffer.alloc(0)),
    }) + "\n",
  );
  return r;
};
const inspecionar = (id) => {
  const itens = JSON.parse(docker(["inspect", id]));
  assert.equal(itens.length, 1);
  return itens[0];
};
function conferir(id, tipo, fase) {
  const o = inspecionar(id);
  assert.equal(o.Id, id);
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.equal(o.Config.Labels[label], token);
  assert.equal(o.Config.Labels[`${label}.papel`], tipo);
  assert.equal(o.Image, tipo === "db" ? ids.dbImagem : ids.runnerImagem);
  assert.equal(o.HostConfig.NetworkMode, tipo === "db" ? "none" : `container:${ids.db}`);
  assert.equal(o.Config.User, tipo === "db" ? "999:999" : "1000:1000");
  assert.equal(o.Config.WorkingDir, tipo === "db" ? "/tmp" : "/repo");
  assert.deepEqual(o.Config.Entrypoint, ["/bin/bash"]);
  assert.deepEqual(o.Config.Cmd, tipo === "db" ? dbCmd : runnerCmd);
  assert.deepEqual(o.Config.Healthcheck, { Test: ["NONE"] });
  assert.equal(o.HostConfig.ReadonlyRootfs, true);
  assert.equal(o.HostConfig.Privileged, false);
  assert.deepEqual(o.HostConfig.CapDrop, ["ALL"]);
  assert.deepEqual(o.HostConfig.SecurityOpt, ["no-new-privileges:true"]);
  assert.ok(!o.HostConfig.PortBindings || Object.keys(o.HostConfig.PortBindings).length === 0);
  assert.ok(!o.NetworkSettings.Ports || Object.keys(o.NetworkSettings.Ports).length === 0);
  for (const campo of [
    "Devices",
    "CapAdd",
    "VolumesFrom",
    "DeviceRequests",
    "Links",
    "ExtraHosts",
    "Binds",
  ])
    assert.ok(!o.HostConfig[campo]?.length, `campo proibido: ${campo}`);
  assert.equal(o.HostConfig.PidMode, "");
  assert.equal(o.HostConfig.IpcMode, "private");
  assert.equal(o.HostConfig.RestartPolicy.Name, "no");
  assert.equal(o.HostConfig.AutoRemove, false);
  assert.deepEqual(envMapa(o.Config.Env), tipo === "db" ? dbEnv : runnerEnv);
  assert.equal(o.HostConfig.Memory, 536870912);
  assert.equal(o.HostConfig.PidsLimit, 128);
  assert.equal(o.HostConfig.NanoCpus, 1000000000);
  assert.deepEqual(o.HostConfig.Tmpfs, tipo === "db" ? tmpfsDB : tmpfsRunner);
  assert.equal(o.State.Running, fase === "rodando");
  if (fase === "criado") {
    assert.equal(o.State.Status, "created");
    assert.equal(o.State.StartedAt, "0001-01-01T00:00:00Z");
  }
  if (fase === "terminado") {
    assert.equal(o.State.Status, "exited");
    assert.equal(o.State.ExitCode, 0);
    assert.equal(o.State.OOMKilled, false);
  }
  const binds = o.Mounts.filter((m) => m.Type === "bind");
  assert.equal(binds.length, tipo === "db" ? 0 : 1);
  if (tipo === "runner") {
    assert.equal(binds[0].Source, snapshot);
    assert.equal(binds[0].Destination, "/repo");
    assert.equal(binds[0].RW, false);
  }
  // --tmpfs fica em HostConfig.Tmpfs; Docker não o duplica em Mounts.
  assert.equal(o.Mounts.length, binds.length);
  return o;
}
function registrar(tipo, id) {
  assert.match(id, /^[a-f0-9]{64}$/);
  assert.ok(!Object.values(ids).includes(id), "ID já registrado");
  ids[tipo] = id;
  salvar();
}
function conferirFontes() {
  for (const [nome, esperado] of Object.entries(manifesto)) {
    assert.equal(hash(fs.readFileSync(path.join(snapshot, nome))), esperado);
    assert.equal(hash(fs.readFileSync(path.join(repo, nome))), esperado);
  }
}
const envArgs = (objeto) => Object.entries(objeto).flatMap(([k, v]) => ["--env", `${k}=${v}`]);
const tmpfsArgs = (objeto) => Object.entries(objeto).flatMap(([k, v]) => ["--tmpfs", `${k}:${v}`]);
// Antes de initdb: UID real, PID1, capacidades, NNP, tmpfs próprios vazios e namespace sem listener.
function probe(tipo, vazio) {
  const uid = tipo === "db" ? 999 : 1000;
  const pastas = Object.keys(tipo === "db" ? tmpfsDB : tmpfsRunner);
  return `set -eu
recusar() { printf '%s\\n' "URL_GUARDA_$1" >&2; exit 78; }
[ "$(id -u):$(id -g)" = ${uid}:${uid} ] || recusar UID_GID
for p in self 1; do
  awk '/^Uid:/ {if($2!=${uid} || $3!=${uid} || $4!=${uid} || $5!=${uid}) exit 1; u=1} END {if(!u) exit 1}' /proc/$p/status || recusar STATUS_UID
  awk '/^Cap(Inh|Prm|Eff|Bnd|Amb):/ {if($2 !~ /^0+$/) exit 1; c++} END {if(c!=5) exit 1}' /proc/$p/status || recusar STATUS_CAPACIDADES
  awk '/^NoNewPrivs:/ {if($2!=1) exit 1; n=1} END {if(!n) exit 1}' /proc/$p/status || recusar STATUS_NNP
done
[ "$(ls /sys/class/net)" = lo ] || recusar INTERFACES
[ "$(wc -l </proc/net/route)" -eq 1 ] || recusar ROTAS
{ [ ! -S /var/run/docker.sock ] && [ ! -S /run/docker.sock ]; } || recusar SOCKET_DOCKER
${
  vazio
    ? pastas
        .map((p) => {
          // Único alias conhecido na imagem fixada; o pedido Docker continua literal.
          const canonico = p === "/var/run/postgresql" ? "/run/postgresql" : p;
          return `[ "$(readlink -f ${p})" = '${canonico}' ] || recusar TMPFS_CAMINHO\n[ "$(stat -c '%u:%g:%a' ${p})" = '${uid}:${uid}:700' ] || recusar TMPFS_PROPRIEDADE\nconteudo=$(find ${p} -mindepth 1 -maxdepth 1 -print -quit) || recusar TMPFS_VAZIO\n[ -z "$conteudo" ] || recusar TMPFS_VAZIO\nawk '$5=="${canonico}" {n++; if($0 !~ / - tmpfs / || $6 !~ /(^|,)rw(,|$)/ || $6 !~ /(^|,)nosuid(,|$)/ || $6 !~ /(^|,)nodev(,|$)/) ruim=1} END {if(n!=1 || ruim) exit 1}' /proc/self/mountinfo || recusar TMPFS_MONTAGEM`;
        })
        .join("\n")
    : ""
}
${vazio ? "awk 'NR>1 && $4==\"0A\" {exit 1}' /proc/net/tcp" : 'awk \'NR>1 && $4=="0A" {if($2!="0100007F:1538") exit 1; n++} END {if(n!=1) exit 1}\' /proc/net/tcp'} || recusar LISTENERS_IPV4
awk 'NR>1 && $4=="0A" {exit 1}' /proc/net/tcp6 || recusar LISTENERS_IPV6
readlink /proc/self/ns/net || recusar NAMESPACE
`;
}
try {
  assert.deepEqual(
    process.argv.slice(2),
    ["--executar"],
    "uso: restauracao-url.sh --executar; não há skip implícito",
  );
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, "exige daemon local padrão");
  base = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "frequenciapp-url-"));
  fs.chmodSync(base, 0o700);
  assert.equal(fs.statSync(base).uid, process.getuid());
  console.log(`Evidências privadas: ${base}`);
  const runnerInfo = prepararImagemOrigem(process.env.RESTAURACAO_URL_RUNNER_IMAGE);
  if (!process.env.RESTAURACAO_URL_DB_IMAGE) docker(["pull", postgresReferencia]);
  const dbInfo = inspecionarImagem(
    process.env.RESTAURACAO_URL_DB_IMAGE || postgresReferencia,
    "postgres",
  );
  gravar("imagens.json", JSON.stringify({ db: dbInfo, runner: runnerInfo }, null, 2) + "\n");
  snapshot = path.join(base, "fontes");
  fs.mkdirSync(snapshot, { mode: 0o755 });
  manifesto = {};
  for (const nome of nomes) {
    const fonte = path.join(repo, nome);
    assert.ok(fs.lstatSync(fonte).isFile() && !fs.lstatSync(fonte).isSymbolicLink());
    const dados = fs.readFileSync(fonte);
    manifesto[nome] = hash(dados);
    const destino = path.join(snapshot, nome);
    fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o755 });
    fs.writeFileSync(destino, dados, { mode: 0o444 });
    fs.chmodSync(destino, 0o444);
    for (let p = path.dirname(destino); p.startsWith(snapshot); p = path.dirname(p))
      fs.chmodSync(p, 0o755);
  }
  fs.writeFileSync(path.join(snapshot, "manifesto.json"), JSON.stringify(manifesto) + "\n", {
    mode: 0o444,
  });
  fs.chmodSync(path.join(snapshot, "manifesto.json"), 0o444);
  gravar("sha256.json", JSON.stringify(manifesto, null, 2) + "\n");
  ids = {
    formato: 2,
    token,
    dbImagem: dbInfo.Id,
    runnerImagem: runnerInfo.Id,
    status: "preparado",
  };
  salvar();
  const comum = [
    "--read-only",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "128",
    "--restart",
    "no",
    "--no-healthcheck",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--entrypoint",
    "/bin/bash",
  ];
  const acrescimosDB = { PGPASSWORD: "senha_sintetica", HOME: "/tmp", TMPDIR: "/tmp" };
  dbEnv = { ...envMapa(dbInfo.Config.Env), ...acrescimosDB };
  registrar(
    "db",
    docker([
      "create",
      "--name",
      `freq-url-db-${token}`,
      "--label",
      `${label}=${token}`,
      "--label",
      `${label}.papel=db`,
      "--network",
      "none",
      ...comum,
      "--user",
      "999:999",
      "--workdir",
      "/tmp",
      ...tmpfsArgs(tmpfsDB),
      ...envArgs(acrescimosDB),
      ids.dbImagem,
      ...dbCmd,
    ]),
  );
  conferir(ids.db, "db", "criado");
  docker(["start", ids.db]);
  conferir(ids.db, "db", "rodando");
  const acrescimos = {
    PGPASSWORD: "senha_sintetica",
    TMPDIR: "/tmp",
    URL_ENSAIO_SINTETICO: "namespace-verificado-pelo-launcher",
    DATABASE_URL: "",
    DIRECT_URL: "",
    DOCKER_HOST: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
  };
  runnerEnv = { ...envMapa(runnerInfo.Config.Env), ...acrescimos };
  registrar(
    "runner",
    docker([
      "create",
      "--name",
      `freq-url-runner-${token}`,
      "--label",
      `${label}=${token}`,
      "--label",
      `${label}.papel=runner`,
      "--network",
      `container:${ids.db}`,
      ...comum,
      "--user",
      "1000:1000",
      ...tmpfsArgs(tmpfsRunner),
      "--mount",
      `type=bind,src=${snapshot},dst=/repo,readonly`,
      "--workdir",
      "/repo",
      ...envArgs(acrescimos),
      ids.runnerImagem,
      ...runnerCmd,
    ]),
  );
  conferir(ids.runner, "runner", "criado");
  docker(["start", ids.runner]);
  conferir(ids.runner, "runner", "rodando");
  const nsDB = docker(["exec", "-i", ids.db, "bash", "-s"], probe("db", true));
  const nsRunner = docker(["exec", "-i", ids.runner, "bash", "-s"], probe("runner", true));
  assert.match(nsDB, /^net:\[\d+\]$/);
  assert.equal(nsDB, nsRunner);
  const leitura = `import fs from 'node:fs'; import {createHash} from 'node:crypto'; const m=JSON.parse(fs.readFileSync('/repo/manifesto.json')); for(const [n,h] of Object.entries(m)) {if(createHash('sha256').update(fs.readFileSync('/repo/'+n)).digest('hex')!==h) throw Error('Fonte divergente');} console.log('fontes-confirmadas');`;
  assert.equal(
    docker(["exec", ids.runner, "node", "--input-type=module", "-e", leitura]),
    "fontes-confirmadas",
  );
  conferirFontes();
  ids.status = "vazio-isolamento-ownership-confirmados";
  salvar();
  conferir(ids.db, "db", "rodando");
  const bootstrap = `set -eu
umask 077
printf '%s\\n' "$PGPASSWORD" > /tmp/senha-init
initdb -D "$PGDATA" -U sintetico --auth-local=reject --auth-host=scram-sha-256 --pwfile=/tmp/senha-init --no-locale --encoding=UTF8 > /tmp/initdb.log 2>&1
rm /tmp/senha-init
printf "\\nlisten_addresses='127.0.0.1'\\nport=5432\\nunix_socket_directories='/var/run/postgresql'\\npassword_encryption='scram-sha-256'\\n" >> "$PGDATA/postgresql.conf"
pg_ctl -D "$PGDATA" -l /tmp/postgres.log -w -t 30 start > /tmp/pg-ctl.log 2>&1
`;
  docker(["exec", "-i", ids.db, "bash", "-s"], bootstrap);
  assert.equal(docker(["exec", "-i", ids.db, "bash", "-s"], probe("db", false)), nsDB);
  assert.equal(docker(["exec", "-i", ids.runner, "bash", "-s"], probe("runner", false)), nsDB);
  const consulta =
    "SELECT json_build_object('banco',current_database(),'usuario',current_user,'versao',current_setting('server_version_num')::integer,'endereco',inet_server_addr()::text,'porta',inet_server_port(),'sistema',c.system_identifier::text,'inicio',pg_postmaster_start_time()::text,'oid',d.oid::bigint,'bases',(SELECT string_agg(datname,',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate),'tabelas',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'roles',(SELECT count(*) FROM pg_roles WHERE rolname !~ '^pg_')) FROM pg_control_system() c, pg_database d WHERE d.datname=current_database()";
  const identidade = JSON.parse(
    docker([
      "exec",
      "--env",
      "PGOPTIONS=-c default_transaction_read_only=on",
      ids.db,
      "psql",
      "--dbname",
      "postgresql://sintetico@127.0.0.1:5432/postgres",
      "-wXqAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      consulta,
    ]),
  );
  assert.equal(identidade.banco, "postgres");
  assert.equal(identidade.usuario, "sintetico");
  assert.ok(identidade.versao >= 170000 && identidade.versao < 180000);
  assert.equal(identidade.endereco, "127.0.0.1/32");
  assert.equal(identidade.porta, 5432);
  assert.equal(identidade.bases, "postgres");
  assert.equal(identidade.tabelas, 0);
  assert.equal(identidade.roles, 1);
  assert.match(identidade.sistema, /^\d+$/);
  gravar("identidade.json", JSON.stringify(identidade, null, 2) + "\n");
  docker(
    ["exec", "-i", ids.runner, "bash", "-c", "umask 077; cat > /tmp/identidade-url.json"],
    JSON.stringify(identidade),
  );
  ids.status = "servidor-autenticado-vazio";
  salvar();
  conferir(ids.runner, "runner", "rodando");
  conferir(ids.db, "db", "rodando");
  conferirFontes();
  docker(["exec", ids.runner, "touch", "/tmp/iniciar-url"]);
  // O shell espera e reaproveita o filho; mantém tmpfs montado somente para a coleta.
  const prazoDriver = Date.now() + 240000;
  let fimDriver;
  while (Date.now() < prazoDriver) {
    const observado = docker([
      "exec",
      ids.runner,
      "bash",
      "-c",
      'set -eu; if [ -f /tmp/driver-fim ]; then IFS=: read -r filho codigo < /tmp/driver-fim; if kill -0 "$filho" 2>/dev/null; then exit 78; fi; printf \'%s:%s\' "$filho" "$codigo"; else printf pendente; fi',
    ]);
    if (observado !== "pendente") {
      assert.match(observado, /^[1-9][0-9]*:[0-9]+$/);
      fimDriver = observado.split(":");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(fimDriver, "driver não confirmou término no prazo; recursos preservados");
  ids.driverFinal = {
    pid: Number(fimDriver[0]),
    codigo: Number(fimDriver[1]),
    waitShell: true,
    ausente: true,
  };
  salvar();
  gravar("execucao.log", docker(["logs", ids.runner]) + "\n");
  conferir(ids.runner, "runner", "rodando");
  conferir(ids.db, "db", "rodando");
  // Coleta antes de desmonte do tmpfs ou parada; falha preserva ambos os recursos.
  const coletas = {
    runner: coletarArtefatosUrl(
      "runner",
      ids.runner,
      path.join(base, "coleta-runner"),
      dockerBinario,
    ),
    db: coletarArtefatosUrl("db", ids.db, path.join(base, "coleta-db"), dockerBinario),
  };
  gravar("coletas.json", JSON.stringify(coletas, null, 2) + "\n");
  assert.equal(ids.driverFinal.codigo, 0, "driver URL falhou; recursos preservados");
  conferir(ids.runner, "runner", "rodando");
  conferir(ids.db, "db", "rodando");
  conferirFontes();
  const resultado = JSON.parse(
    fs.readFileSync(path.join(base, "coleta-runner/resultado-url/resumo.json")),
  );
  assert.deepEqual(
    resultado.resultados.map((r) => r.cenario),
    ["positivo-real", "mesma-base", "alias", "checksum", "sem-permissao", "erro-destino-transacao"],
  );
  assert.deepEqual(
    resultado.resultados.map((r) => r.codigo),
    [0, 1, 1, 1, 1, 1],
  );
  assert.ok(resultado.resultados.every((r) => r.sinal === null));
  assert.deepEqual(resultado.fontes, manifesto);
  assert.equal(resultado.dumpIntacto, true);
  docker(["exec", ids.runner, "touch", "/tmp/coleta-concluida"]);
  gravar("acompanhamento.log", docker(["logs", "--follow", ids.runner]) + "\n");
  assert.equal(docker(["wait", ids.runner]), "0");
  conferir(ids.runner, "runner", "terminado");
  ids.runnerFinal = { parado: true, codigo: 0, wait: "0", acompanhamento: 0 };
  salvar();
  // Só os IDs próprios conferidos; sem remoção nem adoção por nome/projeto.
  docker([
    "exec",
    ids.db,
    "pg_ctl",
    "-D",
    "/var/lib/postgresql/data",
    "-m",
    "fast",
    "-w",
    "-t",
    "30",
    "stop",
  ]);
  conferir(ids.db, "db", "rodando");
  docker(["stop", "--time", "10", ids.db]);
  assert.equal(docker(["wait", ids.db]), "0");
  conferir(ids.db, "db", "terminado");
  ids.dbFinal = { parado: true, codigo: 0, wait: "0" };
  ids.status = "concluido";
  salvar();
  console.log(
    JSON.stringify({
      status: "sucesso",
      cenarios: 6,
      evidencias: base,
      recursos: "parados-preservados-sem-remocao",
    }),
  );
} catch (erro) {
  if (ids) {
    ids.status = "falha-preservada";
    try {
      salvar();
    } catch {}
  }
  console.error(
    `Ensaio URL falhou; nenhum recurso será limpo ou adotado automaticamente. ${base ? `IDs e fontes: ${base}` : "Nenhum journal criado."}`,
  );
  console.error(erro instanceof Error ? erro.message : "Falha sem diagnóstico seguro.");
  process.exitCode = 1;
}
