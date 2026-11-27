// Exercita as entradas reais do controlador com checkout e Compose sintéticos.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fixture } from "./fixture.mjs";

function prepararAtualizador(f, corpo) {
  f.gravar(`${f.app}/scripts/servidor/atualizar.sh`, `#!/bin/bash\nset -euo pipefail\n${corpo}\n`);
  f.ok(f.adocao());
}

function entrada(f, ...args) {
  return f.executar(`${f.prefixo}/executar`, args);
}

test("a entrada estável encaminha somente SHA completo em --ref agendado", () => {
  const f = fixture({ adotar: false });
  try {
    prepararAtualizador(f, "printf '%s\\n' \"$@\"");
    const git = (...args) => f.ok(f.executar("/usr/bin/git", ["-C", f.app, ...args])).stdout.trim();
    git(
      "-c",
      "user.name=Teste",
      "-c",
      "user.email=teste@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "main sintética",
    );
    const alvo = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", alvo);
    const permitido = f.ok(
      entrada(f, "atualizar", "--simular", "--modo", "main", "--ref", alvo, "--agendado"),
    );
    assert.equal(permitido.stdout, `--simular\n--modo\nmain\n--ref\n${alvo}\n--agendado\n`);
    for (const args of [
      ["--modo", "main", "--ref", alvo],
      ["--agendado", "--ref", alvo],
      ["--agendado", "--modo", "main", "--ref", "ab".repeat(20)],
      ["--agendado", "--modo", "main", "--ref", "origin/main"],
      ["--agendado", "--modo", "main", "--ref", alvo.toUpperCase()],
      ["--agendado", "--modo", "main", "--ref", alvo.slice(0, 39)],
      ["--agendado", "--modo", "main", "--ref", `--${alvo}`],
      ["--agendado", "--modo", "main", "--ref", `${alvo}\n`],
      ["--agendado", "--modo", "main", "--ref", alvo, "--ref", alvo],
      ["--agendado", "--ref"],
    ]) {
      const r = entrada(f, "atualizar", "--simular", ...args);
      assert.equal(r.status, 78, `${args}: ${r.stdout}\n${r.stderr}`);
      assert.equal(r.stdout, "");
    }
    assert.deepEqual(fs.readdirSync(`${f.prefixo}/dados/journal`), []);
  } finally {
    f.limpar();
  }
});

const chave = "ATUALIZAR_APROVAR_MIGRACOES_AUTOMATICAMENTE";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lerJson = (nome) => JSON.parse(fs.readFileSync(nome));
const journals = (f) =>
  fs.readdirSync(`${f.prefixo}/dados/journal`).map((id) => `${f.prefixo}/dados/journal/${id}`);
function alternar(f, habilitada, fase = "--confirmar", extras = [], opcoes = {}) {
  return f.executar(
    process.execPath,
    [...extras, f.cli, "politica-migracoes-auto", f.perfil, fase],
    {
      input: JSON.stringify({ habilitada }),
      ...opcoes,
    },
  );
}

test("admin alterna só ops.env sob a trava e revoga a geração antiga", () => {
  const f = fixture();
  try {
    const original = lerJson(f.perfil);
    const inode = (arquivo) => fs.statSync(arquivo).ino;
    const lock = `${original.locks}/operacoes-${original.alvo}.lock`;
    fs.closeSync(fs.openSync(lock, "a", 0o600));
    const trava = inode(lock);
    const ops = `${f.config}/ops.env`;
    const inalterados = [
      `${f.config}/app.env`,
      `${f.destino}/cron.d/frequenciapp`,
      `${f.destino}/logrotate.d/frequenciapp`,
      `${f.prefixo}/dados/rotinas.json`,
    ];
    const antes = inalterados.map((n) => fs.readFileSync(n));
    assert.equal(lerJson(f.perfil).opsEnvSha256, hash(fs.readFileSync(ops)));
    assert.equal(JSON.parse(f.ok(alternar(f, false)).stdout).semMudancas, true);
    assert.equal(JSON.parse(f.ok(alternar(f, true, "--plano")).stdout).plano, true);
    assert.deepEqual(journals(f), []);
    assert.doesNotMatch(fs.readFileSync(ops, "utf8"), new RegExp(chave));
    assert.equal(entrada(f, "politica-migracoes-auto", "--confirmar").status, 78);
    const normal = f.executar(
      process.execPath,
      [f.cli, "reconfigurar-rotinas", f.perfil, "--confirmar"],
      {
        input: JSON.stringify({ habilitada: true }),
      },
    );
    assert.equal(normal.status, 78);
    const fd = fs.openSync(lock, "r+");
    try {
      f.ok(
        spawnSync("/usr/bin/flock", ["-n", "3"], {
          stdio: ["ignore", "pipe", "pipe", fd],
          encoding: "utf8",
        }),
      );
      const r = alternar(f, true);
      assert.equal(r.status, 78);
      assert.match(r.stderr, /Trava física ocupada/);
    } finally {
      fs.closeSync(fd);
    }
    assert.deepEqual(journals(f), []);
    f.ok(alternar(f, true));
    const habilitado = lerJson(f.perfil);
    assert.notEqual(habilitado.snapshot, original.snapshot);
    assert.equal(habilitado.manifestoSha256, original.manifestoSha256);
    const obsoleto = f.executar(process.execPath, [
      `${original.snapshot}/scripts/servidor/controlador/cli.mjs`,
      "executar",
      f.perfil,
      "estado",
    ]);
    assert.equal(obsoleto.status, 78);
    assert.match(obsoleto.stderr, /Geração obsoleta/);
    assert.match(fs.readFileSync(ops, "utf8"), new RegExp(`^${chave}=true$`, "m"));
    f.ok(alternar(f, false));
    assert.match(fs.readFileSync(ops, "utf8"), new RegExp(`^${chave}=false$`, "m"));
    assert.equal(lerJson(f.perfil).opsEnvSha256, hash(fs.readFileSync(ops)));
    assert.deepEqual(
      inalterados.map((n) => fs.readFileSync(n)),
      antes,
    );
    assert.equal(inode(lock), trava);
    f.ok(entrada(f, "estado"));
  } finally {
    f.limpar();
  }
});

test("retoma o toggle interrompido apenas com o mesmo pedido", () => {
  const f = fixture();
  try {
    const hook = path.join(import.meta.dirname, "hooks/interromper-rename.mjs");
    const interrompido = alternar(f, true, "--confirmar", ["--import", hook], {
      env: {
        PATH: `${f.bin}:/usr/local/bin:/usr/bin:/bin`,
        HOME: f.raiz,
        TMPDIR: f.raiz,
        HOOK_ALVO: f.perfil,
      },
    });
    assert.equal(interrompido.signal, "SIGKILL", interrompido.stderr);
    assert.notEqual(entrada(f, "estado").status, 0);
    const outroPedido = alternar(f, false);
    assert.equal(outroPedido.status, 78);
    assert.match(outroPedido.stderr, /mesma política/);
    f.ok(alternar(f, true));
    f.ok(entrada(f, "estado"));
    assert.equal(journals(f).length, 1);
  } finally {
    f.limpar();
  }
});

const commitAlvo = "b".repeat(40);
const imagem = `sha256:${"c".repeat(64)}`;
function prepararLote(f, comandos, evidenciaOverride = {}) {
  fs.appendFileSync(`${f.config}/ops.env`, `${chave}=true\n`);
  const docker = `${f.bin}/docker`;
  f.gravar(
    docker,
    fs.readFileSync(docker, "utf8").replace('"sha256:app"', JSON.stringify(imagem)),
    0o700,
  );
  const evidencia = {
    lote: {
      base: "a".repeat(40),
      alvo: commitAlvo,
      migracoes: [
        {
          caminho: "prisma/migrations/20261126010101_sintetica/migration.sql",
          sha256: "d".repeat(64),
        },
      ],
    },
    ensaio: { runId: 12, tentativa: 1 },
    recuperacao: "e".repeat(64),
    imagem,
    ...evidenciaOverride,
  };
  const arquivos = ["artefato-1", "artefato-2", "artefato-3", "ponteiro.json"].map((nome) => ({
    nome,
    sha256: hash("sintetico\n"),
  }));
  prepararAtualizador(
    f,
    `
cli="$(dirname "$0")/controlador/cli.mjs"
node "$cli" iniciar "$SERVIDOR_CONTROLADOR_PERFIL" --migracoes-auto
export SERVIDOR_CONTROLADOR_OPERACAO="$SERVIDOR_CONTROLADOR_PREPARACAO"
export SERVIDOR_CONTROLADOR_ACAO=atualizar
# Pin sintético com os quatro artefatos no formato do produtor.
pin="$(dirname "$SERVIDOR_CONTROLADOR_PERFIL")/dados/pins/$SERVIDOR_CONTROLADOR_OPERACAO"
mkdir -m 700 "$pin"
for n in ${arquivos.map((a) => a.nome).join(" ")}; do printf 'sintetico\\n' > "$pin/$n"; done
printf '{"versao":1,"operacao":"%s","alvo":"%s","arquivos":%s}\\n' \
  "$SERVIDOR_CONTROLADOR_OPERACAO" "$SERVIDOR_ALVO_CHAVE" '${JSON.stringify(arquivos)}' > "$pin/pin.json"
registrar() { node "$cli" registrar-migracoes-auto "$SERVIDOR_CONTROLADOR_PERFIL" '${JSON.stringify(evidencia)}'; }
recusar() { node "$cli" abortar-migracoes-auto "$SERVIDOR_CONTROLADOR_PERFIL"; }
${comandos}`,
  );
}

test("só anuncia conclusão após gravar o digest do recibo e o reconfere em estado", () => {
  const f = fixture({ adotar: false });
  try {
    prepararLote(f, "registrar");
    const r = f.ok(entrada(f, "atualizar", "--agendado"));
    const [pasta] = journals(f);
    const aprovacao = `${pasta}/migracoes-auto.json`;
    const conclusao = lerJson(`${pasta}/concluida.json`);
    assert.equal(conclusao.migracoesAutoSha256, hash(fs.readFileSync(aprovacao)));
    assert.equal(
      r.stdout.trim(),
      `[controlador] Atualização automática concluída para ${commitAlvo}.`,
    );
    f.ok(entrada(f, "estado"));
    fs.appendFileSync(aprovacao, "\n");
    const recusado = entrada(f, "estado");
    assert.notEqual(recusado.status, 0);
    assert.match(recusado.stderr, /Conclusão diverge da aprovação/);
  } finally {
    f.limpar();
  }
});

test("recibo ausente, inválido ou com imagem diferente não vira sucesso", () => {
  for (const [comandos, evidencia, erro] of [
    [":", {}, /migracoes-auto.json/],
    ["registrar", { imagem: `sha256:${"f".repeat(64)}` }, /Saúde física/],
    [
      "registrar",
      { lote: { base: "a".repeat(40), alvo: commitAlvo, migracoes: [{}] } },
      /Evidência automática/,
    ],
  ]) {
    const f = fixture({ adotar: false });
    try {
      prepararLote(f, comandos, evidencia);
      const r = entrada(f, "atualizar", "--agendado");
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, erro);
      assert.doesNotMatch(r.stdout, /concluída/);
      const [pasta] = journals(f);
      assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
      assert.equal(fs.existsSync(`${pasta}/incerta.json`), true);
    } finally {
      f.limpar();
    }
  }
});

test("aborto limpo exige recusa persistida, saída 20 e ausência de aprovação", () => {
  for (const [comandos, limpo] of [
    ["recusar; exit 20", true],
    ["exit 20", false],
    ["registrar; recusar || exit 20", false],
  ]) {
    const f = fixture({ adotar: false });
    try {
      prepararLote(f, comandos);
      const r = entrada(f, "atualizar", "--agendado");
      assert.equal(r.status, 20, r.stderr);
      assert.doesNotMatch(r.stdout, /concluída/);
      const [pasta] = journals(f);
      assert.equal(fs.existsSync(`${pasta}/concluida.json`), false);
      assert.equal(fs.existsSync(`${pasta}/incerta.json`), !limpo);
      assert.equal(fs.existsSync(`${pasta}/abortada.json`), limpo);
      const estado = entrada(f, "estado");
      if (limpo) f.ok(estado);
      else {
        assert.notEqual(estado.status, 0);
        assert.match(estado.stderr, /Operação incerta/);
      }
      if (limpo) {
        fs.appendFileSync(`${pasta}/recusa-migracoes-auto.json`, "\n");
        const divergente = entrada(f, "estado");
        assert.notEqual(divergente.status, 0);
        assert.match(divergente.stderr, /Aborto diverge da recusa/);
      }
    } finally {
      f.limpar();
    }
  }
});
