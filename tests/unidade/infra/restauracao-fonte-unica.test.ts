// Exercita a seleção de fonte no Bash real, encerrando antes de qualquer ambiente ou restauração.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const fonte = readFileSync("scripts/servidor/restaurar.sh");
const motivo = "ERRO: Selecione somente uma fonte de restauração: --arquivo ou --entrada -.\n";
const arquivoSintetico = "fonte A: bytes do arquivo, não é um dump PostgreSQL\n";
const entradaSintetica = "fonte B: bytes de stdin, distintos do arquivo\n";
const evidencias: { pasta: string; dados: unknown }[] = [];

afterEach(() => {
  for (const { pasta, dados } of evidencias.splice(0)) {
    process.stdout.write(`EVIDENCIA_FONTE_UNICA=${JSON.stringify(dados)}\n`);
    rmSync(pasta, { recursive: true });
  }
});

type Contexto = "direto" | "if" | "negacao";
type Modo = "arquivo-entrada" | "entrada-arquivo" | "arquivo" | "entrada";

function ensaiar(modo: Modo, contexto: Contexto = "direto") {
  const pasta = mkdtempSync(path.join(tmpdir(), "restauracao-fonte-unica-"));
  const registro: { pasta: string; dados: unknown } = { pasta, dados: null };
  evidencias.push(registro);
  mkdirSync(`${pasta}/bin`);
  mkdirSync(`${pasta}/estado`);
  const script = `${pasta}/restaurar.sh`;
  const arquivo = `${pasta}/fonte-a.dump.gpg`;
  writeFileSync(script, fonte);
  writeFileSync(arquivo, arquivoSintetico);
  writeFileSync(`${pasta}/eventos`, "");
  writeFileSync(`${pasta}/parser`, "");
  writeFileSync(
    `${pasta}/comum.sh`,
    `# Dublê sintético: observa o limite do parser, sem carregar ambiente ou restaurar.
erro() { printf 'ERRO: %s\\n' "$*" >&2; exit 1; }
marcar() { printf '%s\\n' "$1" >>"$FONTE_UNICA_FIXTURE/eventos"; }
carregar_ambiente() {
  marcar ambiente
  printf '%s\\n' "$arquivo" "$entrada" "$confirmar" >"$FONTE_UNICA_FIXTURE/parser"
  builtin trap -p EXIT INT TERM >>"$FONTE_UNICA_FIXTURE/parser"
  printf 'FONTE_UNICA_PARSER_ACEITO_ANTES_DO_AMBIENTE\\n'
  exit 73
}
compose() { marcar cliente:compose; exit 91; }
trap() { marcar trap-mutante; exit 92; }
`,
  );
  for (const [cliente, categoria] of [
    ["docker", "cliente"],
    ["psql", "cliente"],
    ["pg_restore", "cliente"],
    ["curl", "cliente"],
    ["node", "metadados"],
    ["gpg", "chave"],
    ["age", "chave"],
  ]) {
    writeFileSync(
      `${pasta}/bin/${cliente}`,
      `#!/bin/bash\n# Sentinela sintética: nunca invoca clientes reais.\nprintf '%s\\n' '${categoria}:${cliente}' >>"$FONTE_UNICA_FIXTURE/eventos"\nexit 93\n`,
      { mode: 0o700 },
    );
  }
  const fontes = {
    "arquivo-entrada": ["--arquivo", arquivo, "--entrada", "-"],
    "entrada-arquivo": ["--entrada", "-", "--arquivo", arquivo],
    arquivo: ["--arquivo", arquivo],
    entrada: ["--entrada", "-"],
  };
  const argumentos = [...fontes[modo], "--confirmar"];
  const invocacoes = {
    direto: [script, ...argumentos],
    if: ["-c", 'if . "$1" "${@:2}"; then exit 90; fi; exit 91', "fonte-unica-if", script, ...argumentos],
    negacao: ["-c", '! . "$1" "${@:2}"; exit 92', "fonte-unica-negacao", script, ...argumentos],
  };
  const resultado = spawnSync("/bin/bash", invocacoes[contexto], {
    cwd: pasta,
    env: {
      NODE_ENV: "test",
      PATH: `${pasta}/bin:/usr/bin:/bin`,
      HOME: pasta,
      TMPDIR: pasta,
      FONTE_UNICA_FIXTURE: pasta,
    },
    input: entradaSintetica,
    encoding: "utf8",
    timeout: 2000,
  });
  const eventos = readFileSync(`${pasta}/eventos`, "utf8").split("\n").filter(Boolean);
  const contadores = {
    ambiente: eventos.filter((e) => e === "ambiente").length,
    clientes: eventos.filter((e) => e.startsWith("cliente:")).length,
    metadados: eventos.filter((e) => e.startsWith("metadados:")).length,
    chave: eventos.filter((e) => e.startsWith("chave:")).length,
    trapMutante: eventos.filter((e) => e === "trap-mutante").length,
  };
  const parser = readFileSync(`${pasta}/parser`, "utf8");
  const estado = readdirSync(`${pasta}/estado`);
  const copiaIdentica = readFileSync(script).equals(fonte);
  const arquivoPreservado = readFileSync(arquivo, "utf8") === arquivoSintetico;
  registro.dados = {
    modo,
    contexto,
    comando: ["/bin/bash", ...invocacoes[contexto]],
    codigo: resultado.status,
    sinal: resultado.signal,
    erro: resultado.error?.message ?? null,
    stdout: resultado.stdout,
    stderr: resultado.stderr,
    contadores,
    eventos,
    parser,
    estado,
    copiaIdentica,
    arquivoPreservado,
    fontesDistintas: !Buffer.from(arquivoSintetico).equals(Buffer.from(entradaSintetica)),
  };
  return {
    resultado,
    contadores,
    eventos,
    parser,
    estado,
    copiaIdentica,
    arquivoPreservado,
    arquivo,
  };
}

for (const modo of ["arquivo-entrada", "entrada-arquivo"] as const) {
  for (const contexto of ["direto", "if", "negacao"] as const) {
    it(`recusa ${modo} em ${contexto} antes de ambiente, clientes, chave, metadados e trap`, () => {
      const t = ensaiar(modo, contexto);
      expect.soft(t.copiaIdentica).toBe(true);
      expect.soft(t.arquivoPreservado).toBe(true);
      expect.soft(t.resultado.error).toBeUndefined();
      expect.soft(t.resultado.signal).toBeNull();
      expect.soft(t.resultado.status).toBe(1);
      expect.soft(t.resultado.stderr).toBe(motivo);
      expect.soft(t.resultado.stdout).toBe("");
      expect.soft(t.parser).toBe("");
      expect.soft(t.contadores).toEqual({
        ambiente: 0,
        clientes: 0,
        metadados: 0,
        chave: 0,
        trapMutante: 0,
      });
      expect.soft(t.eventos).toEqual([]);
      expect.soft(t.estado).toEqual([]);
    });
  }
}

it.each(["arquivo", "entrada"] as const)(
  "reconhece somente %s e para no marcador anterior ao ambiente real",
  (modo) => {
    const t = ensaiar(modo);
    expect(t.copiaIdentica).toBe(true);
    expect(t.arquivoPreservado).toBe(true);
    expect(t.resultado.error).toBeUndefined();
    expect(t.resultado.signal).toBeNull();
    expect(t.resultado.status).toBe(73);
    expect(t.resultado.stderr).toBe("");
    expect(t.resultado.stdout).toBe("FONTE_UNICA_PARSER_ACEITO_ANTES_DO_AMBIENTE\n");
    expect(t.parser).toBe(modo === "arquivo" ? `${t.arquivo}\n\ntrue\n` : "\n-\ntrue\n");
    expect(t.contadores).toEqual({
      ambiente: 1,
      clientes: 0,
      metadados: 0,
      chave: 0,
      trapMutante: 0,
    });
    expect(t.eventos).toEqual(["ambiente"]);
    expect(t.estado).toEqual([]);
  },
);
