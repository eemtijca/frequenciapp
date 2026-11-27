// Reproduz a entrada estável e o atualizador agendado com clientes externos sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { fixture } from "./fixture.mjs";

const arquivo = fileURLToPath(import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ler = (nome) => JSON.parse(fs.readFileSync(nome, "utf8"));
const chave = "ATUALIZAR_APROVAR_MIGRACOES_AUTOMATICAMENTE";
const anterior = "20260101000000_base";
const nova = "20260102000000_aditiva";
const sqlBase = 'CREATE TABLE "turmas" ("id" INTEGER);\n';
const sqlNovo = 'ALTER TABLE "turmas" ADD COLUMN "observacao" TEXT;\n';
const imagemBase = `sha256:${"a".repeat(64)}`;
const imagemAlvo = `sha256:${"b".repeat(64)}`;
const idApp = "c".repeat(64);
const idNovo = "d".repeat(64);
const idDb = "e".repeat(64);
const ip = "172.30.1.2";
const url = "postgresql://frequencia:fixture@db/frequencia?schema=public";
const banco = { cluster: "7654321098765432100", banco: "frequencia", schema: "public" };
const origem = { container: idDb, ...banco, bancoOid: "16384", schemaOid: "2200" };
const diretorioSql = "prisma/migrations";
const json = (obj) => `${JSON.stringify(obj)}\n`;
const emitirLinha = (texto) => process.stdout.write(`${texto}\n`);
const gravar = (nome, bytes) => fs.writeFileSync(nome, bytes, { mode: 0o600 });

function catalogar(p, base, em, operacao) {
  const dir = `${p.backups}/banco`;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(`${p.estado}/recibos`, { recursive: true, mode: 0o700 });
  const arquivo = `${base}.dump.age`;
  const recibo = `${base}.confirmado.json`;
  const dump = `bytes de backup sintético: ${base}\n`;
  const checksum = `${sha(dump)}  ${arquivo}\n`;
  gravar(`${dir}/${arquivo}`, dump);
  gravar(`${dir}/${arquivo}.sha256`, checksum);
  const dados = json({
    versao: 1,
    base,
    em,
    escopo: { tipo: "schema", alvo: p.alvo, banco: banco.banco, schema: banco.schema },
    remoto: "teste:exclusivo",
    criptografia: "age",
    destinatario: sha(fs.readFileSync(`${p.config}/destinatarios.age`)),
    ...(operacao ? { origem: { ...origem, operacao } } : {}),
    etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
    artefatos: [
      { nome: arquivo, sha256: sha(dump) },
      { nome: `${arquivo}.sha256`, sha256: sha(checksum) },
    ],
  });
  gravar(`${dir}/${recibo}`, dados);
  gravar(`${p.estado}/recibos/${recibo}`, dados);
  return { recibo, arquivo, sha256: sha(dump), reciboSha256: sha(dados) };
}

function backup() {
  const env = process.env;
  const p = ler(env.SERVIDOR_CONTROLADOR_PERFIL);
  const operacao = env.SERVIDOR_CONTROLADOR_OPERACAO;
  assert.deepEqual(JSON.parse(env.BACKUP_MIGRACOES_AUTO_ESPERADO), origem);
  assert.equal(ler(`${p.dados}/journal/${operacao}/intencao.json`).migracoesAuto, true);
  fs.appendFileSync(`${p.config}/eventos`, "backup\n");
  const em = new Date().toISOString();
  const nome = `frequenciapp-${em.slice(0, 19).replace(/[:-]/g, "")}Z-2345abcd`;
  const novo = catalogar(p, nome, em, operacao);
  for (const membro of [novo.arquivo, `${novo.arquivo}.sha256`, novo.recibo]) {
    fs.copyFileSync(`${p.backups}/banco/${membro}`, `${p.config}/remoto-sintetico/${membro}`);
  }
  gravar(
    `${p.estado}/ultimo-backup.json`,
    json({
      ...novo,
      em,
      modo: "compose",
      criptografia: "age",
      schema: banco.schema,
      remoto: "teste:exclusivo",
      verificadoRemoto: true,
      ambiente: "",
      ambienteSha256: "",
    }),
  );
}

function docker(raiz, acao, args) {
  const dados = ler(`${raiz}/dados-replay.json`);
  const evento = (texto) => fs.appendFileSync(`${raiz}/config/eventos`, `${texto}\n`);
  const { base, alvo, caso } = dados;
  const iniciado = fs.existsSync(`${raiz}/subiu`);
  const app = iniciado ? idNovo : idApp;
  const revisao = iniciado ? alvo : base;
  const reinicio = !iniciado || fs.existsSync(`${raiz}/reinicio`) ? "unless-stopped" : "no";
  const ambienteApp = {
    DATABASE_URL: url,
    DIRECT_URL: url,
    DATABASE_SCHEMA: banco.schema,
    MIGRAR_NA_PARTIDA: "true",
  };
  function inspecionar(id) {
    assert.ok([app, idDb].includes(id));
    const db = id === idDb;
    return {
      Id: id,
      Image: db ? `sha256:${"f".repeat(64)}` : iniciado ? imagemAlvo : imagemBase,
      HostConfig: { RestartPolicy: { Name: reinicio } },
      State: { Running: true, ...(!db && { Health: { Status: "healthy" } }) },
      Config: {
        Labels: {
          "com.docker.compose.project": "sintetico",
          "com.docker.compose.service": db ? "db" : "app",
        },
        Env: db
          ? ["POSTGRES_DB=frequencia"]
          : Object.entries(ambienteApp).map(([k, v]) => `${k}=${v}`),
      },
      NetworkSettings: { Networks: { "sintetico-interna": { IPAddress: ip } } },
      Mounts: db
        ? [
            {
              Type: "volume",
              Name: "sintetico-dados",
              Source: "/var/lib/docker/volumes/sintetico-dados/_data",
              Destination: "/var/lib/postgresql/data",
            },
          ]
        : [],
    };
  }
  if (acao === "info") {
    emitirLinha(json({ ID: "daemon-sintetico" }).trim());
  } else if (acao === "inspect") {
    if (args[0] === "--format") {
      const c = inspecionar(args[2]);
      const formatos = {
        "{{.Image}}": c.Image,
        "{{.HostConfig.RestartPolicy.Name}}": reinicio,
        "{{.Image}}/{{.HostConfig.RestartPolicy.Name}}": `${c.Image}/${reinicio}`,
      };
      assert.ok(args[1] in formatos);
      emitirLinha(formatos[args[1]]);
    } else emitirLinha(JSON.stringify(args.map(inspecionar)));
  } else if (acao === "image") {
    assert.deepEqual(args.slice(0, 2), ["inspect", "--format"]);
    const [, , formato, imagem] = args;
    if (formato === "{{.Id}}") emitirLinha(imagemAlvo);
    else emitirLinha(imagem === imagemBase ? base : alvo);
  } else if (acao === "run") {
    if (args.includes("/bin/cat")) {
      process.stdout.write(fs.readFileSync(`${raiz}/app/docker/app/migrar.mjs`));
    } else {
      assert.ok(args.includes(imagemAlvo));
      assert.ok(args.includes("--read-only") && args.includes("none"));
      assert.match(fs.readFileSync(0, "utf8"), /sondarImagem/);
      const inventario = { ...dados.inventario };
      if (caso === "bytes-divergentes")
        inventario[`${diretorioSql}/${nova}/migration.sql`] = "0".repeat(64);
      emitirLinha(JSON.stringify(inventario));
    }
  } else if (acao === "exec") {
    if (args[0] === "-i") {
      assert.ok([app, idDb].includes(args[1]));
      assert.match(fs.readFileSync(0, "utf8"), /pg_control_system/);
      if (args[1] === idDb) assert.ok(args.includes("/var/run/postgresql"));
      else assert.equal(args.at(-1), ip);
      evento(iniciado ? "histórico-final" : "histórico-base");
      emitirLinha(
        JSON.stringify({
          ...origem,
          usuario: "frequencia",
          primario: true,
          gatilhos: false,
          registros: [
            [anterior, sha(sqlBase), true],
            ...(iniciado && caso !== "historico-final-divergente"
              ? [[nova, sha(sqlNovo), true]]
              : []),
          ],
        }),
      );
    } else {
      assert.equal(args[0], app);
      assert.match(args.at(-1), /api\/saude/);
      emitirLinha(JSON.stringify({ ok: true, commit: revisao }));
    }
  } else if (acao === "update") {
    assert.deepEqual(args, ["--restart=unless-stopped", idNovo]);
    const origemMontada = fs.readFileSync(`${raiz}/montagem`, "utf8");
    assert.equal(fs.existsSync(`${origemMontada}/autorizar`), false);
    evento("reinício normal");
    gravar(`${raiz}/reinicio`, "");
  } else {
    assert.equal(acao, "compose");
    let volumes;
    while (
      ["--project-name", "--project-directory", "--env-file", "-f", "--profile"].includes(args[0])
    ) {
      if (args[0] === "-f" && args[1].endsWith("/compose.json")) {
        volumes = ler(args[1]).services.app.volumes;
      }
      args = args.slice(2);
    }
    const [comando, ...opcoes] = args;
    const env = process.env;
    if (comando === "config") {
      if (opcoes.includes("--services")) emitirLinha("app\ndb\ncaddy");
      else if (opcoes.includes("--format")) {
        emitirLinha(
          JSON.stringify({
            name: "sintetico",
            networks: { interna: { internal: true, name: "sintetico-interna" } },
            services: {
              app: {
                command: ["./docker/app/entrypoint.sh"],
                networks: { interna: null },
                restart: env.MIGRACAO_POLITICA_REINICIO ?? "unless-stopped",
                image: env.APP_IMAGEM,
                volumes,
                environment: {
                  ...ambienteApp,
                  MIGRACAO_AUTOMATICA: env.MIGRACAO_AUTOMATICA,
                  MIGRACAO_LOTE_APROVADO: env.MIGRACAO_LOTE_APROVADO,
                },
              },
              db: {
                networks: { interna: null },
                environment: { POSTGRES_DB: "frequencia", POSTGRES_USER: "frequencia" },
                volumes: [{ type: "volume", source: "dados", target: "/var/lib/postgresql/data" }],
              },
              caddy: {},
            },
            volumes: { dados: { name: "sintetico-dados" } },
          }),
        );
      } else assert.deepEqual(opcoes, ["--quiet"]);
    } else if (comando === "ps") {
      if (opcoes.includes("-aq")) emitirLinha(`${app}\n${idDb}`);
      else emitirLinha(opcoes.at(-1) === "db" ? idDb : app);
    } else if (comando === "exec") {
      assert.equal(caso, "opt-out");
      assert.deepEqual(opcoes.slice(0, 4), ["-T", "db", "psql", "-XwqAt"]);
      const consulta = fs.readFileSync(0, "utf8");
      assert.match(consulta, /BEGIN READ ONLY/);
      assert.match(consulta, /_prisma_migrations/);
      evento("histórico para manifesto");
      emitirLinha(JSON.stringify([[anterior, sha(sqlBase), true]]));
    } else if (comando === "build") {
      assert.deepEqual(opcoes, ["app"]);
      assert.equal(env.COMMIT_SHA, alvo);
      evento("build");
      if (caso === "build-falhou") process.exitCode = 1;
    } else {
      evento(`tentativa ${comando}`);
      assert.equal(comando, "up");
      assert.deepEqual(opcoes, [
        "-d",
        "--no-deps",
        "--no-build",
        "--pull",
        "never",
        "--wait",
        "--wait-timeout",
        "180",
        "app",
      ]);
      assert.equal(env.APP_IMAGEM, imagemAlvo);
      assert.equal(env.MIGRACAO_AUTOMATICA, "true");
      assert.equal(env.MIGRACAO_POLITICA_REINICIO, "no");
      assert.equal(volumes?.length, 1);
      assert.equal(
        fs.readFileSync(`${volumes[0].source}/autorizar`, "utf8"),
        env.MIGRACAO_LOTE_APROVADO,
      );
      gravar(`${raiz}/montagem`, volumes[0].source);
      const p = ler(`${raiz}/controlador/perfil.json`);
      const pasta = `${p.dados}/journal/${env.SERVIDOR_CONTROLADOR_OPERACAO}`;
      assert.equal(ler(`${pasta}/migracoes-auto.json`).lote.alvo, alvo);
      assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
      const lote = JSON.parse(Buffer.from(env.MIGRACAO_LOTE_APROVADO, "base64url"));
      const { container, ...bancoLote } = origem;
      assert.equal(container, idDb);
      assert.deepEqual(lote, {
        ...bancoLote,
        ip,
        usuario: "frequencia",
        base,
        alvo,
        aplicadas: [{ nome: anterior, sha256: sha(sqlBase) }],
        pendentes: [{ nome: nova, sha256: sha(sqlNovo) }],
      });
      evento("troca após aprovação");
      gravar(`${raiz}/subiu`, "");
    }
  }
}

function preparar(f, caso, habilitado) {
  const git = (...args) => f.ok(f.executar("/usr/bin/git", ["-C", f.app, ...args])).stdout.trim();
  const [appEnv, ops] = ["app.env", "ops.env"].map((n) => `${f.config}/${n}`);
  const destinatarios = "# Destinatários sintéticos; não cifra dados.\n";
  f.gravar(`${f.config}/destinatarios.age`, destinatarios);
  f.gravar(`${f.config}/rclone.conf`, "# Configuração sintética de conferência\n");
  fs.mkdirSync(`${f.config}/remoto-sintetico`, { mode: 0o700 });
  f.gravar(appEnv, "POSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\nDATABASE_SCHEMA=public\n");
  fs.appendFileSync(
    ops,
    [
      `${chave}=${habilitado}`,
      "ATUALIZAR_HABILITADO=true",
      "ATUALIZAR_MODO=main",
      "ATUALIZAR_ESPACO_MINIMO_MB=0",
      "BACKUP_CRIPTOGRAFIA=age",
      `BACKUP_AGE_DESTINATARIOS=${f.config}/destinatarios.age`,
      `BACKUP_AGE_DESTINATARIOS_SHA256=${sha(destinatarios)}`,
      "BACKUP_REMOTO=teste:exclusivo",
      `BACKUP_RCLONE_CONFIG=${f.config}/rclone.conf`,
    ].join("\n") + "\n",
  );
  f.gravar(
    `${f.bin}/docker`,
    `#!/bin/bash\nexec "${process.execPath}" "${arquivo}" docker "${f.raiz}" "$@"\n`,
    0o700,
  );
  f.gravar(
    `${f.bin}/rclone`,
    `#!/bin/bash\nexec "${process.execPath}" "${arquivo}" rclone "${f.config}" ${caso} "$@"\n`,
    0o700,
  );
  f.gravar(
    `${f.app}/scripts/servidor/backup-banco.sh`,
    `#!/bin/bash\nexec "${process.execPath}" "${arquivo}" backup\n`,
    0o700,
  );
  // A consulta de evidência de CI é substituída no snapshot sintético.
  f.gravar(
    `${f.app}/scripts/servidor/evidencia-migracoes-auto.mjs`,
    `
    import fs from 'node:fs';
    export function verificarEvidenciaAutomatica() {
      fs.appendFileSync(${JSON.stringify(`${f.config}/eventos`)}, 'CI\\n');
      if (${JSON.stringify(caso)} === 'ci-recusado') throw new Error('CI sintético recusou o lote.');
      return { runId: 123, tentativa: 1 };
    }
  `,
  );
  const entradas = [
    "docker/app/entrypoint.sh",
    "docker/app/migrar.mjs",
    "src/infra/schema-postgres.mjs",
  ];
  f.gravar(`${f.app}/${entradas[0]}`, "#!/bin/sh\nexit 1\n");
  const sql = (nome) => `${diretorioSql}/${nome}/migration.sql`;
  f.gravar(`${f.app}/${sql(anterior)}`, sqlBase, 0o644);
  f.gravar(`${f.app}/${diretorioSql}/migration_lock.toml`, 'provider = "postgresql"\n', 0o644);
  git("config", "user.name", "Replay");
  git("config", "user.email", "replay@example.invalid");
  git("symbolic-ref", "HEAD", "refs/heads/main");
  git("add", ".");
  git("commit", "-qm", "base sintética");
  const base = git("rev-parse", "HEAD");
  f.gravar(`${f.app}/${sql(nova)}`, sqlNovo, 0o644);
  git("add", "prisma");
  git("commit", "-qm", "migração aditiva");
  const alvo = git("rev-parse", "HEAD");
  const inventario = Object.fromEntries(
    [...entradas, sql(anterior), sql(nova), `${diretorioSql}/migration_lock.toml`].map((n) => [
      n,
      sha(fs.readFileSync(`${f.app}/${n}`)),
    ]),
  );
  gravar(`${f.raiz}/dados-replay.json`, json({ base, alvo, caso, inventario }));
  git("clone", "--bare", "-q", f.app, `${f.raiz}/remoto.git`);
  git("remote", "add", "origin", `${f.raiz}/remoto.git`);
  git("update-ref", "refs/remotes/origin/main", alvo);
  git("reset", "--hard", base);
  f.ok(f.adocao());
  const p = ler(f.perfil);
  gravar(
    `${p.estado}/estado.json`,
    json({ modo: "main", commit: base, ref: base, imagem: imagemBase }),
  );
  const copiaEnsaiada = catalogar(
    p,
    "frequenciapp-20260101T000000Z-1234abcd",
    new Date(Date.now() - 172800000).toISOString(),
  );
  gravar(
    `${p.config}/recuperacao-migracoes-auto.json`,
    json({
      versao: 1,
      resultado: "restaurado-e-conferido",
      ensaiadoEm: new Date(Date.now() - 86400000).toISOString(),
      ...banco,
      alvo: p.alvo,
      remoto: "teste:exclusivo",
      criptografia: "age",
      destinatario: sha(destinatarios),
      ...copiaEnsaiada,
    }),
  );
  const entrada = `${f.prefixo}/executar`;
  f.ok(f.executar(entrada, ["instalar-rotinas", "--confirmar", "--destino", f.destino]));
  const cron = fs.readFileSync(`${f.destino}/cron.d/frequenciapp`, "utf8");
  const linhas = cron.split("\n").filter((linha) => linha.includes(" atualizar "));
  assert.deepEqual(linhas, [
    `30 4 * * * root ${entrada} atualizar --agendado >>${p.logs}/atualizacao.log 2>&1`,
  ]);
  const [, , , , , , cmd, ...args] = linhas[0].split(" >>")[0].split(" ");
  return {
    p,
    base,
    alvo,
    head: () => git("rev-parse", "HEAD"),
    executar: () => f.executar(cmd, args, { timeout: 60000 }),
  };
}

function testar() {
  for (const [caso, habilitado, status, log, terminal] of [
    ["positivo", true, 0, /Atualização automática concluída/, "concluida"],
    ["opt-out", false, 1, /Aprovação agendada de migrações recusada/, null],
    ["ci-recusado", true, 1, /ensaio do lote não confirmado/, null],
    ["build-falhou", true, 20, /construção da imagem falhou; nenhuma troca/, "abortada"],
    ["bytes-divergentes", true, 20, /imagem não contém as migrações aprovadas/, "abortada"],
    ["remoto-indisponivel", true, 20, /backup pré-migração não foi reconfirmado/, "abortada"],
    [
      "historico-final-divergente",
      true,
      1,
      /histórico final da migração automática não confere/,
      "incerta",
    ],
  ]) {
    test(`atualização agendada: ${caso}`, () => {
      const f = fixture({ adotar: false });
      try {
        const { p, base, alvo, head, executar } = preparar(f, caso, habilitado);
        const resultado = executar();
        assert.ifError(resultado.error);
        assert.equal(resultado.signal, null);
        assert.equal(resultado.status, status, resultado.stdout + resultado.stderr);
        assert.match(resultado.stdout + resultado.stderr, log);
        assert.equal(
          fs.readdirSync(p.estado).some((n) => n.startsWith("aprovacao-migracoes")),
          false,
        );
        const eventos = fs.existsSync(`${p.config}/eventos`)
          ? fs.readFileSync(`${p.config}/eventos`, "utf8").trim().split("\n")
          : [];
        const journals = fs.readdirSync(`${p.dados}/journal`);
        assert.equal(journals.length, terminal ? 1 : 0);
        const aposAprovacao = terminal === "concluida" || terminal === "incerta";
        assert.deepEqual(
          eventos.filter((e) => e.startsWith("tentativa ")),
          aposAprovacao ? ["tentativa up"] : [],
        );
        assert.equal(
          eventos.filter((e) => e === "troca após aprovação").length,
          aposAprovacao ? 1 : 0,
        );
        assert.equal(head(), aposAprovacao ? alvo : base);
        assert.equal(ler(`${p.estado}/estado.json`).commit, terminal === "concluida" ? alvo : base);
        assert.equal(eventos.includes("reinício normal"), terminal === "concluida");
        const releuRemoto = eventos.filter((e) => e.startsWith("remoto "));
        assert.equal(
          releuRemoto.length,
          aposAprovacao ? 6 : caso === "remoto-indisponivel" ? 1 : 0,
        );
        if (releuRemoto.length)
          assert.ok(eventos.indexOf("build") < eventos.indexOf(releuRemoto[0]));
        if (!terminal) {
          assert.equal(eventos.includes("backup"), false);
          assert.equal(eventos.includes("build"), false);
          assert.equal(eventos.includes("CI"), caso === "ci-recusado");
          assert.equal(eventos.includes("histórico para manifesto"), caso === "opt-out");
        } else {
          const pasta = `${p.dados}/journal/${journals[0]}`;
          assert.deepEqual(
            ["concluida", "abortada", "incerta"].filter((n) => fs.existsSync(`${pasta}/${n}.json`)),
            [terminal],
          );
          assert.equal(fs.existsSync(`${pasta}/migracoes-auto.json`), aposAprovacao);
          assert.equal(fs.readdirSync(`${p.dados}/pins`).length, 1);
          assert.ok(
            eventos.indexOf("CI") < eventos.indexOf("backup") &&
              eventos.indexOf("backup") < eventos.indexOf("build"),
          );
          if (terminal === "abortada") {
            assert.match(resultado.stderr, /recusado antes da troca/);
            assert.equal(
              ler(`${pasta}/abortada.json`).recusaSha256,
              sha(fs.readFileSync(`${pasta}/recusa-migracoes-auto.json`)),
            );
            f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
          }
          if (terminal === "concluida") {
            assert.equal(
              ler(`${pasta}/concluida.json`).migracoesAutoSha256,
              sha(fs.readFileSync(`${pasta}/migracoes-auto.json`)),
            );
            assert.ok(eventos.lastIndexOf("CI") > eventos.indexOf("build"));
            assert.ok(eventos.lastIndexOf("histórico-final") < eventos.indexOf("reinício normal"));
          }
          if (terminal === "incerta") {
            const repeticao = executar();
            assert.notEqual(repeticao.status, 0);
            assert.match(repeticao.stderr, /Operação incerta/);
            assert.equal(
              fs.readFileSync(`${p.config}/eventos`, "utf8").trim().split("\n").length,
              eventos.length,
            );
            assert.doesNotMatch(resultado.stdout, /concluída/i);
          }
        }
      } finally {
        f.limpar();
      }
    });
  }
}

function rclone(config, caso, args) {
  const [acao] = args;
  const alvo = args.at(-1);
  assert.match(alvo, /^teste:exclusivo\/frequenciapp-[a-zA-Z0-9.-]+$/);
  assert.notEqual(process.env.RCLONE_CONFIG, `${config}/rclone.conf`);
  assert.match(fs.readFileSync(process.env.RCLONE_CONFIG, "utf8"), /Configuração sintética/);
  fs.appendFileSync(`${config}/eventos`, `remoto ${acao}\n`);
  if (caso === "remoto-indisponivel") {
    process.exitCode = 1;
    return;
  }
  const nome = alvo.split("/").at(-1);
  const bytes = fs.readFileSync(`${config}/remoto-sintetico/${nome}`);
  if (acao === "lsjson") {
    assert.ok(args.includes("--stat"));
    emitirLinha(JSON.stringify({ Name: nome, Size: bytes.length, IsDir: false }));
  } else {
    assert.equal(acao, "cat");
    assert.equal(args[args.indexOf("--count") + 1], String(bytes.length + 1));
    process.stdout.write(bytes);
  }
}

if (process.argv[2] === "docker") docker(process.argv[3], process.argv[4], process.argv.slice(5));
else if (process.argv[2] === "rclone")
  rclone(process.argv[3], process.argv[4], process.argv.slice(5));
else if (process.argv[2] === "backup") backup();
else testar();
