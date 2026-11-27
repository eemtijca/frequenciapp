// Confere a evidência pública do Actions sem aceitar autoridade do checkout candidato.
import { execFileSync } from "node:child_process";
import { Agent, get } from "node:https";
import { isDeepStrictEqual } from "node:util";
import { inventariarLoteAutomatico } from "./politica-migracoes-auto.mjs";

const repositorio = "eemtijca/frequenciapp";
const origem = `https://github.com/${repositorio}.git`;
const api = `/repos/${repositorio}`;
const workflow = "validar-migracoes-auto.yml";
const caminhoWorkflow = `.github/workflows/${workflow}`;
const nomeJob = "Ensaio PostgreSQL de migrações automáticas";
const passosObrigatorios = [
  "Conferir o intervalo do push",
  "Exercitar recusas, rollback e concorrência em PostgreSQL isolado",
  "Ensaiar migração no PostgreSQL descartável",
];
const obrigatorios = [
  caminhoWorkflow,
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
];
const atributos = [
  "",
  ".github",
  ".github/workflows",
  "docker",
  "docker/app",
  "prisma",
  "scripts",
  "scripts/servidor",
  "src",
  "src/infra",
  "tests",
  "tests/servidor",
];
const opcionais = [
  ".npmrc",
  ".pnpmfile.cjs",
  ".pnpmfile.mjs",
  ".gitmodules",
  "patches",
  "node_modules",
  "docker/node_modules",
  "docker/app/node_modules",
  "src/node_modules",
  "src/infra/node_modules",
  ...atributos.map((pasta) => (pasta ? `${pasta}/.gitattributes` : ".gitattributes")),
];
const limiteResposta = 512 * 1024;

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

function git(repo, ...args) {
  try {
    return execFileSync(
      "/usr/bin/git",
      ["--no-replace-objects", "--literal-pathspecs", "-C", repo, ...args],
      {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 128 * 1024,
        env: {
          PATH: "/usr/bin:/bin",
          LC_ALL: "C",
          GIT_ALLOW_PROTOCOL: "",
          GIT_TERMINAL_PROMPT: "0",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new Error("Não foi possível conferir a origem ou os objetos Git do ensaio.");
  }
}

function conferirProdutor(repo, base, alvo) {
  // Comparar entradas completas (modo, tipo, objeto e caminho), incluindo ausência.
  // Uma entrada ancestral inesperada não deve virar uma ausência dos arquivos.
  const ler = (sha) =>
    git(repo, "ls-tree", "-z", "--full-tree", sha, "--", ...obrigatorios, ...opcionais);
  const instalado = ler(base);
  exigir(instalado === ler(alvo), "Os arquivos confiáveis do ensaio mudaram no candidato.");
  const entradas = new Map();
  for (const linha of instalado.split("\0").slice(0, -1)) {
    const m = /^(100644 blob|100755 blob|040000 tree) ([0-9a-f]{40})\t([^\r\n\t]+)$/.exec(linha);
    exigir(
      m && m[0] === linha && !entradas.has(m[3]),
      "Arquivo do ensaio com tipo ou modo inválido.",
    );
    entradas.set(m[3], m[1]);
  }
  exigir(
    obrigatorios.every((nome) => entradas.get(nome)?.endsWith(" blob")),
    "O ensaio confiável precisa estar instalado na base.",
  );
}

function github(rota) {
  // Um agente próprio impede o uso das opções do agente global; não há token,
  // redirecionamento, proxy configurável nem URL retornada pela resposta.
  return new Promise((ok, falhar) => {
    const agente = new Agent({ rejectUnauthorized: true });
    const pedido = get(
      {
        hostname: "api.github.com",
        path: rota,
        agent: agente,
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "FrequenciApp-migracoes-auto",
          "Accept-Encoding": "identity",
        },
      },
      (r) => {
        r.once("error", falhar);
        if (r.statusCode !== 200) {
          r.destroy();
          falhar(new Error("Resposta HTTP do Actions recusada."));
          return;
        }
        const partes = [];
        let tamanho = 0;
        r.on("data", (parte) => {
          tamanho += parte.length;
          if (tamanho > limiteResposta) {
            r.destroy(new Error("Resposta do Actions acima do limite."));
            return;
          }
          partes.push(parte);
        });
        r.once("end", () => {
          try {
            exigir(r.complete, "Resposta do Actions incompleta.");
            ok(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(partes))));
          } catch (erro) {
            falhar(erro);
          }
        });
      },
    );
    pedido.once("error", falhar);
    pedido.once("close", () => agente.destroy());
  });
}

const id = (n) => Number.isSafeInteger(n) && n > 0;
const sucesso = (x) => x?.status === "completed" && x?.conclusion === "success";
const fonte = (x) => id(x?.id) && x.full_name === repositorio;

// O adaptador opcional consulta respostas JSON apenas nos testes que importam
// este módulo. Retorna { runId, tentativa }; o chamador revalida antes da troca.
export async function verificarEvidenciaAutomatica(repo, lote, remoto, consultar = github) {
  const esperado = inventariarLoteAutomatico(repo, lote?.base, lote?.alvo);
  exigir(isDeepStrictEqual(lote, esperado), "O lote diverge dos objetos Git aprováveis.");
  exigir(
    typeof remoto === "string" &&
      /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(remoto) &&
      !/[\r\n]/.test(remoto),
    "Informe um nome de remoto Git válido.",
  );
  exigir(
    git(repo, "remote", "get-url", "--all", remoto) === `${origem}\n`,
    "O remoto Git não aponta para a origem canônica.",
  );
  conferirProdutor(repo, esperado.base, esperado.alvo);

  async function ler(rota) {
    try {
      return await consultar(`${api}${rota}`);
    } catch {
      throw new Error("A evidência pública do GitHub Actions está indisponível.");
    }
  }
  const definicao = await ler(`/actions/workflows/${workflow}`);
  exigir(
    id(definicao?.id) && definicao.path === caminhoWorkflow && definicao.state === "active",
    "Workflow confiável do Actions não encontrado.",
  );
  const workflowId = definicao.id;
  const { alvo } = esperado;
  function execucaoValida(run) {
    return (
      id(run?.id) &&
      id(run.run_attempt) &&
      run.workflow_id === workflowId &&
      (run.path === caminhoWorkflow || run.path === `${caminhoWorkflow}@refs/heads/main`) &&
      run.head_sha === alvo &&
      run.head_branch === "main" &&
      run.event === "push" &&
      sucesso(run) &&
      fonte(run.repository) &&
      fonte(run.head_repository) &&
      run.repository.id === run.head_repository.id
    );
  }
  const execucoes = await ler(
    `/actions/workflows/${workflowId}/runs?branch=main&event=push&head_sha=${alvo}&per_page=2`,
  );
  exigir(
    execucoes?.total_count === 1 &&
      Array.isArray(execucoes.workflow_runs) &&
      execucoes.workflow_runs.length === 1,
    "Não há uma execução única do ensaio confiável para o alvo.",
  );
  const run = execucoes.workflow_runs[0];
  exigir(execucaoValida(run), "A execução do Actions não corresponde ao ensaio confiável.");
  const { id: runId, run_attempt: tentativa } = run;

  const jobs = await ler(`/actions/runs/${runId}/attempts/${tentativa}/jobs?per_page=100`);
  exigir(
    Array.isArray(jobs?.jobs) &&
      jobs.jobs.length > 0 &&
      jobs.jobs.length <= 100 &&
      jobs.total_count === jobs.jobs.length,
    "A listagem dos jobs do ensaio está incompleta.",
  );
  const ensaios = jobs.jobs.filter((job) => job?.name === nomeJob);
  const job = ensaios[0];
  exigir(
    ensaios.length === 1 &&
      id(job.id) &&
      job.run_id === runId &&
      job.run_attempt === tentativa &&
      job.head_sha === alvo &&
      sucesso(job),
    "O job do ensaio não concluiu com sucesso na tentativa atual.",
  );
  exigir(
    Array.isArray(job.steps) &&
      passosObrigatorios.every((nome) => {
        const passos = job.steps.filter((passo) => passo?.name === nome);
        return passos.length === 1 && sucesso(passos[0]);
      }),
    "O job não executou todas as etapas obrigatórias do ensaio.",
  );
  // Detecta nova tentativa iniciada enquanto os jobs eram consultados.
  const atual = await ler(`/actions/runs/${runId}`);
  exigir(
    execucaoValida(atual) &&
      atual.id === runId &&
      atual.run_attempt === tentativa &&
      atual.repository.id === run.repository.id,
    "A execução atual do ensaio mudou durante a verificação.",
  );
  const ponta = await ler("/git/ref/heads/main");
  exigir(
    ponta?.ref === "refs/heads/main" &&
      ponta.object?.type === "commit" &&
      ponta.object.sha === alvo,
    "A ponta da main não corresponde ao alvo do ensaio.",
  );
  return { runId, tentativa };
}
