// Verifica o launcher com Docker falso; nunca disponibiliza um daemon às fixtures.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { setTimeout as pausa } from "node:timers/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Script } from "node:vm";

const raiz = path.resolve(import.meta.dirname, "../..");
const launcher = path.join(raiz, "tests/servidor/sinteticos.mjs");
const witness = "tests/servidor/executar-sinteticos.test.mjs";

test("inventário portátil classifica CLI real e root sem skips implícitos", async () => {
  const modulo = await import("./sinteticos.mjs");
  const comuns = modulo.inventario("sinteticos").map((i) => i.arquivo);
  assert.ok(!comuns.includes("tests/servidor/origem-backup-cli.test.mjs"));
  assert.ok(!comuns.some((n) => n.endsWith(".e2e.mjs")));
  const perfis = modulo.inventarioPerfis();
  assert.deepEqual(perfis["origem-cli"], ["tests/servidor/origem-backup-cli.e2e.mjs"]);
  assert.deepEqual(perfis["controlador-root"], ["tests/servidor/controlador/operacional.e2e.mjs"]);
  assert.equal(perfis.legadosBloqueados.length, 4);
  const cli = fs.readFileSync(path.join(raiz, perfis["origem-cli"][0]), "utf8");
  assert.doesNotMatch(cli, /skip\s*:/);
  assert.match(cli, /assert\.equal\(process\.env\.ORIGEM_BACKUP_ENSAIO/);
});

// O produtor falso aloca IDs opacos; não os deriva dos argumentos do consumidor.
test("receita projeta somente manifests públicos e imagens recusam defaults opacos", async () => {
  const { contextoFerramentas, validarImagem, pathFerramentas } =
    await import("./imagens-ensaio.mjs");
  const contexto = contextoFerramentas();
  try {
    assert.deepEqual(fs.readdirSync(contexto).sort(), [
      "Dockerfile.sinteticos",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]);
  } finally {
    fs.rmSync(contexto, { recursive: true, force: true });
  }
  const info = {
    Id: `sha256:${"a".repeat(64)}`,
    Config: {
      Labels: { "frequenciapp.ensaio.toolchain": "sinteticos-v2" },
      Env: [
        `PATH=${pathFerramentas}`,
        "NODE_VERSION=24.22.2",
        "YARN_VERSION=1.22.22",
        "HOME=/tmp",
        "TMPDIR=/tmp",
        "GIT_CONFIG_NOSYSTEM=1",
        "GIT_CONFIG_GLOBAL=/dev/null",
        "GIT_ALLOW_PROTOCOL=file",
        "HELM_BIN=/usr/local/bin/helm",
      ],
    },
  };
  assert.doesNotThrow(() => validarImagem(info, "ferramentas"));
  for (const extra of ["DATABASE_URL=postgresql://externo", "TOKEN=segredo", "PATH=/outro"]) {
    const ruim = structuredClone(info);
    ruim.Config.Env.push(extra);
    assert.throws(() => validarImagem(ruim, "ferramentas"));
  }
  for (const campo of ["Volumes", "ExposedPorts", "Healthcheck"]) {
    const ruim = structuredClone(info);
    ruim.Config[campo] = { inesperado: {} };
    assert.throws(() => validarImagem(ruim, "ferramentas"));
  }
});

// Observa a captura real na fronteira Docker, sem criar recursos ou iniciar os E2E.
const observarCaptura = `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const p=process.env.FIXTURE_DOCKER, a=process.argv.slice(2);
const s=JSON.parse(fs.readFileSync(p+'/estado.json','utf8'));
fs.appendFileSync(p+'/chamadas.jsonl',JSON.stringify(a)+'\\n');
if(a[0]==='image' && a[1]==='inspect') {
 const env=s.perfil==='origem'
  ? ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin','GOSU_VERSION=1.19','LANG=en_US.utf8','PG_MAJOR=17','PG_VERSION=17.11-1.pgdg12+2','PGDATA=/var/lib/postgresql/data','NODE_VERSION=24.22.2','HOME=/tmp','TMPDIR=/tmp']
  : ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','NODE_VERSION=24.22.2','YARN_VERSION=1.22.22','HOME=/tmp','TMPDIR=/tmp','GIT_CONFIG_NOSYSTEM=1','GIT_CONFIG_GLOBAL=/dev/null','GIT_ALLOW_PROTOCOL=file','HELM_BIN=/usr/local/bin/helm'];
 const Config={Env:env,Labels:s.perfil==='origem'?{'frequenciapp.ensaio':'origem-backup-sintetico','frequenciapp.ensaio.toolchain':'origem-v2'}:{'frequenciapp.ensaio.toolchain':'sinteticos-v2'}};
 if(s.perfil==='origem') Object.assign(Config,{Volumes:{'/var/lib/postgresql/data':{}},ExposedPorts:{'5432/tcp':{}}});
 process.stdout.write(JSON.stringify([{Id:s.image,Config}]));
} else if(a[0]==='image' && a[1]==='tag') {
 // O observador não cria tags reais.
} else if(a[0]===(s.perfil==='origem'?'build':'create')) {
 const captura=s.perfil==='origem'?a.at(-1):a[a.indexOf('--mount')+1].split(',').find(v=>v.startsWith('src=')).slice(4);
 const itens=[];
 function visitar(nome='') {
  const alvo=path.join(captura,nome), st=fs.lstatSync(alvo);
  if(st.isSymbolicLink()) throw Error('Link inesperado na captura');
  const item={nome,diretorio:st.isDirectory(),modo:st.mode&0o777,uid:st.uid};
  if(st.isFile()) item.sha256=createHash('sha256').update(fs.readFileSync(alvo)).digest('hex');
  itens.push(item);
  if(st.isDirectory()) for(const filho of fs.readdirSync(alvo).sort()) visitar(path.join(nome,filho));
 }
 visitar();
 fs.writeFileSync(p+'/captura.json',JSON.stringify({captura,itens}));
 process.exit(86);
} else throw Error('Operação não autorizada no observador: '+a[0]);
`;

for (const perfil of ["runner-root", "origem"]) {
  test(`captura pública ${perfil} permanece legível sob umask 077 sem mudar as fontes`, () => {
    const f = preparar();
    const umask = process.umask();
    try {
      fs.writeFileSync(path.join(f.tmp, "bin/docker"), observarCaptura);
      fs.writeFileSync(path.join(f.tmp, "estado.json"), JSON.stringify({ perfil, image: f.image }));
      const entrada =
        perfil === "origem"
          ? path.join(raiz, "tests/kubernetes/origem-backup-isolado.mjs")
          : launcher;
      const args =
        perfil === "origem"
          ? [entrada, "--executar"]
          : [entrada, "--perfil", "controlador-root", "--image", "fixture:tools"];
      const fontes = new Map();
      for (const nome of [
        "tests/servidor",
        "tests/kubernetes",
        "scripts/servidor",
        "src/infra",
        "infra/kubernetes",
      ]) {
        function registrar(pasta) {
          for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
            const arquivo = path.join(pasta, item.name);
            if (item.isDirectory()) registrar(arquivo);
            else if (item.isFile())
              fontes.set(path.relative(raiz, arquivo), {
                modo: fs.statSync(arquivo).mode,
                sha256: createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex"),
              });
          }
        }
        registrar(path.join(raiz, nome));
      }
      const r = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `process.umask(0o077);process.argv=[process.execPath,...${JSON.stringify(args)}];await import(${JSON.stringify(new URL(entrada, "file://").href)});`,
        ],
        {
          env: { ...f.env, ORIGEM_BACKUP_TEST_IMAGE: "fixture:origem" },
          encoding: "utf8",
          timeout: 20000,
        },
      );
      assert.equal(r.error, undefined, r.stderr);
      assert.equal(r.signal, null, r.stderr);
      assert.equal(r.status, 1, "observador encerra antes de criar qualquer contêiner");
      const chamadas = f.chamadas();
      assert.ok(chamadas.some((a) => a[0] === (perfil === "origem" ? "build" : "create")));
      assert.ok(!chamadas.some((a) => ["start", "wait", "rm"].includes(a[0])));
      const { captura, itens } = JSON.parse(
        fs.readFileSync(path.join(f.tmp, "captura.json"), "utf8"),
      );
      assert.equal(fs.existsSync(captura), false, "captura descartada pelo consumidor real");
      assert.ok(itens.some((i) => i.nome === "tests/servidor" && i.diretorio));
      if (perfil === "runner-root") {
        for (const nome of [
          "scripts/backup/backup-externo.mjs",
          "scripts/backup/pacote-backup.mjs",
          "tests/unidade/infra/operacao-catalogo-cli.test.ts",
        ])
          assert.ok(
            itens.some((item) => item.nome === nome && !item.diretorio),
            nome,
          );
      }
      for (const item of itens) {
        assert.ok(
          !item.nome.split(path.sep).some((n) => [".git", ".env", "node_modules"].includes(n)),
        );
        if (item.diretorio)
          assert.equal(item.modo, 0o755, `Diretório público: ${item.nome || "."}`);
        else if (item.nome === "Dockerfile" && perfil === "origem") assert.equal(item.modo, 0o444);
        else {
          const original = path.join(raiz, item.nome);
          assert.equal(
            item.sha256,
            createHash("sha256").update(fs.readFileSync(original)).digest("hex"),
          );
          assert.equal(item.modo, fs.statSync(original).mode & 0o111 ? 0o555 : 0o444, item.nome);
        }
      }
      for (const [nome, antes] of fontes) {
        const arquivo = path.join(raiz, nome);
        assert.equal(fs.statSync(arquivo).mode, antes.modo, nome);
        assert.equal(
          createHash("sha256").update(fs.readFileSync(arquivo)).digest("hex"),
          antes.sha256,
          nome,
        );
      }
    } finally {
      assert.equal(process.umask(), umask, "umask do processo de teste não muda");
      f.limpar();
    }
  });
}

// O produtor falso aloca IDs opacos; não os deriva dos argumentos do consumidor.
const dockerFalso = `#!/usr/bin/env node
import fs from 'node:fs';
const p=process.env.FIXTURE_DOCKER, a=process.argv.slice(2);
const s=JSON.parse(fs.readFileSync(p+'/estado.json','utf8'));
fs.appendFileSync(p+'/chamadas.jsonl',JSON.stringify(a)+'\\n');
const salvar=()=>fs.writeFileSync(p+'/estado.json',JSON.stringify(s));
const sair=(texto='',codigo=0)=>{process.stdout.write(texto);process.exit(codigo)};
const imageEnv=['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','NODE_VERSION=24.22.2','YARN_VERSION=1.22.22','HOME=/tmp','TMPDIR=/tmp','GIT_CONFIG_NOSYSTEM=1','GIT_CONFIG_GLOBAL=/dev/null','GIT_ALLOW_PROTOCOL=file','HELM_BIN=/usr/local/bin/helm'];
if(a[0]==='image' && a[1]==='inspect') sair(JSON.stringify([{Id:s.image,Config:{Env:imageEnv,Labels:{'frequenciapp.ensaio.toolchain':'sinteticos-v2'},Volumes:null,ExposedPorts:null}}]));
if(a[0]==='create') {
 s.round=a.filter((v,i)=>a[i-1]==='--label').find(v=>v.startsWith('br.app.frequenciapp.sinteticos.rodada=')).split('=')[1];
 s.fonte=a[a.indexOf('--mount')+1].split(',').find(x=>x.startsWith('src=')).slice(4);
 s.nonce=a.at(-1); s.status='created'; salvar(); sair(s.cid+'\\n');
}
if(a[0]==='inspect') {
 const running=s.status==='running';
 const item={Id:s.cid,Image:s.image,Config:{User:'1000:1000',WorkingDir:'/repo',Entrypoint:['node'],Cmd:['/repo/tests/servidor/sinteticos-interno.mjs','autoteste',s.nonce],Labels:{'br.app.frequenciapp.sinteticos':'1','br.app.frequenciapp.sinteticos.rodada':s.round},Env:imageEnv},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,AutoRemove:false,Init:true,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Binds:null,Tmpfs:{'/tmp':'rw,exec,nosuid,nodev,size=1g'},PortBindings:{},PublishAllPorts:false,PidMode:'',IpcMode:'private',Devices:[],DeviceRequests:null,RestartPolicy:{Name:'no',MaximumRetryCount:0}},NetworkSettings:{Ports:{},Networks:{none:{}}},Mounts:[{Type:'bind',Source:s.fonte,Destination:'/repo',RW:false}],State:{Status:s.status,Running:running,ExitCode:s.exit}};
 if(s.caso==='rede') item.HostConfig.NetworkMode='host';
 if(s.caso==='mount') item.Mounts[0].RW=true;
 if(s.caso==='socket') item.Mounts.push({Type:'bind',Source:'/var/run/docker.sock',Destination:'/var/run/docker.sock',RW:true});
 if(s.caso==='uid') item.Config.User='0';
 if(s.caso==='tmpfs') item.HostConfig.Tmpfs['/tmp']='rw,noexec';
 if(s.caso==='id') item.Id='e'.repeat(64);
 if(s.caso==='label') item.Config.Labels['br.app.frequenciapp.sinteticos.rodada']='outra';
 if(s.caso==='status-ausente') delete item.State.Status;
 if(s.caso==='exit-ausente' && s.status==='exited') delete item.State.ExitCode;
 if(s.caso==='identidade-final' && s.status==='exited') item.Image='sha256:'+'e'.repeat(64);
 sair(JSON.stringify([item]));
}
if(a[0]==='start') {
 if(s.caso==='sinal') {s.status='running';salvar();await new Promise(()=>{setInterval(()=>{},1000)})}
 else {
 s.status='exited';
 if(['suite-falhou','exit-nao-zero','logs-ausentes-falha','logs-falsos-falha'].includes(s.caso)) s.exit=1;
 salvar();
 const contagens={testes:1,passaram:1,falharam:0,cancelados:0,ignorados:0,pendentes:0};
 const report={schema:1,perfil:'autoteste',arquivos:[{arquivo:'tests/servidor/executar-sinteticos.test.mjs',tipo:'node',codigo:0,estado:'aprovado',contagens}]};
 if(s.caso==='suite-falhou') {Object.assign(contagens,{testes:3,passaram:1,falharam:2});Object.assign(report.arquivos[0],{codigo:1,estado:'falhou'})}
 if(s.caso==='skip'){contagens.passaram=0;contagens.ignorados=1}
 if(s.caso==='zero'){contagens.testes=0;contagens.passaram=0}
 if(s.caso==='arquivo-ausente') report.arquivos=[];
 if(s.caso==='resultado-ausente') sair('');
 if(s.caso==='resultado-invalido') sair('FREQUENCIAPP_SINTETICOS_RESULTADO='+s.nonce+':e30=\\n');
 if(s.caso==='logs-ausentes-falha') sair('',1);
 if(s.caso==='logs-falsos-falha') sair('LOG_ARBITRARIO_SEGREDO\\nFREQUENCIAPP_SINTETICOS_RESULTADO='+('f'.repeat(48))+':e30=\\n',1);
 const linha='FREQUENCIAPP_SINTETICOS_RESULTADO='+s.nonce+':'+Buffer.from(JSON.stringify(report)).toString('base64')+'\\n';
 if(s.caso==='attach-sinal') {await new Promise(()=>{process.stdout.write(linha,()=>process.kill(process.pid,'SIGTERM'))});}
 else if(s.caso==='suite-falhou') sair('LOG_ARBITRARIO_SEGREDO\\n'+linha,1);
 else if(s.caso==='exit-nao-zero') sair(linha,1);
 else sair(linha+(s.caso==='duplicado'?linha:''),s.caso==='attach-falhou'?7:0);
 }
}
if(a[0]==='stop'){s.status='exited';s.exit=130;salvar();sair(s.cid+'\\n')}
if(a[0]==='wait') sair(s.caso==='wait-ausente'?'':String(s.exit)+'\\n');
if(a[0]==='rm'){if(a.at(-1)!==s.cid || !['created','exited'].includes(s.status)) sair('',9);s.removido=true;s.remocaoEstado=s.status;s.remocaoId=a.at(-1);salvar();sair(s.cid+'\\n')}
throw Error('Operação não prevista pelo produtor falso: '+a[0]);
`;

function preparar(caso = "ok") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-sinteticos-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  const cid = randomBytes(32).toString("hex");
  const image = "sha256:" + randomBytes(32).toString("hex");
  fs.writeFileSync(path.join(bin, "docker"), dockerFalso, { mode: 0o700 });
  fs.writeFileSync(path.join(tmp, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(tmp, "estado.json"), JSON.stringify({ cid, image, caso, exit: 0 }));
  const relatorio = path.join(tmp, "publico.json");
  const args = [launcher, "--selftest", "--image", "fixture:tools", "--report", relatorio];
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: tmp,
    TMPDIR: tmp,
    FIXTURE_DOCKER: tmp,
    FONTE_REPO: raiz,
  };
  return {
    tmp,
    cid,
    image,
    relatorio,
    args,
    env,
    chamadas: () =>
      fs.existsSync(path.join(tmp, "chamadas.jsonl"))
        ? fs
            .readFileSync(path.join(tmp, "chamadas.jsonl"), "utf8")
            .trim()
            .split("\n")
            .map(JSON.parse)
        : [],
    limpar: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}
function executar(f) {
  const r = spawnSync(process.execPath, f.args, { env: f.env, encoding: "utf8", timeout: 20000 });
  assert.equal(r.error, undefined, r.stderr);
  assert.equal(r.signal, null, r.stderr);
  return r;
}

// Exercita a guarda real, antes do inventário, sem contêiner ou bypass no launcher.
function conferirMontagens(
  texto,
  arquivoRegular = true,
  uid = 0,
  mode = 0o100755,
  pidIgual = true,
) {
  const fonte = fs.readFileSync(path.join(raiz, "tests/servidor/sinteticos-interno.mjs"), "utf8");
  const inicio = fonte.indexOf("const mounts =");
  const fim = fonte.indexOf('process.chdir("/repo")');
  assert.ok(inicio >= 0 && fim > inicio, "guarda real deve estar presente");
  new Script(fonte.slice(inicio, fim)).runInNewContext({
    assert,
    Buffer,
    perfil: "autoteste",
    fs: {
      readFileSync: (nome) => {
        if (["/usr/sbin/docker-init", "/proc/1/exe"].includes(nome))
          return Buffer.from([0x7f, 0x45, 0x4c, 0x46, nome === "/proc/1/exe" && !pidIgual ? 2 : 1]);
        assert.equal(nome, "/proc/self/mountinfo");
        return texto;
      },
      statSync: (nome) => {
        assert.equal(nome, "/usr/sbin/docker-init");
        return { isFile: () => arquivoRegular, uid, mode };
      },
    },
  });
}

const mountsMinimos = [
  "1 0 0:1 / / ro,relatime - overlay overlay ro",
  "2 1 8:1 /fonte /repo ro,relatime - ext4 /dev/sda ro",
  "3 1 0:2 / /tmp rw,nosuid,nodev - tmpfs tmpfs rw",
];
const mountInit =
  "4 1 8:1 /usr/libexec/docker/docker-init /usr/sbin/docker-init ro,relatime - ext4 /dev/sda rw";

test("mount real do --init permite somente arquivo ELF root readonly do PID 1", () => {
  const texto = [...mountsMinimos, mountInit].join("\n");
  assert.doesNotThrow(() => conferirMontagens(texto));
  assert.doesNotThrow(() =>
    conferirMontagens(
      texto
        .replace("/usr/libexec/docker/docker-init", "/usr/bin/docker-init")
        .replace(" - ext4 /dev/sda rw", " - xfs /dev/sda rw"),
    ),
  );
  assert.throws(() => conferirMontagens(texto, true, 1000));
  assert.throws(() => conferirMontagens(texto, true, 0, 0o100777));
  assert.throws(() => conferirMontagens(texto, true, 0, 0o100644));
  assert.throws(() => conferirMontagens(texto, true, 0, 0o100755, false));
  for (const linha of [
    mountInit.replace("ro,relatime", "rw,relatime"),
    mountInit.replace("ro,relatime", "ro,rw,relatime"),
    mountInit.replace(" - ext4 ", " - tmpfs "),
    mountInit.replace("/usr/libexec/docker/docker-init", "/arquivo-arbitrario"),
    mountInit.replace("/usr/sbin/docker-init", "/usr/sbin/outro"),
  ])
    assert.throws(() => conferirMontagens([...mountsMinimos, linha].join("\n")));
  assert.throws(() => conferirMontagens([...mountsMinimos, mountInit].join("\n"), false));
  assert.throws(() => conferirMontagens([...mountsMinimos, mountInit, mountInit].join("\n")));
  assert.throws(() => conferirMontagens(mountsMinimos.join("\n")));
  assert.throws(() =>
    conferirMontagens(
      [...mountsMinimos, mountInit, "5 1 8:1 /socket /run/docker.sock ro - ext4 /dev/sda rw"].join(
        "\n",
      ),
    ),
  );
});

for (const caso of [
  "suite-falhou",
  "exit-nao-zero",
  "attach-falhou",
  "attach-sinal",
  "logs-ausentes-falha",
  "logs-falsos-falha",
]) {
  test(`falha ${caso} preserva coleta disponível sem aprovar e remove somente o ID parado`, () => {
    const f = preparar(caso);
    try {
      const r = executar(f);
      assert.equal(r.status, 1, r.stderr);
      const p = JSON.parse(fs.readFileSync(f.relatorio, "utf8"));
      assert.equal(p.resultado, "falhou");
      assert.equal(p.encerramento, "confirmado");
      assert.equal(p.limpeza, "removido");
      const temRelatorio = !["logs-ausentes-falha", "logs-falsos-falha"].includes(caso);
      assert.equal(p.contagens.arquivos, temRelatorio ? 1 : 0);
      assert.equal(p.contagens.testes, caso === "suite-falhou" ? 3 : temRelatorio ? 1 : 0);
      assert.equal(p.contagens.falharam, caso === "suite-falhou" ? 2 : 0);
      assert.equal(p.contagens.falhos, caso === "suite-falhou" ? 1 : 0);
      const log = f.chamadas();
      for (const c of ["start", "wait", "rm"]) {
        const calls = log.filter((a) => a[0] === c);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].at(-1), f.cid);
      }
      const s = JSON.parse(fs.readFileSync(path.join(f.tmp, "estado.json"), "utf8"));
      assert.equal(s.remocaoId, f.cid);
      assert.equal(s.remocaoEstado, "exited");
      if (caso === "suite-falhou") assert.equal(s.exit, 1);
      assert.ok(log.findIndex((a) => a[0] === "wait") < log.findIndex((a) => a[0] === "rm"));
      const privado = JSON.parse(fs.readFileSync(f.relatorio + ".privado.json", "utf8"));
      assert.equal(privado.container, f.cid);
      assert.equal(privado.resultado, "falhou");
      assert.equal(
        privado.causa,
        ["logs-ausentes-falha", "logs-falsos-falha"].includes(caso)
          ? "resultado-invalido"
          : ["suite-falhou", "exit-nao-zero"].includes(caso)
            ? "suite-falhou"
            : "attach-invalido",
      );
      assert.equal(fs.statSync(f.relatorio + ".privado.json").mode & 0o777, 0o600);
      assert.equal(
        privado.comandos.find((c) => c.operacao === "start").code,
        caso === "attach-sinal" ? null : caso === "attach-falhou" ? 7 : 1,
      );
      assert.equal(privado.comandos.find((c) => c.operacao === "wait").code, 0);
      assert.ok(!JSON.stringify(p).includes("LOG_ARBITRARIO_SEGREDO"));
      assert.ok(!JSON.stringify(privado).includes("LOG_ARBITRARIO_SEGREDO"));
    } finally {
      f.limpar();
    }
  });
}

test("launcher só aprova após wait, relatório completo e remoção do ID criado", () => {
  const f = preparar();
  try {
    const r = executar(f);
    assert.equal(r.status, 0, r.stderr);
    const log = f.chamadas();
    const create = log.find((a) => a[0] === "create");
    assert.ok(create);
    for (const [flag, value] of [
      ["--network", "none"],
      ["--user", "1000:1000"],
      ["--cap-drop", "ALL"],
      ["--security-opt", "no-new-privileges:true"],
      ["--tmpfs", "/tmp:rw,exec,nosuid,nodev,size=1g"],
    ])
      assert.equal(create[create.indexOf(flag) + 1], value);
    assert.ok(create.includes("--read-only"));
    assert.ok(!create.includes("--rm"));
    const mount = create[create.indexOf("--mount") + 1];
    assert.match(mount, /^type=bind,src=.+\/frequenciapp-fontes-[^/,]+,dst=\/repo,readonly$/);
    assert.ok(!mount.includes(`src=${raiz},`));
    assert.ok(!create.some((a) => a.includes("docker.sock")));
    for (const command of ["start", "wait", "rm"]) {
      const calls = log.filter((a) => a[0] === command);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].at(-1), f.cid);
    }
    assert.ok(log.findIndex((a) => a[0] === "wait") < log.findIndex((a) => a[0] === "rm"));
    const publico = JSON.parse(fs.readFileSync(f.relatorio, "utf8"));
    assert.equal(publico.resultado, "aprovado");
    assert.equal(publico.limpeza, "removido");
    assert.equal(publico.contagens.testes, 1);
    assert.equal(publico.contagens.arquivos, 1);
    assert.ok(!JSON.stringify(publico).includes(f.cid));
  } finally {
    f.limpar();
  }
});

for (const caso of ["rede", "mount", "socket", "uid", "tmpfs", "id", "label", "status-ausente"]) {
  test(`preflight ${caso} recusa antes de start e preserva ownership incerto`, () => {
    const f = preparar(caso);
    try {
      const r = executar(f);
      assert.notEqual(r.status, 0);
      assert.ok(
        f.chamadas().some((a) => a[0] === "create"),
        "a criação deve ter sido alcançada",
      );
      assert.ok(!f.chamadas().some((a) => a[0] === "start"));
      if (["id", "label", "status-ausente"].includes(caso))
        assert.ok(!f.chamadas().some((a) => ["stop", "rm"].includes(a[0])));
    } finally {
      f.limpar();
    }
  });
}
for (const caso of [
  "wait-ausente",
  "exit-ausente",
  "resultado-ausente",
  "resultado-invalido",
  "arquivo-ausente",
  "skip",
  "zero",
  "duplicado",
  "attach-falhou",
  "identidade-final",
]) {
  test(`resultado ${caso} nunca vira aprovação`, () => {
    const f = preparar(caso);
    try {
      const r = executar(f);
      assert.notEqual(r.status, 0);
      assert.ok(
        f.chamadas().some((a) => a[0] === "start"),
        "controle deve alcançar start",
      );
      const p = JSON.parse(fs.readFileSync(f.relatorio, "utf8"));
      assert.notEqual(p.resultado, "aprovado");
      if (caso === "identidade-final") assert.ok(!f.chamadas().some((a) => a[0] === "rm"));
    } finally {
      f.limpar();
    }
  });
}
test("SIGINT interrompe e limpa exclusivamente o recurso próprio após parada confirmada", async () => {
  const f = preparar("sinal");
  try {
    const filho = spawn(process.execPath, f.args, {
      env: f.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    filho.stderr.on("data", (b) => (err += b));
    filho.stdout.resume();
    const fim = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (code, signal) => resolve({ code, signal }));
    });
    for (let n = 0; n < 400 && !f.chamadas().some((a) => a[0] === "start"); n++) await pausa(10);
    assert.ok(
      f.chamadas().some((a) => a[0] === "start"),
      "entrada real no attach pendente",
    );
    filho.kill("SIGINT");
    const r = await fim;
    assert.equal(r.signal, null, err);
    assert.equal(r.code, 130, err);
    const calls = f.chamadas();
    for (const c of ["stop", "rm"]) {
      const own = calls.filter((a) => a[0] === c);
      assert.equal(own.length, 1);
      assert.equal(own[0].at(-1), f.cid);
    }
    assert.ok(calls.findIndex((a) => a[0] === "stop") < calls.findIndex((a) => a[0] === "rm"));
    const p = JSON.parse(fs.readFileSync(f.relatorio, "utf8"));
    assert.equal(p.resultado, "interrompido");
    assert.equal(p.limpeza, "removido");
  } finally {
    f.limpar();
  }
});

test("coletor publica falha estruturada quando a origem está ausente ou inválida", () => {
  const f = preparar();
  try {
    for (const caso of ["ausente", "invalido", "campo-extra"]) {
      const origem = path.join(f.tmp, caso + ".json"),
        destino = path.join(f.tmp, caso + "-publico.json");
      if (caso === "invalido") fs.writeFileSync(origem, "LOG_ARBITRARIO_SEGREDO");
      if (caso === "campo-extra")
        fs.writeFileSync(origem, JSON.stringify({ schema: 1, segredo: "LOG_ARBITRARIO_SEGREDO" }));
      const r = spawnSync(process.execPath, [launcher, "--export-report", origem, destino], {
        encoding: "utf8",
        timeout: 10000,
      });
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(r.status, 1);
      assert.ok(
        fs.existsSync(destino),
        "o coletor deve preservar um resultado público mesmo na falha",
      );
      const texto = fs.readFileSync(destino, "utf8");
      assert.ok(!texto.includes("LOG_ARBITRARIO_SEGREDO"));
      assert.equal(JSON.parse(texto).resultado, "falhou");
    }
    assert.deepEqual(f.chamadas(), []);
  } finally {
    f.limpar();
  }
});

test("coletor publica projeção válida e exige resultado aprovado no gate", () => {
  const f = preparar();
  try {
    assert.equal(executar(f).status, 0);
    const saida = path.join(f.tmp, "projetado.json");
    const r = spawnSync(process.execPath, [launcher, "--export-report", f.relatorio, saida], {
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(
      JSON.parse(fs.readFileSync(saida, "utf8")),
      JSON.parse(fs.readFileSync(f.relatorio, "utf8")),
    );
    assert.equal(spawnSync(process.execPath, [launcher, "--check-report", saida]).status, 0);
    const p = JSON.parse(fs.readFileSync(saida, "utf8"));
    p.resultado = "falhou";
    fs.writeFileSync(saida, JSON.stringify(p));
    assert.equal(spawnSync(process.execPath, [launcher, "--check-report", saida]).status, 1);
  } finally {
    f.limpar();
  }
});

test("entradas integradas exigem os três E2E e --executar, mantendo legados bloqueados", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "entrada-integracao-"));
  try {
    const log = path.join(tmp, "chamadas");
    for (const bin of ["node", "bash"])
      fs.writeFileSync(
        path.join(tmp, bin),
        `#!/bin/sh\nprintf '%s\\n' "${bin} $*" >> '${log}'\nexit 0\n`,
        { mode: 0o700 },
      );
    const r = spawnSync("/bin/bash", [path.join(raiz, "tests/servidor/executar.sh"), "todos"], {
      env: { PATH: `${tmp}:${process.env.PATH}` },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 78);
    const chamadas = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(chamadas.length, 4);
    assert.match(chamadas[0], /sinteticos\.mjs$/);
    assert.match(chamadas[1], /sinteticos\.mjs --perfil controlador-root$/);
    assert.match(chamadas[2], /origem-backup-isolado\.mjs --executar$/);
    assert.match(chamadas[3], /restauracao-url\.sh --executar$/);
    assert.equal(r.stderr.split("BLOQUEADO integracao/").length - 1, 4);
    assert.match(r.stdout, /legados-bloqueados=4 codigo-legados=78/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("entrada sintética encaminha ao launcher independente, sem executar Node no host", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "entrada-sinteticos-"));
  try {
    const bin = path.join(tmp, "node");
    const log = path.join(tmp, "chamadas.json");
    fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" > '${log}'\nexit 0\n`, { mode: 0o700 });
    const r = spawnSync("bash", [path.join(raiz, "tests/servidor/executar.sh"), "sinteticos"], {
      env: { PATH: `${tmp}:${process.env.PATH}`, HOME: tmp, TMPDIR: tmp },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.match(fs.readFileSync(log, "utf8"), /tests\/servidor\/sinteticos\.mjs/);
    assert.equal(r.status, 0, r.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
