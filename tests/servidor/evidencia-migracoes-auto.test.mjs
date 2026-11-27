// Exercita a validação da evidência do Actions com Git local e API sintética.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { inventariarLoteAutomatico } from "../../scripts/servidor/politica-migracoes-auto.mjs";
import { verificarEvidenciaAutomatica } from "../../scripts/servidor/evidencia-migracoes-auto.mjs";

const repoGithub = "eemtijca/frequenciapp";
const api = `/repos/${repoGithub}`;
const nomeWorkflow = "validar-migracoes-auto.yml";
const caminho = `.github/workflows/${nomeWorkflow}`;
const nomeJob = "Ensaio PostgreSQL de migrações automáticas";
const objetoRepo = { id: 101, full_name: repoGithub };

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "evidencia-migracoes-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const escrever = (nome, conteudo) => {
    const arquivo = join(repo, nome);
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, conteudo);
  };
  const commit = () => {
    git("add", "-A");
    git("commit", "-m", "revisão sintética");
    return git("rev-parse", "HEAD");
  };
  git("init", "--initial-branch=main");
  git("config", "user.name", "Teste");
  git("config", "user.email", "teste@example.invalid");
  git("remote", "add", "origin", `https://github.com/${repoGithub}.git`);
  for (const nome of [
    caminho,
    "tests/servidor/ensaio-migracoes-auto.sh",
    "tests/servidor/migracao-auto-lock.test.mjs",
    "scripts/servidor/alvo-migracoes-auto.mjs",
    "scripts/servidor/politica-migracoes-auto.mjs",
    "scripts/servidor/aprovacao-migracoes.mjs",
    "docker/app/migrar.mjs",
    "src/infra/schema-postgres.mjs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ])
    escrever(nome, "bytes instalados\n");
  escrever(
    "prisma/migrations/20260101000000_inicial/migration.sql",
    'CREATE TABLE "notas" ("nome" TEXT);\n',
  );
  const base = commit();
  escrever(
    "prisma/migrations/20260201000000_nova/migration.sql",
    'ALTER TABLE "notas" ADD COLUMN "dia" DATE;\n',
  );
  const alvo = commit();
  const lote = inventariarLoteAutomatico(repo, base, alvo);
  const run = {
    id: 501,
    workflow_id: 42,
    path: caminho,
    run_attempt: 2,
    head_sha: alvo,
    head_branch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    repository: objetoRepo,
    head_repository: objetoRepo,
  };
  const job = {
    id: 801,
    run_id: 501,
    run_attempt: 2,
    head_sha: alvo,
    name: nomeJob,
    status: "completed",
    conclusion: "success",
    steps: [
      { name: "Conferir o intervalo do push", status: "completed", conclusion: "success" },
      {
        name: "Exercitar recusas, rollback e concorrência em PostgreSQL isolado",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Ensaiar migração no PostgreSQL descartável",
        status: "completed",
        conclusion: "success",
      },
    ],
  };
  const respostas = new Map([
    [`${api}/actions/workflows/${nomeWorkflow}`, { id: 42, path: caminho, state: "active" }],
    [
      `${api}/actions/workflows/42/runs?branch=main&event=push&head_sha=${alvo}&per_page=2`,
      { total_count: 1, workflow_runs: [run] },
    ],
    [`${api}/actions/runs/501/attempts/2/jobs?per_page=100`, { total_count: 1, jobs: [job] }],
    [`${api}/actions/runs/501`, { ...run }],
    [
      `${api}/git/ref/heads/main`,
      { ref: "refs/heads/main", object: { type: "commit", sha: alvo } },
    ],
  ]);
  const chamadas = [];
  const consultar = async (rota) => {
    chamadas.push(rota);
    assert(respostas.has(rota), "A rota deve ser fixa e confinada ao repositório canônico");
    return respostas.get(rota);
  };
  return { repo, lote, consultar, chamadas, respostas, git, escrever, commit, run, job };
}

test("aceita somente a execução do workflow instalado na main para o lote exato", async (t) => {
  const { repo, lote, consultar, chamadas, respostas } = fixture(t);
  assert.deepEqual(await verificarEvidenciaAutomatica(repo, lote, "origin", consultar), {
    runId: 501,
    tentativa: 2,
  });
  assert.deepEqual(chamadas, [...respostas.keys()]);
});

for (const arquivo of [
  caminho,
  "tests/servidor/ensaio-migracoes-auto.sh",
  "tests/servidor/migracao-auto-lock.test.mjs",
  "scripts/servidor/alvo-migracoes-auto.mjs",
  "scripts/servidor/aprovacao-migracoes.mjs",
  "docker/app/migrar.mjs",
  "docker/app/.gitattributes",
  "pnpm-lock.yaml",
  ".npmrc",
]) {
  test(`recusa mudança em ${arquivo} antes de consultar o Actions`, async (t) => {
    const { repo, lote, consultar, chamadas, escrever, git } = fixture(t);
    escrever(arquivo, "alteração no candidato\n");
    git("add", "-A");
    git("commit", "--amend", "--no-edit");
    const alvo = git("rev-parse", "HEAD");
    const alterado = inventariarLoteAutomatico(repo, lote.base, alvo);
    await assert.rejects(
      verificarEvidenciaAutomatica(repo, alterado, "origin", consultar),
      /arquivos confiáveis/,
    );
    assert.deepEqual(chamadas, []);
  });
}

test("recusa remoto divergente e lote cujo hash não corresponde ao Git", async (t) => {
  const { repo, lote, consultar, chamadas, git } = fixture(t);
  const alterado = structuredClone(lote);
  alterado.migracoes[0].sha256 = "f".repeat(64);
  await assert.rejects(
    verificarEvidenciaAutomatica(repo, alterado, "origin", consultar),
    /lote diverge/,
  );
  git("config", "url.https://example.invalid/.insteadOf", "https://github.com/");
  await assert.rejects(
    verificarEvidenciaAutomatica(repo, lote, "origin", consultar),
    /origem canônica/,
  );
  assert.deepEqual(chamadas, []);
});

const casos = {
  "workflow diferente": ({ run }) => {
    run.workflow_id = 88;
  },
  "run de pull request": ({ run }) => {
    run.event = "pull_request";
  },
  "run com outro SHA": ({ run, lote }) => {
    run.head_sha = lote.base;
  },
  "run com outra branch": ({ run }) => {
    run.head_branch = "outra";
  },
  "run em fork": ({ run }) => {
    run.head_repository = { id: 901, full_name: "outro/frequenciapp" };
  },
  "job de tentativa antiga": ({ job }) => {
    job.run_attempt = 1;
  },
  "etapa obrigatória pulada": ({ job }) => {
    job.steps[1].conclusion = "skipped";
  },
  "job incompleto": ({ job }) => {
    job.status = "in_progress";
  },
  "API indisponível": ({ respostas }) => {
    respostas.clear();
  },
  "run em nova tentativa": ({ respostas }) => {
    respostas.get(`${api}/actions/runs/501`).run_attempt = 3;
  },
  "main avançou": ({ lote, respostas }) => {
    respostas.get(`${api}/git/ref/heads/main`).object.sha = lote.base;
  },
  "listagem ambígua": ({ lote, respostas }) => {
    respostas.get(
      `${api}/actions/workflows/42/runs?branch=main&event=push&head_sha=${lote.alvo}&per_page=2`,
    ).total_count = 2;
  },
};

for (const [caso, mudar] of Object.entries(casos)) {
  test(`não aceita evidência quando há ${caso}`, async (t) => {
    const contexto = fixture(t);
    mudar(contexto);
    const { repo, lote, consultar } = contexto;
    await assert.rejects(verificarEvidenciaAutomatica(repo, lote, "origin", consultar));
  });
}
