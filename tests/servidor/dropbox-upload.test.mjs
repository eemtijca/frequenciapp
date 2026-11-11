// Exercita a janela entre upload Bash, publicação e expurgo HTTPS concorrentes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fixtureDropbox, sha } from "./dropbox-api-falso.mjs";
import { identidadeCompose } from "../../scripts/servidor/identidade.mjs";

const cliente = `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const tipo=path.basename(process.argv[1]), a=process.argv.slice(2);
const negar=()=>process.exit(91);
if(tipo==='docker') {
 const d=JSON.parse(fs.readFileSync(process.env.FALSO_DOCKER));
 if(a[0]==='info') process.stdout.write(JSON.stringify(d.daemon));
 else if(a[0]==='inspect') process.stdout.write(JSON.stringify(d.containers));
 else if(a[0]==='compose') {
  const x=a.indexOf('exec');
  if(a.includes('config')) { if(a.includes('--services')) process.stdout.write('app\\ndb\\ncaddy\\n'); else if(a.includes('--format')) process.stdout.write(JSON.stringify(d.config)); }
  else if(a.includes('ps')) process.stdout.write('db-falso\\napp-falso\\n');
  else if(x>=0 && a[x+3]==='psql') process.stdout.write('escola\\n');
  else if(x>=0 && a[x+3]==='pg_dump') process.stdout.write('DUMP FALSO\\n');
  else if(x>=0 && a[x+3]==='pg_restore') fs.readFileSync(0);
  else negar();
 } else negar();
} else if(tipo==='age') {
 if(a.length!==4||a[0]!=='--recipients-file'||a[2]!=='--output') negar();
 fs.writeFileSync(a[3],fs.readFileSync(0));
} else if(tipo==='rclone') {
 const ini=fs.readFileSync(process.env.RCLONE_CONFIG,'utf8'), c=JSON.parse(fs.readFileSync(ini.split('\\n').find(l=>l.startsWith('#fixture=')).slice(9)));
 const remoto=n=>{if(!n.startsWith('falso:copias/')||n.slice(13).includes('/')) negar(); return path.join(c.remoto,path.basename(n));};
 fs.appendFileSync(c.log,JSON.stringify({acao:a[0],upload:!a[1].startsWith('falso:')})+'\\n');
 if(a[0]==='copy') {
  const nomes=fs.readdirSync(a[1]); fs.copyFileSync(path.join(a[1],nomes[0]),remoto(a[2]+'/'+nomes[0]));
  fs.writeFileSync(c.entrou,'upload parcial');
  while(!fs.existsSync(c.liberar)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
  if(c.falhar) process.exit(42);
  for(const n of nomes.slice(1)) fs.copyFileSync(path.join(a[1],n),remoto(a[2]+'/'+n));
 } else if(a[0]==='copyto') {
  if(a[1].startsWith('falso:')) fs.copyFileSync(remoto(a[1]),a[2]);
  else fs.copyFileSync(a[1],remoto(a[2]));
 } else negar();
} else negar();
`;
const esperar = async (predicado, motivo) => {
  const fim = Date.now() + 10000;
  while (!predicado()) {
    assert.ok(Date.now() < fim, motivo);
    await new Promise((r) => setTimeout(r, 10));
  }
};
function iniciarBackup(env) {
  const p = spawn("bash", ["scripts/servidor/backup-banco.sh"], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  p.stdout.on("data", (c) => (stdout += c));
  p.stderr.on("data", (c) => (stderr += c));
  const timer = setTimeout(() => process.kill(-p.pid, "SIGKILL"), 25000);
  const resultado = new Promise((resolve, reject) => {
    p.on("error", reject);
    p.on("close", (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
  return { p, resultado };
}
async function preparar() {
  const f = await fixtureDropbox(3);
  const dir = (n) => {
    const p = path.join(f.tmp, n);
    fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    return p;
  };
  const estado = dir("estado"),
    catalogo = dir("estado/recibos"),
    diarios = dir("estado/expurgos"),
    bin = dir("bin"),
    checkout = dir("checkout-app");
  f.gravar(
    path.join(checkout, "compose.yml"),
    "# Fonte da aplicação sintética, sem módulos operacionais.\n",
  );
  for (const n of fs.readdirSync(f.catalogo))
    fs.copyFileSync(path.join(f.catalogo, n), path.join(catalogo, n));
  const config = {
    name: "sintetico",
    services: { app: {}, db: { volumes: [{ type: "volume", source: "dados", target: "/db" }] } },
    volumes: { dados: { name: "volume-falso" } },
  };
  const containers = [
    {
      Id: "db-falso",
      Config: {
        Labels: { "com.docker.compose.project": "sintetico", "com.docker.compose.service": "db" },
      },
      Mounts: [{ Type: "volume", Name: "volume-falso", Source: "/FALSO", Destination: "/db" }],
    },
    {
      Id: "app-falso",
      Config: {
        Labels: { "com.docker.compose.project": "sintetico", "com.docker.compose.service": "app" },
      },
      Mounts: [],
    },
  ];
  const daemon = { ID: "daemon-falso" };
  const identidade = identidadeCompose(config, daemon, containers, {
    projeto: "sintetico",
    app: "app",
    db: "db",
  });
  f.gravar(path.join(f.tmp, "identidade.json"), JSON.stringify(identidade));
  f.gravar(path.join(f.tmp, "docker.json"), JSON.stringify({ config, containers, daemon }));
  f.gravar(path.join(bin, "cliente.mjs"), cliente);
  fs.chmodSync(path.join(bin, "cliente.mjs"), 0o700);
  for (const n of ["docker", "age", "rclone"]) fs.symlinkSync("cliente.mjs", path.join(bin, n));
  for (const n of ["app.env", "ops.env", "age.txt"])
    f.gravar(path.join(f.tmp, n), "FALSO=nao-segredo\n");
  const log = path.join(f.tmp, "clientes.jsonl"),
    entrou = path.join(f.tmp, "entrou"),
    liberar = path.join(f.tmp, "liberar");
  f.gravar(log, "");
  const transporte = path.join(f.tmp, "cliente.json");
  f.gravar(transporte, JSON.stringify({ remoto: f.remoto, log, entrou, liberar }));
  const ini = `#fixture=${transporte}\n${fs.readFileSync(f.rclone, "utf8")}`;
  f.gravar(f.rclone, ini);
  Object.assign(f.config, {
    alvo: identidade.trava,
    minimoAutorizado: 1,
    rcloneConfigSha256: sha(ini),
    timeoutMs: 20000,
  });
  // Os recibos antigos têm a mesma identidade Compose, estabelecida independentemente.
  for (const n of fs.readdirSync(catalogo)) {
    const r = JSON.parse(fs.readFileSync(path.join(catalogo, n)));
    r.escopo.alvo = identidade.trava;
    f.gravar(path.join(catalogo, n), JSON.stringify(r) + "\n");
    f.gravar(path.join(f.remoto, n), JSON.stringify(r) + "\n");
  }
  const envs = [];
  for (let i = 1; i <= 2; i++) {
    const locks = dir(`locks${i}`),
      lock = path.join(locks, `operacoes-${identidade.trava}.lock`),
      adocao = path.join(f.tmp, `adocao${i}.json`);
    f.gravar(lock, "");
    f.gravar(adocao, JSON.stringify({ ...f.config, targetLock: lock }));
    envs.push({
      ...f.env,
      PATH: `${bin}:${process.env.PATH}`,
      NODE_ENV: "test",
      SERVIDOR_AMBIENTE_INJETADO: "true",
      APP_DIR: checkout,
      APP_ENV_FILE: path.join(f.tmp, "app.env"),
      OPS_ENV_FILE: path.join(f.tmp, "ops.env"),
      ESTADO_DIR: estado,
      BACKUP_DIR: f.tmp,
      BACKUP_BANCO_DIR: dir(`banco${i}`),
      SERVIDOR_LOCK_DIR: locks,
      SERVIDOR_LOCK_HERDADO: "",
      COMPOSE_PROJECT_NAME: "sintetico",
      COMPOSE_ARQUIVOS: "compose.yml",
      SERVIDOR_IDENTIDADE_ARQUIVO: path.join(f.tmp, "identidade.json"),
      BACKUP_PLANILHAS_HABILITADO: "false",
      FALSO_DOCKER: path.join(f.tmp, "docker.json"),
      POSTGRES_DB: "escola",
      BACKUP_CRIPTOGRAFIA: "age",
      BACKUP_AGE_DESTINATARIOS: path.join(f.tmp, "age.txt"),
      BACKUP_AGE_DESTINATARIOS_SHA256: sha(fs.readFileSync(path.join(f.tmp, "age.txt"))),
      BACKUP_INCLUIR_AMBIENTE: "false",
      BACKUP_ESPACO_MINIMO_MB: "0",
      BACKUP_RCLONE_CONFIG: f.rclone,
      BACKUP_DROPBOX_CONFIG: adocao,
      NODE_OPTIONS: `--import=${f.preload}`,
      BACKUP_VERIFICAR_REMOTO: "true",
      BACKUP_RETER_REMOTO: "true",
      BACKUP_RETER_MINIMO: "1",
      SERVIDOR_ALVO_CHAVE: identidade.trava,
    });
  }
  let rev = 400000000;
  const hashes = new Map();
  f.state.hook = ({ req }) => {
    if (req.url !== "/2/files/list_folder") return false;
    for (const n of fs.readdirSync(f.remoto)) {
      const h = sha(fs.readFileSync(path.join(f.remoto, n)));
      if (!f.objects.has(n))
        f.objects.set(n, { id: `id:novo_${++rev}`, rev: (++rev).toString(16).padStart(9, "0") });
      else if (hashes.get(n) !== h) f.objects.get(n).rev = (++rev).toString(16).padStart(9, "0");
      hashes.set(n, h);
    }
    for (const n of f.objects.keys())
      if (!fs.existsSync(path.join(f.remoto, n))) f.objects.delete(n);
    return false;
  };
  const expurgar = (i) =>
    f.executar(
      {
        ...envs[i],
        SERVIDOR_LOCK_HERDADO: path.join(
          envs[i].SERVIDOR_LOCK_DIR,
          `operacoes-${identidade.trava}.lock`,
        ),
      },
      undefined,
      [],
      { catalogo, diarios },
    );
  return { ...f, estado, catalogo, diarios, envs, log, entrou, liberar, transporte, expurgar };
}

test("upload e publicação Bash excluem dois uploads/expurgos concorrentes e incerteza impede delete", async () => {
  for (const modo of ["integro", "erro-upload", "persistencia-incerta"]) {
    const f = await preparar();
    const filhos = [],
      independentes = [];
    try {
      for (const sessao of ["true", "0".repeat(64)]) {
        const negado = await f.executar(
          {
            ...f.envs[0],
            SERVIDOR_LOCK_HERDADO: path.join(
              f.envs[0].SERVIDOR_LOCK_DIR,
              `operacoes-${f.config.alvo}.lock`,
            ),
            BACKUP_DROPBOX_SESSAO: sessao,
          },
          undefined,
          [],
          { catalogo: f.catalogo, diarios: f.diarios },
        );
        assert.equal(negado.signal, null);
        assert.equal(negado.status, 1);
        assert.equal(f.events.length, 0, "ambiente sem capacidade real não autoriza API");
      }
      if (modo === "erro-upload") {
        const c = JSON.parse(fs.readFileSync(f.transporte));
        f.gravar(f.transporte, JSON.stringify({ ...c, falhar: true }));
      }
      if (modo === "persistencia-incerta") {
        const injecao = path.join(f.tmp, "persistencia.mjs");
        f.gravar(
          injecao,
          `import fs from 'node:fs'; const original=fs.fsyncSync; fs.fsyncSync=function(fd){const p=fs.readlinkSync('/proc/self/fd/'+fd); if(p.startsWith(${JSON.stringify(f.catalogo + "/")})) {process.stderr.write('PERSISTENCIA_INCERTA\\n');throw new Error('falha sintetica');} return original(fd);};`,
        );
        f.envs[0].NODE_OPTIONS += ` --import=${injecao}`;
      }
      const primeiro = iniciarBackup(f.envs[0]);
      filhos.push(primeiro);
      await esperar(() => fs.existsSync(f.entrou), "produtor Bash não chegou ao upload parcial");
      const antes = f.events.length;
      const purge1 = f.expurgar(0);
      independentes.push(purge1);
      const segundo = modo === "integro" ? iniciarBackup(f.envs[1]) : null;
      if (segundo) filhos.push(segundo);
      const purge2 = f.expurgar(1);
      independentes.push(purge2);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(
        f.events.length,
        antes,
        "JANELA_UPLOAD_EXPURGO: a CLI acessou Dropbox enquanto upload parcial detinha autoridade",
      );
      assert.equal(
        fs
          .readFileSync(f.log, "utf8")
          .split("\n")
          .filter(Boolean)
          .map(JSON.parse)
          .filter((e) => e.acao === "copy").length,
        1,
        "segundo upload deve aguardar a mesma autoridade",
      );
      f.gravar(f.liberar, "liberado");
      const r = await primeiro.resultado;
      assert.equal(r.signal, null);
      const statusEsperado = modo === "erro-upload" ? 42 : modo === "integro" ? 0 : 1;
      assert.equal(r.status, statusEsperado, r.stderr);
      const purges = await Promise.all([purge1, purge2]);
      for (const p of purges) {
        assert.equal(p.signal, null);
        assert.equal(p.status, modo === "integro" ? 0 : 1, p.stderr);
      }
      if (segundo) {
        const s = await segundo.resultado;
        assert.equal(s.signal, null);
        assert.equal(s.status, 0, s.stderr);
      }
      const deletes = f.events.filter((e) => e.route === "/2/files/delete_v2");
      if (modo !== "integro") {
        assert.equal(
          deletes.length,
          0,
          "erro/persistência incerta não autoriza exclusão concorrente",
        );
        assert.equal((await f.expurgar(0)).status, 1);
        assert.ok(fs.existsSync(f.config.authorityLock + ".upload.json"));
        if (modo === "persistencia-incerta") assert.match(r.stderr, /PERSISTENCIA_INCERTA/);
      } else {
        assert.ok(deletes.length > 0, "expurgo funcional deve alcançar API real falsa");
        assert.equal(fs.existsSync(f.config.authorityLock + ".upload.json"), false);
        const novos = fs.readdirSync(f.catalogo).filter((n) => !n.includes("20200101T"));
        assert.equal(novos.length, 2, "dois produtores publicaram recibos");
        for (const n of novos) assert.ok(fs.existsSync(path.join(f.remoto, n)));
      }
    } finally {
      if (!fs.existsSync(f.liberar)) f.gravar(f.liberar, "cleanup");
      for (const { p, resultado } of filhos) {
        if (p.exitCode === null && p.signalCode === null) process.kill(-p.pid, "SIGTERM");
        await resultado;
      }
      await Promise.allSettled(independentes);
      await f.fechar();
    }
  }
});
