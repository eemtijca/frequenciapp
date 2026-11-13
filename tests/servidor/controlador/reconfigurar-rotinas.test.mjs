// Exercita a reconfiguração administrativa pública sem Docker, cron ou rede reais.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fixture } from "./fixture.mjs";

const seletores = {
  AGENDA_HABILITADA: "false",
  AGENDA_NOTIFICACOES: "false",
  AGENDA_PLANILHAS: "false",
  AGENDA_INDICADORES: "false",
  BACKUP_PLANILHAS_HABILITADO: "false",
};

test("consultas Compose públicas usam o snapshot ativo antes e depois da reconfiguração", () => {
  const f = fixture();
  try {
    const consultar = (...args) => {
      const p = JSON.parse(fs.readFileSync(f.perfil));
      return f.executar("/bin/bash", [`${f.app}/scripts/servidor/compose.sh`, ...args], {
        env: {
          PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
          HOME: f.raiz,
          TMPDIR: f.raiz,
          APP_DIR: f.app,
          APP_ENV_FILE: `${f.config}/app.env`,
          OPS_ENV_FILE: `${f.config}/ops.env`,
          SERVIDOR_CONFIG_DIR: f.config,
          SERVIDOR_IDENTIDADE_ARQUIVO: `${f.config}/identidade.json`,
          SERVIDOR_AMBIENTE_INJETADO: "true",
          SERVIDOR_CONTROLADOR_PERFIL: f.perfil,
          SERVIDOR_LOCK_DIR: p.locks,
          SERVIDOR_USUARIO: "root",
          COMPOSE_PROJECT_NAME: "sintetico",
          COMPOSE_ARQUIVOS: p.compose.join(":"),
          PROXY_TIPO: "caddy",
          ESTADO_DIR: p.estado,
        },
      });
    };
    for (const reconfigurado of [false, true]) {
      if (reconfigurado) f.ok(comando(f));
      const journal = fs.readdirSync(`${f.prefixo}/dados/journal`);
      const configuracao = f.ok(consultar("config", "--format", "json"));
      assert.match(configuracao.stdout, /"name":"sintetico"/);
      const estado = f.ok(consultar("ps", "-aq"));
      assert.match(estado.stdout, /container-app\ncontainer-db/);
      assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), journal);
      const recusado = consultar("up", "-d");
      assert.equal(recusado.error, undefined);
      assert.equal(recusado.signal, null);
      assert.equal(recusado.status, 78);
      assert.match(recusado.stderr, /mutação Compose arbitrária/);
      assert.doesNotMatch(fs.readFileSync(`${f.raiz}/docker.log`, "utf8"), /compose .* up /);
    }
  } finally {
    f.limpar();
  }
});

test("reconfigura seletivamente o perfil adotado e repete sem mover a trava", () => {
  const f = fixture();
  try {
    const antigo = fs.readFileSync(f.perfil);
    const p = JSON.parse(antigo);
    const lock = `${p.locks}/operacoes-${p.alvo}.lock`;
    const inode = fs.statSync(lock).ino;
    const appAntes = fs.readFileSync(`${f.config}/app.env`, "utf8");
    const args = [f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"];
    const input = JSON.stringify({ seletores, destino: f.raiz });
    f.ok(f.executar(process.execPath, args, { input }));
    assert.equal(fs.statSync(lock).ino, inode);
    assert.equal(
      fs.readFileSync(`${f.config}/app.env`, "utf8"),
      appAntes.replace("export AGENDA_PLANILHAS=true", "export AGENDA_PLANILHAS=false") +
        "AGENDA_HABILITADA=false\nAGENDA_NOTIFICACOES=false\nAGENDA_INDICADORES=false\nBACKUP_PLANILHAS_HABILITADO=false\n",
    );
    assert.doesNotMatch(
      fs.readFileSync(`${f.raiz}/cron.d/frequenciapp`, "utf8"),
      /executar agenda|executar backup-planilhas/,
    );
    assert.match(fs.readFileSync(`${f.raiz}/cron.d/frequenciapp`, "utf8"), /executar backup-banco/);
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
    const depois = fs.readFileSync(f.perfil);
    f.ok(f.executar(process.execPath, args, { input }));
    assert.deepEqual(fs.readFileSync(f.perfil), depois);
    assert.equal(fs.statSync(lock).ino, inode);
    const obsoleto = f.executar(process.execPath, [
      `${p.snapshot}/scripts/servidor/controlador/cli.mjs`,
      "executar",
      f.perfil,
      "estado",
    ]);
    assert.equal(obsoleto.status, 78);
    assert.match(obsoleto.stderr, /geração|obsolet|adotado/);
  } finally {
    f.limpar();
  }
});

function comando(f, extras = [], opcoes = {}) {
  return f.executar(
    process.execPath,
    [f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar", ...extras],
    { input: JSON.stringify({ seletores, destino: f.destino }), ...opcoes },
  );
}
function protegidos(f) {
  return [
    f.perfil,
    `${f.config}/app.env`,
    `${f.config}/ops.env`,
    `${f.prefixo}/executar`,
    `${f.destino}/cron.d/frequenciapp`,
    `${f.destino}/logrotate.d/frequenciapp`,
    `${f.prefixo}/dados/rotinas.json`,
    `${f.config}/instalador.json`,
  ];
}
function guardar(f) {
  return protegidos(f).map((n) => (fs.existsSync(n) ? fs.readFileSync(n) : null));
}
function recusa(r, motivo) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 78, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, motivo);
}

test("recusa cron alheio, journal incerto e configuração divergente antes de publicar", () => {
  for (const caso of ["cron", "journal", "configuracao", "snapshot", "pin"]) {
    const f = fixture();
    try {
      if (caso === "cron")
        f.gravar(
          `${f.destino}/cron.d/frequenciapp`,
          "# Cron pertencente a outra instalação.\n",
          0o644,
        );
      if (caso === "journal") {
        const id = randomUUID();
        f.gravar(
          `${f.prefixo}/dados/journal/${id}/intencao.json`,
          JSON.stringify({
            versao: 1,
            operacao: id,
            alvo: JSON.parse(fs.readFileSync(f.perfil)).alvo,
            acao: "backup-banco",
          }),
        );
      }
      if (caso === "configuracao")
        fs.appendFileSync(`${f.config}/ops.env`, "OUTRA_CONFIGURACAO=alterada\n");
      if (caso === "snapshot")
        fs.appendFileSync(
          `${JSON.parse(fs.readFileSync(f.perfil)).snapshot}/scripts/servidor/agenda.sh`,
          "# Alteração alheia.\n",
        );
      if (caso === "pin") f.gravar(`${f.prefixo}/dados/pins/${randomUUID()}/pin.json`, "{}\n");
      const antes = guardar(f);
      recusa(comando(f), /Cron|Journal|Configuração|Snapshot|Pin/);
      assert.deepEqual(guardar(f), antes, caso);
    } finally {
      f.limpar();
    }
  }
});

test("adota cron legado somente pelo hash exato informado explicitamente", () => {
  const f = fixture();
  try {
    fs.rmSync(`${f.prefixo}/dados/rotinas.json`);
    const antes = guardar(f);
    recusa(comando(f), /adotar-cron-sha256/);
    recusa(comando(f, ["--adotar-cron-sha256", "0".repeat(64)]), /hash exato/);
    assert.deepEqual(guardar(f), antes);
    const sha = createHash("sha256")
      .update(fs.readFileSync(`${f.destino}/cron.d/frequenciapp`))
      .digest("hex");
    f.ok(comando(f, ["--adotar-cron-sha256", sha]));
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  } finally {
    f.limpar();
  }
});

test("não publica com trava concorrente e conserva o inode original", () => {
  const f = fixture();
  const p = JSON.parse(fs.readFileSync(f.perfil));
  const lock = `${p.locks}/operacoes-${p.alvo}.lock`,
    fd = fs.openSync(lock, "r+");
  try {
    const stdio = ["ignore", "pipe", "pipe"];
    while (stdio.length <= fd) stdio.push("ignore");
    stdio[fd] = fd;
    f.ok(spawnSync("/usr/bin/flock", ["-n", String(fd)], { stdio, encoding: "utf8" }));
    const antes = guardar(f),
      inode = fs.statSync(lock).ino;
    recusa(comando(f), /Trava física ocupada/);
    assert.deepEqual(guardar(f), antes);
    assert.equal(fs.statSync(lock).ino, inode);
  } finally {
    fs.closeSync(fd);
    f.limpar();
  }
});

test("retoma cada publicação interrompida apenas de bytes antigos ou novos comprovados", () => {
  for (const indice of [1, 2, 0, 3, 4, 6, 7]) {
    const f = fixture();
    try {
      const alvo = protegidos(f)[indice];
      const p = JSON.parse(fs.readFileSync(f.perfil));
      const lock = `${p.locks}/operacoes-${p.alvo}.lock`,
        inode = fs.statSync(lock).ino;
      const hook = `${f.raiz}/interromper.mjs`;
      f.gravar(
        hook,
        `import fs from 'node:fs'; const original=fs.renameSync; fs.renameSync=(a,b)=>{original(a,b); if(b===${JSON.stringify(alvo)}) process.kill(process.pid,'SIGKILL');};\n`,
      );
      const r = f.executar(
        process.execPath,
        ["--import", hook, f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"],
        { input: JSON.stringify({ seletores, destino: f.destino }) },
      );
      assert.equal(r.error, undefined);
      assert.equal(r.signal, "SIGKILL", alvo);
      assert.equal(r.status, null);
      assert.notEqual(
        f.executar(`${f.prefixo}/executar`, ["estado"]).status,
        0,
        "entrada estável não deve autorizar durante crash",
      );
      f.ok(comando(f));
      f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
      assert.equal(fs.statSync(lock).ino, inode);
      assert.equal(fs.readdirSync(`${f.prefixo}/dados/journal`).length, 1);
      f.ok(comando(f));
      assert.equal(fs.readdirSync(`${f.prefixo}/dados/journal`).length, 1);
    } finally {
      f.limpar();
    }
  }
});

test("não retoma publicação quando um terceiro valor aparece depois do crash", () => {
  const f = fixture();
  try {
    const hook = `${f.raiz}/interromper.mjs`;
    f.gravar(
      hook,
      `import fs from 'node:fs'; const original=fs.renameSync; fs.renameSync=(a,b)=>{original(a,b);if(b===${JSON.stringify(`${f.config}/app.env`)})process.kill(process.pid,'SIGKILL');};\n`,
    );
    const r = f.executar(
      process.execPath,
      ["--import", hook, f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"],
      { input: JSON.stringify({ seletores, destino: f.destino }) },
    );
    assert.equal(r.signal, "SIGKILL");
    fs.appendFileSync(`${f.config}/app.env`, "OUTRO_VALOR=nao-comprovado\n");
    const antes = guardar(f);
    recusa(comando(f), /antigo ou novo comprovado/);
    assert.deepEqual(guardar(f), antes);
  } finally {
    f.limpar();
  }
});

test("agenda delegada passa seletores novos por exec mesmo sem recriar o aplicativo", () => {
  const f = fixture();
  try {
    f.ok(comando(f));
    fs.writeFileSync(`${f.raiz}/docker.log`, "");
    f.ok(f.executar(`${f.prefixo}/executar`, ["agenda"]));
    const comandos = fs.readFileSync(`${f.raiz}/docker.log`, "utf8").split("\n");
    const agenda = comandos.filter((n) => n.includes("exec -T"));
    assert.equal(agenda.length, 1);
    assert.match(
      agenda[0],
      /-e AGENDA_NOTIFICACOES=false -e AGENDA_PLANILHAS=false -e AGENDA_INDICADORES=false app node scripts\/servidor\/agenda.mjs$/,
    );
    assert.equal(
      comandos.some((n) => /\b(?:up|build|pull|stop|run)\b/.test(n)),
      false,
    );
  } finally {
    f.limpar();
  }
});

test("entrada que leu a geração antiga revalida depois da trava e não dispara agenda", async () => {
  const f = fixture();
  let filho, termino;
  try {
    f.ok(comando(f));
    const p = JSON.parse(fs.readFileSync(f.perfil));
    const hook = `${f.raiz}/aguardar.mjs`,
      pronto = `${f.raiz}/pronto`,
      liberar = `${f.raiz}/liberar`;
    f.gravar(
      hook,
      `import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.spawnSync;cp.spawnSync=(bin,args,o)=>{if(bin==='/bin/bash'&&args[0].endsWith('/trancar.sh')){fs.writeFileSync(${JSON.stringify(pronto)},'pronto');const fim=Date.now()+15000;while(!fs.existsSync(${JSON.stringify(liberar)})){if(Date.now()>fim)throw Error('espera de teste esgotada');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}}return original(bin,args,o);};syncBuiltinESMExports();\n`,
    );
    filho = spawn(
      process.execPath,
      [
        "--import",
        hook,
        `${p.snapshot}/scripts/servidor/controlador/cli.mjs`,
        "executar",
        f.perfil,
        "agenda",
      ],
      {
        env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: f.raiz, TMPDIR: f.raiz },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    filho.stdout.resume();
    filho.stderr.on("data", (b) => {
      stderr += b;
    });
    termino = new Promise((resolve, reject) => {
      filho.once("error", reject);
      filho.once("close", (status, signal) => resolve({ status, signal }));
    });
    const fim = Date.now() + 10000;
    while (!fs.existsSync(pronto)) {
      assert.ok(
        Date.now() < fim && filho.exitCode === null,
        "entrada não chegou ao ponto anterior à trava",
      );
      await new Promise((r) => setTimeout(r, 20));
    }
    const novas = { ...seletores, AGENDA_HABILITADA: "true", AGENDA_PLANILHAS: "true" };
    f.ok(comando(f, [], { input: JSON.stringify({ seletores: novas, destino: f.destino }) }));
    fs.writeFileSync(`${f.raiz}/docker.log`, "");
    fs.writeFileSync(liberar, "liberado");
    const r = await termino;
    assert.equal(r.signal, null);
    assert.ok(Number.isInteger(r.status) && r.status !== 0, stderr);
    assert.match(stderr, /Geração obsoleta|não autorizou/);
    assert.doesNotMatch(fs.readFileSync(`${f.raiz}/docker.log`, "utf8"), /exec -T/);
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  } finally {
    if (filho && filho.exitCode === null) {
      filho.kill("SIGKILL");
      await termino;
    }
    f.limpar();
  }
});

test("retoma o temporário do cron após interrupção imediatamente antes do rename", () => {
  const f = fixture();
  try {
    const hook = `${f.raiz}/antes-rename.mjs`;
    const cron = `${f.destino}/cron.d/frequenciapp`;
    f.gravar(
      hook,
      `import fs from 'node:fs'; const original=fs.renameSync;fs.renameSync=(a,b)=>{if(b===${JSON.stringify(cron)})process.kill(process.pid,'SIGKILL');return original(a,b);};\n`,
    );
    const r = f.executar(
      process.execPath,
      ["--import", hook, f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"],
      { input: JSON.stringify({ seletores, destino: f.destino }) },
    );
    assert.equal(r.error, undefined);
    assert.equal(r.signal, "SIGKILL");
    const temporarios = fs.readdirSync(`${f.destino}/cron.d`).filter((n) => n.endsWith(".tmp"));
    assert.equal(temporarios.length, 1);
    assert.equal(fs.statSync(`${f.destino}/cron.d/${temporarios[0]}`).mode & 0o777, 0o644);
    f.ok(comando(f));
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  } finally {
    f.limpar();
  }
});
