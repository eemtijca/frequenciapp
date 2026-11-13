// Regressão da reconciliação das rotinas de um controlador já adotado.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { executar } from "../../../scripts/instalador/passos/controlador.mjs";
import { fixture } from "./fixture.mjs";
import { estadoInicial } from "../../../scripts/instalador/estado.mjs";

function instalador(f, extras = [], nodeExtras = []) {
  return f.executar(
    process.execPath,
    [
      ...nodeExtras,
      path.resolve(import.meta.dirname, "../../../scripts/instalador/cli.mjs"),
      "aplicar",
      "--perfil",
      "controlador",
      "--json",
      "--modo-teste",
      "--nao-interativo",
      "--sim",
      ...extras,
    ],
    {
      env: {
        PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
        HOME: f.raiz,
        TMPDIR: f.raiz,
        INSTALADOR_RAIZ: f.raiz,
      },
    },
  );
}
function prepararInstalador(f) {
  const p = JSON.parse(fs.readFileSync(f.perfil));
  const estado = estadoInicial({
    configuracao: { perfil: "controlador", canal: "main", diretorioFonte: "/opt/frequenciapp" },
  });
  estado.controlador = { adotado: true, migradorSha256: p.migradorSha256, readocaoPendente: false };
  f.gravar(`${f.raiz}/var/lib/frequenciapp/instalacao.json`, JSON.stringify(estado));
  f.gravar(`${f.raiz}/etc/os-release`, 'ID=ubuntu\nVERSION_ID="26.04"\nID_LIKE=debian\n');
}

test("aplicar público aceita o JSON existente sem alterar outras configurações", () => {
  const f = fixture({ instalador: true });
  try {
    prepararInstalador(f);
    const config = `${f.config}/instalador.json`;
    const anterior = {
      perfil: "controlador",
      dominio: "frequencia.exemplo.br",
      canal: "main",
      criptografia: "gpg",
    };
    f.gravar(config, JSON.stringify(anterior));
    f.ok(instalador(f, ["--config", config, "--agenda-planilhas", "false"]));
    const depois = JSON.parse(fs.readFileSync(config));
    for (const [campo, valor] of Object.entries(anterior)) assert.equal(depois[campo], valor);
    assert.equal(depois.agendaPlanilhas, "false");
  } finally {
    f.limpar();
  }
});

test("aplicar público persiste seletores sem reativá-los pelo JSON anterior", () => {
  const f = fixture({ instalador: true });
  try {
    prepararInstalador(f);
    const config = `${f.config}/instalador.json`;
    f.gravar(config, JSON.stringify({ perfil: "controlador", agendaPlanilhas: true }));
    f.ok(instalador(f, ["--config", config, "--agenda-planilhas", "false"]));
    assert.equal(JSON.parse(fs.readFileSync(config)).agendaPlanilhas, "false");
    f.ok(instalador(f, ["--config", config, "--retomar"]));
    assert.match(fs.readFileSync(`${f.config}/ops.env`, "utf8"), /^AGENDA_PLANILHAS=false$/m);
  } finally {
    f.limpar();
  }
});

test("aplicar público adota o cron legado somente com hash literal válido", () => {
  const f = fixture({ instalador: true });
  try {
    prepararInstalador(f);
    fs.rmSync(`${f.prefixo}/dados/rotinas.json`);
    const cron = fs.readFileSync(`${f.destino}/cron.d/frequenciapp`);
    const sha = createHash("sha256").update(cron).digest("hex");
    const invalido = instalador(f, ["--adotar-cron-sha256", sha.toUpperCase()]);
    assert.equal(invalido.error, undefined);
    assert.equal(invalido.signal, null);
    assert.equal(invalido.status, 2);
    assert.equal(JSON.parse(invalido.stdout).codigo, "E_USO");
    assert.deepEqual(fs.readFileSync(`${f.destino}/cron.d/frequenciapp`), cron);
    f.ok(instalador(f, ["--adotar-cron-sha256", sha, "--agenda-planilhas", "false"]));
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
  } finally {
    f.limpar();
  }
});

test("aplicar público altera somente seletores de controlador adotado antes do pipeline", () => {
  const f = fixture({ instalador: true });
  try {
    prepararInstalador(f);
    const appAntes = fs.readFileSync(`${f.config}/app.env`, "utf8");
    const opcoes = [
      "--agenda-habilitada",
      "false",
      "--agenda-notificacoes",
      "false",
      "--agenda-planilhas",
      "false",
      "--agenda-indicadores",
      "false",
      "--backup-planilhas-habilitado",
      "false",
    ];
    const resultado = f.ok(instalador(f, opcoes));
    const doc = JSON.parse(resultado.stdout);
    assert.deepEqual(doc.erros, []);
    assert.deepEqual(
      doc.etapas.map((e) => e.id),
      ["controlador"],
    );
    assert.ok(
      fs
        .readFileSync(`${f.config}/app.env`, "utf8")
        .startsWith(
          appAntes.replace("export AGENDA_PLANILHAS=true", "export AGENDA_PLANILHAS=false"),
        ),
    );
    f.ok(instalador(f, ["--retomar", ...opcoes]));
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
    const protegido = fs.readFileSync(`${f.config}/app.env`);
    const recusa = instalador(f, ["--destino", "remoto:nao-autorizado"]);
    assert.notEqual(recusa.status, 0);
    assert.deepEqual(fs.readFileSync(`${f.config}/app.env`), protegido);
  } finally {
    f.limpar();
  }
});

test("não informa sucesso quando a verificação das rotinas adotadas falha", () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "issue499-controlador-"));
  try {
    const prefixo = path.join(raiz, "controlador");
    const appDir = path.join(raiz, "app");
    fs.mkdirSync(prefixo);
    fs.mkdirSync(path.join(appDir, "docker/app"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "docker/app/migrar.mjs"), "// sintético\n");
    const perfil = path.join(prefixo, "perfil.json");
    fs.writeFileSync(perfil, JSON.stringify({ operador: "sintetico" }));
    const chamadas = [];
    const ctx = {
      caminhos: { appDir, controladorPrefixo: prefixo, controladorPerfil: perfil },
      estado: { controlador: { adotado: true, readocaoPendente: false } },
      configuracao: {},
      executar(comando, argumentos) {
        chamadas.push([comando, argumentos]);
        return { status: 78, stderr: "journal anterior incerto" };
      },
    };
    assert.throws(() => executar(ctx), /rotinas|cron/i);
    assert.ok(chamadas.some(([, argumentos]) => argumentos.includes("--plano")));
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test("aplicar público retoma o journal depois da interrupção da publicação administrativa", () => {
  const f = fixture({ instalador: true });
  try {
    prepararInstalador(f);
    const estadoAntes = fs.readFileSync(`${f.raiz}/var/lib/frequenciapp/instalacao.json`);
    const opcoes = [
      "--agenda-habilitada",
      "false",
      "--agenda-notificacoes",
      "false",
      "--agenda-planilhas",
      "false",
      "--agenda-indicadores",
      "false",
      "--backup-planilhas-habilitado",
      "false",
    ];
    const interromper = `${f.raiz}/interromper.mjs`,
      transporte = `${f.raiz}/transporte.mjs`;
    f.gravar(
      interromper,
      `import fs from 'node:fs';const original=fs.renameSync;fs.renameSync=(a,b)=>{original(a,b);if(b===${JSON.stringify(`${f.config}/app.env`)})process.kill(process.pid,'SIGKILL');};\n`,
    );
    f.gravar(
      transporte,
      `import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.spawnSync;cp.spawnSync=(bin,args,o)=>original(bin,args.includes('reconfigurar-rotinas')&&args.includes('--confirmar')?['--import',${JSON.stringify(interromper)},...args]:args,o);syncBuiltinESMExports();\n`,
    );
    const falha = instalador(f, opcoes, ["--import", transporte]);
    assert.equal(falha.error, undefined);
    assert.equal(falha.signal, null);
    assert.ok(Number.isInteger(falha.status) && falha.status !== 0);
    assert.equal(JSON.parse(falha.stdout).ok, false);
    assert.deepEqual(
      fs.readFileSync(`${f.raiz}/var/lib/frequenciapp/instalacao.json`),
      estadoAntes,
    );
    f.ok(instalador(f, ["--retomar", ...opcoes]));
    f.ok(f.executar(`${f.prefixo}/executar`, ["estado"]));
    assert.equal(fs.readdirSync(`${f.prefixo}/dados/journal`).length, 1);
  } finally {
    f.limpar();
  }
});

test("aplicar público recusa cron alheio e journal incerto sem sobrescrever ambiente", () => {
  for (const caso of ["cron", "journal"]) {
    const f = fixture({ instalador: true });
    try {
      prepararInstalador(f);
      if (caso === "cron")
        f.gravar(`${f.destino}/cron.d/frequenciapp`, "# Agendamento alheio.\n", 0o644);
      else
        f.gravar(
          `${f.prefixo}/dados/journal/00000000-0000-4000-8000-000000000000/intencao.json`,
          JSON.stringify({
            versao: 1,
            alvo: JSON.parse(fs.readFileSync(f.perfil)).alvo,
            operacao: "00000000-0000-4000-8000-000000000000",
            acao: "backup-banco",
          }),
        );
      const nomes = [
        f.perfil,
        `${f.config}/app.env`,
        `${f.config}/ops.env`,
        `${f.destino}/cron.d/frequenciapp`,
      ];
      const antes = nomes.map((n) => fs.readFileSync(n));
      const r = instalador(f, ["--agenda-planilhas", "false"]);
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.ok(Number.isInteger(r.status) && r.status !== 0);
      assert.equal(JSON.parse(r.stdout).ok, false);
      assert.deepEqual(
        nomes.map((n) => fs.readFileSync(n)),
        antes,
      );
    } finally {
      f.limpar();
    }
  }
});
