// Exercita a CLI inteira com eventos e clientes falsos; a projeção YAML não executa Actions.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

// O parser já pertence ao ESLint instalado; não há instalação ou resolução pela rede.
const require = createRequire(import.meta.url);
const yaml = createRequire(require.resolve("eslint/package.json"))("js-yaml") as {
  load: (texto: string) => Workflow;
};
type Workflow = {
  on: Record<string, { inputs?: Record<string, { type: string; required: boolean }> } | null>;
  jobs: Record<
    string,
    {
      uses?: string;
      with?: Record<string, string>;
      steps?: { run?: string; env?: Record<string, string> }[];
    }
  >;
};
const shaTag = "b".repeat(40);
const etapas = ["pull", "build", "migrar", "publicar", "promover", "saude"];
type Chamada = { etapa: string; args?: string[]; commit?: string; direct?: string };
type Opcoes = {
  evento?: object;
  ref?: string;
  sha?: string;
  versaoDelegada?: string;
  versaoPacote?: string;
  sujo?: boolean;
  falha?: string;
};
function executarEntrada(opcoes: Opcoes = {}) {
  const pasta = mkdtempSync(path.join(os.tmpdir(), "qa-implantacao-entrada-"));
  const log = path.join(pasta, "chamadas.jsonl");
  try {
    for (const nome of ["scripts/github", "docker/app", "bin"]) {
      mkdirSync(path.join(pasta, nome), { recursive: true });
    }
    for (const nome of ["orquestrar-implantacao.mjs", "validar-publicacao.mjs"]) {
      writeFileSync(
        path.join(pasta, "scripts/github", nome),
        readFileSync(`scripts/github/${nome}`),
      );
    }
    writeFileSync(path.join(pasta, "vercel.json"), readFileSync("vercel.json"));
    const registrar = `import {appendFileSync} from 'node:fs';
const registrar=(etapa,args=[])=>appendFileSync(${JSON.stringify(log)},JSON.stringify({etapa,args,commit:process.env.COMMIT_SHA,direct:process.env.DIRECT_URL})+'\\n');`;
    const config = JSON.stringify({
      sha: shaTag,
      pacote: opcoes.versaoPacote ?? "1.2.3",
      sujo: opcoes.sujo ?? false,
      falha: opcoes.falha,
    });
    writeFileSync(
      path.join(pasta, "bin/git"),
      `#!${process.execPath}
${registrar}
const c=${config}, args=process.argv.slice(2); registrar('git',args);
if(args[0]==='rev-parse' && (args[1]==='HEAD' || args[1]==='--verify')) process.stdout.write(c.sha+'\\n');
else if(args[0]==='show' && args[1]===c.sha+':package.json') process.stdout.write(JSON.stringify({version:c.pacote}));
else if(args[0]==='merge-base' && args[1]==='--is-ancestor') process.exitCode=0;
else if(JSON.stringify(args)===JSON.stringify(['diff','--exit-code','HEAD','--'])) process.exitCode=c.sujo?1:0;
else throw new Error('Git falso recebeu comando inesperado: '+JSON.stringify(args));
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(pasta, "bin/pnpm"),
      `#!${process.execPath}
${registrar}
const c=${config}, args=process.argv.slice(2), nomes={pull:'pull',build:'build',deploy:'publicar',promote:'promover'}, etapa=nomes[args[2]];
if(args[0]!=='exec' || args[1]!=='vercel' || !etapa) throw new Error('Executor falso recebeu comando inesperado');
registrar(etapa,args);
if(c.falha===etapa) process.exitCode=9;
else if(etapa==='publicar') process.stdout.write('https://qa.vercel.app\\n');
`,
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(pasta, "docker/app/migrar.mjs"),
      `${registrar}
registrar('migrar'); if(${JSON.stringify(opcoes.falha)}==='migrar') process.exitCode=9;
`,
    );
    writeFileSync(
      path.join(pasta, "saude.mjs"),
      `${registrar}
globalThis.fetch=async(url,opcoes)=>{registrar('saude',[String(url),opcoes.redirect]); return new Response(JSON.stringify({ok:true,commit:${JSON.stringify(shaTag)}}));};
`,
    );
    writeFileSync(path.join(pasta, "evento.json"), JSON.stringify(opcoes.evento ?? { inputs: {} }));
    const resultado = spawnSync(
      process.execPath,
      ["--import", path.join(pasta, "saude.mjs"), "scripts/github/orquestrar-implantacao.mjs"],
      {
        cwd: pasta,
        encoding: "utf8",
        timeout: 10000,
        env: {
          NODE_ENV: "test",
          PATH: path.join(pasta, "bin"),
          HOME: pasta,
          TMPDIR: pasta,
          GITHUB_EVENT_PATH: path.join(pasta, "evento.json"),
          GITHUB_EVENT_NAME: "release" in (opcoes.evento ?? {}) ? "release" : "workflow_dispatch",
          GITHUB_REF: opcoes.ref ?? "refs/tags/v1.2.3",
          GITHUB_SHA: opcoes.sha ?? shaTag,
          ...(opcoes.versaoDelegada !== undefined
            ? { IMPLANTACAO_VERSAO: opcoes.versaoDelegada }
            : {}),
          DEPLOY_TARGET: "vercel",
          VERCEL_TOKEN: "TOKEN_FICTICIO",
          DIRECT_URL_PROD: "CONEXAO_FICTICIA_NAO_UTILIZADA",
          APP_URL: "https://app.exemplo",
        },
      },
    );
    expect(resultado.error).toBeUndefined();
    expect(resultado.signal).toBeNull();
    let chamadas: Chamada[] = [];
    try {
      chamadas = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Chamada);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== "ENOENT") throw erro;
    }
    return { status: resultado.status, stderr: resultado.stderr, chamadas };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}
function conferirSucesso(resultado: ReturnType<typeof executarEntrada>) {
  expect(resultado.stderr).toBe("");
  expect(resultado.status).toBe(0);
  const mutacoes = resultado.chamadas.filter((c) => c.etapa !== "git");
  expect(mutacoes.map((c) => c.etapa)).toEqual(etapas);
  expect(mutacoes.every((c) => c.commit === shaTag || c.etapa === "saude")).toBe(true);
  expect(mutacoes.filter((c) => c.direct !== undefined).map((c) => c.etapa)).toEqual(["migrar"]);
  expect(resultado.chamadas.some((c) => c.args?.includes("refs/tags/v1.2.3^{commit}"))).toBe(true);
}

describe("entrada completa da implantação", () => {
  it("delega versão do caller manual até a CLI pela entrada reutilizável", () => {
    const caller = yaml.load(readFileSync(".github/workflows/migracoes.yml", "utf8"));
    const comum = yaml.load(readFileSync(".github/workflows/implantacao.yml", "utf8"));
    const entrada = caller.on.workflow_dispatch?.inputs?.versao;
    const job = caller.jobs.orquestrar;
    const etapa = comum.jobs.implantar?.steps?.find(
      (s) => s.run === "node scripts/github/orquestrar-implantacao.mjs",
    );
    const versao = entrada && job?.with?.versao === "${{ inputs.versao }}" ? "1.2.3" : undefined;
    const exportada =
      comum.on.workflow_call?.inputs?.versao &&
      etapa?.env?.IMPLANTACAO_VERSAO === "${{ inputs.versao }}"
        ? versao
        : undefined;
    const resultado = executarEntrada({ versaoDelegada: exportada });
    conferirSucesso(resultado);
    expect(entrada).toMatchObject({ type: "string", required: false });
    expect(comum.on.workflow_call?.inputs?.versao).toMatchObject({
      type: "string",
      required: false,
    });
    expect(job?.uses).toBe("./.github/workflows/implantacao.yml");
  });
  it("a CLI aceita versão explícita do reusable mesmo sem evento.inputs", () => {
    conferirSucesso(executarEntrada({ versaoDelegada: "v1.2.3" }));
  });
  it("preserva dispatch direto e release com a mesma validação de identidade", () => {
    conferirSucesso(executarEntrada({ evento: { inputs: { versao: "1.2.3" } } }));
    conferirSucesso(
      executarEntrada({
        evento: { release: { tag_name: "v1.2.3", draft: false, prerelease: false } },
      }),
    );
  });
  it("publica a main sem versão em qualquer momento", () => {
    const resultado = executarEntrada({
      ref: "refs/heads/main",
      versaoDelegada: "",
    });
    expect(resultado.status).toBe(0);
    expect(resultado.chamadas.filter((c) => c.etapa !== "git").map((c) => c.etapa)).toEqual(etapas);
  });
  it.each<[string, Opcoes, string]>([
    ["versão ausente", {}, "SemVer"],
    ["versão divergente", { versaoDelegada: "1.2.4" }, "tag completa"],
    [
      "branch homônima",
      { versaoDelegada: "1.2.3", ref: "refs/heads/v1.2.3" },
      "Evento fora do regime",
    ],
    ["SHA divergente", { versaoDelegada: "1.2.3", sha: "c".repeat(40) }, "SHA esperado"],
    ["pacote divergente", { versaoDelegada: "1.2.3", versaoPacote: "0.1.0" }, "package.json"],
    ["checkout sujo", { versaoDelegada: "1.2.3", sujo: true }, "Command failed"],
    [
      "release preliminar",
      { evento: { release: { tag_name: "v1.2.3", prerelease: true } } },
      "Release não estável",
    ],
  ])("recusa %s antes do executor mutante", (_, opcoes, mensagem) => {
    const resultado = executarEntrada(opcoes);
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain(mensagem);
    expect(resultado.chamadas.filter((c) => c.etapa !== "git")).toEqual([]);
  });
  it("uma falha após migrar interrompe a CLI sem nova mutação ou promoção", () => {
    const resultado = executarEntrada({ versaoDelegada: "1.2.3", falha: "publicar" });
    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain("schema pode já ter sido aplicado");
    expect(resultado.stderr).toContain("Nenhuma repetição automática");
    expect(resultado.chamadas.filter((c) => c.etapa !== "git").map((c) => c.etapa)).toEqual(
      etapas.slice(0, 4),
    );
  });
});
