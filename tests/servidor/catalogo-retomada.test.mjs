// Exercita CLIs e o consumidor Bash reais; banco, cifra e transporte são falsos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
function executarBackup(env) {
  const inicio = performance.now();
  const resultado = spawnSync("bash", ["scripts/servidor/backup-banco.sh"], {
    cwd: raiz,
    env,
    encoding: "utf8",
    timeout: 25000,
  });
  const duracaoMs = performance.now() - inicio;
  const config = ler(env.BACKUP_RCLONE_CONFIG);
  const eventos = fs
    .readFileSync(config.eventos, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  const diarios = path.join(env.ESTADO_DIR, "expurgos");
  process.stdout.write(
    JSON.stringify({
      reciboEnsaioCatalogo: true,
      status: resultado.status,
      signal: resultado.signal,
      errorCode: resultado.error?.code ?? null,
      duracaoMs,
      transporteAcumulado: Object.fromEntries(
        ["copy", "copyto", "lsjson", "deletefile"].map((acao) => [
          acao,
          eventos.filter((e) => e.acao === acao).length,
        ]),
      ),
      lotes: eventos.filter((e) => e.acao === "loteFalso").length,
      diarios: fs.existsSync(diarios)
        ? fs.readdirSync(diarios).map((nome) => ({
            nome,
            sha256: sha(fs.readFileSync(path.join(diarios, nome))),
            dados: ler(path.join(diarios, nome)),
          }))
        : [],
      remoto: fs
        .readdirSync(config.raiz)
        .map((nome) => ({ nome, sha256: sha(fs.readFileSync(path.join(config.raiz, nome))) })),
      catalogo: fs.readdirSync(path.join(env.ESTADO_DIR, "recibos")).map((nome) => ({
        nome,
        sha256: sha(fs.readFileSync(path.join(env.ESTADO_DIR, "recibos", nome))),
      })),
    }) + "\n",
  );
  return resultado;
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
  const arquivo=process.env.RCLONE_CONFIG; const c=JSON.parse(fs.readFileSync(arquivo,'utf8'));
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

test("#392 Bash retoma expurgo parcial exato e reconcilia histórico sem apagar catálogo", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "expurgo-bash-"));
  try {
    const local = pasta(tmp, "banco"),
      remoto = pasta(tmp, "remoto"),
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
      const r = conjunto(local, i, i % 2 ? "gpg" : "age", { alvo: identidade.chave });
      antigos.push(r);
      copiar(r, local, remoto);
      fs.copyFileSync(
        path.join(local, r.base + ".confirmado.json"),
        path.join(catalogo, r.base + ".confirmado.json"),
      );
    }
    const vizinho = conjunto(local, 7, "gpg", { alvo: identidade.chave, banco: "vizinho" });
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
    const transporte = path.join(tmp, "rclone.conf");
    const falhar = antigos[1].artefatos[1].nome;
    json(transporte, { raiz: remoto, eventos, falhar });
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
      BACKUP_RCLONE_CONFIG: transporte,
      BACKUP_VERIFICAR_REMOTO: "true",
      BACKUP_RETER_REMOTO: "true",
    });
    const primeira = executarBackup(env);
    assert.notEqual(primeira.status, 0, "falha parcial precisa ser propagada");
    assert.match(primeira.stderr, /parcial/i, primeira.stdout + primeira.stderr);
    assert.equal(
      fs.existsSync(path.join(remoto, antigos[1].artefatos[0].nome)),
      false,
      "consumidor não atingiu exclusão real no FS falso",
    );
    assert.equal(fs.existsSync(path.join(remoto, antigos[1].base + ".confirmado.json")), true);
    const diarios = path.join(estado, "expurgos");
    assert.ok(
      fs.existsSync(diarios) && fs.readdirSync(diarios).length > 0,
      "expurgo parcial precisa de registro persistente para retomada conservadora",
    );
    // Uma perda do mínimo pertinente bloqueia a retomada, sem novos deletes.
    const confirmar = antigos[5].artefatos[0].nome;
    const salvo = fs.readFileSync(path.join(remoto, confirmar));
    gravar(path.join(remoto, confirmar), "corrompido durante interrupcao");
    json(transporte, { raiz: remoto, eventos, falhar: "" });
    const antes = fs
      .readFileSync(eventos, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .filter((e) => e.acao === "deletefile").length;
    const bloqueada = executarBackup(env);
    assert.notEqual(bloqueada.status, 0, "mínimo não íntegro deve suspender retomada");
    assert.equal(
      fs
        .readFileSync(eventos, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse)
        .filter((e) => e.acao === "deletefile").length,
      antes,
    );
    gravar(path.join(remoto, confirmar), salvo);
    const segunda = executarBackup(env);
    assert.equal(segunda.status, 0, segunda.stdout + segunda.stderr);
    for (const r of antigos.slice(0, 2)) {
      for (const n of nomes(r)) assert.equal(fs.existsSync(path.join(remoto, n)), false, n);
      assert.ok(
        fs.existsSync(path.join(catalogo, r.base + ".confirmado.json")),
        "evidência independente não pode sumir",
      );
    }
    const terceira = executarBackup(env);
    assert.equal(terceira.status, 0, terceira.stdout + terceira.stderr);
    assert.equal(fs.readFileSync(path.join(local, alheio), "utf8"), "preservar local");
    assert.equal(fs.readFileSync(path.join(remoto, alheio), "utf8"), "preservar remoto");
    for (const n of nomes(vizinho)) assert.ok(fs.existsSync(path.join(remoto, n)));
    const chamadas = fs.readFileSync(eventos, "utf8").trim().split("\n").map(JSON.parse);
    for (const r of antigos.slice(0, 2)) {
      const deletes = chamadas.filter(
        (e) => e.acao === "deletefile" && nomes(r).includes(path.basename(e.args[0])),
      );
      assert.equal(
        path.basename(deletes.at(-1).args[0]),
        r.base + ".confirmado.json",
        "recibo deve ser o último",
      );
      assert.ok(deletes.every((e) => nomes(r).includes(path.basename(e.args[0]))));
    }
    for (const n of fs.readdirSync(catalogo))
      assert.equal(ler(path.join(catalogo, n)).etapas.recuperacaoExercitada, false);
    // Caracterizações novas da interface de lote, sem alterar os cenários originais.
    const eventosAtuais = () => fs.readFileSync(eventos, "utf8").trim().split("\n").map(JSON.parse);
    const lotesAtuais = () => eventosAtuais().filter((e) => e.acao === "loteFalso");
    const deletesAtuais = () => eventosAtuais().filter((e) => e.acao === "deletefile").length;
    assert.ok(lotesAtuais().length > 0, "o despacho de leitura em lote precisa ser atingido");
    assert.ok(lotesAtuais().every((e) => e.status === 0 && e.ausentes.length === 0));
    // Garante um candidato antigo para exigir reobservação antes de qualquer delete.
    const adicional = conjunto(local, 8, "gpg", { alvo: identidade.chave });
    copiar(adicional, local, remoto);
    fs.copyFileSync(
      path.join(local, adicional.base + ".confirmado.json"),
      path.join(catalogo, adicional.base + ".confirmado.json"),
    );
    const guardados = new Map();
    const instanteFixture = new Date("2020-02-01T00:00:00.000Z");
    for (const nome of fs.readdirSync(remoto)) {
      const arquivo = path.join(remoto, nome);
      // Timestamp sintético exato permite restaurar e comparar sem arredondamento.
      fs.utimesSync(arquivo, instanteFixture, instanteFixture);
      const stat = fs.statSync(arquivo);
      guardados.set(nome, {
        bytes: fs.readFileSync(arquivo),
        mode: stat.mode & 0o777,
        atime: stat.atime,
        mtime: stat.mtime,
      });
    }
    const semDeletes = deletesAtuais();
    const omitirNaCopia = lotesAtuais().length + 1;
    json(transporte, { raiz: remoto, eventos, falhar: "", omitirNaCopia, omitir: "todos" });
    const incompleta = executarBackup(env);
    assert.notEqual(incompleta.status, 0, "copy exit 0 com membro ausente precisa bloquear");
    assert.equal(incompleta.error, undefined);
    assert.match(incompleta.stderr, /parcial/i);
    const omitido = lotesAtuais().find((e) => e.numero === omitirNaCopia);
    assert.ok(omitido, "a ausência deve ocorrer entre inventário e cópia");
    assert.equal(omitido.status, 0);
    assert.deepEqual(omitido.ausentes, omitido.lista);
    assert.ok(omitido.ausentes.length > 0);
    assert.deepEqual(omitido.copiados, []);
    assert.equal(deletesAtuais(), semDeletes, "lote incompleto não autoriza novos deletes");
    for (const nome of omitido.ausentes) {
      const salvo = guardados.get(nome);
      assert.ok(salvo, "restauro limitado às fixtures previamente guardadas");
      const arquivo = path.join(remoto, nome);
      assert.equal(fs.existsSync(arquivo), false);
      gravar(arquivo, salvo.bytes);
      fs.chmodSync(arquivo, salvo.mode);
      fs.utimesSync(arquivo, salvo.atime, salvo.mtime);
      assert.deepEqual(fs.readFileSync(arquivo), salvo.bytes);
      const stat = fs.statSync(arquivo);
      assert.equal(stat.mode & 0o777, salvo.mode);
      assert.equal(stat.mtimeMs, salvo.mtime.getTime());
    }
    const adulterarAposCopia = lotesAtuais().length + 1;
    json(transporte, {
      raiz: remoto,
      eventos,
      falhar: "",
      adulterarAposCopia,
      adulterar: "primeiro-dump",
    });
    const alterada = executarBackup(env);
    assert.notEqual(
      alterada.status,
      0,
      "conteúdo alterado com tamanho/mtime iguais precisa bloquear",
    );
    assert.equal(alterada.error, undefined);
    assert.match(alterada.stderr, /parcial/i);
    const lotes = lotesAtuais();
    const inicial = lotes.find((e) => e.numero === adulterarAposCopia);
    assert.ok(inicial?.adulterado, "corrupção simulada deve ocorrer após uma cópia bem-sucedida");
    const adulterado = inicial.adulterado;
    assert.equal(inicial.status, 0);
    assert.ok(inicial.copiados.includes(adulterado.nome));
    assert.equal(adulterado.tamanhoDepois, adulterado.tamanhoAntes);
    assert.equal(adulterado.mtimeDepois, adulterado.mtimeAntes);
    const nova = lotes.find((e) => e.numero > inicial.numero && e.lista.includes(adulterado.nome));
    assert.ok(nova, "a mesma entrada precisa ser relida no fluxo real antes do delete");
    assert.equal(nova.status, 0);
    assert.ok(nova.copiados.includes(adulterado.nome));
    assert.notEqual(nova.destino, inicial.destino);
    assert.notEqual(
      sha(fs.readFileSync(path.join(remoto, adulterado.nome))),
      sha(guardados.get(adulterado.nome).bytes),
    );
    assert.equal(deletesAtuais(), semDeletes, "reobservação corrompida não autoriza novos deletes");
    assert.equal(new Set(lotes.map((e) => e.destino)).size, lotes.length);
    for (const lote of lotes) {
      assert.deepEqual(lote.antes, [], "cada observação começa em destino vazio");
      assert.deepEqual(lote.pulados, [], "nenhum membro pode aproveitar tamanho/mtime anteriores");
      assert.ok(lote.lista.length > 0);
      assert.equal(new Set(lote.lista).size, lote.lista.length);
      const recibo = ler(
        path.join(catalogo, lote.lista[0].slice(0, antigos[0].base.length) + ".confirmado.json"),
      );
      assert.ok(
        lote.lista.every((nome) => nomes(recibo).includes(nome)),
        "lista literal limitada aos membros do recibo",
      );
    }
    process.stdout.write(
      JSON.stringify({
        caracterizacoesLote: true,
        clientes: "rclone FALSO; corrupção simulada",
        incompleta: { status: incompleta.status, evento: omitido },
        fresca: { status: alterada.status, inicial, nova },
        lotes: lotes.length,
        destinosDistintos: true,
        destinosVazios: true,
        nenhumNovoDelete: true,
      }) + "\n",
    );
    process.stdout.write(
      JSON.stringify({
        prova: "Bash/Node/FS reais",
        clientes: "Docker/PG/age/rclone FALSOS",
        testemunhaCatalogo: 1,
        nonce: process.env.CATALOGO_PROVA_NONCE ?? null,
        inputs: Object.fromEntries(
          [
            "tests/unidade/infra/operacao-catalogo-cli.test.ts",
            "tests/servidor/catalogo-retomada.test.mjs",
            "scripts/servidor/backup-recibos.mjs",
            "scripts/servidor/backup-banco.sh",
            "scripts/servidor/recibos.mjs",
            "scripts/servidor/comum.sh",
            "scripts/servidor/identidade.mjs",
            "scripts/servidor/identidade.sh",
          ].map((nome) => [nome, sha(fs.readFileSync(path.join(raiz, nome)))]),
        ),
        casos: ["#391", "#392"],
        retomada: true,
        reciboPorUltimo: true,
        catalogoPreservado: true,
        diarios: fs.readdirSync(diarios).map((n) => ler(path.join(diarios, n))),
      }) + "\n",
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
