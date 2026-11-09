// Conserva resultados mínimos por allowlist; relatórios e logs permanecem privados.
import { spawnSync } from "node:child_process";
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const etapasCI = Object.freeze(["distribuicao", "api", "e2e", "pwa"]);
const estados = ["passed", "failed", "skipped", "pending", "todo"];
const numero = (valor) => Number.isSafeInteger(valor) && valor >= 0 && valor <= 10_000_000;
const objeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);

function contagensVitest(relatorio) {
  if (!objeto(relatorio) || !Array.isArray(relatorio.testResults)) return null;
  for (const campo of ["errors", "unhandledErrors"]) {
    if (
      relatorio[campo] !== undefined &&
      (!Array.isArray(relatorio[campo]) || relatorio[campo].length)
    )
      return null;
  }
  if (relatorio.numUnhandledErrors !== undefined && relatorio.numUnhandledErrors !== 0) return null;
  const {
    numTotalTestSuites: suites,
    numPassedTestSuites: suitesAprovadas,
    numFailedTestSuites: suitesFalhas,
    numPendingTestSuites: suitesPendentes,
  } = relatorio;
  if (
    ![suites, suitesAprovadas, suitesFalhas, suitesPendentes].every(numero) ||
    suites === 0 ||
    suitesPendentes !== 0 ||
    suites !== suitesAprovadas + suitesFalhas
  )
    return null;
  const {
    numTotalTests: total,
    numPassedTests: aprovados,
    numFailedTests: falhos,
    numPendingTests: pendentes,
    numTodoTests: futuros,
  } = relatorio;
  if (![total, aprovados, falhos, pendentes, futuros].every(numero) || total === 0) return null;
  const status = relatorio.testResults.flatMap((suite) => {
    if (
      !objeto(suite) ||
      !Array.isArray(suite.assertionResults) ||
      !["passed", "failed"].includes(suite.status)
    )
      return [null];
    return suite.assertionResults.map((teste) => (objeto(teste) ? teste.status : null));
  });
  if (status.some((s) => !estados.includes(s))) return null;
  const contar = (s) => status.filter((item) => item === s).length;
  const ignorados = contar("skipped") + contar("todo");
  const interrompidos = contar("pending");
  if (
    status.length !== total ||
    contar("passed") !== aprovados ||
    contar("failed") !== falhos ||
    pendentes + futuros !== ignorados + interrompidos ||
    total !== aprovados + falhos + ignorados + interrompidos ||
    relatorio.success !==
      (suitesFalhas === 0 &&
        falhos === 0 &&
        !relatorio.testResults.some((s) => s.status === "failed"))
  )
    return null;
  if (falhos === 0 && relatorio.success !== true) return null;
  return { total, aprovados, falhos, ignorados, interrompidos, instaveis: 0 };
}

function contagensPlaywright(relatorio) {
  if (
    !objeto(relatorio) ||
    !objeto(relatorio.stats) ||
    !Array.isArray(relatorio.suites) ||
    !Array.isArray(relatorio.errors) ||
    relatorio.errors.length
  )
    return null;
  const { expected, unexpected, flaky, skipped } = relatorio.stats;
  if (![expected, unexpected, flaky, skipped].every(numero)) return null;
  const testes = [];
  function visitar(suites, profundidade = 0) {
    if (profundidade > 100) throw new Error("Estrutura inválida.");
    for (const suite of suites) {
      if (
        !objeto(suite) ||
        (suite.specs !== undefined && !Array.isArray(suite.specs)) ||
        (suite.suites !== undefined && !Array.isArray(suite.suites))
      )
        throw new Error("Estrutura inválida.");
      for (const spec of suite.specs ?? []) {
        if (!objeto(spec) || !Array.isArray(spec.tests) || !spec.tests.length)
          throw new Error("Estrutura inválida.");
        testes.push(...spec.tests);
      }
      visitar(suite.suites ?? [], profundidade + 1);
    }
  }
  try {
    visitar(relatorio.suites);
  } catch {
    return null;
  }
  let interrompidos = 0;
  for (const teste of testes) {
    if (
      !objeto(teste) ||
      !["expected", "unexpected", "flaky", "skipped"].includes(teste.status) ||
      !["passed", "failed", "skipped", "timedOut"].includes(teste.expectedStatus) ||
      !Array.isArray(teste.results) ||
      !teste.results.length
    )
      return null;
    if (
      teste.results.some(
        (r) =>
          !objeto(r) ||
          !["passed", "failed", "timedOut", "skipped", "interrupted"].includes(r.status),
      )
    )
      return null;
    const ultimo = teste.results.at(-1).status;
    if (ultimo === "interrupted") interrompidos++;
    if (
      (teste.status === "expected" && ultimo !== teste.expectedStatus) ||
      (teste.status === "skipped" && ultimo !== "skipped") ||
      (teste.status === "unexpected" && ultimo === teste.expectedStatus) ||
      (teste.status === "flaky" &&
        (ultimo !== teste.expectedStatus ||
          !teste.results.some((r) => r.status !== teste.expectedStatus)))
    )
      return null;
  }
  const contar = (s) => testes.filter((t) => t.status === s).length;
  const total = expected + unexpected + flaky + skipped;
  if (
    !total ||
    total !== testes.length ||
    contar("expected") !== expected ||
    contar("unexpected") !== unexpected ||
    contar("flaky") !== flaky ||
    contar("skipped") !== skipped
  )
    return null;
  return {
    total,
    aprovados: expected + flaky,
    falhos: unexpected,
    ignorados: skipped,
    interrompidos,
    instaveis: flaky,
  };
}

/** Nunca projeta strings do relatório, nem mesmo nomes, caminhos ou mensagens redigidas. */
export function resumirEtapa(etapa, registro, relatorio) {
  if (!etapasCI.includes(etapa)) throw new Error("Etapa inválida.");
  const valido =
    objeto(registro) &&
    Object.keys(registro).length === 2 &&
    registro.etapa === etapa &&
    Number.isInteger(registro.exit) &&
    registro.exit >= 0 &&
    registro.exit <= 255;
  const exit = valido ? registro.exit : null;
  const contagens =
    etapa === "distribuicao"
      ? null
      : etapa === "api"
        ? contagensVitest(relatorio)
        : contagensPlaywright(relatorio);
  const completa =
    valido &&
    (etapa === "distribuicao" ||
      (contagens !== null && contagens.ignorados === 0 && contagens.interrompidos === 0));
  return { etapa, exit, contagens, integridade: completa ? "completa" : "incompleta" };
}

function caminhoSemLinks(caminho) {
  if (!path.isAbsolute(caminho) || path.resolve(caminho) !== caminho)
    throw new Error("Caminho inválido.");
  let atual = path.parse(caminho).root;
  for (const parte of caminho.slice(atual.length).split(path.sep).filter(Boolean)) {
    atual = path.join(atual, parte);
    if (lstatSync(atual).isSymbolicLink()) throw new Error("Link recusado.");
  }
  return caminho;
}

function raizSegura(raiz) {
  const relativo = path.relative(process.cwd(), raiz);
  if (!relativo.startsWith(`..${path.sep}`) && relativo !== "..")
    throw new Error("Destino deve ficar fora do checkout.");
  caminhoSemLinks(raiz);
  for (const nome of ["privado", "publico"]) {
    const info = lstatSync(caminhoSemLinks(path.join(raiz, nome)));
    if (!info.isDirectory()) throw new Error("Destino inválido.");
  }
}

export function prepararEvidencias(raiz) {
  caminhoSemLinks(path.dirname(raiz));
  if (!path.isAbsolute(raiz) || path.resolve(raiz) !== raiz) throw new Error("Destino inválido.");
  const relativo = path.relative(process.cwd(), raiz);
  if (!relativo.startsWith(`..${path.sep}`) && relativo !== "..")
    throw new Error("Destino deve ficar fora do checkout.");
  mkdirSync(raiz, { mode: 0o700 });
  mkdirSync(path.join(raiz, "privado"), { mode: 0o700 });
  mkdirSync(path.join(raiz, "publico"), { mode: 0o700 });
}

function lerJson(arquivo) {
  let fd;
  try {
    caminhoSemLinks(arquivo);
    fd = openSync(arquivo, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 32 * 1024 * 1024) return null;
    return JSON.parse(readFileSync(fd, "utf8"));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function coletarEvidencias(raiz) {
  raizSegura(raiz);
  const etapas = etapasCI.map((etapa) =>
    resumirEtapa(
      etapa,
      lerJson(path.join(raiz, "privado", `${etapa}.exit.json`)),
      etapa === "distribuicao"
        ? null
        : lerJson(path.join(raiz, "privado", etapa, "test-results", `${etapa}.json`)),
    ),
  );
  const resumo = {
    integridade: etapas.every((e) => e.integridade === "completa") ? "completa" : "incompleta",
    etapas,
  };
  writeFileSync(path.join(raiz, "publico/resumo.json"), `${JSON.stringify(resumo, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return {
    resumo,
    exit: etapas.every(
      (e) =>
        e.integridade === "completa" &&
        e.exit === 0 &&
        (!e.contagens || (e.contagens.falhos === 0 && e.contagens.instaveis === 0)),
    )
      ? 0
      : 1,
  };
}

export function executarEtapa(raiz, etapa, comando) {
  raizSegura(raiz);
  if (!etapasCI.includes(etapa) || !comando.length) throw new Error("Etapa ou comando inválido.");
  const fd = openSync(path.join(raiz, "privado", `${etapa}.log`), "wx", 0o600);
  let resultado;
  try {
    resultado = spawnSync(comando[0], comando.slice(1), {
      stdio: ["ignore", fd, fd],
      env: process.env,
    });
  } finally {
    closeSync(fd);
  }
  const exit =
    resultado.status ??
    (resultado.signal === "SIGINT" ? 130 : resultado.signal === "SIGTERM" ? 143 : 1);
  writeFileSync(path.join(raiz, "privado", `${etapa}.exit.json`), JSON.stringify({ etapa, exit }), {
    flag: "wx",
    mode: 0o600,
  });
  return exit;
}

export function executarCli(argv = process.argv.slice(2)) {
  const [acao, ...args] = argv;
  const separador = args.indexOf("--");
  const opcoes = new Map();
  const entradas = separador < 0 ? args : args.slice(0, separador);
  for (let i = 0; i < entradas.length; i += 2) {
    const chave = entradas[i];
    if (!["--raiz", "--etapa"].includes(chave) || opcoes.has(chave) || !entradas[i + 1])
      throw new Error("Opções inválidas.");
    opcoes.set(chave, entradas[i + 1]);
  }
  const raiz = opcoes.get("--raiz");
  if (!raiz || (acao !== "executar" && (opcoes.has("--etapa") || separador >= 0)))
    throw new Error("Uso inválido.");
  if (acao === "preparar") {
    prepararEvidencias(raiz);
    return 0;
  }
  if (acao === "coletar") return coletarEvidencias(raiz).exit;
  if (acao === "executar" && separador >= 0)
    return executarEtapa(raiz, opcoes.get("--etapa"), args.slice(separador + 1));
  throw new Error("Ação inválida.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = executarCli();
  } catch {
    process.stderr.write("Não foi possível conservar as evidências mínimas de CI.\n");
    process.exitCode = 1;
  }
}
