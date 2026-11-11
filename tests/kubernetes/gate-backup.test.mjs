// Exercita o gate Kubernetes com recibos e artefatos exclusivamente sintéticos.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { criarRecibo } from "../../scripts/servidor/recibos.mjs";

const raiz = path.resolve(import.meta.dirname, "../..");
const scratch = fs.realpathSync(os.tmpdir());
assert.ok(
  path.isAbsolute(scratch) && scratch !== raiz && !scratch.startsWith(raiz + path.sep),
  "As fixtures devem ficar fora do repositório",
);
const gate = path.join(raiz, "infra/kubernetes/frequenciapp/files/verificar-backup.sh");
const hash = (dados) => createHash("sha256").update(dados).digest("hex");
const base = "frequenciapp-20260101T020000Z-abcdef01";
const salvar = (arquivo, valor) => fs.writeFileSync(arquivo, JSON.stringify(valor) + "\n");

function ensaiar(
  mudar,
  remoto = false,
  { diagnostico = true, limiteMemoria = false, ensaio = false, argumento } = {},
) {
  const tmp = fs.mkdtempSync(path.join(scratch, "gate-k8s-"));
  try {
    const banco = path.join(tmp, "banco");
    const estadoDir = path.join(tmp, "estado");
    fs.mkdirSync(banco);
    fs.mkdirSync(estadoDir);
    const nome = `${base}.dump.gpg`;
    const dump = "dump sintético, sem dados reais\n";
    fs.writeFileSync(path.join(banco, nome), dump);
    fs.writeFileSync(path.join(banco, nome + ".sha256"), `${hash(dump)}  ${nome}\n`);
    const recibo = criarRecibo(banco, {
      base,
      criptografia: "gpg",
      schema: "public",
      banco: "escola-sintetica",
      alvo: "url-conservador",
      remoto: remoto ? "remoto-sintetico" : "",
      verificadoRemoto: remoto,
      destinatario: "chave-sintetica",
    });
    const ponteiro = {
      em: recibo.em,
      modo: "url",
      criptografia: "gpg",
      arquivo: nome,
      sha256: hash(dump),
      schema: "public",
      ambiente: "",
      ambienteSha256: "",
      remoto: recibo.remoto,
      verificadoRemoto: remoto,
      recibo: `${base}.confirmado.json`,
    };
    mudar?.({ recibo, ponteiro, banco, estadoDir, nome });
    salvar(path.join(banco, `${base}.confirmado.json`), recibo);
    salvar(path.join(estadoDir, "ultimo-backup.json"), ponteiro);
    const args = argumento
      ? [gate, argumento]
      : diagnostico
        ? [gate, "--diagnosticar-integridade"]
        : [gate];
    const comando = limiteMemoria ? 'ulimit -v 1703936; exec /bin/bash "$@"' : null;
    const resultado = spawnSync("/bin/bash", comando ? ["-c", comando, "gate", ...args] : args, {
      cwd: raiz,
      env: {
        PATH: process.env.PATH,
        HOME: tmp,
        TMPDIR: tmp,
        ESTADO_DIR: estadoDir,
        BACKUP_BANCO_DIR: banco,
        BACKUP_GATE_EXIGIR_REMOTO: String(remoto),
        ENSAIO_SEM_PROTECAO: String(ensaio),
      },
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    return resultado;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function recusar(
  rotulo,
  mudar,
  remoto = false,
  motivo = /Ponteiro diverge do recibo ou do escopo/,
) {
  test(rotulo, () => {
    const controle = ensaiar(undefined, remoto);
    assert.equal(controle.status, 0, controle.stderr);
    assert.match(controle.stdout, /Integridade local conferida/);
    const resultado = ensaiar(mudar, remoto);
    assert.equal(
      resultado.status,
      1,
      `resultado inesperado: ${resultado.stdout} ${resultado.stderr}`,
    );
    assert.match(resultado.stderr, motivo);
  });
}

test("operação protegida recusa recibo URL consistente sem prova de origem", () => {
  const resultado = ensaiar(undefined, false, { diagnostico: false });
  assert.equal(resultado.status, 1, "autorizou upgrade por metadados consistentes");
  assert.match(resultado.stderr, /origem|vínculo|vinculo/i);
});

test("diagnóstico em ensaio verifica conjunto íntegro", () => {
  const controle = ensaiar(undefined, false, { ensaio: true });
  assert.equal(controle.status, 0, controle.stderr);
  assert.match(controle.stdout, /Integridade local conferida/);
});

test("diagnóstico em ensaio recusa artefato adulterado", () => {
  const controle = ensaiar(undefined, false);
  assert.equal(controle.status, 0, controle.stderr);
  assert.match(controle.stdout, /Integridade local conferida/);
  const alterado = ensaiar(
    ({ banco, nome }) => {
      fs.writeFileSync(path.join(banco, nome), "adulterado\n");
    },
    false,
    { ensaio: true },
  );
  assert.equal(alterado.status, 1, alterado.stdout + alterado.stderr);
  assert.match(alterado.stderr, /Artefato local ausente ou divergente/);
});

test("flag antiga não aceita argumento inválido nem contorna gate sem argumento", () => {
  const invalido = ensaiar(undefined, false, { ensaio: true, argumento: "--invalido" });
  assert.equal(invalido.status, 1, invalido.stdout + invalido.stderr);
  assert.match(invalido.stderr, /Uso:/);
  const ensaio = ensaiar(undefined, false, { diagnostico: false, ensaio: true });
  assert.equal(ensaio.status, 1, ensaio.stderr);
  assert.match(ensaio.stderr, /Adoção ausente/);
});

test("ConfigMap e Job declaram hooks ordenados sem executar diagnóstico como autorização", () => {
  const ler = (nome) =>
    fs.readFileSync(path.join(raiz, "infra/kubernetes/frequenciapp/templates", nome), "utf8");
  const configmap = ler("configmap-backup-gate.yaml");
  const job = ler("hook-backup-gate.yaml");
  for (const template of [configmap, job]) {
    assert.match(template, /helm\.sh\/hook: pre-upgrade,pre-rollback/);
  }
  assert.match(configmap, /helm\.sh\/hook-weight: "-10"/);
  assert.match(job, /helm\.sh\/hook-weight: "0"/);
  assert.match(job, /command: \["bash", "\/scripts\/verificar-backup\.sh"\]/);
  assert.doesNotMatch(job, /--diagnosticar-integridade/);
});

test("diagnóstico processa dump sintético grande sob limite de memória", () => {
  const resultado = ensaiar(
    ({ recibo, ponteiro, banco, nome }) => {
      const tamanho = 512 * 1024 * 1024;
      fs.truncateSync(path.join(banco, nome), 0);
      fs.truncateSync(path.join(banco, nome), tamanho);
      // O controle distingue leitura integral de leitura em fluxo no mesmo limite.
      const controle = spawnSync(
        "/bin/bash",
        [
          "-c",
          'ulimit -v 1703936; exec node -e \'try { require("fs").readFileSync(process.argv[1]); } catch (e) { console.error(e.code); process.exit(37); }\' "$1"',
          "controle",
          path.join(banco, nome),
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      assert.equal(controle.error, undefined);
      assert.equal(controle.signal, null);
      assert.equal(controle.status, 37, controle.stderr);
      assert.match(controle.stderr, /ERR_MEMORY_ALLOCATION_FAILED/);
      const h = createHash("sha256");
      const zeros = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < 512; i++) h.update(zeros);
      const digest = h.digest("hex");
      const lista = `${digest}  ${nome}\n`;
      fs.writeFileSync(path.join(banco, nome + ".sha256"), lista);
      recibo.artefatos.find((a) => a.nome === nome).sha256 = digest;
      recibo.artefatos.find((a) => a.nome === nome + ".sha256").sha256 = hash(lista);
      ponteiro.sha256 = digest;
    },
    false,
    { limiteMemoria: true },
  );
  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
});

test("aceita conjunto local sintético confirmado", () => {
  const resultado = ensaiar();
  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
});
test("aceita remoto apenas quando ambos os recibos o confirmam", () => {
  const resultado = ensaiar(undefined, true);
  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
});
test("aceita conjunto com artefato adicional do ambiente", () => {
  const resultado = ensaiar(({ recibo, ponteiro, banco }) => {
    const nome = `${base}-ambiente.env.gpg`;
    const dados = "ambiente sintético\n";
    const lista = `${hash(dados)}  ${nome}\n`;
    fs.writeFileSync(path.join(banco, nome), dados);
    fs.writeFileSync(path.join(banco, nome + ".sha256"), lista);
    recibo.artefatos.push(
      { nome, sha256: hash(dados) },
      { nome: nome + ".sha256", sha256: hash(lista) },
    );
    ponteiro.ambiente = nome;
    ponteiro.ambienteSha256 = hash(dados);
  });
  assert.equal(resultado.status, 0, resultado.stdout + resultado.stderr);
});
recusar(
  "recusa string em vez de booleano remoto",
  ({ ponteiro }) => {
    ponteiro.verificadoRemoto = "true";
  },
  true,
  /Confirmação remota deve ser booleana/,
);
recusar(
  "recusa recibo individual ausente",
  ({ ponteiro }) => {
    ponteiro.recibo = "frequenciapp-20260101T020000Z-12345678.confirmado.json";
  },
  false,
  /ENOENT/,
);
recusar("recusa data divergente do recibo", ({ recibo }) => {
  recibo.em = "2000-01-01T00:00:00.000Z";
});
recusar("recusa schema divergente do recibo", ({ recibo }) => {
  recibo.escopo.schema = "outro";
});
recusar("recusa modo diferente do CronJob", ({ ponteiro }) => {
  ponteiro.modo = "compose";
});
recusar("recusa alvo incompatível com modo URL", ({ recibo }) => {
  recibo.escopo.alvo = "outro";
});
recusar("recusa criptografia divergente", ({ ponteiro }) => {
  ponteiro.criptografia = "age";
});
recusar(
  "recusa destino remoto divergente",
  ({ ponteiro }) => {
    ponteiro.remoto = "outro";
  },
  true,
);
recusar(
  "recusa confirmação remota individual falsa",
  ({ recibo }) => {
    recibo.etapas.remotoVerificado = false;
  },
  true,
);
recusar(
  "recusa checksum associado adulterado",
  ({ banco, nome }) => {
    fs.writeFileSync(path.join(banco, nome + ".sha256"), "falso\n");
  },
  false,
  /Artefato local ausente ou divergente/,
);
recusar(
  "recusa checksum associado com hash atualizado, mas conteúdo inválido",
  ({ banco, nome, recibo }) => {
    const conteudo = "falso\n";
    fs.writeFileSync(path.join(banco, nome + ".sha256"), conteudo);
    recibo.artefatos.find((a) => a.nome === nome + ".sha256").sha256 = hash(conteudo);
  },
  false,
  /Checksum associado divergente/,
);
recusar("recusa artefato do ambiente não declarado no ponteiro", ({ ponteiro }) => {
  ponteiro.ambiente = "arquivo-estranho";
});

test("CronJob usa diretório de trava privado dentro do volume gravável", () => {
  const ler = (nome) => fs.readFileSync(path.join(raiz, nome), "utf8");
  const comum = ler("scripts/servidor/comum.sh");
  const backup = ler("scripts/servidor/backup-banco.sh");
  const template = ler("infra/kubernetes/frequenciapp/templates/cronjob-backup-banco.yaml");
  const valores = ler("infra/kubernetes/frequenciapp/values.yaml");
  assert.match(comum, /SERVIDOR_LOCK_DIR="\$\{SERVIDOR_LOCK_DIR:-\/var\/lock\/frequenciapp\}"/);
  assert.match(comum, /stat -c %a "\$base"\)" = 700/);
  assert.match(backup, /travar backup-banco 0/);
  assert.match(valores, /readOnlyRootFilesystem: true/);
  assert.match(valores, /runAsUser: 1000/);
  assert.match(valores, /fsGroup: 1000/);
  assert.match(template, /- name: SERVIDOR_LOCK_DIR\s+value: \/backups\/\.locks/);
  assert.match(template, /- name: backups\s+mountPath: \/backups\s+- name: tmp/);
  assert.match(template, /persistentVolumeClaim:[\s\S]*?emptyDir: \{\}/);
});
