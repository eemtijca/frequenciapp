// Executa o controlador e o backup originais em uma única árvore administrativa Root.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { AMBIENTE, prepararFontes, gravar } from "./atualizacao-integracao-fontes.mjs";
import { hash, exigir } from "./atualizacao-integracao-receitas.mjs";
import { abrirSupervisor } from "./atualizacao-integracao-supervisor.mjs";
import { CARGA } from "./atualizacao-integracao-engine.mjs";

export function conferirConfinamento() {
  exigir(process.getuid() === 0, "ROOT");
  const status = fs.readFileSync("/proc/self/status", "utf8"),
    capEff = /^CapEff:\s*(\S+)/m.exec(status)?.[1],
    nnp = /^NoNewPrivs:\s*(\S+)/m.exec(status)?.[1];
  exigir(capEff === "0000000000000000" && nnp === "1", "CONFINAMENTO");
  exigir(!fs.existsSync("/var/run/docker.sock") && !fs.existsSync("/run/docker.sock"), "SOCKET");
  exigir(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length === 1, "REDE");
  return { uid: process.getuid(), capEff, nnp };
}
async function esperar(fn) {
  const fim = Date.now() + 30000;
  while (!fn()) {
    exigir(Date.now() < fim, "PRAZO");
    await new Promise((r) => setTimeout(r, 10));
  }
}
export async function comando(
  bin,
  args,
  { cwd, env = AMBIENTE, entrada = null, registrar = true, aoStdout = null } = {},
) {
  const filho = spawn(bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] }),
    out = [],
    err = [];
  filho.stdout.on("data", (b) => {
    out.push(Buffer.from(b));
    aoStdout?.(b);
  });
  filho.stderr.on("data", (b) => err.push(Buffer.from(b)));
  let erro = null;
  filho.on("error", (e) => {
    erro = e.code;
  });
  filho.stdin.on("error", () => {});
  filho.stdin.end(entrada);
  const fim = await new Promise((resolve) =>
    filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, close: true })),
  );
  const stdout = Buffer.concat(out),
    stderr = Buffer.concat(err),
    r = {
      ...fim,
      erro,
      stdout: stdout.toString("base64"),
      stderr: stderr.toString("base64"),
      argv: [bin, ...args],
    };
  if (registrar)
    process.stdout.write(
      "ATUALIZACAO_ETAPA=" + Buffer.from(JSON.stringify(r)).toString("base64") + "\n",
    );
  return { ...r, bytes: stdout };
}
function ok(r) {
  assert.equal(r.erro, null);
  assert.equal(r.sinal, null);
  assert.equal(r.codigo, 0, Buffer.from(r.stderr, "base64").toString());
  return r;
}
export function conferirInputs() {
  const bytes = fs.readFileSync("/repo/atualizacao-integracao-inputs.json"),
    m = JSON.parse(bytes);
  exigir(m.versao === 1 && typeof m.rodada === "string" && m.arquivos && m.casos, "INPUTS");
  for (const [n, sha] of Object.entries(m.arquivos)) {
    exigir(!path.isAbsolute(n) && !n.split("/").includes(".."), "INPUTS");
    const a = `/repo/${n}`,
      s = fs.lstatSync(a);
    exigir(
      s.isFile() &&
        !s.isSymbolicLink() &&
        s.nlink === 1 &&
        (s.mode & 0o222) === 0 &&
        hash(fs.readFileSync(a)) === sha,
      "INPUTS",
    );
  }
  return { ...m, sha256: hash(bytes) };
}
// Consumidor independente: recompõe a conclusão a partir da tabela e da referência por caminho.
export function conferirMedicaoAutoridade(m, referencia) {
  const campos = (o, ks) =>
    !!o &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...ks].sort());
  const decimal = (s) => typeof s === "string" && /^(0|[1-9][0-9]*)$/.test(s);
  const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  exigir(
    campos(referencia, ["versao", "rodada", "inputsSha256", "dev", "ino"]) &&
      referencia.versao === 1 &&
      typeof referencia.rodada === "string" &&
      /^[a-z0-9][a-z0-9_-]{1,95}$/.test(referencia.rodada) &&
      typeof referencia.inputsSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(referencia.inputsSha256) &&
      decimal(referencia.dev) &&
      decimal(referencia.ino) &&
      referencia.ino !== "0",
    "WITNESS_REFERENCIA",
  );
  exigir(
    campos(m, [
      "versao",
      "referencia",
      "referenciaValida",
      "janela",
      "enumerados",
      "enumeracaoErro",
      "fechamentoErro",
      "tabela",
      "ebadfTransitorios",
      "fd9",
      "fd9Ausente",
      "completa",
      "encontrados",
      "autoridadeAusente",
      "motivo",
    ]),
    "WITNESS_SCHEMA",
  );
  exigir(
    campos(m.referencia, Object.keys(referencia)) &&
      Object.keys(referencia).every((k) => m.referencia[k] === referencia[k]) &&
      m.referenciaValida === true,
    "WITNESS_REFERENCIA",
  );
  exigir(
    m.versao === 1 &&
      campos(m.janela, ["inicioNs", "fimNs", "escopo", "garantiaFutura"]) &&
      decimal(m.janela.inicioNs) &&
      decimal(m.janela.fimNs) &&
      BigInt(m.janela.fimNs) >= BigInt(m.janela.inicioNs) &&
      m.janela.escopo === "snapshot-/proc/self/fd-com-diretorio-aberto" &&
      m.janela.garantiaFutura === false,
    "WITNESS_SCHEMA",
  );
  exigir(
    Array.isArray(m.enumerados) &&
      m.enumerados.length <= 4096 &&
      m.enumerados.every(
        (fd, i, a) => Number.isSafeInteger(fd) && fd >= 0 && (i === 0 || fd > a[i - 1]),
      ),
    "WITNESS_SCHEMA",
  );
  const fds = [...new Set([...m.enumerados, 9])].sort((a, b) => a - b);
  exigir(
    Array.isArray(m.tabela) &&
      iguais(
        m.tabela.map((o) => o.fd),
        fds,
      ),
    "WITNESS_SCHEMA",
  );
  for (const o of m.tabela) {
    exigir(campos(o, ["fd", "estado", "dev", "ino", "tipo", "erro"]), "WITNESS_SCHEMA");
    if (o.estado === "aberto")
      exigir(
        decimal(o.dev) &&
          decimal(o.ino) &&
          ["0", "10000", "20000", "40000", "60000", "100000", "120000", "140000"].includes(
            o.tipo,
          ) &&
          o.erro === null,
        "WITNESS_SCHEMA",
      );
    else
      exigir(
        ["erro", "ebadf"].includes(o.estado) &&
          o.dev === null &&
          o.ino === null &&
          o.tipo === null &&
          typeof o.erro === "string" &&
          o.erro.length > 0 &&
          (o.estado === "ebadf") === (o.erro === "EBADF"),
        "WITNESS_SCHEMA",
      );
  }
  exigir(
    iguais(
      m.fd9,
      m.tabela.find((o) => o.fd === 9),
    ) && m.fd9Ausente === (m.fd9.estado === "ebadf"),
    "WITNESS_SCHEMA",
  );
  for (const erro of [m.enumeracaoErro, m.fechamentoErro])
    exigir(erro === null || (typeof erro === "string" && erro.length > 0), "WITNESS_SCHEMA");
  const transitorios = m.tabela
    .filter((o) => o.estado === "ebadf" && m.enumerados.includes(o.fd))
    .map((o) => o.fd);
  exigir(iguais(m.ebadfTransitorios, transitorios), "WITNESS_SCHEMA");
  const completa =
    m.enumeracaoErro === null &&
    m.fechamentoErro === null &&
    m.enumerados.length > 0 &&
    m.tabela.every(
      (o) =>
        o.estado === "aberto" || (o.fd === 9 && !m.enumerados.includes(9) && o.estado === "ebadf"),
    );
  const encontrados = m.tabela
    .filter((o) => o.estado === "aberto" && o.dev === referencia.dev && o.ino === referencia.ino)
    .map((o) => o.fd);
  const ausencia = completa && encontrados.length === 0;
  exigir(
    m.completa === completa &&
      iguais(m.encontrados, encontrados) &&
      m.autoridadeAusente === ausencia &&
      m.motivo ===
        (!completa
          ? "OBSERVACAO_INCOMPLETA"
          : encontrados.length
            ? "AUTORIDADE_PRESENTE"
            : "AUTORIDADE_AUSENTE"),
    "WITNESS_CONCLUSAO",
  );
  exigir(completa, "WITNESS_OBSERVACAO");
  exigir(ausencia, "WITNESS_AUTORIDADE");
  return true;
}
export async function ensaiar() {
  const confinado = conferirConfinamento(),
    inputs = conferirInputs();
  process.umask(0o077);
  const raiz = "/scratch/coeso-" + randomUUID().replaceAll("-", "");
  const m = prepararFontes(raiz),
    v = m.vertical;
  // Cópias públicas legíveis viram NOVOS arquivos root-owned, sem chown/capacidades.
  const harness = `${raiz}/harness`;
  for (const n of fs.readdirSync(new URL(".", import.meta.url))) {
    if (
      /^atualizacao-integracao-(?:adaptador|receitas|fontes|engine|shim|supervisor)\.mjs$/.test(
        n,
      ) ||
      /^atualizacao-integracao-(?:container|imagem)\.json$/.test(n)
    )
      gravar(`${harness}/${n}`, fs.readFileSync(new URL(n, import.meta.url)));
  }
  const arquivo = `${raiz}/manifesto.json`;
  gravar(arquivo, JSON.stringify(m) + "\n");
  const supervisor = await abrirSupervisor(m, arquivo);
  await esperar(() => fs.existsSync(`${raiz}/ids.json`));
  try {
    const ids = JSON.parse(fs.readFileSync(`${raiz}/ids.json`));
    for (const bin of ["docker", "curl"])
      gravar(
        `${v.bin}/${bin}`,
        `#!/bin/sh\n# Cliente finito sem shell recebido pelo transporte.\nexec /usr/local/bin/node ${harness}/atualizacao-integracao-shim.mjs ${arquivo} ${bin} "$@"\n`,
        0o700,
      );
    fs.mkdirSync(v.config, { mode: 0o700 });
    const chave = `${raiz}/age-privada.txt`;
    ok(await comando("/usr/bin/age-keygen", ["-o", chave], { cwd: raiz, registrar: false }));
    const publica = ok(
      await comando("/usr/bin/age-keygen", ["-y", chave], { cwd: raiz, registrar: false }),
    ).bytes;
    gravar(`${raiz}/destinatarios.age`, publica);
    gravar(`${v.config}/app.env`, "POSTGRES_USER=frequencia\nPOSTGRES_DB=frequencia\n");
    const ops = {
      COMPOSE_PROJECT_NAME: m.projeto,
      COMPOSE_ARQUIVOS: "compose.yml",
      BACKUP_PLANILHAS_HABILITADO: "false",
      ATUALIZAR_MODO: "main",
      ATUALIZAR_PERMITIR_BACKUP_LOCAL: "true",
      ATUALIZAR_ESPACO_MINIMO_MB: "0",
      ATUALIZAR_SAUDE_URL: "https://sintetico.invalid/api/saude",
      ATUALIZAR_VERIFICAR_SAUDE_PUBLICA: "false",
      APP_IMAGEM_REPOSITORIO: "ensaio/app",
      APP_IMAGEM_BACKUP_REPOSITORIO: "ensaio/backup",
      BACKUP_CRIPTOGRAFIA: "age",
      BACKUP_AGE_DESTINATARIOS: `${raiz}/destinatarios.age`,
      BACKUP_AGE_DESTINATARIOS_SHA256: hash(publica),
      BACKUP_ESPACO_MINIMO_MB: "0",
      BACKUP_REMOTO: "",
      BACKUP_RCLONE_CONFIG: "",
      ESTADO_DIR: `${raiz}/legado`,
    };
    gravar(
      `${v.config}/ops.env`,
      Object.entries(ops)
        .map(([k, val]) => `${k}='${val}'\n`)
        .join(""),
    );
    const ambiente = {
      ...AMBIENTE,
      ...ops,
      PATH: `${v.bin}:${AMBIENTE.PATH}`,
      APP_DIR: v.app,
      APP_ENV_FILE: `${v.config}/app.env`,
      OPS_ENV_FILE: `${v.config}/ops.env`,
      SERVIDOR_IDENTIDADE_ARQUIVO: `${v.config}/identidade.json`,
      SERVIDOR_CONFIG_DIR: v.config,
      SERVIDOR_AMBIENTE_INJETADO: "true",
      SERVIDOR_LOCK_DIR: `${raiz}/locks`,
      POSTGRES_DB: m.banco,
      POSTGRES_USER: m.usuario,
    };
    const adocao = ok(
      await comando(
        "/bin/bash",
        [`${v.fonte}/scripts/servidor/identidade.sh`, "--adotar", "--confirmar"],
        { cwd: raiz, env: ambiente },
      ),
    );
    const instalacao = ok(
      await comando(
        "/bin/bash",
        [
          `${v.fonte}/scripts/servidor/instalar-controlador.sh`,
          "--fonte",
          v.fonte,
          "--app",
          v.app,
          "--config",
          v.config,
          "--prefixo",
          v.prefixo,
          "--operador",
          "nobody",
          "--bin-dir",
          v.bin,
          "--confirmar",
        ],
        { cwd: raiz },
      ),
    );
    const perfil = JSON.parse(fs.readFileSync(`${v.prefixo}/perfil.json`));
    assert.equal(perfil.operador, "nobody");
    assert.equal(
      hash(fs.readFileSync(`${perfil.snapshot}/scripts/servidor/backup-banco.sh`)),
      v.publico["scripts/servidor/backup-banco.sh"],
    );
    assert.equal(hash(fs.readFileSync(perfil.compose[0])), v.composeSha256);
    const atualizacao = ok(await comando(`${v.prefixo}/executar`, ["atualizar"], { cwd: raiz }));
    for (const esperado of [Buffer.from([0, 255, 13, 10, 83]), Buffer.from([82, 0, 254, 10])])
      assert.ok(
        Buffer.from(atualizacao.stderr, "base64").includes(esperado),
        "stderr binário do dump/listagem atravessa o canal sem contaminação",
      );
    const journal = fs.readdirSync(`${perfil.dados}/journal`);
    assert.equal(journal.length, 1);
    const op = journal[0],
      pinDir = `${perfil.dados}/pins/${op}`,
      pin = JSON.parse(fs.readFileSync(`${pinDir}/pin.json`));
    const fim = JSON.parse(fs.readFileSync(`${perfil.dados}/journal/${op}/concluida.json`));
    assert.equal(fim.status, 0);
    const estado = JSON.parse(fs.readFileSync(`${perfil.estado}/estado.json`));
    const ponteiro = JSON.parse(fs.readFileSync(`${perfil.estado}/ultimo-backup.json`));
    const decifra = ok(
      await comando(
        "/usr/bin/age",
        ["--decrypt", "--identity", chave, `${pinDir}/${ponteiro.arquivo}`],
        { cwd: raiz, registrar: false },
      ),
    );
    assert.deepEqual(decifra.bytes, CARGA);
    assert.notDeepEqual(fs.readFileSync(`${pinDir}/${ponteiro.arquivo}`), CARGA);
    // Novo processo confinado abre os mesmos arquivos duráveis; não simula power loss.
    const reabertura = ok(await comando(`${v.prefixo}/executar`, ["estado"], { cwd: raiz }));
    const reaberto = JSON.parse(reabertura.bytes);
    assert.deepEqual(reaberto.operacoes, journal);
    const http = ok(
      await comando(
        `${v.bin}/curl`,
        [
          "-fsS",
          "--retry",
          "12",
          "--retry-delay",
          "5",
          "--retry-all-errors",
          "--max-time",
          "15",
          "https://sintetico.invalid/api/saude",
        ],
        { cwd: raiz },
      ),
    );
    const sentinela = ok(
      await comando(
        `${v.bin}/docker`,
        [
          "compose",
          "--project-name",
          m.projeto,
          "--project-directory",
          v.app,
          "--env-file",
          perfil.appEnv,
          "--env-file",
          perfil.opsEnv,
          "-f",
          perfil.compose[0],
          "exec",
          "-T",
          "db",
          "psql",
          "-X",
          "-U",
          m.usuario,
          "-d",
          m.banco,
          "-v",
          "ON_ERROR_STOP=1",
          "-tAc",
          "select valor from marcador",
        ],
        { cwd: raiz },
      ),
    );
    const lockPath = `${perfil.locks}/operacoes-${perfil.alvo}.lock`;
    const lockDir = fs.lstatSync(perfil.locks, { bigint: true });
    const s = fs.statSync(lockPath, { bigint: true }),
      ls = fs.lstatSync(lockPath, { bigint: true });
    assert.ok(
      lockDir.isDirectory() &&
        !lockDir.isSymbolicLink() &&
        lockDir.uid === 0n &&
        (lockDir.mode & 0o7777n) === 0o700n,
    );
    assert.ok(
      ls.isFile() &&
        !ls.isSymbolicLink() &&
        ls.uid === 0n &&
        ls.nlink === 1n &&
        (ls.mode & 0o7777n) === 0o600n,
    );
    assert.equal(fs.realpathSync(lockPath), lockPath);
    assert.ok(s.dev === ls.dev && s.ino === ls.ino);
    const referenciaLock = {
      versao: 1,
      rodada: inputs.rodada,
      inputsSha256: inputs.sha256,
      dev: s.dev.toString(),
      ino: s.ino.toString(),
    };
    const shims = fs
      .readFileSync(`${raiz}/shims.ndjson`, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse);
    for (const receita of ["dump", "listar-dump", "construir", "subir"]) {
      const chamadas = shims.filter((c) => c.receita === receita);
      assert.ok(chamadas.length > 0, receita);
      for (const c of chamadas) {
        assert.ok(Number.isSafeInteger(c.fd9?.dev) && Number.isSafeInteger(c.fd9?.ino));
        assert.deepEqual(
          { dev: String(c.fd9.dev), ino: String(c.fd9.ino) },
          { dev: referenciaLock.dev, ino: referenciaLock.ino },
        );
      }
    }
    const leituras = shims.filter((c) => c.receita === "validar-imagem");
    assert.ok(leituras.length > 0, "leitura readonly da imagem-alvo");
    for (const c of leituras) {
      assert.equal(c.revisao, "B");
      // Null indica ausência da autoridade no ambiente reconstruído pelo CLI;
      // não declara ausência física do descritor que o CLI pode encaminhar.
      assert.equal(c.fd9, null);
    }
    assert.ok(
      shims
        .filter((c) => ["construir", "subir"].includes(c.receita))
        .every(
          (c) => c.argv.includes(perfil.compose[0]) && !c.argv.includes(`${v.app}/compose.yml`),
        ),
    );
    const publico = "/tmp/atualizacao-integracao-probe";
    fs.mkdirSync(publico, { mode: 0o1777 });
    fs.chmodSync(publico, 0o1777);
    const publicStat = fs.lstatSync(publico);
    assert.ok(
      publicStat.isDirectory() &&
        !publicStat.isSymbolicLink() &&
        publicStat.uid === 0 &&
        (publicStat.mode & 0o7777) === 0o1777,
    );
    gravar(
      `${publico}/alvo.json`,
      JSON.stringify({
        privado: `${v.prefixo}/perfil.json`,
        socket: v.socket,
        referencia: referenciaLock,
      }),
      0o644,
    );
    const alvoStat = fs.lstatSync(`${publico}/alvo.json`);
    assert.ok(
      alvoStat.isFile() &&
        !alvoStat.isSymbolicLink() &&
        alvoStat.uid === 0 &&
        alvoStat.nlink === 1 &&
        (alvoStat.mode & 0o7777) === 0o644,
    );
    const alvoBytes = fs.readFileSync(`${publico}/alvo.json`);
    process.stdout.write("ADAPTADOR_PROBE_PRONTO\n");
    await esperar(() => fs.existsSync(`${publico}/resultado.json`));
    const resultadoStat = fs.lstatSync(`${publico}/resultado.json`);
    assert.ok(
      resultadoStat.isFile() &&
        !resultadoStat.isSymbolicLink() &&
        resultadoStat.uid === 65534 &&
        resultadoStat.nlink === 1 &&
        (resultadoStat.mode & 0o7777) === 0o644 &&
        resultadoStat.size < 1024 * 1024,
    );
    assert.deepEqual(fs.readFileSync(`${publico}/alvo.json`), alvoBytes);
    const lockDepois = fs.statSync(lockPath, { bigint: true });
    assert.ok(
      lockDepois.dev === s.dev &&
        lockDepois.ino === s.ino &&
        lockDepois.uid === 0n &&
        (lockDepois.mode & 0o7777n) === 0o600n,
    );
    const operador = JSON.parse(fs.readFileSync(`${publico}/resultado.json`));
    assert.deepEqual(Object.keys(operador).sort(), [
      "escritaNegada",
      "fd9Ausente",
      "leituraNegada",
      "medicao",
      "socketNegado",
      "uid",
      "versao",
    ]);
    assert.equal(operador.versao, 2);
    assert.equal(operador.uid, 65534);
    for (const k of ["leituraNegada", "escritaNegada", "socketNegado"])
      assert.equal(operador[k], true);
    assert.equal(operador.fd9Ausente, operador.medicao.fd9Ausente);
    conferirMedicaoAutoridade(operador.medicao, referenciaLock);
    const fechado = await supervisor.fechar();
    await assert.rejects(supervisor.cliente.executar({ receita: "subir" }), { code: "FECHADO" });
    const engine = JSON.parse(fs.readFileSync(`${raiz}/engine-final.json`));
    assert.deepEqual(engine.ledger, []);
    const eventos = engine.efeitos;
    const index = (nome) => eventos.findIndex((e) => e.tipo === nome);
    const leitor = eventos.find((e) => e.tipo === "create" && e.papel === "leitor");
    assert.ok(leitor);
    const ordem = ["create", "inspect", "start", "inspect", "attach", "wait", "inspect", "rmOwn"];
    assert.deepEqual(
      eventos.filter((e) => e.id === leitor.id).map((e) => e.tipo),
      ordem,
    );
    const exportados = {};
    for (const [pasta, nome] of [
      [`${perfil.dados}/journal/${op}`, "journal"],
      [pinDir, "pin"],
      [perfil.estado, "estado"],
    ])
      for (const n of fs.readdirSync(pasta)) {
        const a = `${pasta}/${n}`,
          st = fs.lstatSync(a);
        if (st.isFile()) {
          assert.equal(st.uid, 0);
          assert.equal(st.mode & 0o077, 0);
          exportados[`${nome}/${n}`] = {
            sha256: hash(fs.readFileSync(a)),
            bytes: fs.readFileSync(a).toString("base64"),
            modo: st.mode & 0o777,
          };
        }
      }
    const db = engine.recursos.find((c) => c.Id === ids.db),
      proxy = engine.recursos.find((c) => c.Id === ids.caddy);
    assert.ok(db && proxy);
    return {
      fase: "EngineFake-confinado",
      inputsSha256: inputs.sha256,
      rodada: inputs.rodada,
      ...confinado,
      A: m.revisoes.A.commit,
      B: m.revisoes.B.commit,
      instalacao,
      adocao,
      atualizacao,
      estado,
      httpSimulado: http.bytes.toString(),
      sentinelaSimulada: sentinela.bytes.toString(),
      dbAntes: ids.db,
      dbDepois: db.Id,
      proxyAntes: ids.caddy,
      proxyDepois: proxy.Id,
      volumeAntes: `${m.projeto}-dados`,
      volumeDepois: db.Mounts[0].Name,
      cifraAgeReal: decifra.bytes.equals(CARGA),
      dumpListagemConcorrentes: eventos.some((e) => e.tipo === "pgfake-concorrente"),
      pinAntesBuild: index("pin-conferido") >= 0 && index("pin-conferido") < index("build"),
      migradorDaImagem: eventos.some((e) => e.tipo === "attach"),
      reabertura,
      operador,
      referenciaLock,
      revogado: engine.revogado,
      filhosAtivos: engine.filhosAtivos,
      backendRealExecutado: false,
      ladoHost: "simulado dentro do Root, não UID1000 físico",
      limites: "DB/HTTP/OCI EngineFake explícitos; AGE/Git/controlador/backup/locks/pipes físicos",
      fechado,
      engine,
      shims,
      exportados,
      manifesto: m,
    };
  } catch (e) {
    await supervisor
      .fechar()
      .catch((f) => process.stderr.write(`Fechamento: ${f.code ?? f.message}\n`));
    throw e;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  conferirConfinamento();
  exigir(process.argv.length === 3 && process.argv[2] === "--engine-fake", "PERFIL");
  try {
    const r = await ensaiar();
    process.stdout.write(
      "ATUALIZACAO_PROVA=" + Buffer.from(JSON.stringify(r)).toString("base64") + "\n",
    );
  } catch (e) {
    process.stderr.write(e.stack + "\n");
    process.exitCode = 1;
  }
}
