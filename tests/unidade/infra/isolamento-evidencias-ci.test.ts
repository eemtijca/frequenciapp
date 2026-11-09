// Exercita os comandos reais do workflow com executor sintético e upload local.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "vitest";
import {
  resumirEtapa,
  prepararEvidencias,
  coletarEvidencias,
  executarEtapa,
  executarCli,
} from "../../isolamento/evidencias-ci.mjs";

const apiValida = () => ({
  success: true,
  numTotalTestSuites: 1,
  numPassedTestSuites: 1,
  numFailedTestSuites: 0,
  numPendingTestSuites: 0,
  numTotalTests: 1,
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [{ status: "passed", assertionResults: [{ status: "passed" }] }],
});

it("recusa resultado de API com erro global mesmo quando as asserções passaram", () => {
  const resumo = resumirEtapa(
    "api",
    { etapa: "api", exit: 0 },
    {
      ...apiValida(),
      unhandledErrors: [{ message: "marcador-privado" }],
    },
  );
  assert.equal(resumo.integridade, "incompleta");
  assert.equal(resumo.contagens, null);
});

type Etapa = {
  name: string;
  run?: string;
  uses?: string;
  if?: string;
  with: Record<string, string>;
};
function etapasDoWorkflow(texto: string): Etapa[] {
  const etapas: Etapa[] = [];
  const linhas = texto.split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const nome = linhas[i]?.match(/^      - name: (.+)$/)?.[1];
    if (!nome) continue;
    const etapa: Etapa = { name: nome, with: {} };
    etapas.push(etapa);
    for (i++; i < linhas.length && !linhas[i]?.startsWith("      - name:"); i++) {
      const linha = linhas[i] ?? "";
      if (!linha.trim() || linha.trimStart().startsWith("#")) continue;
      if (linha === "        id: evidencias_preparo") continue;
      if (linha.startsWith("      #")) continue;
      const campo = linha.match(/^        (run|uses|if): (.+)$/);
      if (campo?.[1] && campo[2]) {
        const chave = campo[1] as "run" | "uses" | "if";
        if (campo[2] !== "|") etapa[chave] = campo[2];
        else {
          const corpo: string[] = [];
          while (linhas[i + 1]?.startsWith("          ")) corpo.push(linhas[++i]?.slice(10) ?? "");
          etapa[chave] = corpo.join("\n");
        }
      } else if (linha === "        with:") {
        while (linhas[i + 1]?.startsWith("          ")) {
          const entrada = linhas[++i]?.match(/^          ([\w-]+): (.+?)(?: #.*)?$/);
          assert(entrada?.[1] && entrada[2], "Entrada with não suportada pelo ensaio");
          etapa.with[entrada[1]] = entrada[2].replace(/^['"]|['"]$/g, "");
        }
      } else assert.fail(`Campo de etapa não exercitado pelo ensaio: ${linha.trim()}`);
    }
    i--;
  }
  return etapas;
}

const executorSintetico = `// Executor falso: não chama Docker, rede ou aplicação.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const etapa=args.includes('--validar-distribuicao')?'distribuicao':args.join(' ').includes('vitest.api')?'api':args.join(' ').includes('playwright.pwa')?'pwa':'e2e';
appendFileSync(process.env.INVOCACOES,JSON.stringify({etapa,args})+'\\n');
const falha=process.env.FALHA_ETAPA===etapa;
const indice=args.indexOf('--artefatos');
if(indice>=0){
 const destino=args[indice+1]; mkdirSync(destino,{mode:0o700}); mkdirSync(path.join(destino,'test-results'));
 const status=falha?'failed':'passed';
 const relatorio=etapa==='api'?{
  success:!falha,numTotalTestSuites:1,numPassedTestSuites:falha?0:1,numFailedTestSuites:falha?1:0,numPendingTestSuites:0,
  numTotalTests:1,numPassedTests:falha?0:1,numFailedTests:falha?1:0,numPendingTests:0,numTodoTests:0,
  testResults:[{status,assertionResults:[{status,title:'marcador-privado',failureMessages:['marcador-privado']}]}]
 }:{stats:{expected:falha?0:1,unexpected:falha?1:0,flaky:0,skipped:0},errors:[],suites:[{title:'marcador-privado',specs:[{tests:[{status:falha?'unexpected':'expected',expectedStatus:'passed',results:[{status,error:{message:'marcador-privado'},attachments:[{path:'.auth/token'}]}]}]}]}]};
 const comando=args.slice(args.indexOf('--')+1).join(' ');
 const relatorioConfigurado=comando.includes('--reporter=json') && (etapa==='api'?comando.includes('--outputFile=test-results/api.json'):comando.includes('PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/'+etapa+'.json'));
 if(relatorioConfigurado && process.env.RELATORIO_AUSENTE!==etapa) writeFileSync(path.join(destino,'test-results',etapa+'.json'),process.env.RELATORIO_INVALIDO===etapa?'{':JSON.stringify(relatorio));
 writeFileSync(path.join(destino,'runtime.log'),'marcador-privado cookie token URL');
 writeFileSync(path.join(destino,'fontes.json'),'marcador-privado');
 mkdirSync(path.join(destino,'playwright-report'));writeFileSync(path.join(destino,'playwright-report/index.html'),'marcador-privado');
}
process.stdout.write('marcador-privado logs e erros\\n');process.exitCode=falha?7:0;
`;

function ensaiarWorkflow(opcoes: Record<string, string> = {}, texto?: string) {
  const pasta = mkdtempSync(path.join(tmpdir(), "evidencias-ci-workflow-"));
  try {
    const checkout = path.join(pasta, "checkout");
    const temporario = path.join(pasta, "runner");
    const duravel = path.join(pasta, "duravel");
    mkdirSync(path.join(checkout, "tests/isolamento"), { recursive: true });
    mkdirSync(temporario);
    mkdirSync(duravel);
    const origem = "tests/isolamento/evidencias-ci.mjs";
    if (existsSync(origem)) copyFileSync(origem, path.join(checkout, origem));
    writeFileSync(path.join(checkout, "tests/isolamento/executar.mjs"), executorSintetico);
    const workflow = texto ?? readFileSync(".github/workflows/testes.yml", "utf8");
    const raiz = path.join(temporario, "frequenciapp-ci-123-1");
    const substituir = (valor: string) =>
      valor
        .replaceAll("${{ runner.temp }}", temporario)
        .replaceAll("${{ github.run_id }}", "123")
        .replaceAll("${{ github.run_attempt }}", "1")
        .replaceAll("${{ env.EVIDENCIAS_CI }}", "frequenciapp-ci-123-1");
    const envDeclarado = workflow.match(/^  EVIDENCIAS_CI: (.+)$/m)?.[1];
    const invocacoes = path.join(pasta, "invocacoes.jsonl");
    const ambiente = {
      NODE_ENV: "test" as const,
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: pasta,
      TMPDIR: temporario,
      RUNNER_TEMP: temporario,
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_ATTEMPT: "1",
      INVOCACOES: invocacoes,
      ...(envDeclarado ? { EVIDENCIAS_CI: substituir(envDeclarado) } : {}),
      ...opcoes,
    };
    let falhou = false;
    let preparado = false;
    const saidas: string[] = [];
    const executadas: string[] = [];
    for (const etapa of etapasDoWorkflow(workflow)) {
      const condicao = etapa.if?.replace(/^\$\{\{\s*|\s*\}\}$/g, "");
      if (condicao === "always() && steps.evidencias_preparo.outcome == 'success'") {
        if (!preparado) continue;
        // Mesmo após falha, a coleta e o upload precisam executar.
      } else if (condicao === "!cancelled() && steps.evidencias_preparo.outcome == 'success'") {
        if (!preparado) continue;
      } else {
        assert(!condicao, "Condição nova exige prova explícita no ensaio");
        if (falhou) continue;
      }
      if (etapa.run) {
        const resultado = spawnSync(
          "bash",
          ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", etapa.run],
          {
            cwd: checkout,
            env: ambiente,
            encoding: "utf8",
          },
        );
        assert(!resultado.error, "Shell sintético indisponível");
        saidas.push(resultado.stdout, resultado.stderr);
        executadas.push(etapa.name);
        if (etapa.run.includes("evidencias-ci.mjs preparar")) preparado = resultado.status === 0;
        if (resultado.status !== 0) falhou = true;
      } else if (etapa.uses?.startsWith("actions/upload-artifact@")) {
        executadas.push("upload");
        assert.equal(condicao, "always() && steps.evidencias_preparo.outcome == 'success'");
        assert.equal(etapa.with["if-no-files-found"], "error");
        assert.equal(etapa.with.overwrite, "false");
        assert.equal(etapa.with["include-hidden-files"], "false");
        assert.equal(etapa.with["retention-days"], "7");
        const arquivo = substituir(etapa.with.path ?? "");
        assert.equal(
          arquivo,
          path.join(raiz, "publico/resumo.json"),
          "Upload aceita somente o resumo exato",
        );
        if (opcoes.FALHA_UPLOAD || !existsSync(arquivo)) falhou = true;
        else copyFileSync(arquivo, path.join(duravel, "resumo.json"));
      }
    }
    rmSync(checkout, { recursive: true });
    rmSync(temporario, { recursive: true });
    return {
      falhou,
      executadas,
      saida: saidas.join(""),
      arquivos: readdirSync(duravel),
      resumo: existsSync(path.join(duravel, "resumo.json"))
        ? JSON.parse(readFileSync(path.join(duravel, "resumo.json"), "utf8"))
        : undefined,
      invocacoes: existsSync(invocacoes)
        ? readFileSync(invocacoes, "utf8")
            .trim()
            .split("\n")
            .map((linha) => JSON.parse(linha))
        : [],
    };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

it("usa somente contextos permitidos no ambiente global do workflow", () => {
  const workflow = readFileSync(".github/workflows/testes.yml", "utf8");
  const valor = workflow.match(/^  EVIDENCIAS_CI: (.+)$/m)?.[1];
  assert(valor);
  for (const contexto of valor.matchAll(/\$\{\{\s*(\w+)\./g)) {
    assert(["github", "secrets", "inputs", "vars"].includes(contexto[1] ?? ""));
  }
});

it("preserva resultados mínimos após falha sem publicar evidência privada nem perder cobertura", () => {
  const resultado = ensaiarWorkflow({ FALHA_ETAPA: "api" });
  assert.equal(resultado.falhou, true);
  assert.deepEqual(
    resultado.arquivos,
    ["resumo.json"],
    "A evidência precisa sobreviver ao runner efêmero",
  );
  assert.deepEqual(
    resultado.invocacoes.map((i) => i.etapa),
    ["distribuicao", "api", "e2e", "pwa"],
  );
  assert.equal(resultado.resumo.etapas[1].exit, 7);
  assert.equal(resultado.resumo.etapas[1].contagens.falhos, 1);
  assert(!JSON.stringify(resultado.resumo).includes("marcador-privado"));
  assert(
    !resultado.saida.includes("marcador-privado"),
    "Logs brutos não entram no log público do Actions",
  );
  assert(resultado.executadas.includes("upload"));
});

for (const etapa of ["distribuicao", "api", "e2e", "pwa"]) {
  it(`conserva a falha e o resumo quando a etapa ${etapa} falha`, () => {
    const resultado = ensaiarWorkflow({ FALHA_ETAPA: etapa });
    assert.equal(resultado.falhou, true);
    assert.deepEqual(resultado.arquivos, ["resumo.json"]);
    assert.equal(resultado.resumo.etapas.find((e: { etapa: string }) => e.etapa === etapa).exit, 7);
    assert.deepEqual(
      resultado.invocacoes.map((i) => i.etapa),
      ["distribuicao", "api", "e2e", "pwa"],
    );
  });
}

for (const campo of ["RELATORIO_AUSENTE", "RELATORIO_INVALIDO"]) {
  for (const etapa of ["api", "e2e", "pwa"]) {
    it(`falha fechado e publica evidência incompleta em ${campo}, ${etapa}`, () => {
      const resultado = ensaiarWorkflow({ [campo]: etapa });
      assert.equal(resultado.falhou, true);
      assert.deepEqual(resultado.arquivos, ["resumo.json"]);
      assert.equal(resultado.resumo.integridade, "incompleta");
      const registro = resultado.resumo.etapas.find((e: { etapa: string }) => e.etapa === etapa);
      assert.equal(registro.integridade, "incompleta");
      assert.equal(registro.contagens, null);
    });
  }
}

it("não encobre falha de upload e não simula confirmação durável", () => {
  const resultado = ensaiarWorkflow({ FALHA_UPLOAD: "1" });
  assert.equal(resultado.falhou, true);
  assert.deepEqual(resultado.arquivos, []);
  assert(resultado.executadas.includes("upload"));
});

it("aceita apenas a execução completa com as quatro etapas e os contadores conciliados", () => {
  const resultado = ensaiarWorkflow();
  assert.equal(resultado.falhou, false);
  assert.equal(resultado.resumo.integridade, "completa");
  assert.deepEqual(Object.keys(resultado.resumo).sort(), ["etapas", "integridade"]);
  for (const etapa of resultado.resumo.etapas) {
    assert.deepEqual(Object.keys(etapa).sort(), ["contagens", "etapa", "exit", "integridade"]);
    assert.equal(etapa.exit, 0);
    if (etapa.etapa === "distribuicao") assert.equal(etapa.contagens, null);
    else
      assert.deepEqual(etapa.contagens, {
        total: 1,
        aprovados: 1,
        falhos: 0,
        ignorados: 0,
        interrompidos: 0,
        instaveis: 0,
      });
  }
  assert.equal(resultado.invocacoes[0].args.includes("--artefatos"), false);
  const destinos = resultado.invocacoes
    .slice(1)
    .map((i) => i.args[i.args.indexOf("--artefatos") + 1]);
  assert.equal(new Set(destinos).size, 3);
});

it("o consumidor detecta remoção da suíte PWA e da configuração do relatório", () => {
  const workflow = readFileSync(".github/workflows/testes.yml", "utf8");
  const semPwa = workflow.replace(/      - name: PWA[^]*?(?=      - name: Coletar)/, "");
  const semRelatorio = workflow.replace("--outputFile=test-results/api.json", "");
  for (const mutante of [semPwa, semRelatorio]) {
    const resultado = ensaiarWorkflow({}, mutante);
    assert.equal(resultado.falhou, true);
    assert.equal(resultado.resumo.integridade, "incompleta");
  }
});

it("projeta somente números validados e enums, sem texto arbitrário do relatório", () => {
  const resumo = resumirEtapa(
    "api",
    { etapa: "api", exit: 0 },
    {
      ...apiValida(),
      title: "marcador-privado",
      message: "marcador-privado",
      url: "marcador-privado",
      labels: ["marcador-privado"],
      session: { cookie: "marcador-privado" },
    },
  );
  assert.deepEqual(resumo, {
    etapa: "api",
    exit: 0,
    integridade: "completa",
    contagens: { total: 1, aprovados: 1, falhos: 0, ignorados: 0, interrompidos: 0, instaveis: 0 },
  });
});

for (const relatorio of [
  null,
  {},
  { ...apiValida(), numTotalTests: 2 },
  { ...apiValida(), numPassedTests: "1" },
  { ...apiValida(), numPassedTests: -1 },
  { ...apiValida(), numTotalTests: 1.5 },
  { ...apiValida(), testResults: [] },
  { ...apiValida(), success: false },
  { ...apiValida(), numPendingTestSuites: 1, numPassedTestSuites: 0 },
  { ...apiValida(), numTotalTestSuites: undefined },
  { ...apiValida(), numTotalTests: 0, numPassedTests: 0, testResults: [] },
]) {
  it("não transforma JSON incompleto, incoerente ou sem casos em aprovação", () => {
    const resumo = resumirEtapa("api", { etapa: "api", exit: 0 }, relatorio);
    assert.equal(resumo.integridade, "incompleta");
    assert.equal(resumo.contagens, null);
  });
}

for (const registro of [
  null,
  {},
  { etapa: "api", exit: "0" },
  { etapa: "pwa", exit: 0 },
  { etapa: "api", exit: 0, mensagem: "marcador-privado" },
  { etapa: "api", exit: 256 },
]) {
  it("não inventa exit zero para registro ausente ou inválido", () => {
    const resumo = resumirEtapa("api", registro, apiValida());
    assert.equal(resumo.integridade, "incompleta");
    assert.equal(resumo.exit, null);
  });
}

it("mantém casos ignorados como evidência incompleta", () => {
  const resumo = resumirEtapa(
    "api",
    { etapa: "api", exit: 0 },
    {
      ...apiValida(),
      numPassedTests: 0,
      numPendingTests: 1,
      testResults: [{ status: "passed", assertionResults: [{ status: "skipped" }] }],
    },
  );
  assert.equal(resumo.contagens?.ignorados, 1);
  assert.equal(resumo.integridade, "incompleta");
});

it("conta casos de API ainda pendentes como interrompidos, sem inventar conclusão", () => {
  const resumo = resumirEtapa(
    "api",
    { etapa: "api", exit: 0 },
    {
      ...apiValida(),
      numPassedTests: 0,
      numPendingTests: 1,
      testResults: [{ status: "passed", assertionResults: [{ status: "pending" }] }],
    },
  );
  assert.equal(resumo.contagens?.interrompidos, 1);
  assert.equal(resumo.contagens?.ignorados, 0);
  assert.equal(resumo.integridade, "incompleta");
});

function playwrightValido(status = "passed") {
  return {
    stats: {
      expected: status === "passed" ? 1 : 0,
      unexpected: status === "interrupted" ? 1 : 0,
      flaky: 0,
      skipped: status === "skipped" ? 1 : 0,
    },
    errors: [],
    suites: [
      {
        specs: [
          {
            tests: [
              {
                status:
                  status === "passed"
                    ? "expected"
                    : status === "skipped"
                      ? "skipped"
                      : "unexpected",
                expectedStatus: "passed",
                results: [{ status }],
              },
            ],
          },
        ],
      },
    ],
  };
}

for (const status of ["skipped", "interrupted"]) {
  it(`não aprova Playwright parcial em ${status}`, () => {
    const resumo = resumirEtapa("pwa", { etapa: "pwa", exit: 0 }, playwrightValido(status));
    assert.equal(resumo.integridade, "incompleta");
    assert.equal(
      status === "skipped" ? resumo.contagens?.ignorados : resumo.contagens?.interrompidos,
      1,
    );
  });
}

for (const relatorio of [
  { ...playwrightValido(), errors: [{ message: "marcador-privado" }] },
  { ...playwrightValido(), stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 } },
  { ...playwrightValido(), suites: [] },
  { ...playwrightValido(), stats: { expected: "1", unexpected: 0, flaky: 0, skipped: 0 } },
  {
    ...playwrightValido(),
    suites: [
      { specs: [{ tests: [{ status: "expected", expectedStatus: "passed", results: [] }] }] },
    ],
  },
]) {
  it("reconcilia o relatório Playwright e recusa erro global ou caso sem resultado", () => {
    const resumo = resumirEtapa("e2e", { etapa: "e2e", exit: 0 }, relatorio);
    assert.equal(resumo.integridade, "incompleta");
    assert.equal(resumo.contagens, null);
  });
}

it("recusa sobrescrita e links, conserva o exit e trata coleta sem relatórios como falha", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "evidencias-ci-destinos-"));
  try {
    const raiz = path.join(pasta, "nova");
    prepararEvidencias(raiz);
    assert.throws(() => prepararEvidencias(raiz));
    assert.equal(
      executarEtapa(raiz, "api", [
        process.execPath,
        "-e",
        "process.stdout.write('marcador-privado');process.exitCode=9",
      ]),
      9,
    );
    assert.throws(() => executarEtapa(raiz, "api", [process.execPath, "-e", "process.exitCode=0"]));
    assert.equal(readFileSync(path.join(raiz, "privado/api.log"), "utf8"), "marcador-privado");
    const relatorio = path.join(pasta, "api.json");
    writeFileSync(relatorio, JSON.stringify(apiValida()));
    mkdirSync(path.join(raiz, "privado/api/test-results"), { recursive: true });
    symlinkSync(relatorio, path.join(raiz, "privado/api/test-results/api.json"));
    const coleta = coletarEvidencias(raiz);
    assert.equal(coleta.exit, 1);
    assert.equal(coleta.resumo.etapas[1]?.exit, 9);
    assert.equal(coleta.resumo.etapas[1]?.contagens, null);
    assert.equal(coleta.resumo.integridade, "incompleta");
    const anterior = readFileSync(path.join(raiz, "publico/resumo.json"), "utf8");
    assert.throws(() => coletarEvidencias(raiz));
    assert.equal(readFileSync(path.join(raiz, "publico/resumo.json"), "utf8"), anterior);
    symlinkSync(pasta, path.join(pasta, "link"));
    assert.throws(() => prepararEvidencias(path.join(pasta, "link/recusado")));
    assert.throws(() => prepararEvidencias("destino-relativo"));
    assert.throws(() => executarCli(["coletar", "--raiz", raiz, "--etapa", "api"]));
    assert.throws(() => executarCli(["ignorada", "--raiz", raiz]));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
