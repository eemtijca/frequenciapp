// Exercita permissões e ambientes pela CLI pública em raiz administrativa sintética.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { estadoInicial } from "../../../scripts/instalador/estado.mjs";
import { ordemEtapasPara } from "../../../scripts/instalador/executor.mjs";
import { fixture } from "../../servidor/controlador/fixture.mjs";

function preparar(t) {
  const f = fixture({ instalador: true, adotar: false });
  t.after(f.limpar);
  fs.cpSync(path.resolve(import.meta.dirname, "../fixtures/aplicar/repo"), f.app, {
    recursive: true,
  });
  for (const args of [
    ["add", "."],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "test: registra fonte sintética",
    ],
  ])
    f.ok(f.executar("/usr/bin/git", ["-C", f.app, ...args]));
  const commit = f.ok(f.executar("/usr/bin/git", ["-C", f.app, "rev-parse", "HEAD"])).stdout.trim();
  f.gravar(`${f.raiz}/etc/os-release`, 'ID=ubuntu\nVERSION_ID="26.04"\nID_LIKE=debian\n');
  // Estado sintético delimita a retomada; não atesta pacotes, Docker, contas ou backup.
  f.inicio = (etapa) => {
    const estado = estadoInicial({ configuracao: { perfil: "completo", canal: "main" } });
    estado.commit = commit;
    estado.etapas = ordemEtapasPara("completo")
      .slice(0, ordemEtapasPara("completo").indexOf(etapa))
      .map((id) => ({
        id,
        estado: "concluida",
        inicio: null,
        fim: null,
        codigo: null,
        acoes: [],
        avisos: [],
        detalhes: {},
      }));
    f.gravar(`${f.raiz}/var/lib/frequenciapp/instalacao.json`, JSON.stringify(estado));
  };
  f.aplicar = (extras = [], env = {}) =>
    f.executar(
      f.nodeCli ?? process.execPath,
      [
        path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
        "aplicar",
        "--json",
        "--nao-interativo",
        "--sim",
        "--nao-iniciar",
        "--pular-contas",
        "--perfil",
        "completo",
        "--operador-controlador",
        "nobody",
        "--canal",
        "main",
        "--permitir-instavel",
        "--dominio",
        "frequencia.teste",
        "--email-acme",
        "tls@example.invalid",
        "--destinatario-gpg",
        "A".repeat(40),
        "--config-dropbox",
        `${f.config}/dropbox/adocao.json`,
        "--arquivo-token-dropbox",
        `${f.config}/dropbox/token.json`,
        "--config-rclone",
        `${f.config}/dropbox/rclone.conf`,
        "--destino",
        "falso:copias",
        ...extras,
      ],
      {
        env: {
          PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: f.raiz,
          TMPDIR: f.raiz,
          COMPOSE_PROJECT_NAME: "sintetico",
          INSTALADOR_RAIZ: f.raiz,
          INSTALADOR_LOCK_DIR: `${f.raiz}/locks`,
          ...env,
        },
      },
    );
  return f;
}

test("A: o perfil completo mantém diretórios administrativos fora da conta de serviço", (t) => {
  const f = preparar(t);
  f.inicio("usuario");
  const r = f.aplicar(["--desde-etapa", "usuario"], { SERVIDOR_USUARIO: "daemon" });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  const doc = JSON.parse(r.stdout);
  f.ok(r);
  for (const n of ["etc/frequenciapp", "var/lib/frequenciapp", "var/backups/frequenciapp", "locks"])
    assert.equal(fs.statSync(`${f.raiz}/${n}`).uid, 0, `Propriedade administrativa: ${n}`);
  assert.equal(
    doc.etapas.find((e) => e.id === "diretorios")?.estado,
    "concluida",
    JSON.stringify(doc.erros),
  );
  for (const n of [f.app, `${f.config}/app.env`, `${f.config}/ops.env`])
    assert.equal(fs.statSync(n).uid, 0);
  assert.match(fs.readFileSync(`${f.config}/ops.env`, "utf8"), /^SERVIDOR_USUARIO=root$/m);
  assert.equal(fs.existsSync(f.perfil), false, "Não iniciar não adota controlador.");
});

test("B: ambiente Compose gerado permite adoção real sem conexão paralela", (t) => {
  const f = preparar(t);
  f.inicio("ambiente");
  const r = f.aplicar(["--desde-etapa", "ambiente"]);
  f.ok(r);
  const plano = f.adocao([], "--plano");
  f.ok(plano);
  f.ok(f.adocao());
  f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
});

test("E: CLI transmite o fuso observado ao cron sem confirmação antecipada", (t) => {
  const f = preparar(t);
  f.nodeCli = `${f.bin}/node-cli`;
  fs.copyFileSync(process.execPath, f.nodeCli);
  fs.chmodSync(f.nodeCli, 0o700);
  f.gravar(
    `${f.config}/ops.env`,
    fs.readFileSync(`${f.config}/ops.env`, "utf8").replace(/^CRON_FUSO_SISTEMA=.*\n/m, ""),
  );
  f.gravar(
    `${f.bin}/timedatectl`,
    '#!/bin/sh\n[ "$*" = "show --property=Timezone" ] || exit 91\nprintf "Timezone=UTC\\n"\n',
    0o700,
  );
  f.inicio("ambiente");
  f.ok(f.aplicar(["--desde-etapa", "ambiente", "--fuso", "UTC"]));
  assert.match(fs.readFileSync(`${f.config}/ops.env`, "utf8"), /^CRON_FUSO_SISTEMA=UTC$/m);
  f.ok(f.adocao());
  const cron = f.ok(
    f.executar(`${f.prefixo}/executar`, ["instalar-rotinas", "--plano", "--destino", f.destino]),
  );
  assert.match(cron.stdout, /30 2 \* \* \* root .*\/executar backup-banco/);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
});

for (const caso of [
  { nome: "ausente", saida: "exit 1", observado: "", fuso: "UTC", extra: "", aceita: false },
  {
    nome: "divergente",
    saida: "printf 'Timezone=UTC\\n'",
    observado: "UTC",
    fuso: "America/Fortaleza",
    extra: "",
    aceita: false,
  },
  {
    nome: "CRON_TZ sem suporte comprovado",
    saida: "printf 'Timezone=UTC\\n'",
    observado: "UTC",
    fuso: "America/Fortaleza",
    extra: "CRON_TZ=America/Fortaleza\n",
    aceita: false,
  },
  {
    nome: "CRON_TZ com confirmação explícita",
    saida: "printf 'Timezone=UTC\\n'",
    observado: "UTC",
    fuso: "America/Fortaleza",
    extra: "CRON_TZ=America/Fortaleza\nCRON_SUPORTA_TZ=true\n",
    aceita: true,
  },
])
  test(`E: cron trata prova de fuso ${caso.nome} sem confundir observação e escolha`, (t) => {
    const f = preparar(t);
    f.nodeCli = `${f.bin}/node-cli`;
    fs.copyFileSync(process.execPath, f.nodeCli);
    fs.chmodSync(f.nodeCli, 0o700);
    f.gravar(
      `${f.config}/ops.env`,
      fs.readFileSync(`${f.config}/ops.env`, "utf8").replace(/^CRON_FUSO_SISTEMA=.*\n/m, "") +
        caso.extra,
    );
    f.gravar(
      `${f.bin}/timedatectl`,
      `#!/bin/sh\n[ "$*" = "show --property=Timezone" ] || exit 91\n${caso.saida}\n`,
      0o700,
    );
    f.inicio("ambiente");
    f.ok(f.aplicar(["--desde-etapa", "ambiente", "--fuso", caso.fuso]));
    const ops = fs.readFileSync(`${f.config}/ops.env`);
    assert.ok(ops.toString().split("\n").includes(`CRON_FUSO_SISTEMA=${caso.observado}`));
    f.ok(f.adocao());
    const r = f.executar(`${f.prefixo}/executar`, [
      "instalar-rotinas",
      "--confirmar",
      "--destino",
      f.destino,
    ]);
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    if (caso.aceita) {
      f.ok(r);
      assert.match(
        fs.readFileSync(`${f.destino}/cron.d/frequenciapp`, "utf8"),
        /^CRON_TZ=America\/Fortaleza$/m,
      );
    } else {
      assert.equal(r.status, 78);
      assert.match(r.stderr, /Confirmar CRON_FUSO_SISTEMA/);
      assert.equal(fs.existsSync(`${f.destino}/cron.d/frequenciapp`), false);
    }
    assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), ops);
    assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
  });

test("E: retomada mantém a prova persistida e não reescreve ambiente já adotado", (t) => {
  const f = preparar(t);
  f.nodeCli = `${f.bin}/node-cli`;
  fs.copyFileSync(process.execPath, f.nodeCli);
  fs.chmodSync(f.nodeCli, 0o700);
  f.gravar(
    `${f.config}/ops.env`,
    fs.readFileSync(`${f.config}/ops.env`, "utf8").replace(/^CRON_FUSO_SISTEMA=.*\n/m, ""),
  );
  f.gravar(`${f.bin}/timedatectl`, "#!/bin/sh\nprintf 'Timezone=UTC\\n'\n", 0o700);
  f.inicio("ambiente");
  f.ok(f.aplicar(["--desde-etapa", "ambiente", "--fuso", "UTC"]));
  const ops = fs.readFileSync(`${f.config}/ops.env`);
  f.inicio("ambiente");
  f.ok(f.aplicar(["--retomar", "--fuso", "UTC"]));
  assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), ops);
  f.ok(f.adocao());
  f.ok(
    f.executar(`${f.prefixo}/executar`, [
      "instalar-rotinas",
      "--confirmar",
      "--destino",
      f.destino,
    ]),
  );
  f.gravar(`${f.bin}/timedatectl`, "#!/bin/sh\nprintf 'Timezone=America/Fortaleza\\n'\n", 0o700);
  f.ok(
    f.executar(
      f.nodeCli,
      [
        path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
        "aplicar",
        "--config",
        `${f.config}/instalador.json`,
        "--retomar",
        "--sim",
        "--json",
      ],
      {
        env: {
          PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: f.raiz,
          TMPDIR: f.raiz,
          INSTALADOR_RAIZ: f.raiz,
        },
      },
    ),
  );
  assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), ops);
  f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
});

test("B: adoção recusa cada conexão explícita divergente sem criar prefixo", (t) => {
  for (const chave of ["DATABASE_URL", "DIRECT_URL", "BACKUP_DATABASE_URL"]) {
    const f = preparar(t);
    f.inicio("ambiente");
    f.ok(f.aplicar(["--desde-etapa", "ambiente"]));
    fs.appendFileSync(`${f.config}/ops.env`, `${chave}=postgresql://externo.invalid/outro\n`);
    const antes = fs.readFileSync(`${f.config}/ops.env`);
    const r = f.adocao();
    assert.equal(r.status, 78);
    assert.match(r.stderr, /conexões URL paralelas/);
    assert.equal(fs.existsSync(f.prefixo), false);
    assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), antes);
  }
});

test("C: default sob var/lock simbólico preserva a trava do produtor na adoção", (t) => {
  const f = preparar(t);
  f.gravar(`${f.raiz}/run/lock/.fixture`, "");
  fs.mkdirSync(`${f.raiz}/var`, { recursive: true });
  fs.symlinkSync("../run/lock", `${f.raiz}/var/lock`);
  f.inicio("ambiente");
  f.ok(f.aplicar(["--desde-etapa", "ambiente"], { INSTALADOR_LOCK_DIR: "" }));
  const env = {
    PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: f.raiz,
    TMPDIR: f.raiz,
    APP_DIR: f.app,
    APP_ENV_FILE: `${f.config}/app.env`,
    OPS_ENV_FILE: `${f.config}/ops.env`,
    SERVIDOR_CONFIG_DIR: f.config,
  };
  // O produtor público disputa a mesma trava operacional, com Docker sintético.
  f.gravar(
    `${f.bin}/docker`,
    fs.readFileSync(`${f.bin}/docker`, "utf8").replace("exec) exit 0;;", "exec|run) exit 0;;"),
    0o700,
  );
  f.ok(f.executar("/bin/bash", [`${f.app}/scripts/servidor/backup-planilhas.sh`], { env }));
  const alvo = JSON.parse(fs.readFileSync(`${f.config}/identidade.json`)).trava;
  const trava = `${f.raiz}/run/lock/frequenciapp/operacoes-${alvo}.lock`;
  const antes = fs.statSync(trava);
  f.ok(f.adocao());
  const p = JSON.parse(fs.readFileSync(f.perfil));
  assert.equal(p.locks, `${f.raiz}/run/lock/frequenciapp`);
  assert.equal(fs.statSync(trava).ino, antes.ino);
  assert.equal(fs.statSync(trava).dev, antes.dev);
  const ocupado = f.executar("flock", ["-x", trava, `${f.prefixo}/executar`, "agenda"]);
  assert.equal(ocupado.error, undefined);
  assert.equal(ocupado.signal, null);
  assert.equal(ocupado.status, 1);
  assert.match(ocupado.stderr, /Outra operação incompatível com agenda está em andamento/);
  assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
  f.ok(f.executar(`${f.prefixo}/executar`, ["agenda"]));
  assert.equal(fs.statSync(trava).ino, antes.ino);
});

test("C: derivação inicial não aceita alias arbitrário nem migra literal legado", (t) => {
  for (const legado of [false, true]) {
    const f = preparar(t);
    f.gravar(`${f.raiz}/${legado ? "run/lock" : "outro"}/.fixture`, "");
    fs.mkdirSync(`${f.raiz}/var`, { recursive: true });
    fs.symlinkSync(legado ? "../run/lock" : "../outro", `${f.raiz}/var/lock`);
    if (legado)
      fs.appendFileSync(
        `${f.config}/ops.env`,
        `SERVIDOR_LOCK_DIR=${f.raiz}/var/lock/frequenciapp\n`,
      );
    f.inicio("ambiente");
    f.ok(f.aplicar(["--desde-etapa", "ambiente"], { INSTALADOR_LOCK_DIR: "" }));
    const ops = fs.readFileSync(`${f.config}/ops.env`);
    assert.ok(ops.toString().includes(`SERVIDOR_LOCK_DIR=${f.raiz}/var/lock/frequenciapp\n`));
    const r = f.adocao();
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 78);
    assert.match(r.stderr, /root e não conter links/);
    assert.equal(fs.existsSync(f.prefixo), false);
    assert.deepEqual(fs.readFileSync(`${f.config}/ops.env`), ops);
  }
});

test("A: adoção exige operador separado não administrativo", (t) => {
  const f = preparar(t);
  const r2 = f.executar(process.execPath, [
    f.cli,
    "instalar",
    "--fonte",
    f.app,
    "--app",
    f.app,
    "--config",
    f.config,
    "--prefixo",
    f.prefixo,
    "--operador",
    "root",
    "--confirmar",
  ]);
  assert.equal(r2.status, 78);
  assert.match(r2.stderr, /não pode ser root/);
  assert.equal(fs.existsSync(f.prefixo), false);
});

test("E: JSON efetivo permite repetição e retomada públicas sem repetir campos do perfil", (t) => {
  const f = preparar(t);
  f.inicio("ambiente");
  f.ok(f.aplicar(["--desde-etapa", "ambiente"]));
  const config = `${f.config}/instalador.json`;
  const ambientes = ["app.env", "ops.env"].map((n) => fs.readFileSync(`${f.config}/${n}`));
  for (const extras of [["--retomar"], ["--desde-etapa", "ambiente"]]) {
    const r = f.executar(
      process.execPath,
      [
        path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
        "aplicar",
        "--config",
        config,
        "--sim",
        "--json",
        "--nao-interativo",
        "--nao-iniciar",
        "--permitir-instavel",
        ...extras,
      ],
      {
        env: {
          PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: f.raiz,
          TMPDIR: f.raiz,
          INSTALADOR_RAIZ: f.raiz,
          INSTALADOR_LOCK_DIR: `${f.raiz}/locks`,
          COMPOSE_PROJECT_NAME: "sintetico",
        },
      },
    );
    f.ok(r);
  }
  assert.deepEqual(
    ["app.env", "ops.env"].map((n) => fs.readFileSync(`${f.config}/${n}`)),
    ambientes,
  );
  const dados = JSON.parse(fs.readFileSync(config));
  assert.equal(dados.operadorControlador, "nobody");
  assert.equal(dados.configDropbox, `${f.config}/dropbox/adocao.json`);
  assert.equal(dados.arquivoTokenDropbox, `${f.config}/dropbox/token.json`);
  assert.equal(fs.statSync(config).mode & 0o777, 0o600);
});

test("E: retomada recusa cada campo obrigatório ausente antes de alterar o ambiente", (t) => {
  for (const campo of ["operadorControlador", "configDropbox", "arquivoTokenDropbox"]) {
    const f = preparar(t);
    f.inicio("ambiente");
    f.ok(f.aplicar(["--desde-etapa", "ambiente"]));
    const config = `${f.config}/instalador.json`;
    const dados = JSON.parse(fs.readFileSync(config));
    delete dados[campo];
    f.gravar(config, JSON.stringify(dados));
    const antes = fs.readFileSync(`${f.config}/app.env`);
    const r = f.executar(
      process.execPath,
      [
        path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
        "aplicar",
        "--config",
        config,
        "--sim",
        "--json",
        "--retomar",
        "--nao-iniciar",
        "--permitir-instavel",
      ],
      {
        env: {
          PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: f.raiz,
          TMPDIR: f.raiz,
          INSTALADOR_RAIZ: f.raiz,
          INSTALADOR_LOCK_DIR: `${f.raiz}/locks`,
        },
      },
    );
    assert.equal(r.status, 2);
    assert.equal(JSON.parse(r.stdout).codigo, "E_USO");
    assert.deepEqual(fs.readFileSync(`${f.config}/app.env`), antes);
  }
});
