// Exercita CLIs e o consumidor Bash reais; banco, cifra e transporte são falsos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fixtureDropbox } from "./dropbox-api-falso.mjs";
import { test } from "node:test";
import { criarRecibo } from "../../scripts/servidor/recibos.mjs";
import { identidadeCompose } from "../../scripts/servidor/identidade.mjs";

const raiz = process.cwd();
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gravar = (arquivo, bytes) => fs.writeFileSync(arquivo, bytes, { mode: 0o600 });
const json = (arquivo, dados) => gravar(arquivo, JSON.stringify(dados) + "\n");
const ler = (arquivo) => JSON.parse(fs.readFileSync(arquivo, "utf8"));
const pasta = (base, nome) => {
  const p = path.join(base, nome);
  fs.mkdirSync(p, { recursive: true, mode: 0o700 });
  return p;
};
const ambiente = (extra) => ({
  PATH: process.env.PATH,
  HOME: os.tmpdir(),
  TMPDIR: os.tmpdir(),
  NODE_ENV: "test",
  BACKUP_MODO: "compose",
  SERVIDOR_ALVO_CHAVE: "sintetico",
  BACKUP_BANCO_VERIFICADO: "escola",
  DATABASE_SCHEMA: "public",
  BACKUP_REMOTO: "falso:copias",
  BACKUP_CATALOGO_PERSISTENTE: "true",
  BACKUP_RETER_DIAS: "1",
  BACKUP_RETER_MINIMO: "5",
  ...extra,
});
function cli(acao, diretorio, env) {
  return spawnSync(process.execPath, ["scripts/servidor/recibos.mjs", acao, diretorio], {
    cwd: raiz,
    env,
    encoding: "utf8",
    timeout: 10000,
  });
}
function conjunto(dir, numero, ext = "age", extra = {}, incluirAmbiente = true) {
  const dia = String(numero).padStart(2, "0");
  const base = `frequenciapp-202001${dia}T000000Z-abcdef01`;
  for (const sufixo of [`.dump.${ext}`, ...(incluirAmbiente ? [`-ambiente.env.${ext}`] : [])]) {
    const nome = base + sufixo;
    const bytes = `FALSO: nao e cifra nem PostgreSQL: ${nome}\n`;
    gravar(path.join(dir, nome), bytes);
    gravar(path.join(dir, nome + ".sha256"), `${sha(bytes)}  ${nome}\n`);
  }
  const r = criarRecibo(dir, {
    base,
    criptografia: ext,
    schema: "public",
    banco: "escola",
    alvo: "sintetico",
    remoto: "falso:copias",
    verificadoRemoto: true,
    destinatario: "pin-sintetico",
    em: `2020-01-${dia}T00:00:00.000Z`,
    ...extra,
  });
  json(path.join(dir, base + ".confirmado.json"), r);
  return r;
}
function nomes(r) {
  return r.artefatos.map((a) => a.nome).concat(r.base + ".confirmado.json");
}
function copiar(r, origem, destino) {
  for (const nome of nomes(r)) fs.copyFileSync(path.join(origem, nome), path.join(destino, nome));
}
async function executarBackup(env) {
  const p = spawn("bash", ["scripts/servidor/backup-banco.sh"], {
    cwd: raiz,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "",
    stderr = "";
  p.stdout.on("data", (c) => {
    stdout += c;
  });
  p.stderr.on("data", (c) => {
    stderr += c;
  });
  const timer = setTimeout(() => p.kill("SIGKILL"), 30000);
  const r = await new Promise((resolve, reject) => {
    p.on("error", reject);
    p.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  clearTimeout(timer);
  process.stdout.write(
    JSON.stringify({ reciboEnsaioCatalogo: true, status: r.status, signal: r.signal }) + "\n",
  );
  return r;
}

// Todos os clientes externos têm despacho fechado e só escrevem na fixture.
const clienteFalso = `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
const tipo=path.basename(process.argv[1]); const a=process.argv.slice(2);
const falhar=()=>{process.stderr.write('Cliente FALSO recusou operacao desconhecida\\n');process.exit(91);};
if(tipo==='age') {
  if(a.length!==4||a[0]!=='--recipients-file'||a[2]!=='--output') falhar();
  fs.writeFileSync(a[3],fs.readFileSync(0));
} else if(tipo==='docker') {
  const d=JSON.parse(fs.readFileSync(process.env.FALSO_DOCKER,'utf8'));
  if(a[0]==='info') process.stdout.write(JSON.stringify(d.daemon));
  else if(a[0]==='inspect') process.stdout.write(JSON.stringify(d.containers));
  else if(a[0]==='compose') {
    const c=a.indexOf('config'); const x=a.indexOf('exec');
    if(c>=0) {
      if(a.includes('--services')) process.stdout.write('app\\ndb\\ncaddy\\n');
      else if(a.includes('--format')) process.stdout.write(JSON.stringify(d.config));
      else if(!a.includes('--quiet')) falhar();
    } else if(a.includes('ps')) process.stdout.write('db-falso\\napp-falso\\n');
    else if(x>=0 && a[x+3]==='psql') process.stdout.write('escola\\n');
    else if(x>=0 && a[x+3]==='pg_dump') process.stdout.write('FALSO: nao PostgreSQL\\n');
    else if(x>=0 && a[x+3]==='pg_restore') fs.readFileSync(0);
    else falhar();
  } else falhar();
} else if(tipo==='rclone') {
  const arquivo=process.env.RCLONE_CONFIG; const linha=fs.readFileSync(arquivo,'utf8').split('\\n').find(l=>l.startsWith('#fixture=')); const c=JSON.parse(fs.readFileSync(linha.slice(9),'utf8'));
  const remoto=(n)=>{ if(!n.startsWith('falso:copias/')) falhar(); const b=n.slice('falso:copias/'.length); if(!b||b.includes('/')||b==='..') falhar(); return path.join(c.raiz,b); };
  fs.appendFileSync(c.eventos,JSON.stringify({acao:a[0],args:a.slice(1)})+'\\n');
  if(a[0]==='copy' && a[1]==='falso:copias') {
    if(a[3]!=='--files-from-raw'||JSON.stringify(a.slice(5))!==JSON.stringify(['--no-traverse','--transfers','1','--checkers','1','--multi-thread-streams','0','--retries','1','--low-level-retries','1'])) falhar();
    const lista=fs.readFileSync(a[4],'utf8').split('\\n'); if(lista.at(-1)==='') lista.pop();
    const antes=fs.readdirSync(a[2]); const copiados=[],ausentes=[],pulados=[];
    const numero=fs.readFileSync(c.eventos,'utf8').split('\\n').filter(Boolean).map(JSON.parse).filter(e=>e.acao==='loteFalso').length+1;
    if(c.omitirNaCopia===numero) for(const n of c.omitir==='todos'?lista:[c.omitir]) { const p=remoto(a[1]+'/'+n); if(fs.existsSync(p)) fs.unlinkSync(p); }
    for(const n of lista) {
      const origem=remoto(a[1]+'/'+n), destino=path.join(a[2],n);
      if(!fs.existsSync(origem)) { ausentes.push(n); continue; }
      const s=fs.statSync(origem), d=fs.statSync(destino,{throwIfNoEntry:false});
      if(d && d.size===s.size && Math.abs(d.mtimeMs-s.mtimeMs)<1) { pulados.push(n); continue; }
      fs.copyFileSync(origem,destino); fs.utimesSync(destino,s.atime,s.mtime); copiados.push(n);
    }
    let adulterado=null;
    if(c.adulterarAposCopia===numero) {
      const nome=c.adulterar==='primeiro-dump'?lista.find(n=>n.includes('.dump.')&&!n.endsWith('.sha256')):c.adulterar;
      if(!nome) falhar();
      const p=remoto(a[1]+'/'+nome), s=fs.statSync(p), bytes=fs.readFileSync(p);
      bytes[0]^=1; fs.writeFileSync(p,bytes); fs.utimesSync(p,s.atime,s.mtime);
      const depois=fs.statSync(p);
      adulterado={nome,tamanhoAntes:s.size,tamanhoDepois:depois.size,mtimeAntes:s.mtimeMs,mtimeDepois:depois.mtimeMs};
    }
    fs.appendFileSync(c.eventos,JSON.stringify({acao:'loteFalso',numero,destino:a[2],lista,antes,copiados,ausentes,pulados,adulterado,status:0})+'\\n');
  } else if(a[0]==='copy') { for(const n of fs.readdirSync(a[1])) fs.copyFileSync(path.join(a[1],n),remoto(a[2]+'/'+n)); }
  else if(a[0]==='copyto') {
    if(a[1].startsWith('falso:')) fs.copyFileSync(remoto(a[1]),a[2]);
    else fs.copyFileSync(a[1],remoto(a[2]));
  } else if(a[0]==='lsjson') {
    if(a[1]!=='falso:copias') falhar();
    process.stdout.write(JSON.stringify(fs.readdirSync(c.raiz).map(n=>({Name:n,Path:n,IsDir:false,Size:fs.statSync(path.join(c.raiz,n)).size}))));
  } else if(a[0]==='deletefile') {
    if(path.basename(a[1])===c.falhar) { process.stderr.write('Falha parcial INJETADA no transporte FALSO\\n'); process.exit(42); }
    fs.unlinkSync(remoto(a[1]));
  } else falhar();
} else falhar();
`;

// O leitor antigo também é exercitado diretamente: não se entrega array pronto ao plano.
test("#391 CLI conta apenas íntegros do mesmo banco/schema/alvo/remoto", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalogo-cli-"));
  try {
    const dir = pasta(tmp, "local");
    const bons = [conjunto(dir, 1, "gpg"), conjunto(dir, 2, "age", {}, false), conjunto(dir, 3)];
    for (const [i, extra] of [
      { banco: "vizinho" },
      { schema: "vizinho" },
      { alvo: "vizinho" },
      { remoto: "vizinho:copias" },
    ].entries())
      conjunto(dir, i + 4, "gpg", extra);
    const incompleto = conjunto(dir, 8);
    fs.unlinkSync(path.join(dir, incompleto.artefatos[0].nome));
    const corrupto = conjunto(dir, 9);
    gravar(path.join(dir, corrupto.artefatos[0].nome), "adulterado");
    const legado = conjunto(dir, 10);
    delete legado.escopo.banco;
    json(path.join(dir, legado.base + ".confirmado.json"), legado);
    gravar(path.join(dir, "quebrado.confirmado.json"), "{nao-json");
    gravar(path.join(dir, "frequenciapp-incompleto.dump.gpg"), "sem recibo");
    const env = ambiente({ BACKUP_RETER_MINIMO: "2" });
    const p = cli("planejar-local", dir, env);
    assert.equal(p.status, 0, p.stderr);
    assert.deepEqual(
      p.stdout.trim().split("\n"),
      nomes(bons[0]).map((n) => `${bons[0].base}\t${n}`),
    );
    assert.equal(cli("planejar-local", dir, { ...env, BACKUP_RETER_MINIMO: "3" }).stdout, "");
    const remoto = cli("catalogo-remoto", dir, env);
    assert.notEqual(remoto.status, 0, "catálogo remoto corrompido não pode ser adotado");
    assert.equal(remoto.stdout, "");
    assert.equal(
      ler(path.join(dir, bons[0].base + ".confirmado.json")).etapas.recuperacaoExercitada,
      false,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("#392 Bash retoma expurgo parcial exato e reconcilia histórico sem apagar catálogo", async () => {
  const f = await fixtureDropbox(0);
  const tmp = f.tmp;
  try {
    const local = pasta(tmp, "banco"),
      remoto = f.remoto,
      estado = pasta(tmp, "estado");
    const catalogo = pasta(estado, "recibos"),
      bin = pasta(tmp, "bin");
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
        Mounts: [
          {
            Type: "volume",
            Name: "volume-falso",
            Source: "/FALSO/sem-mount-real",
            Destination: "/db",
          },
        ],
      },
      {
        Id: "app-falso",
        Config: {
          Labels: {
            "com.docker.compose.project": "sintetico",
            "com.docker.compose.service": "app",
          },
        },
        Mounts: [],
      },
    ];
    const daemon = { ID: "daemon-falso-sem-engine" };
    const identidade = identidadeCompose(config, daemon, containers, {
      projeto: "sintetico",
      app: "app",
      db: "db",
    });
    json(path.join(tmp, "identidade.json"), identidade);
    json(path.join(tmp, "docker.json"), { config, daemon, containers });
    const cliente = path.join(bin, "cliente.mjs");
    gravar(cliente, clienteFalso);
    fs.chmodSync(cliente, 0o700);
    for (const nome of ["docker", "age", "rclone"])
      fs.symlinkSync("cliente.mjs", path.join(bin, nome));
    gravar(path.join(tmp, "app.env"), "FALSO=sem_segredo\n");
    gravar(path.join(tmp, "ops.env"), "");
    gravar(path.join(tmp, "age.txt"), "destinatario FALSO\n");
    const antigos = [];
    for (let i = 1; i <= 6; i++) {
      const r = conjunto(local, i, i % 2 ? "gpg" : "age", { alvo: identidade.trava });
      antigos.push(r);
      copiar(r, local, remoto);
      fs.copyFileSync(
        path.join(local, r.base + ".confirmado.json"),
        path.join(catalogo, r.base + ".confirmado.json"),
      );
    }
    const vizinho = conjunto(local, 7, "gpg", { alvo: identidade.trava, banco: "vizinho" });
    copiar(vizinho, local, remoto);
    fs.copyFileSync(
      path.join(local, vizinho.base + ".confirmado.json"),
      path.join(catalogo, vizinho.base + ".confirmado.json"),
    );
    const alheio = antigos[1].base + "-nao-pertence.env.gpg";
    gravar(path.join(local, alheio), "preservar local");
    gravar(path.join(remoto, alheio), "preservar remoto");
    const eventos = path.join(tmp, "transporte.jsonl");
    gravar(eventos, "");
    const transporte = path.join(tmp, "transporte.json");
    const falhar = antigos[1].artefatos[1].nome;
    json(transporte, { raiz: remoto, eventos, falhar });
    const ini = `#fixture=${transporte}\n[falso]\ntype = dropbox\nroot_namespace = 42\ntoken = {"access_token":"sintetico"}\n`;
    gravar(f.rclone, ini);
    f.config.alvo = identidade.trava;
    f.config.minimoAutorizado = 5;
    f.config.targetLock = path.join(tmp, "locks", `operacoes-${identidade.trava}.lock`);
    f.config.rcloneConfigSha256 = sha(ini);
    json(f.configFile, f.config);
    const env = ambiente({
      PATH: `${bin}:${process.env.PATH}`,
      SERVIDOR_AMBIENTE_INJETADO: "true",
      APP_DIR: raiz,
      APP_ENV_FILE: path.join(tmp, "app.env"),
      OPS_ENV_FILE: path.join(tmp, "ops.env"),
      ESTADO_DIR: estado,
      BACKUP_DIR: tmp,
      BACKUP_BANCO_DIR: local,
      SERVIDOR_LOCK_DIR: path.join(tmp, "locks"),
      COMPOSE_PROJECT_NAME: "sintetico",
      COMPOSE_ARQUIVOS: "compose.yml",
      SERVIDOR_IDENTIDADE_ARQUIVO: path.join(tmp, "identidade.json"),
      BACKUP_PLANILHAS_HABILITADO: "false",
      FALSO_DOCKER: path.join(tmp, "docker.json"),
      POSTGRES_DB: "escola",
      BACKUP_CRIPTOGRAFIA: "age",
      BACKUP_AGE_DESTINATARIOS: path.join(tmp, "age.txt"),
      BACKUP_AGE_DESTINATARIOS_SHA256: sha(fs.readFileSync(path.join(tmp, "age.txt"))),
      BACKUP_INCLUIR_AMBIENTE: "true",
      BACKUP_ESPACO_MINIMO_MB: "0",
      BACKUP_RCLONE_CONFIG: f.rclone,
      BACKUP_DROPBOX_CONFIG: f.configFile,
      NODE_OPTIONS: `--import=${f.preload}`,
      BACKUP_VERIFICAR_REMOTO: "true",
      BACKUP_RETER_REMOTO: "true",
    });

    let revisao = 200000000;
    const hashes = new Map();
    const sincronizar = () => {
      for (const n of fs.readdirSync(remoto)) {
        const h = sha(fs.readFileSync(path.join(remoto, n)));
        if (!f.objects.has(n))
          f.objects.set(n, {
            id: `id:sintetico_${++revisao}`,
            rev: (++revisao).toString(16).padStart(9, "0"),
          });
        else if (hashes.get(n) !== h)
          f.objects.get(n).rev = (++revisao).toString(16).padStart(9, "0");
        hashes.set(n, h);
      }
      for (const n of f.objects.keys())
        if (!fs.existsSync(path.join(remoto, n))) {
          f.objects.delete(n);
          hashes.delete(n);
        }
    };
    const exclusoes = () => f.events.filter((e) => e.route === "/2/files/delete_v2");
    let falharDelete = true,
      omitir = false,
      adulterar = false,
      omitidos = [],
      adulterado;
    f.state.hook = ({ req, res, arg, json }) => {
      if (req.url === "/2/files/list_folder") sincronizar();
      if (req.url === "/2/files/delete_v2" && falharDelete && exclusoes().length === 2) {
        json({ error: "falha_parcial_injetada" }, 503);
        return true;
      }
      if (req.url === "/2/files/download") {
        const n = [...f.objects.keys()].find((n) => f.objects.get(n).id === arg.path);
        if (omitir) {
          omitir = false;
          const r = ler(
            path.join(catalogo, n.slice(0, antigos[0].base.length) + ".confirmado.json"),
          );
          omitidos = nomes(r).map((nome) => ({
            nome,
            bytes: fs.readFileSync(path.join(remoto, nome)),
            meta: { ...f.objects.get(nome) },
          }));
          for (const a of omitidos) fs.unlinkSync(path.join(remoto, a.nome));
          json({ error: "not_found" }, 409);
          return true;
        }
        if (adulterar && n.includes(".dump.") && !n.endsWith(".sha256")) {
          adulterar = false;
          const arquivo = path.join(remoto, n);
          const instante = new Date("2020-02-01T00:00:00.000Z");
          fs.utimesSync(arquivo, instante, instante);
          const stat = fs.statSync(arquivo);
          adulterado = {
            nome: n,
            bytes: fs.readFileSync(arquivo),
            stat,
            downloads: f.events.filter((e) => e.route.endsWith("/download")).length,
          };
          res.on("finish", () => {
            const b = Buffer.from(adulterado.bytes);
            b[0] ^= 1;
            gravar(arquivo, b);
            fs.utimesSync(arquivo, stat.atime, stat.mtime);
          });
        }
      }
      return false;
    };
    const catalogoAntes = new Map(
      fs.readdirSync(catalogo).map((n) => [n, sha(fs.readFileSync(path.join(catalogo, n)))]),
    );
    const primeira = await executarBackup(env);
    assert.equal(primeira.signal, null);
    assert.equal(primeira.status, 1, primeira.stderr);
    assert.equal(
      exclusoes().length,
      2,
      `exclusão parcial deve ser realmente alcançada: ${primeira.stderr}; rotas=${JSON.stringify(f.events.map((e) => e.route))}`,
    );
    assert.equal(fs.existsSync(path.join(remoto, antigos[0].artefatos[0].nome)), false);
    const diarios = path.join(estado, "expurgos");
    const diario = () =>
      fs
        .readdirSync(diarios)
        .filter((n) => n.endsWith(".json"))
        .map((n) => ler(path.join(diarios, n)).valor);
    assert.equal(diario()[0].removidos, 1);
    assert.equal(diario()[0].pendente, 1);
    const confirmar = antigos[5].artefatos[0].nome,
      salvo = fs.readFileSync(path.join(remoto, confirmar));
    gravar(path.join(remoto, confirmar), "corrompido durante interrupcao");
    falharDelete = false;
    const antes = exclusoes().length;
    const bloqueada = await executarBackup(env);
    assert.equal(bloqueada.status, 1);
    assert.equal(exclusoes().length, antes, "perda de íntegro bloqueia retomada");
    gravar(path.join(remoto, confirmar), salvo);
    const segunda = await executarBackup(env);
    assert.equal(segunda.status, 0, segunda.stderr);
    const terceira = await executarBackup(env);
    assert.equal(terceira.status, 0, terceira.stderr);
    for (const r of antigos.slice(0, 2)) {
      for (const n of nomes(r)) assert.equal(fs.existsSync(path.join(remoto, n)), false, n);
      assert.ok(fs.existsSync(path.join(catalogo, r.base + ".confirmado.json")));
      const ids = new Set(
        nomes(r).map((n) => {
          const d = diario().find((j) => j.itens.some((i) => i.nome === n));
          return d.itens.find((i) => i.nome === n).id;
        }),
      );
      const pedidos = exclusoes().filter((e) => ids.has(e.arg.path));
      const ultimo = diario()
        .find((j) => j.itens.some((i) => i.nome === r.base + ".confirmado.json"))
        .itens.at(-1);
      assert.equal(pedidos.at(-1).arg.path, ultimo.id, "recibo deve ser o último");
      assert.ok(pedidos.every((e) => typeof e.arg.parent_rev === "string"));
    }
    for (const [nome, h] of catalogoAntes)
      assert.equal(sha(fs.readFileSync(path.join(catalogo, nome))), h);
    assert.equal(fs.readFileSync(path.join(local, alheio), "utf8"), "preservar local");
    assert.equal(fs.readFileSync(path.join(remoto, alheio), "utf8"), "preservar remoto");
    for (const n of nomes(vizinho)) assert.ok(fs.existsSync(path.join(remoto, n)));
    const semDeletes = exclusoes().length;
    omitir = true;
    const incompleta = await executarBackup(env);
    assert.equal(incompleta.status, 1);
    assert.equal(incompleta.signal, null);
    assert.ok(omitidos.length > 0);
    assert.equal(exclusoes().length, semDeletes);
    for (const a of omitidos) {
      assert.equal(fs.existsSync(path.join(remoto, a.nome)), false);
      gravar(path.join(remoto, a.nome), a.bytes);
      f.objects.set(a.nome, a.meta);
    }
    adulterar = true;
    const alterada = await executarBackup(env);
    assert.equal(alterada.status, 1);
    assert.equal(alterada.signal, null);
    assert.ok(adulterado, "uma leitura bem-sucedida deve preceder a corrupção");
    assert.equal(fs.statSync(path.join(remoto, adulterado.nome)).size, adulterado.stat.size);
    assert.equal(fs.statSync(path.join(remoto, adulterado.nome)).mtimeMs, adulterado.stat.mtimeMs);
    assert.notEqual(
      sha(fs.readFileSync(path.join(remoto, adulterado.nome))),
      sha(adulterado.bytes),
    );
    assert.equal(
      exclusoes().length,
      semDeletes,
      "revisão mudou depois da leitura; nenhum novo delete",
    );
    assert.ok(f.events.filter((e) => e.route.endsWith("/download")).length > adulterado.downloads);
    for (const n of fs.readdirSync(catalogo))
      assert.equal(ler(path.join(catalogo, n)).etapas.recuperacaoExercitada, false);
    process.stdout.write(
      JSON.stringify({
        caracterizacoesNativas: true,
        incompleta: true,
        revisaoFresca: true,
        nenhumNovoDelete: true,
      }) + "\n",
    );
    process.stdout.write(
      JSON.stringify({
        prova: "Bash/Node/FS/HTTPS reais",
        clientes: "Docker/PG/age/rclone/API Dropbox FALSOS",
        testemunhaCatalogo: 1,
        nonce: process.env.CATALOGO_PROVA_NONCE ?? null,
        inputs: Object.fromEntries(
          [
            "tests/unidade/infra/operacao-catalogo-cli.test.ts",
            "tests/servidor/catalogo-retomada.test.mjs",
            "tests/servidor/dropbox-api-falso.mjs",
            "scripts/servidor/backup-recibos.mjs",
            "scripts/servidor/dropbox-api.mjs",
            "scripts/servidor/dropbox-estado.mjs",
            "scripts/servidor/dropbox-autoridade.mjs",
            "scripts/servidor/dropbox-retencao.mjs",
            "scripts/servidor/backup-banco.sh",
            "scripts/servidor/recibos.mjs",
            "scripts/servidor/comum.sh",
            "scripts/servidor/identidade.mjs",
            "scripts/servidor/identidade.sh",
          ].map((n) => [n, sha(fs.readFileSync(path.join(raiz, n)))]),
        ),
        casos: ["#391", "#392"],
        retomada: true,
        reciboPorUltimo: true,
        catalogoPreservado: true,
        diarios: diario().length,
      }) + "\n",
    );
  } finally {
    await f.fechar();
  }
});
