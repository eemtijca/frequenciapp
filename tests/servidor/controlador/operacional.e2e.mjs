// Exercita instalação e atualização reais com executáveis falsos, sem daemon ou rede.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const repo = "/repo";
const base = "/sandbox";
assert.equal(process.getuid(), 0, "Executar somente como root do contêiner descartável.");
assert.equal(fs.existsSync("/var/run/docker.sock"), false);
assert.equal(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length, 1);
const executar = (cmd, args, env = {}) =>
  spawnSync(cmd, args, {
    encoding: "utf8",
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: base,
      TMPDIR: base,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ALLOW_PROTOCOL: "file",
      ...env,
    },
  });
const ok = (r) => assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
function gravar(p, t, mode = 0o600) {
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, t, { mode });
}
function copiar(origem, destino) {
  if (fs.lstatSync(origem).isDirectory()) {
    fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
    for (const n of fs.readdirSync(origem)) copiar(`${origem}/${n}`, `${destino}/${n}`);
  } else gravar(destino, fs.readFileSync(origem), fs.statSync(origem).mode & 0o111 ? 0o755 : 0o600);
}
function preparar() {
  const raiz = fs.mkdtempSync(`${base}/operacional-`);
  const fonte = `${raiz}/fonte`,
    app = `${raiz}/app`,
    conf = `${raiz}/config`,
    prefixo = `${raiz}/controlador`,
    bin = `${raiz}/bin`;
  copiar(`${repo}/scripts/servidor`, `${fonte}/scripts/servidor`);
  copiar(`${repo}/docker/app/migrar.mjs`, `${fonte}/docker/app/migrar.mjs`);
  fs.mkdirSync(app, { mode: 0o700 });
  copiar(`${fonte}/docker`, `${app}/docker`);
  gravar(`${app}/compose.yml`, "# Configuração sintética sem clientes reais.\nservices: {}\n");
  gravar(`${app}/README.md`, "revisão 1\n");
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "Teste"],
    ["config", "user.email", "teste@escola.exemplo"],
    ["add", "."],
    ["commit", "-qm", "base"],
  ])
    ok(executar("git", ["-C", app, ...args]));
  const revisoes = [executar("git", ["-C", app, "rev-parse", "HEAD"]).stdout.trim()];
  for (const n of [2, 3]) {
    gravar(`${app}/README.md`, `revisão ${n}\n`);
    ok(executar("git", ["-C", app, "commit", "-qam", `revisao ${n}`]));
    revisoes.push(executar("git", ["-C", app, "rev-parse", "HEAD"]).stdout.trim());
  }
  ok(executar("git", ["-C", app, "update-ref", "refs/remotes/origin/main", revisoes[1]]));
  ok(executar("git", ["-C", app, "checkout", "-q", "--detach", revisoes[0]]));
  fs.mkdirSync(bin, { mode: 0o755 });
  gravar(
    `${bin}/docker`,
    `#!/usr/bin/env node
const fs=require('fs'); const a=process.argv.slice(2), r=${JSON.stringify(raiz)};
fs.appendFileSync(r+'/docker.log', JSON.stringify({a,imagem:process.env.APP_IMAGEM,commit:process.env.COMMIT_SHA})+'\\n');
if(a[0]==='info') {console.log('{"ID":"daemon-sintetico"}');process.exit(0)}
if(a[0]==='inspect') {console.log(JSON.stringify([{Id:'container-app',Image:'sha256:app-observada',State:{Running:true,Health:{Status:'healthy'}},Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'app'}},Mounts:[]},{Id:'container-db',Image:'sha256:db-observado',State:{Running:true},Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'db'}},Mounts:[{Type:'volume',Name:'sintetico-dados',Source:'/virtual/dados',Destination:'/var/lib/postgresql/data'}]}]));process.exit(0)}
if(a[0]==='image'&&a[1]==='inspect'){console.log(fs.readFileSync(r+'/build-revisao','utf8'));process.exit(0)}
if(a[0]==='run'){process.stdout.write(fs.readFileSync(${JSON.stringify(fonte)}+'/docker/app/migrar.mjs'));process.exit(0)}
if(a[0]==='tag')process.exit(0);
if(a[0]!=='compose')process.exit(91);
let i=1;while(['--project-name','--project-directory','--env-file','-f','--profile'].includes(a[i]))i+=2;
const c=a[i], tail=a.slice(i+1);
if(c==='config'){if(tail.includes('--services'))console.log('app\\ndb\\ncaddy');if(tail.includes('json'))console.log(JSON.stringify({name:'sintetico',services:{app:{},db:{volumes:[{type:'volume',source:'dados',target:'/var/lib/postgresql/data'}]},caddy:{}},volumes:{dados:{name:'sintetico-dados'}}}));process.exit(0)}
if(c==='ps'){console.log(tail.includes('-aq')?'container-app\\ncontainer-db':'container-app');process.exit(0)}
if(c==='exec' && tail.at(-1)==='SELECT current_database();'){console.log('frequencia');process.exit(0)}
if(c==='up'){
 fs.appendFileSync(r+'/up.log',process.env.COMMIT_SHA+'\\n');
 const modo=fs.existsSync(r+'/modo-up')?fs.readFileSync(r+'/modo-up','utf8'):'';
 if(modo==='falhar')process.exit(37);
 if(modo==='persistir'){
  const stat=fs.readFileSync('/proc/'+process.ppid+'/stat','utf8').split(') ')[1].split(' ');
  fs.writeFileSync(r+'/up-iniciado.json',JSON.stringify({pid:process.pid,atualizador:process.ppid,controlador:Number(stat[1])}));
  setInterval(()=>{if(fs.existsSync(r+'/liberar-up')){fs.writeFileSync(r+'/up-terminou','sim');process.exit(0)}},20);
 }else process.exit(0);
}
if(c==='build'){fs.writeFileSync(r+'/build-revisao',process.env.COMMIT_SHA);process.exit(0)}
if(c==='pull')process.exit(0);
if(c!=='up')process.exit(92);
`,
    0o755,
  );
  gravar(
    `${bin}/git`,
    `#!/bin/bash\nif [[ " $* " == *" fetch "* ]]; then exit 0; fi\nexec /usr/bin/git "$@"\n`,
    0o755,
  );
  gravar(
    `${fonte}/scripts/servidor/backup-banco.sh`,
    `#!/bin/bash
set -Eeuo pipefail
DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"; . "$DIR/comum.sh"
carregar_ambiente; verificar_instalacao; travar backup-banco 0
mkdir -p "$BACKUP_DIR/banco" "$ESTADO_DIR"
node --input-type=module - "$DIR/recibos.mjs" <<'JS'
import fs from 'node:fs';import {createHash} from 'node:crypto';
const {criarRecibo}=await import(process.argv[2]);
const dir=process.env.BACKUP_DIR+'/banco', base='frequenciapp-20261110T000000Z-'+Math.random().toString(16).slice(2,10).padEnd(8,'0');
const nome=base+'.dump.age', bytes=Buffer.from('dump sintético'), sha=createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(dir+'/'+nome,bytes,{mode:0o600});fs.writeFileSync(dir+'/'+nome+'.sha256',sha+'  '+nome+'\\n',{mode:0o600});
// Recibo validado pelo contrato real, usando o comando público de criação.
fs.writeFileSync(process.env.ESTADO_DIR+'/fixture-base',base,{mode:0o600});
JS
base=$(cat "$ESTADO_DIR/fixture-base")
BACKUP_DESTINATARIO_VERIFICADO=$(printf fixture | sha256sum | cut -d' ' -f1) RECIBO_REMOTO_VERIFICADO=false BACKUP_CRIPTOGRAFIA=age DATABASE_SCHEMA=public BACKUP_BANCO_VERIFICADO=frequencia node "$DIR/recibos.mjs" criar "$BACKUP_DIR/banco" "$base" >"$BACKUP_DIR/banco/$base.confirmado.json"
node - "$base" <<'JS'
const fs=require('fs'),b=process.argv[2],r=JSON.parse(fs.readFileSync(process.env.BACKUP_DIR+'/banco/'+b+'.confirmado.json'));const a=r.artefatos.find(a=>a.nome.includes('.dump.')&&!a.nome.endsWith('.sha256'));fs.writeFileSync(process.env.ESTADO_DIR+'/ultimo-backup.json',JSON.stringify({arquivo:a.nome,sha256:a.sha256,recibo:b+'.confirmado.json',verificadoRemoto:false}),{mode:0o600});
JS
`,
    0o755,
  );
  fs.mkdirSync(conf, { mode: 0o700 });
  gravar(`${conf}/app.env`, "POSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\n");
  gravar(
    `${conf}/ops.env`,
    `COMPOSE_PROJECT_NAME=sintetico\nCOMPOSE_ARQUIVOS=compose.yml\nBACKUP_PLANILHAS_HABILITADO=false\nATUALIZAR_MODO=main\nATUALIZAR_PERMITIR_BACKUP_LOCAL=true\nATUALIZAR_ESPACO_MINIMO_MB=0\nATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false\nTZ_APP=UTC\nCRON_FUSO_SISTEMA=UTC\n`,
  );
  const env = {
    APP_DIR: app,
    APP_ENV_FILE: `${conf}/app.env`,
    OPS_ENV_FILE: `${conf}/ops.env`,
    SERVIDOR_CONFIG_DIR: conf,
    SERVIDOR_LOCK_DIR: `${raiz}/locks`,
    PATH: `${bin}:/usr/local/bin:/usr/bin:/bin`,
  };
  copiar(`${app}/compose.yml`, `${fonte}/compose.yml`);
  ok(
    executar("/bin/bash", [`${fonte}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"], {
      ...env,
      APP_DIR: fonte,
    }),
  );
  const args = [
    "--fonte",
    fonte,
    "--app",
    app,
    "--config",
    conf,
    "--prefixo",
    prefixo,
    "--operador",
    "nobody",
    "--bin-dir",
    bin,
  ];
  return { raiz, fonte, app, conf, prefixo, bin, revisoes, args, env };
}

test("instala em prefixo privado, plano sem escrita e duas atualizações pelo snapshot estável", () => {
  const f = preparar();
  const instalador = `${repo}/scripts/servidor/instalar-controlador.sh`;
  assert.ok(fs.existsSync(instalador), "Falta controlador operacional instalável.");
  ok(executar("/bin/bash", [instalador, ...f.args, "--plano"]));
  assert.equal(fs.existsSync(f.prefixo), false);
  ok(executar("/bin/bash", [instalador, ...f.args, "--confirmar"]));
  const entrada = `${f.prefixo}/executar`;
  ok(executar(entrada, ["atualizar"]));
  ok(executar("git", ["-C", f.app, "update-ref", "refs/remotes/origin/main", f.revisoes[2]]));
  ok(executar(entrada, ["atualizar"]));
  const journalAntes = fs.readdirSync(`${f.prefixo}/dados/journal`);
  ok(executar(entrada, ["atualizar"]));
  assert.deepEqual(
    fs.readdirSync(`${f.prefixo}/dados/journal`),
    journalAntes,
    "No-op não cria intenção, conclusão nem pin.",
  );
  ok(executar(entrada, ["estado"]));
  assert.deepEqual(
    fs.readFileSync(`${f.raiz}/up.log`, "utf8").trim().split("\n"),
    f.revisoes.slice(1),
  );
  const journals = fs.readdirSync(`${f.prefixo}/dados/journal`);
  assert.equal(journals.length, 2);
  for (const nome of journals) {
    const pasta = `${f.prefixo}/dados/journal/${nome}`;
    assert.ok(fs.existsSync(`${pasta}/intencao.json`));
    assert.ok(fs.existsSync(`${pasta}/concluida.json`));
    assert.ok(
      fs.readdirSync(`${f.prefixo}/dados/pins/${nome}`).some((n) => n.endsWith(".dump.age")),
    );
  }
  assert.equal(executar("git", ["-C", f.app, "rev-parse", "HEAD"]).stdout.trim(), f.revisoes[2]);
  assert.equal(
    fs.existsSync(`${f.app}/scripts/servidor/atualizar.sh`),
    false,
    "A fonte nova não recebe poderes do snapshot.",
  );
});

test("cron em prefixo temporário aponta somente para a entrada estável adotada", () => {
  const f = preparar();
  ok(
    executar("/bin/bash", [
      `${repo}/scripts/servidor/instalar-controlador.sh`,
      ...f.args,
      "--confirmar",
    ]),
  );
  const destino = `${f.raiz}/etc`;
  fs.mkdirSync(destino, { mode: 0o700 });
  const args = ["--perfil", `${f.prefixo}/perfil.json`, "--destino", destino];
  const plano = executar("/bin/bash", [
    `${repo}/scripts/servidor/instalar-rotinas.sh`,
    ...args,
    "--plano",
  ]);
  ok(plano);
  assert.ok(plano.stdout.includes(`${f.prefixo}/executar`));
  assert.equal(fs.existsSync(`${destino}/cron.d/frequenciapp`), false);
  ok(
    executar("/bin/bash", [`${repo}/scripts/servidor/instalar-rotinas.sh`, ...args, "--confirmar"]),
  );
  const cron = fs.readFileSync(`${destino}/cron.d/frequenciapp`, "utf8");
  assert.ok(cron.includes(`root ${f.prefixo}/executar backup-banco`));
  assert.equal(cron.includes(`${f.app}/scripts`), false);
  assert.equal(cron.includes("nobody "), false);
});

test("entrada Compose não concede mutações arbitrárias nem carrega clientes antes da recusa", () => {
  const f = preparar(),
    log = fs.readFileSync(`${f.raiz}/docker.log`, "utf8");
  const r = executar("/bin/bash", [`${f.fonte}/scripts/servidor/compose.sh`, "up", "-d"], f.env);
  assert.equal(r.status, 78, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(`${f.raiz}/docker.log`, "utf8"), log);
  assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
});

// Casos vindos dos Bash usam a adoção real; somente os clientes são dublês.
function prepararHistorico(config = {}, controle = {}) {
  const f = preparar();
  f.controle = `${f.raiz}/controle.json`;
  f.estado = `${f.prefixo}/dados/estado`;
  f.entrada = `${f.prefixo}/executar`;
  gravar(f.controle, JSON.stringify(controle));
  for (const [nome, valor] of Object.entries(config)) {
    assert.match(nome, /^[A-Z_]+$/);
    assert.equal(/[\n'\0]/.test(String(valor)), false);
    fs.appendFileSync(`${f.conf}/ops.env`, `${nome}='${valor}'\n`);
  }
  // Transporte Git local real, inclusive fetch; só as falhas pontuais são falsas.
  ok(executar("git", ["clone", "--bare", "--quiet", f.app, `${f.raiz}/remoto.git`]));
  ok(
    executar("git", [
      "--git-dir",
      `${f.raiz}/remoto.git`,
      "update-ref",
      "refs/heads/main",
      f.revisoes[1],
    ]),
  );
  ok(executar("git", ["-C", f.app, "remote", "add", "origin", `${f.raiz}/remoto.git`]));
  gravar(
    `${f.bin}/git`,
    `#!/bin/bash
if [ -e '${f.raiz}/diff-falha' ] && [[ " $* " == *" diff --name-only "* ]]; then
 printf diff >'${f.raiz}/diff-injetado'; exit 42
fi
if [ -e '${f.raiz}/limpeza-falha' ] && [[ " $* " == *" worktree remove "* ]]; then
 printf limpeza >'${f.raiz}/limpeza-injetada'; exit 61
fi
exec /usr/bin/git "$@"
`,
    0o755,
  );
  gravar(
    `${f.bin}/docker`,
    `#!/usr/bin/env node
const fs=require('node:fs'), {spawnSync}=require('node:child_process');
const a=process.argv.slice(2), r=${JSON.stringify(f.raiz)}, app=${JSON.stringify(f.app)}, conf=${JSON.stringify(f.conf)};
const c=JSON.parse(fs.readFileSync(r+'/controle.json'));
const marca=(n)=>fs.writeFileSync(r+'/'+n,'injetado');
fs.appendFileSync(r+'/docker.log',JSON.stringify({a,imagem:process.env.APP_IMAGEM,backup:process.env.APP_IMAGEM_BACKUP,commit:process.env.COMMIT_SHA})+'\\n');
if(a[0]==='info'){console.log('{"ID":"daemon-sintetico"}');process.exit(0)}
if(a[0]==='inspect'){
 console.log(JSON.stringify([{Id:'container-app',Image:'sha256:app-observada',State:{Running:true,Health:{Status:'healthy'}},Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'app'}},Mounts:[]},{Id:'container-db',Image:'sha256:db-observado',State:{Running:true},Config:{Labels:{'com.docker.compose.project':'sintetico','com.docker.compose.service':'db'}},Mounts:[{Type:'volume',Name:'sintetico-dados',Source:'/virtual/dados',Destination:'/var/lib/postgresql/data'}]}]));process.exit(0)
}
if(a[0]==='image'&&a[1]==='inspect'){console.log(c.revisaoErrada?'revisao-divergente':fs.readFileSync(r+'/build-revisao','utf8'));process.exit(0)}
if(a[0]==='run'){process.stdout.write(fs.readFileSync(${JSON.stringify(f.fonte)}+'/docker/app/migrar.mjs'));process.exit(0)}
if(a[0]!=='compose')throw Error('Docker inesperado: '+a);
let i=1;while(['--project-name','--project-directory','--env-file','-f','--profile'].includes(a[i]))i+=2;
const cmd=a[i],tail=a.slice(i+1), projeto=a[a.indexOf('--project-directory')+1];
if(cmd==='config'){
 const head=spawnSync('/usr/bin/git',['-C',app,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
 if(tail.includes('json')&&projeto===app&&c.identidadeAlvo&&head===c.alvo){marca('identidade-injetada');process.exit(41)}
 if(tail.includes('json')&&projeto===app&&c.identidadeRollback&&fs.existsSync(r+'/up.log')&&head!==c.alvo){marca('rollback-injetado');process.exit(41)}
 if(tail.includes('--services'))console.log('app\\ndb\\ncaddy'+(process.env.BACKUP_PLANILHAS_HABILITADO==='true'?'\\nbackup-planilhas':''));
 if(tail.includes('json'))console.log(JSON.stringify({name:'sintetico',services:{app:{},db:{volumes:[{type:'volume',source:'dados',target:'/var/lib/postgresql/data'}]},caddy:{}},volumes:{dados:{name:'sintetico-dados'}}}));process.exit(0)
}
if(cmd==='ps'){console.log(tail.includes('-aq')?'container-app\\ncontainer-db':'container-app');process.exit(0)}
if(cmd==='exec'&&tail.at(-1)==='SELECT current_database();'){console.log('frequencia');process.exit(0)}
if(cmd==='build'){fs.writeFileSync(r+'/build-revisao',process.env.COMMIT_SHA);if(c.build){marca('build-injetado');process.exit(c.build)}process.exit(0)}
if(cmd==='up'){
 fs.appendFileSync(r+'/up.log',process.env.COMMIT_SHA+'\\n');
 if(c.ca){fs.unlinkSync(c.ca);marca('ca-injetada')}
 if(c.apagarIdentidade){fs.unlinkSync(conf+'/identidade.json');marca('identidade-removida')}
 if(c.falhaConcorrente){fs.copyFileSync(r+'/falha-original.json',process.env.ESTADO_DIR+'/falha.json');marca('falha-concorrente')}
 if(c.sigkill){marca('sigkill-injetado');process.kill(process.ppid,'SIGKILL');process.exit(0)}
 if(c.up){marca('up-injetado');process.exit(c.up)}process.exit(0)
}
throw Error('Compose inesperado: '+cmd+' '+tail);
`,
    0o755,
  );
  // O produtor falso cria artefatos/recibo pelo contrato real antes de variar o ponteiro.
  const backup = `${f.fonte}/scripts/servidor/backup-banco.sh`;
  const texto = fs.readFileSync(backup, "utf8");
  assert.equal(texto.split("RECIBO_REMOTO_VERIFICADO=false").length, 2);
  gravar(
    backup,
    texto.replace(
      "RECIBO_REMOTO_VERIFICADO=false",
      'RECIBO_REMOTO_VERIFICADO="${FALSO_REMOTO_RECIBO:-false}"',
    ) +
      `
node - <<'JS'
const fs=require('node:fs'),p=process.env.ESTADO_DIR+'/ultimo-backup.json';
const r=JSON.parse(fs.readFileSync(p)),v=process.env.FALSO_REMOTO_PONTEIRO;
if(v==='true')r.verificadoRemoto=true;
else if(v==='string')r.verificadoRemoto='true';
else if(v==='null')r.verificadoRemoto=null;
else if(v==='ausente')delete r.verificadoRemoto;
fs.writeFileSync(p,v==='truncado'?'{':JSON.stringify(r));
fs.appendFileSync(process.env.ESTADO_DIR+'/backup-chamadas','backup\\n');
JS
`,
    0o755,
  );
  gravar(
    `${f.bin}/curl`,
    `#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2);
if(a.at(-1)!=='https://alerta.invalid/hook')throw Error('Rede proibida');
fs.appendFileSync(${JSON.stringify(f.raiz + "/alerta.log")},JSON.stringify(a)+'\\n');
process.exit(71);
`,
    0o755,
  );
  return f;
}
function chamadasHistoricas(f) {
  return fs.readFileSync(`${f.raiz}/docker.log`, "utf8").trim().split("\n").map(JSON.parse);
}
function comandoCompose(c, nome) {
  if (c.a[0] !== "compose") return false;
  let i = 1;
  while (
    ["--project-name", "--project-directory", "--env-file", "-f", "--profile"].includes(c.a[i])
  )
    i += 2;
  return c.a[i] === nome;
}
function statusHistorico(r, codigo, diagnostico) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, codigo, r.stdout + r.stderr);
  if (diagnostico) assert.match(r.stdout + r.stderr, diagnostico);
}
function headHistorico(f, esperado) {
  const r = executar("git", ["-C", f.app, "rev-parse", "HEAD"]);
  ok(r);
  assert.equal(r.stdout.trim(), esperado);
}
function pinHistorico(f, operacao, ponteiro = fs.readFileSync(`${f.estado}/ultimo-backup.json`)) {
  const dir = `${f.prefixo}/dados/pins/${operacao}`;
  const pin = JSON.parse(fs.readFileSync(`${dir}/pin.json`));
  assert.equal(pin.operacao, operacao);
  assert.ok(pin.arquivos.length >= 4);
  for (const a of pin.arquivos) {
    const bytes = fs.readFileSync(`${dir}/${a.nome}`);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const origem = a.nome === "ponteiro.json" ? null : `${f.prefixo}/dados/backups/banco/${a.nome}`;
    assert.deepEqual(bytes, origem ? fs.readFileSync(origem) : ponteiro);
    assert.notEqual(
      fs.statSync(`${dir}/${a.nome}`).ino,
      fs.statSync(origem ?? `${f.estado}/ultimo-backup.json`).ino,
    );
  }
  const recibo = JSON.parse(
    fs.readFileSync(`${dir}/${pin.arquivos.find((a) => a.nome.endsWith(".confirmado.json")).nome}`),
  );
  assert.equal(recibo.escopo.alvo, pin.alvo);
  assert.equal(recibo.escopo.banco, "frequencia");
  assert.equal(recibo.etapas.local, true);
  const referencia = JSON.parse(ponteiro);
  assert.ok(
    pin.arquivos.some((a) => a.nome === referencia.arquivo && a.sha256 === referencia.sha256),
  );
  assert.ok(pin.arquivos.some((a) => a.nome === referencia.recibo));
  return pin;
}
function semAplicacaoHistorica(f, falha = "ausente") {
  headHistorico(f, f.revisoes[0]);
  assert.equal(fs.existsSync(`${f.estado}/backup-chamadas`), false);
  assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
  assert.equal(
    chamadasHistoricas(f).some((c) => comandoCompose(c, "build")),
    false,
  );
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/pins`), []);
  falhaHistorica(f, falha);
}
function falhaHistorica(f, tipo) {
  assert.ok(["ausente", "segura", "incerta"].includes(tipo));
  const nome = `${f.estado}/falha.json`;
  if (tipo === "ausente") assert.equal(fs.existsSync(nome), false);
  else
    assert.equal(
      JSON.parse(fs.readFileSync(nome)).migracoesPossivelmenteAplicadas,
      tipo === "incerta",
    );
}
function subidasHistoricas(f, alvos) {
  const subidas = chamadasHistoricas(f).filter((c) => comandoCompose(c, "up"));
  assert.equal(subidas.length, alvos.length);
  for (const [i, alvo] of alvos.entries()) {
    assert.equal(subidas[i].commit, alvo, "Commit enviado ao up diverge da revisão alvo.");
    assert.equal(
      subidas[i].imagem,
      `ghcr.io/eemtijca/frequenciapp:main-${alvo.slice(0, 12)}`,
      "Imagem enviada ao up diverge da revisão alvo.",
    );
    assert.deepEqual(subidas[i].a.slice(-5), ["up", "-d", "--wait", "--wait-timeout", "180"]);
  }
  if (alvos.length)
    assert.deepEqual(fs.readFileSync(`${f.raiz}/up.log`, "utf8").trim().split("\n"), alvos);
  else assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
}
function estadoIncertoHistorico(
  f,
  { subiu = true, pin = true, alvo = f.revisoes[1], falha = "incerta" } = {},
) {
  headHistorico(f, subiu ? alvo : f.revisoes[0]);
  const nomes = fs.readdirSync(`${f.prefixo}/dados/journal`);
  assert.equal(nomes.length, 1);
  const pasta = `${f.prefixo}/dados/journal/${nomes[0]}`;
  assert.ok(fs.existsSync(`${pasta}/intencao.json`));
  assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
  assert.ok(fs.existsSync(`${pasta}/incerta.json`));
  if (pin) pinHistorico(f, nomes[0]);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/pins`), pin ? nomes : []);
  subidasHistoricas(f, subiu ? [alvo] : []);
  falhaHistorica(f, falha);
  assert.equal(
    chamadasHistoricas(f).some((c) =>
      c.a.some((a) => ["stop", "kill", "down", "restart"].includes(a)),
    ),
    false,
  );
  return pasta;
}
function fotografiaHistorica(f) {
  const visitar = (nome) => {
    const s = fs.lstatSync(nome, { throwIfNoEntry: false });
    if (!s) return null;
    assert.ok(s.isDirectory() || s.isFile());
    return {
      modo: s.mode & 0o777,
      conteudo: s.isDirectory()
        ? Object.fromEntries(
            fs
              .readdirSync(nome)
              .sort()
              .map((n) => [n, visitar(`${nome}/${n}`)]),
          )
        : createHash("sha256").update(fs.readFileSync(nome)).digest("hex"),
    };
  };
  return Object.fromEntries(
    ["estado", "backups", "journal", "pins"]
      .map((n) => [n, visitar(`${f.prefixo}/dados/${n}`)])
      .concat([["up", visitar(`${f.raiz}/up.log`)]]),
  );
}
function consultasIdentidadeHistoricas(f) {
  const compose = [
    "compose",
    "--project-name",
    "sintetico",
    "--project-directory",
    f.app,
    "--env-file",
    `${f.conf}/app.env`,
    "--env-file",
    `${f.conf}/ops.env`,
    "-f",
    `${f.prefixo}/snapshot/compose/0.yml`,
  ];
  const captura = [
    [...compose, "config", "--format", "json"],
    ["info", "--format", "{{json .}}"],
    [...compose, "ps", "-aq"],
    ["inspect", "container-app", "container-db"],
  ];
  // trancar confere antes do flock e novamente após adquirir a mesma trava.
  return [...captura, ...captura].map((a) => ({ a }));
}
function incertaHistorica(f, { reexecucao = "journal-valido", ...estado } = {}) {
  const pasta = estadoIncertoHistorico(f, estado);
  const antes = fs.readFileSync(`${f.raiz}/docker.log`);
  const fotografia = fotografiaHistorica(f);
  const r = atualizarHistorico(f, ["--forcar"]);
  if (reexecucao === "identidade-ausente") {
    statusHistorico(r, 78);
    assert.equal(
      r.stderr,
      `[controlador] ENOENT: no such file or directory, lstat '${f.conf}/identidade.json'\n`,
    );
  } else {
    statusHistorico(r, 1, /Controlador não autorizou a mutação deste alvo/);
    if (reexecucao === "journal-valido")
      assert.ok(
        r.stderr.includes(
          "[controlador] Operação incerta bloqueia mutações. Revisão administrativa obrigatória.",
        ),
      );
    else {
      assert.equal(reexecucao, "intencao-parcial");
      let mensagem;
      try {
        JSON.parse("{");
      } catch (e) {
        mensagem = e.message;
      }
      assert.ok(r.stderr.includes(`[controlador] ${mensagem}`));
      assert.equal(r.stderr.includes("Operação incerta bloqueia mutações"), false);
    }
  }
  const depois = fs.readFileSync(`${f.raiz}/docker.log`);
  assert.deepEqual(
    depois.subarray(0, antes.length),
    antes,
    "Prefixo Docker precisa ser preservado byte a byte.",
  );
  const sufixo = depois.subarray(antes.length).toString();
  assert.deepEqual(
    sufixo ? sufixo.trimEnd().split("\n").map(JSON.parse) : [],
    reexecucao === "identidade-ausente" ? [] : consultasIdentidadeHistoricas(f),
    "A recusa só permite as consultas exatas de identidade, nunca mutações ou comandos desconhecidos.",
  );
  assert.deepEqual(
    fotografiaHistorica(f),
    fotografia,
    "Reexecução alterou estado, backup, journal, pin ou subida.",
  );
  assert.equal(estadoIncertoHistorico(f, estado), pasta);
  return pasta;
}
function novaMigracaoHistorica(f) {
  ok(executar("git", ["-C", f.app, "checkout", "-q", "--detach", f.revisoes[1]]));
  gravar(`${f.app}/prisma/migrations/0002_nova/migration.sql`, "select 1;\n");
  ok(executar("git", ["-C", f.app, "add", "prisma"]));
  ok(executar("git", ["-C", f.app, "commit", "-qm", "migração sintética"]));
  const r = executar("git", ["-C", f.app, "rev-parse", "HEAD"]);
  ok(r);
  const alvo = r.stdout.trim();
  ok(
    executar("git", [
      "--git-dir",
      `${f.raiz}/remoto.git`,
      "fetch",
      f.app,
      `${alvo}:refs/heads/main`,
    ]),
  );
  ok(executar("git", ["-C", f.app, "checkout", "-q", "--detach", f.revisoes[0]]));
  return alvo;
}
function falhaSeguraHistorica(f, commit, incerta = false) {
  const bytes = JSON.stringify({
    ref: "origin/main",
    commit,
    migracoesPossivelmenteAplicadas: incerta,
  });
  gravar(`${f.estado}/falha.json`, bytes);
  return Buffer.from(bytes);
}

function atualizarHistorico(f, opcoes = []) {
  const r = executar(f.entrada, ["atualizar", ...opcoes]);
  // Canais preservados antes das asserções, inclusive na primeira falha.
  process.stdout.write(
    `HISTORICO_RESULTADO=${JSON.stringify({ raiz: f.raiz, opcoes, status: r.status, sinal: r.signal, erro: r.error?.code ?? null, stdout: r.stdout, stderr: r.stderr })}\n`,
  );
  return r;
}
function sucessoHistorico(f, alvo = f.revisoes[1], anteriores = []) {
  headHistorico(f, alvo);
  const nomes = fs.readdirSync(`${f.prefixo}/dados/journal`);
  assert.equal(nomes.length, anteriores.length + 1);
  const novas = nomes.filter((n) => !anteriores.some((a) => a.operacao === n));
  assert.equal(novas.length, 1);
  const operacoes = [
    ...anteriores,
    { operacao: novas[0], ponteiro: fs.readFileSync(`${f.estado}/ultimo-backup.json`) },
  ];
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/pins`).sort(), [...nomes].sort());
  for (const { operacao, ponteiro } of operacoes) {
    const pasta = `${f.prefixo}/dados/journal/${operacao}`;
    const inicio = JSON.parse(fs.readFileSync(`${pasta}/intencao.json`));
    const fim = JSON.parse(fs.readFileSync(`${pasta}/concluida.json`));
    assert.equal(inicio.acao, "atualizar");
    assert.equal(inicio.operacao, operacao);
    assert.equal(fim.operacao, operacao);
    assert.equal(inicio.alvo, JSON.parse(fs.readFileSync(`${f.conf}/identidade.json`)).trava);
    assert.equal(fim.alvo, inicio.alvo);
    assert.equal(
      fim.intencaoSha256,
      createHash("sha256")
        .update(fs.readFileSync(`${pasta}/intencao.json`))
        .digest("hex"),
    );
    assert.equal(fim.status, 0);
    assert.equal(fs.existsSync(`${pasta}/incerta.json`), false);
    assert.equal(pinHistorico(f, operacao, ponteiro).alvo, inicio.alvo);
  }
  assert.equal(
    fs.readFileSync(`${f.estado}/backup-chamadas`, "utf8"),
    "backup\n".repeat(operacoes.length),
  );
  subidasHistoricas(
    f,
    operacoes.map(() => alvo),
  );
  falhaHistorica(f, "ausente");
  assert.equal(fs.existsSync(`${f.estado}/atualizacao-em-andamento.json`), false);
  const estado = JSON.parse(fs.readFileSync(`${f.estado}/estado.json`));
  assert.equal(estado.commit, alvo);
  assert.equal(estado.imagem, `ghcr.io/eemtijca/frequenciapp:main-${alvo.slice(0, 12)}`);
  const chamadas = chamadasHistoricas(f);
  const builds = chamadas.filter((c) => comandoCompose(c, "build") && c.a.at(-1) === "app");
  assert.equal(builds.length, operacoes.length);
  const subidas = chamadas.filter((c) => comandoCompose(c, "up"));
  for (const [i, build] of builds.entries()) {
    assert.equal(build.commit, alvo);
    assert.equal(build.imagem, `ghcr.io/eemtijca/frequenciapp:main-${alvo.slice(0, 12)}`);
    assert.match(
      build.a[build.a.indexOf("--project-directory") + 1],
      /frequenciapp-atualizacao\.[^/]+\/worktree$/,
    );
    assert.ok(chamadas.indexOf(build) < chamadas.indexOf(subidas[i]));
  }
  assert.ok(chamadas.some((c) => comandoCompose(c, "config")));
  statusHistorico(executar(f.entrada, ["estado"]), 0);
  return operacoes;
}

// Subtestes sequenciais param na primeira falha, sem rerodar os 25 casos antigos.
test("testemunhas históricas do atualizador usam controlador e Git reais", async (t) => {
  const cenarios = [];
  const adicionar = (nome, fn) => cenarios.push([nome, fn]);
  for (const planilhas of [true, false])
    adicionar(`positivo-planilhas-${planilhas}`, () => {
      const f = prepararHistorico({ BACKUP_PLANILHAS_HABILITADO: String(planilhas) });
      instalar(f);
      const r = atualizarHistorico(f);
      statusHistorico(r, 0, /Backup limitado ao schema/);
      const operacoes = sucessoHistorico(f);
      const builds = chamadasHistoricas(f).filter(
        (c) => comandoCompose(c, "build") && c.a.at(-1) === "backup-planilhas",
      );
      assert.equal(builds.length, planilhas ? 1 : 0);
      if (planilhas)
        assert.equal(
          builds[0].backup,
          `ghcr.io/eemtijca/frequenciapp-backup:main-${f.revisoes[1].slice(0, 12)}`,
        );
      // Sucesso concluído não é incerteza: no-op não cria backup e --forcar reaplica.
      const antes = fotografiaHistorica(f);
      statusHistorico(atualizarHistorico(f), 0, /Nenhuma mudança/);
      assert.deepEqual(fotografiaHistorica(f), antes);
      assert.equal(fs.readFileSync(`${f.estado}/backup-chamadas`, "utf8"), "backup\n");
      statusHistorico(atualizarHistorico(f, ["--forcar"]), 0);
      sucessoHistorico(f, f.revisoes[1], operacoes);
      const depois = fotografiaHistorica(f);
      for (const { operacao } of operacoes)
        for (const n of ["journal", "pins"])
          assert.deepEqual(depois[n].conteudo[operacao], antes[n].conteudo[operacao]);
    });
  adicionar("arvore-suja", () => {
    const f = prepararHistorico();
    instalar(f);
    gravar(`${f.app}/nao-rastreado.txt`, "sujo");
    statusHistorico(atualizarHistorico(f), 1, /árvore de trabalho/);
    semAplicacaoHistorica(f);
  });
  adicionar("revisao-imagem", () => {
    const f = prepararHistorico({}, { revisaoErrada: true });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /não corresponde ao commit/);
    incertaHistorica(f, { subiu: false, falha: "ausente" });
  });
  adicionar("build-alerta", () => {
    const f = prepararHistorico({ NOTIFICAR_URL: "https://alerta.invalid/hook" }, { build: 23 });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 23, /Falha ao enviar alerta \(status 71\)/);
    assert.ok(fs.existsSync(`${f.raiz}/build-injetado`));
    assert.equal(fs.readFileSync(`${f.raiz}/alerta.log`, "utf8").trim().split("\n").length, 1);
    incertaHistorica(f, { subiu: false, falha: "ausente" });
  });
  adicionar("subida-incerta", () => {
    const f = prepararHistorico({}, { up: 37 });
    instalar(f);
    statusHistorico(
      atualizarHistorico(f),
      37,
      /migrações não são revertidas.*revisão manual.*Nenhuma imagem anterior/,
    );
    const pasta = incertaHistorica(f);
    assert.equal(JSON.parse(fs.readFileSync(`${pasta}/incerta.json`)).status, 37);
  });
  adicionar("migracao-nova", () => {
    const f = prepararHistorico(),
      alvo = novaMigracaoHistorica(f);
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /Há migrações novas/);
    semAplicacaoHistorica(f);
    statusHistorico(atualizarHistorico(f, ["--permitir-migracoes"]), 0);
    sucessoHistorico(f, alvo);
  });
  adicionar("migracao-externa", () => {
    // Configuração adotada é imutável. A declaração externa usa uma nova instalação.
    const f = prepararHistorico({ MIGRAR_NA_PARTIDA: "false" });
    novaMigracaoHistorica(f);
    instalar(f);
    statusHistorico(atualizarHistorico(f, ["--permitir-migracoes"]), 1, /MIGRAR_NA_PARTIDA=false/);
    semAplicacaoHistorica(f);
    const g = prepararHistorico({ MIGRAR_NA_PARTIDA: "false", ATUALIZAR_MIGRACAO_EXTERNA: "true" });
    const alvo = novaMigracaoHistorica(g);
    instalar(g);
    statusHistorico(
      atualizarHistorico(g, ["--permitir-migracoes"]),
      0,
      /Migrações externas confirmadas/,
    );
    sucessoHistorico(g, alvo);
  });
  adicionar("backup-local", () => {
    const f = prepararHistorico({ ATUALIZAR_PERMITIR_BACKUP_LOCAL: "false" });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /exige backup remoto confirmado/);
    incertaHistorica(f, { subiu: false, pin: false, falha: "ausente" });
    assert.equal(
      chamadasHistoricas(f).some((c) => comandoCompose(c, "build")),
      false,
    );
  });
  for (const variante of ["false", "string", "null", "ausente", "truncado", "true"])
    adicionar(`remoto-${variante}`, () => {
      const f = prepararHistorico({
        BACKUP_REMOTO: "destino:teste",
        BACKUP_VERIFICAR_REMOTO: "true",
        FALSO_REMOTO_RECIBO: "true",
        FALSO_REMOTO_PONTEIRO: variante,
      });
      instalar(f);
      const r = atualizarHistorico(f);
      if (variante === "true") {
        statusHistorico(r, 0);
        sucessoHistorico(f);
      } else {
        statusHistorico(
          r,
          1,
          variante === "truncado" ? /Estado JSON inválido/ : /backup remoto não foi verificado/,
        );
        incertaHistorica(f, { subiu: false, pin: false, falha: "ausente" });
        assert.equal(
          chamadasHistoricas(f).some((c) => comandoCompose(c, "build")),
          false,
        );
      }
    });
  adicionar("ca-ausente", () => {
    const f = prepararHistorico();
    fs.appendFileSync(
      `${f.conf}/ops.env`,
      `ATUALIZAR_SAUDE_URL=https://sintetico.invalid/api/saude\nATUALIZAR_SAUDE_CA=${f.raiz}/ausente.pem\n`,
    );
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /CA de saúde não encontrada/);
    semAplicacaoHistorica(f);
  });
  adicionar("falha-antiga", () => {
    const f = prepararHistorico();
    instalar(f);
    falhaSeguraHistorica(f, f.revisoes[0]);
    statusHistorico(atualizarHistorico(f), 0);
    sucessoHistorico(f);
    assert.equal(fs.existsSync(`${f.estado}/falha.json`), false);
  });
  adicionar("identidade-alvo", () => {
    const f = prepararHistorico();
    gravar(f.controle, JSON.stringify({ identidadeAlvo: true, alvo: f.revisoes[1] }));
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /identidade não foi conferida no checkout alvo/i);
    assert.ok(fs.existsSync(`${f.raiz}/identidade-injetada`));
    incertaHistorica(f, { subiu: false, falha: "segura" });
    assert.equal(
      JSON.parse(fs.readFileSync(`${f.estado}/falha.json`)).migracoesPossivelmenteAplicadas,
      false,
    );
  });
  adicionar("ca-removida", () => {
    const f = prepararHistorico(),
      ca = `${f.raiz}/ca.pem`;
    gravar(ca, "CA sintética");
    fs.appendFileSync(
      `${f.conf}/ops.env`,
      `ATUALIZAR_SAUDE_URL=https://sintetico.invalid/api/saude\nATUALIZAR_SAUDE_CA=${ca}\n`,
    );
    gravar(f.controle, JSON.stringify({ ca }));
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /CA de saúde não encontrada após a subida/);
    assert.ok(fs.existsSync(`${f.raiz}/ca-injetada`));
    assert.equal(fs.existsSync(ca), false);
    incertaHistorica(f);
  });
  adicionar("identidade-rollback", () => {
    const f = prepararHistorico();
    gravar(f.controle, JSON.stringify({ identidadeRollback: true, alvo: f.revisoes[1], up: 37 }));
    instalar(f);
    statusHistorico(atualizarHistorico(f), 37, /Nenhuma imagem anterior/);
    incertaHistorica(f);
    assert.equal(fs.existsSync(`${f.raiz}/rollback-injetado`), false);
  });
  adicionar("mesma-falha", () => {
    const f = prepararHistorico();
    instalar(f);
    const bytes = falhaSeguraHistorica(f, f.revisoes[1]);
    statusHistorico(atualizarHistorico(f), 1, /falhou antes/);
    semAplicacaoHistorica(f, "segura");
    assert.deepEqual(fs.readFileSync(`${f.estado}/falha.json`), bytes);
    statusHistorico(atualizarHistorico(f, ["--forcar"]), 0);
    sucessoHistorico(f);
  });
  for (const forcar of [false, true])
    adicionar(`falha-incerta-forcar-${forcar}`, () => {
      const f = prepararHistorico();
      instalar(f);
      const bytes = JSON.stringify({
        ref: "outra-ref",
        commit: f.revisoes[0],
        migracoesPossivelmenteAplicadas: true,
      });
      gravar(`${f.estado}/falha.json`, bytes);
      statusHistorico(
        atualizarHistorico(f, forcar ? ["--forcar"] : []),
        1,
        /falha anterior pode ter aplicado migrações/i,
      );
      semAplicacaoHistorica(f, "incerta");
      assert.equal(fs.readFileSync(`${f.estado}/falha.json`, "utf8"), bytes);
    });
  adicionar("trava-ocupada", () => {
    const f = prepararHistorico();
    instalar(f);
    const p = JSON.parse(fs.readFileSync(`${f.prefixo}/perfil.json`));
    const lock = `${p.locks}/operacoes-${p.alvo}.lock`;
    gravar(lock, "");
    const r = executar("/bin/bash", [
      "-c",
      'exec 8>>"$1"; flock -n 8 || exit 99; "$2" atualizar',
      "trava",
      lock,
      f.entrada,
    ]);
    statusHistorico(r, 1, /Outra operação incompatível/);
    semAplicacaoHistorica(f);
  });
  for (const incidente of [false, true])
    adicionar(`persistencia-${incidente ? "incidente" : "estado"}`, () => {
      const f = prepararHistorico({}, incidente ? { up: 37 } : {});
      gravar(
        `${f.bin}/mv`,
        `#!/bin/bash
if [ "\${2:-}" = '${f.estado}/${incidente ? "falha" : "estado"}.json' ]; then printf falha >'${f.raiz}/mv-injetado'; exit 64; fi
exec /usr/bin/mv "$@"
`,
        0o755,
      );
      instalar(f);
      statusHistorico(
        atualizarHistorico(f),
        incidente ? 37 : 1,
        incidente ? /Não foi possível registrar a falha/ : /Falha ao registrar o estado/,
      );
      assert.ok(fs.existsSync(`${f.raiz}/mv-injetado`));
      incertaHistorica(f, { falha: incidente ? "ausente" : "incerta" });
      if (incidente) assert.equal(fs.existsSync(`${f.estado}/falha.json`), false);
    });
  adicionar("identidade-removida", () => {
    const f = prepararHistorico({}, { apagarIdentidade: true, up: 37 });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 37);
    assert.ok(fs.existsSync(`${f.raiz}/identidade-removida`));
    assert.equal(fs.existsSync(`${f.conf}/identidade.json`), false);
    incertaHistorica(f, { reexecucao: "identidade-ausente" });
  });
  adicionar("sigkill", () => {
    const f = prepararHistorico({}, { sigkill: true });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /Filho não concluiu/);
    assert.ok(fs.existsSync(`${f.raiz}/sigkill-injetado`));
    const pasta = incertaHistorica(f, { falha: "ausente" });
    const r = JSON.parse(fs.readFileSync(`${pasta}/incerta.json`));
    assert.equal(r.sinal, "SIGKILL");
    assert.equal(r.status, null);
  });
  adicionar("diff-aplicacao", () => {
    const f = prepararHistorico();
    gravar(`${f.raiz}/diff-falha`, "sim");
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /Não foi possível comparar as migrações/);
    assert.ok(fs.existsSync(`${f.raiz}/diff-injetado`));
    semAplicacaoHistorica(f);
  });
  adicionar("externa-build", () => {
    const f = prepararHistorico({ ATUALIZAR_MIGRACAO_EXTERNA: "true" }, { build: 23 });
    instalar(f);
    statusHistorico(atualizarHistorico(f), 23);
    incertaHistorica(f, { subiu: false, falha: "ausente" });
    assert.ok(fs.existsSync(`${f.raiz}/build-injetado`));
  });
  adicionar("falha-segura-subida", () => {
    const f = prepararHistorico({}, { up: 37 });
    instalar(f);
    falhaSeguraHistorica(f, f.revisoes[0]);
    statusHistorico(atualizarHistorico(f, ["--forcar"]), 37);
    incertaHistorica(f);
    assert.equal(JSON.parse(fs.readFileSync(`${f.estado}/falha.json`)).commit, f.revisoes[1]);
  });
  adicionar("falha-concorrente", () => {
    const f = prepararHistorico({}, { falhaConcorrente: true, up: 37 });
    const bytes = JSON.stringify({
      ref: "antiga",
      commit: f.revisoes[0],
      migracoesPossivelmenteAplicadas: true,
    });
    gravar(`${f.raiz}/falha-original.json`, bytes);
    instalar(f);
    statusHistorico(atualizarHistorico(f, ["--forcar"]), 37);
    assert.ok(fs.existsSync(`${f.raiz}/falha-concorrente`));
    incertaHistorica(f);
    assert.equal(fs.readFileSync(`${f.estado}/falha.json`, "utf8"), bytes);
  });
  adicionar("limpeza", () => {
    const f = prepararHistorico();
    gravar(`${f.raiz}/limpeza-falha`, "sim");
    instalar(f);
    statusHistorico(atualizarHistorico(f), 61, /Falha de limpeza/);
    assert.ok(fs.existsSync(`${f.raiz}/limpeza-injetada`));
    incertaHistorica(f, { falha: "ausente" });
  });
  adicionar("intencao-parcial", () => {
    const f = prepararHistorico(),
      preload = `${f.raiz}/parcial.mjs`;
    gravar(
      preload,
      `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const original=fs.writeFileSync;fs.writeFileSync=function(fd,...args){
const nome=typeof fd==='number'?fs.readlinkSync('/proc/self/fd/'+fd):String(fd);
if(nome.includes('/journal/')&&nome.endsWith('/intencao.json')){original.call(fs,fd,'{');original.call(fs,${JSON.stringify(f.raiz + "/parcial-injetada")},'sim');throw Error('Intenção parcial sintética');}
return original.call(fs,fd,...args)};syncBuiltinESMExports();`,
    );
    gravar(
      `${f.bin}/node`,
      `#!/bin/sh\nexec /usr/local/bin/node --import ${preload} "$@"\n`,
      0o755,
    );
    instalar(f);
    statusHistorico(atualizarHistorico(f), 1, /Não foi possível registrar a operação/);
    assert.ok(fs.existsSync(`${f.raiz}/parcial-injetada`));
    const pasta = incertaHistorica(f, {
      subiu: false,
      pin: false,
      falha: "ausente",
      reexecucao: "intencao-parcial",
    });
    assert.equal(fs.readFileSync(`${pasta}/intencao.json`, "utf8"), "{");
    assert.equal(fs.existsSync(`${f.estado}/backup-chamadas`), false);
    assert.equal(
      chamadasHistoricas(f).some((c) => comandoCompose(c, "build")),
      false,
    );
  });
  for (const [nome, fn] of cenarios) {
    let passou = false;
    await t.test(nome, () => {
      fn();
      passou = true;
    });
    if (!passou) return; // O runner preserva a falha do subteste e não inicia os demais.
  }
});

const instalar = (f) =>
  ok(
    executar("/bin/bash", [
      `${repo}/scripts/servidor/instalar-controlador.sh`,
      ...f.args,
      "--confirmar",
    ]),
  );
async function esperar(predicado, mensagem) {
  const prazo = Date.now() + 30000;
  while (!predicado()) {
    assert.ok(Date.now() < prazo, mensagem);
    await new Promise((r) => setTimeout(r, 20));
  }
}
function iniciar(f) {
  const fd = fs.openSync(`${f.raiz}/execucao.log`, "w", 0o600);
  const filho = spawn(`${f.prefixo}/executar`, ["atualizar"], {
    env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  const encerrado = new Promise((resolve) =>
    filho.once("exit", (status, sinal) => resolve({ status, sinal })),
  );
  return { filho, encerrado };
}

test("crash do controlador mantém filho e trava; journal bloqueia backup, restore e retenção após o filho", async () => {
  const f = preparar();
  instalar(f);
  gravar(`${f.raiz}/modo-up`, "persistir");
  const execucao = iniciar(f);
  await esperar(() => fs.existsSync(`${f.raiz}/up-iniciado.json`), "O filho não chegou ao up.");
  const ids = JSON.parse(fs.readFileSync(`${f.raiz}/up-iniciado.json`));
  assert.ok(ids.controlador > 1 && ids.pid !== ids.controlador);
  process.kill(ids.controlador, "SIGKILL");
  const encerrado = await execucao.encerrado;
  assert.notEqual(encerrado.status, 0);
  process.kill(ids.pid, 0);
  const durante = executar(`${f.prefixo}/executar`, ["retencao"]);
  assert.notEqual(durante.status, 0);
  assert.match(durante.stdout + durante.stderr, /Outra operação incompatível/);
  gravar(`${f.raiz}/liberar-up`, "sim");
  await esperar(() => fs.existsSync(`${f.raiz}/up-terminou`), "Filho não concluiu após liberação.");
  await esperar(
    () =>
      !fs.existsSync(`/proc/${ids.atualizador}`) ||
      fs.readFileSync(`/proc/${ids.atualizador}/stat`, "utf8").includes(") Z "),
    "Atualizador não encerrou.",
  );
  const nomes = fs.readdirSync(`${f.prefixo}/dados/journal`);
  assert.equal(nomes.length, 1);
  const pasta = `${f.prefixo}/dados/journal/${nomes[0]}`;
  assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
  assert.ok(fs.existsSync(`${pasta}/observado-antes.json`));
  for (const acao of ["backup-banco", "restaurar", "retencao", "atualizar"]) {
    const r = executar(`${f.prefixo}/executar`, [acao]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /andamento ou incerta/);
  }
  const forcar = executar(`${f.prefixo}/executar`, ["atualizar", "--forcar"]);
  assert.notEqual(forcar.status, 0);
  assert.match(forcar.stdout + forcar.stderr, /andamento ou incerta/);
  const substituto = `${f.raiz}/substituto`;
  fs.appendFileSync(`${f.conf}/ops.env`, `ESTADO_DIR=${f.prefixo}/dados/estado\n`);
  const adocao = executar("/bin/bash", [
    `${repo}/scripts/servidor/instalar-controlador.sh`,
    ...f.args.map((v) => (v === f.prefixo ? substituto : v)),
    "--confirmar",
  ]);
  assert.equal(adocao.status, 78);
  assert.match(adocao.stderr, /Journal anterior não reconciliado/);
  assert.equal(fs.existsSync(substituto), false);
  assert.equal(fs.existsSync(`${pasta}/intencao.json`), true);
  assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
});

test("retenção concorrente usa o mesmo alvo e expurgo posterior não remove o pin físico", async () => {
  const f = preparar();
  fs.appendFileSync(`${f.conf}/ops.env`, "BACKUP_RETER_MINIMO=0\nBACKUP_RETER_DIAS=1\n");
  instalar(f);
  gravar(`${f.raiz}/modo-up`, "persistir");
  const execucao = iniciar(f);
  await esperar(() => fs.existsSync(`${f.raiz}/up-iniciado.json`), "Partida não alcançada.");
  const n = fs.readdirSync(`${f.prefixo}/dados/journal`)[0],
    pinDir = `${f.prefixo}/dados/pins/${n}`;
  const pinAntes = fs.readFileSync(`${pinDir}/pin.json`);
  const durante = executar(`${f.prefixo}/executar`, ["retencao"]);
  assert.notEqual(durante.status, 0);
  assert.match(durante.stdout + durante.stderr, /Outra operação incompatível/);
  gravar(`${f.raiz}/liberar-up`, "sim");
  assert.equal(
    (await execucao.encerrado).status,
    0,
    fs.readFileSync(`${f.raiz}/execucao.log`, "utf8"),
  );
  const dir = `${f.prefixo}/dados/backups/banco`,
    nome = fs.readdirSync(dir).find((n) => n.endsWith(".confirmado.json"));
  const recibo = JSON.parse(fs.readFileSync(`${dir}/${nome}`));
  recibo.em = "2000-01-01T00:00:00.000Z";
  gravar(`${dir}/${nome}`, JSON.stringify(recibo));
  ok(executar(`${f.prefixo}/executar`, ["retencao"]));
  assert.equal(fs.existsSync(`${dir}/${nome}`), false);
  for (const a of recibo.artefatos) assert.equal(fs.existsSync(`${dir}/${a.nome}`), false);
  assert.deepEqual(fs.readFileSync(`${pinDir}/pin.json`), pinAntes);
  for (const a of JSON.parse(pinAntes).arquivos) assert.ok(fs.existsSync(`${pinDir}/${a.nome}`));
  ok(executar(`${f.prefixo}/executar`, ["estado"]));
});

for (const fase of ["intencao", "concluida"])
  test(`erro fsync em ${fase} impede liberação e preserva estado bloqueado`, () => {
    const f = preparar(),
      falha = `${f.raiz}/falha-fsync.mjs`;
    gravar(
      falha,
      `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const original=fs.fsyncSync;fs.fsyncSync=function(fd){const n=fs.readlinkSync('/proc/self/fd/'+fd);if(n.includes('/journal/')&&n.endsWith('/${fase}.json')&&!fs.existsSync(${JSON.stringify(f.raiz + "/fsync-injetado")})){fs.writeFileSync(${JSON.stringify(f.raiz + "/fsync-injetado")},'EIO');throw Object.assign(new Error('Erro fsync EIO sintético'),{code:'EIO'});}return original(fd)};syncBuiltinESMExports();`,
    );
    gravar(`${f.bin}/node`, `#!/bin/sh\nexec /usr/local/bin/node --import ${falha} "$@"\n`, 0o755);
    instalar(f);
    ok(executar(`${f.prefixo}/executar`, ["atualizar", "--simular"]));
    const r = executar(`${f.prefixo}/executar`, ["atualizar"]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /fsync EIO/);
    assert.equal(fs.readFileSync(`${f.raiz}/fsync-injetado`, "utf8"), "EIO");
    const n = fs.readdirSync(`${f.prefixo}/dados/journal`)[0],
      pasta = `${f.prefixo}/dados/journal/${n}`;
    assert.ok(fs.existsSync(`${pasta}/intencao.json`));
    const apos = executar(`${f.prefixo}/executar`, ["backup-banco"]);
    assert.notEqual(apos.status, 0);
    assert.match(apos.stdout + apos.stderr, /incerta/);
    if (fase === "intencao") assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
    else assert.equal(fs.readFileSync(`${f.raiz}/up.log`, "utf8").trim().split("\n").length, 1);
  });

test("falha Compose não autoriza parar recursos nem iniciar imagem anterior", () => {
  const f = preparar();
  instalar(f);
  gravar(`${f.raiz}/modo-up`, "falhar");
  const r = executar(`${f.prefixo}/executar`, ["atualizar"]);
  assert.equal(r.status, 37, r.stdout + r.stderr);
  assert.deepEqual(fs.readFileSync(`${f.raiz}/up.log`, "utf8").trim().split("\n"), [f.revisoes[1]]);
  const chamadas = fs
    .readFileSync(`${f.raiz}/docker.log`, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(
    chamadas.some((c) => c.a.some((a) => ["stop", "kill", "down", "restart"].includes(a))),
    false,
  );
  const n = fs.readdirSync(`${f.prefixo}/dados/journal`)[0];
  const incerta = JSON.parse(fs.readFileSync(`${f.prefixo}/dados/journal/${n}/incerta.json`));
  assert.equal(incerta.observado.confirmado, true);
  assert.ok(
    incerta.observado.recursos.some(
      (c) => c.id === "container-app" && c.imagem === "sha256:app-observada" && c.executando,
    ),
  );
});

test("cron estável recusa revisão com migrador antigo sem guard aprovado", () => {
  const f = preparar();
  fs.appendFileSync(`${f.conf}/ops.env`, "ATUALIZAR_HABILITADO=true\n");
  ok(executar("git", ["-C", f.app, "checkout", "-q", "--detach", f.revisoes[2]]));
  gravar(
    `${f.app}/docker/app/migrar.mjs`,
    "// Migrador antigo sintético sem guard.\nprocess.exit(0);\n",
  );
  ok(executar("git", ["-C", f.app, "commit", "-qam", "migrador antigo sem guard"]));
  const alvo = executar("git", ["-C", f.app, "rev-parse", "HEAD"]).stdout.trim();
  ok(executar("git", ["-C", f.app, "update-ref", "refs/remotes/origin/main", alvo]));
  ok(executar("git", ["-C", f.app, "checkout", "-q", "--detach", f.revisoes[0]]));
  instalar(f);
  const plano = executar(`${f.prefixo}/executar`, ["instalar-rotinas", "--plano"]);
  ok(plano);
  const linha = plano.stdout.split("\n").find((l) => l.includes("/executar atualizar"));
  assert.ok(linha);
  const comando = linha.slice(linha.indexOf(`${f.prefixo}/executar`));
  const r = executar("/bin/bash", ["-c", comando]);
  assert.notEqual(r.status, 0);
  assert.match(
    fs.readFileSync(`${f.prefixo}/dados/logs/atualizacao.log`, "utf8"),
    /guard.*aprovado|aprovado.*guard/,
  );
  assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
  assert.equal(fs.existsSync(`${f.raiz}/build-revisao`), false);
});

test("repetir alvo sem mudança não converte sucesso anterior em bloqueio incerto", () => {
  const f = preparar();
  instalar(f);
  ok(executar(`${f.prefixo}/executar`, ["atualizar"]));
  ok(executar(`${f.prefixo}/executar`, ["atualizar"]));
  ok(executar(`${f.prefixo}/executar`, ["backup-banco"]));
  assert.equal(fs.readFileSync(`${f.raiz}/up.log`, "utf8").trim().split("\n").length, 1);
});

test("ajuda e simulação não criam transição; registro tem journal próprio sem pin", () => {
  const f = preparar();
  instalar(f);
  const entrada = `${f.prefixo}/executar`,
    journal = `${f.prefixo}/dados/journal`;
  for (const opcao of ["--ajuda", "-h", "--simular"]) {
    ok(executar(entrada, ["atualizar", opcao]));
    assert.deepEqual(fs.readdirSync(journal), []);
    assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/pins`), []);
    assert.equal(fs.existsSync(`${f.prefixo}/dados/estado/estado.json`), false);
  }
  const invalido = executar(entrada, ["atualizar", "--simular", "--registrar"]);
  assert.equal(invalido.status, 78);
  assert.match(invalido.stderr, /incompatíveis/);
  assert.deepEqual(fs.readdirSync(journal), []);
  ok(executar(entrada, ["atualizar", "--registrar"]));
  const nomes = fs.readdirSync(journal);
  assert.equal(nomes.length, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(`${journal}/${nomes[0]}/intencao.json`)).acao,
    "registrar-atualizacao",
  );
  assert.equal(JSON.parse(fs.readFileSync(`${journal}/${nomes[0]}/concluida.json`)).status, 0);
  assert.equal(
    JSON.parse(fs.readFileSync(`${f.prefixo}/dados/estado/estado.json`)).commit,
    f.revisoes[0],
  );
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/pins`), []);
  assert.equal(fs.existsSync(`${f.raiz}/up.log`), false);
  assert.equal(fs.existsSync(`${f.raiz}/build-revisao`), false);
  ok(executar(entrada, ["estado"]));
  ok(executar(entrada, ["atualizar"]));
  ok(executar(entrada, ["atualizar"]));
  ok(executar(entrada, ["estado"]));
  assert.equal(fs.readdirSync(journal).length, 2);
  assert.equal(fs.readdirSync(`${f.prefixo}/dados/pins`).length, 1);
});

test("adoção recusa estado legado incerto antes de criar qualquer prefixo", () => {
  const f = preparar(),
    legado = `${f.raiz}/estado-legado`;
  const marcador = `${legado}/atualizacao-em-andamento.json`;
  gravar(marcador, '{"emAndamento":true,"migracoesPossivelmenteAplicadas":true}\n');
  const bytes = fs.readFileSync(marcador);
  fs.appendFileSync(`${f.conf}/ops.env`, `ESTADO_DIR=${legado}\n`);
  const antes = fs.readFileSync(`${f.raiz}/docker.log`);
  const r = executar("/bin/bash", [
    `${repo}/scripts/servidor/instalar-controlador.sh`,
    ...f.args,
    "--confirmar",
  ]);
  assert.equal(
    r.status,
    78,
    "A adoção não pode esconder incerteza legada substituindo ESTADO_DIR.",
  );
  assert.match(r.stderr, /legad|reconcilia/);
  assert.equal(fs.existsSync(f.prefixo), false);
  assert.deepEqual(fs.readFileSync(marcador), bytes);
  assert.deepEqual(fs.readFileSync(`${f.raiz}/docker.log`), antes);
});

test("adoção rejeita metadado Git gravável por outro ator antes de instalar", () => {
  const f = preparar();
  fs.chmodSync(`${f.app}/.git/config`, 0o666);
  const r = executar("/bin/bash", [
    `${repo}/scripts/servidor/instalar-controlador.sh`,
    ...f.args,
    "--confirmar",
  ]);
  assert.notEqual(
    r.status,
    0,
    "Metadado Git mutável não pode alimentar fetch/build administrativo.",
  );
  assert.equal(fs.existsSync(f.prefixo), false);
});

for (const entrada of [".git/hooks", ".git/refs", ".git/HEAD", "README.md", "docker"])
  test(`adoção recusa ownership inseguro em ${entrada}`, () => {
    const f = preparar(),
      nome = `${f.app}/${entrada}`;
    fs.chmodSync(nome, fs.statSync(nome).isDirectory() ? 0o777 : 0o666);
    const antes = fs.readFileSync(`${f.raiz}/docker.log`);
    const r = executar("/bin/bash", [
      `${repo}/scripts/servidor/instalar-controlador.sh`,
      ...f.args,
      "--confirmar",
    ]);
    assert.equal(r.status, 78);
    assert.match(r.stderr, /Checkout\/metadado Git/);
    assert.equal(fs.existsSync(f.prefixo), false);
    assert.deepEqual(fs.readFileSync(`${f.raiz}/docker.log`), antes);
  });

for (const tipo of ["include", "hooks"])
  test(`adoção confere ${tipo} Git externo em vez de confiar só no checkout`, () => {
    const f = preparar(),
      externo = `${f.raiz}/externo`,
      instalador = `${repo}/scripts/servidor/instalar-controlador.sh`;
    if (tipo === "include") {
      gravar(externo, "[teste]\nvalor = sintético\n", 0o600);
      ok(executar("git", ["-C", f.app, "config", "include.path", externo]));
    } else {
      fs.mkdirSync(externo, { mode: 0o700 });
      gravar(`${externo}/post-checkout`, "#!/bin/sh\nexit 0\n", 0o700);
      ok(executar("git", ["-C", f.app, "config", "core.hooksPath", externo]));
    }
    ok(executar("/bin/bash", [instalador, ...f.args, "--plano"]));
    assert.equal(fs.existsSync(f.prefixo), false);
    const mutavel = tipo === "include" ? externo : `${externo}/post-checkout`;
    // O mode de criação é filtrado pela umask; chmod garante a adulteração real.
    fs.chmodSync(mutavel, tipo === "include" ? 0o666 : 0o777);
    assert.equal(fs.statSync(mutavel).mode & 0o022, 0o022);
    const antes = fs.readFileSync(`${f.raiz}/docker.log`);
    const r = executar("/bin/bash", [instalador, ...f.args, "--confirmar"]);
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 78, r.stdout + r.stderr);
    assert.match(
      r.stderr,
      tipo === "include" ? /Caminho permite escrita/ : /Checkout\/metadado Git/,
    );
    assert.equal(fs.existsSync(f.prefixo), false);
    assert.deepEqual(fs.readFileSync(`${f.raiz}/docker.log`), antes);
  });

for (const inseguro of [false, true])
  test(`adoção resolve commondir real de worktree: inseguro=${inseguro}`, () => {
    const f = preparar(),
      principal = `${f.raiz}/principal`;
    fs.renameSync(f.app, principal);
    ok(executar("git", ["-C", principal, "worktree", "add", "--detach", f.app, f.revisoes[0]]));
    if (inseguro) fs.chmodSync(`${principal}/.git/config`, 0o666);
    const r = executar("/bin/bash", [
      `${repo}/scripts/servidor/instalar-controlador.sh`,
      ...f.args,
      "--confirmar",
    ]);
    assert.equal(r.status, inseguro ? 78 : 0, r.stdout + r.stderr);
    assert.equal(fs.existsSync(f.prefixo), !inseguro);
    if (!inseguro) {
      ok(executar(`${f.prefixo}/executar`, ["atualizar"]));
      ok(executar(`${f.prefixo}/executar`, ["atualizar"]));
      ok(executar(`${f.prefixo}/executar`, ["estado"]));
    }
  });

for (const bytes of ["{}", '{"migracoesPossivelmenteAplicadas":true}', "{"])
  test(`adoção recusa falha legada não reconciliada: ${bytes}`, () => {
    const f = preparar(),
      legado = `${f.raiz}/legado`;
    gravar(`${legado}/falha.json`, bytes);
    fs.appendFileSync(`${f.conf}/ops.env`, `ESTADO_DIR=${legado}\n`);
    const r = executar("/bin/bash", [
      `${repo}/scripts/servidor/instalar-controlador.sh`,
      ...f.args,
      "--confirmar",
    ]);
    assert.equal(r.status, 78);
    assert.equal(fs.existsSync(f.prefixo), false);
    assert.equal(fs.readFileSync(`${legado}/falha.json`, "utf8"), bytes);
  });
