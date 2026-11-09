// Liga persistência e subprocessos reais ao núcleo local com Engine explicitamente falso.
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { errorMonitor } from "node:events";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  abrirNucleoPrivado,
  recuperarJournalPrivado,
  criarClienteStdio,
  executarRunnerStdio,
} from "../../isolamento/administrativo/host.mjs";
import type { Supervisionar } from "../../isolamento/administrativo/engine-gate.mjs";

const rodada = "a".repeat(32);
const imagem = `sha256:${"b".repeat(64)}`;
function receita() {
  return {
    Image: imagem,
    Cmd: ["postgres"],
    Env: ["POSTGRES_DB=sintetico"],
    Labels: { "br.frequenciapp.isolamento": rodada, "br.frequenciapp.isolamento.tipo": "banco" },
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 268435456,
      NanoCpus: 1000000000,
      PidsLimit: 64,
      LogConfig: { Type: "local", Config: { "max-size": "1m", "max-file": "1" } },
    },
  };
}
async function preparar(modo = "normal") {
  const diretorio = await mkdtemp(join(tmpdir(), "fadm-fisico-"));
  const arquivo = join(diretorio, "falso.json");
  await writeFile(arquivo, JSON.stringify({ chamadas: [] }), { mode: 0o600 });
  const cliente = criarClienteStdio({
    iniciar: () =>
      spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./fixtures/administrativo-engine-falso.mjs", import.meta.url)),
          arquivo,
          modo,
        ],
        { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
      ),
  });
  return { diretorio, arquivo, cliente };
}

it("persiste journal exclusivo antes dos efeitos e recupera apenas para revisão", async () => {
  expect(typeof abrirNucleoPrivado).toBe("function");
  const f = await preparar();
  const opcoes = {
    diretorio: f.diretorio,
    rodada,
    receitas: { banco: receita() },
    imagens: { [imagem]: { volumes: [] } },
    requisitar: f.cliente,
  };
  const nucleo = await abrirNucleoPrivado({
    ...opcoes,
    requisitar: async (metodo, caminho, corpo) => {
      const journal = await recuperarJournalPrivado({ diretorio: f.diretorio, rodada });
      expect(journal.liberado).toBe(false);
      if (caminho === "/containers/create")
        expect(journal.registros.at(-1)).toMatchObject({ estado: "intencao", id: null });
      if (caminho.endsWith("/start"))
        expect(journal.registros.at(-1)).toMatchObject({ estado: "inspecionado" });
      return f.cliente(metodo, caminho, corpo);
    },
  });
  try {
    expect((await stat(f.diretorio)).mode & 0o777).toBe(0o700);
    expect((await stat(join(f.diretorio, "journal.jsonl"))).mode & 0o777).toBe(0o600);
    const handle = await nucleo.gate.criar("banco");
    const fisico: { id: string } = JSON.parse(await readFile(f.arquivo, "utf8"));
    expect(handle).not.toBe(fisico.id);
    await expect(abrirNucleoPrivado(opcoes)).rejects.toThrow(/exclusivo|existente/);
    await nucleo.gate.iniciar(handle);
    const fim = await nucleo.gate.encerrar(async () => {
      const estado: { existe: boolean } = JSON.parse(await readFile(f.arquivo, "utf8"));
      expect(estado.existe).toBe(true);
      expect(
        (await recuperarJournalPrivado({ diretorio: f.diretorio, rodada })).registros.at(-1),
      ).toMatchObject({ estado: "iniciado", id: fisico.id });
    });
    expect(fim).toEqual({ removidos: [handle], preservados: [], falhas: [] });
    await nucleo.fechar();
    const recuperado = await recuperarJournalPrivado({ diretorio: f.diretorio, rodada });
    expect(recuperado.registros.at(-1)).toMatchObject({
      estado: "ausencia-confirmada",
      id: fisico.id,
      handle,
    });
    expect(recuperado.liberado).toBe(false);
    await expect(abrirNucleoPrivado(opcoes)).rejects.toThrow(/exclusivo|existente/);
    const bytes = await readFile(join(f.diretorio, "journal.jsonl"));
    await writeFile(join(f.diretorio, "journal.jsonl"), bytes.subarray(0, -1));
    await expect(recuperarJournalPrivado({ diretorio: f.diretorio, rodada })).rejects.toThrow(
      /Journal/,
    );
  } finally {
    await nucleo.fechar();
    await rm(f.diretorio, { recursive: true });
  }
});

it.each([
  "inspecao-204-vazia",
  "inspecao-200-nula",
  "inspecao-201-nula",
  "inspecao-200-array",
  "inspecao-200-string",
  "inspecao-200-numero",
  "inspecao-200-booleano",
  "inspecao-201-objeto",
])(
  "FISICO-01 não persiste falsa ausência com %s no consumidor real e Engine falso",
  async (modo) => {
    const f = await preparar(modo);
    const nucleo = await abrirNucleoPrivado({
      diretorio: f.diretorio,
      rodada,
      receitas: { banco: receita() },
      imagens: { [imagem]: { volumes: [] } },
      requisitar: f.cliente,
    });
    try {
      const handle = await nucleo.gate.criar("banco");
      const criado: { id: string } = JSON.parse(await readFile(f.arquivo, "utf8"));
      expect(handle).not.toBe(criado.id);
      await nucleo.gate.iniciar(handle);
      const fim = await nucleo.gate.encerrar(async () => {});
      const final: {
        id: string;
        existe: boolean;
        inspecaoPosDelete: { modo: string; status: number };
        chamadas: { metodo: string; caminho: string }[];
      } = JSON.parse(await readFile(f.arquivo, "utf8"));
      expect(final.id).toBe(criado.id);
      expect(final.existe).toBe(false);
      expect(final.inspecaoPosDelete).toEqual({
        modo,
        status: modo === "inspecao-204-vazia" ? 204 : modo.startsWith("inspecao-201") ? 201 : 200,
      });
      expect(final.chamadas.filter((c) => c.metodo === "DELETE")).toEqual([
        { metodo: "DELETE", caminho: `/v1.47/containers/${criado.id}` },
      ]);
      expect(final.chamadas.at(-1)).toEqual({
        metodo: "GET",
        caminho: `/v1.47/containers/${criado.id}/json`,
      });
      await nucleo.fechar();
      const journal = await recuperarJournalPrivado({ diretorio: f.diretorio, rodada });
      expect(journal.registros.map((r) => r.estado)).not.toContain("ausencia-confirmada");
      expect(journal.registros.at(-1)).toMatchObject({ estado: "removido", handle, id: criado.id });
      expect(journal.liberado).toBe(false);
      expect(fim).toEqual({ removidos: [], preservados: [handle], falhas: ["recurso"] });
      expect(nucleo.gate.inventario()).toEqual([{ handle, slot: "banco", estado: "removido" }]);
      await expect(nucleo.gate.iniciar(handle)).rejects.toThrow(/Partida/);
      await expect(nucleo.gate.criar("banco")).rejects.toThrow(/Slot/);
    } finally {
      await nucleo.fechar();
      await rm(f.diretorio, { recursive: true });
    }
  },
);

it("falha física de persistência impede criação, partida e repetição", async () => {
  const f = await preparar();
  const nucleo = await abrirNucleoPrivado({
    diretorio: f.diretorio,
    rodada,
    receitas: { banco: receita() },
    imagens: { [imagem]: { volumes: [] } },
    requisitar: f.cliente,
  });
  try {
    await nucleo.fechar();
    await expect(nucleo.gate.criar("banco")).rejects.toThrow(/Journal/);
    await expect(nucleo.gate.criar("banco")).rejects.toThrow(/Slot/);
    const estado: { chamadas: unknown[] } = JSON.parse(await readFile(f.arquivo, "utf8"));
    expect(estado.chamadas).toEqual([]);
    const recurso = nucleo.gate.inventario()[0];
    if (!recurso) throw new Error("Intenção reservada ausente.");
    await expect(nucleo.gate.iniciar(recurso.handle)).rejects.toThrow(/Partida/);
  } finally {
    await nucleo.fechar();
    await rm(f.diretorio, { recursive: true });
  }
});

async function fluxoStdio(modo: string) {
  const f = await preparar();
  const eventos: {
    evento:
      | "stdout-error"
      | "stdin-error"
      | "kill"
      | "close"
      | "session-end-enviado"
      | "session-end-recebido";
    erro?: "ABORT_ERR" | "EPIPE" | "outro";
    iteradorReadable?: boolean;
    retornoLeitor?: boolean;
    sinal?: "SIGKILL" | "outro" | null;
    codigo?: number | null;
  }[] = [];
  let restaurarKill = () => {};
  const execs: { id: string; argv: string[] }[] = [];
  // Apenas o supervisor de exec continua sintético; transporte, fs e runner são reais.
  const supervisionar: Supervisionar = async ({ id, argv, entrada }) => {
    execs.push({ id, argv });
    const resultado = (async () => {
      const blocos: Buffer[] = [];
      for await (const bloco of entrada) blocos.push(bloco);
      expect(Buffer.concat(blocos)).toEqual(Buffer.from([0, 255, 10, 0]));
      return { codigo: 0, sinal: null, grupoEncerrado: true } as const;
    })();
    return {
      stdout: (async function* () {
        yield Buffer.from([0, 255, 100, 0]);
      })(),
      stderr: (async function* () {})(),
      resultado,
      cancelar: () => resultado,
    };
  };
  const nucleo = await abrirNucleoPrivado({
    diretorio: f.diretorio,
    rodada,
    receitas: { banco: receita() },
    imagens: { [imagem]: { volumes: [] } },
    requisitar: f.cliente,
    supervisionar,
  });
  try {
    const handle = await nucleo.gate.criar("banco");
    const fisico: { id: string } = JSON.parse(await readFile(f.arquivo, "utf8"));
    await nucleo.gate.iniciar(handle);
    let coletas = 0;
    const resultado = await executarRunnerStdio({
      iniciar: () => {
        const filho = spawn(
          process.execPath,
          [
            fileURLToPath(new URL("./fixtures/administrativo-runner-falso.mjs", import.meta.url)),
            modo,
          ],
          { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
        );
        for (const nome of ["stdout", "stdin"] satisfies ("stdout" | "stdin")[]) {
          filho[nome].on(errorMonitor, (erro: NodeJS.ErrnoException) =>
            eventos.push({
              evento: nome === "stdout" ? "stdout-error" : "stdin-error",
              erro:
                erro.code === "ABORT_ERR" ? "ABORT_ERR" : erro.code === "EPIPE" ? "EPIPE" : "outro",
              iteradorReadable: erro.stack?.includes("createAsyncIterator") === true,
              retornoLeitor: erro.stack?.includes("leitor.mjs") === true,
            }),
          );
        }
        let diagnostico = "";
        filho.stderr.on("data", (bloco: Buffer) => {
          diagnostico += bloco.toString();
          for (const evento of ["session-end-enviado", "session-end-recebido"] satisfies (
            "session-end-enviado" | "session-end-recebido"
          )[]) {
            if (
              diagnostico.includes(`FADM:${evento}\n`) &&
              !eventos.some((e) => e.evento === evento)
            )
              eventos.push({ evento });
          }
        });
        const matar = filho.kill.bind(filho);
        const kill = vi.spyOn(filho, "kill").mockImplementation((sinal) => {
          eventos.push({ evento: "kill", sinal: sinal === "SIGKILL" ? "SIGKILL" : "outro" });
          return matar(sinal);
        });
        restaurarKill = () => kill.mockRestore();
        filho.once("close", (codigo, sinal) =>
          eventos.push({
            evento: "close",
            codigo,
            sinal: sinal === null ? null : sinal === "SIGKILL" ? "SIGKILL" : "outro",
          }),
        );
        return filho;
      },
      gate: nucleo.gate,
      coletar: async () => {
        const atual: { existe: boolean } = JSON.parse(await readFile(f.arquivo, "utf8"));
        expect(atual.existe).toBe(true);
        coletas++;
      },
      timeoutMs: modo === "pendente" ? 500 : 3000,
    });
    expect(resultado.cliente.encerrado).toBe(true);
    expect(resultado.sessao.limpeza).toEqual({ removidos: [handle], preservados: [], falhas: [] });
    const journal = await recuperarJournalPrivado({ diretorio: f.diretorio, rodada });
    expect(journal.registros.at(-1)).toMatchObject({
      estado: "ausencia-confirmada",
      id: fisico.id,
    });
    expect(coletas).toBeGreaterThanOrEqual(1);
    if (modo === "normal" || modo === "exit-invalido") {
      expect(
        eventos.filter(
          (e) => e.evento === "stdout-error" || e.evento === "stdin-error" || e.evento === "kill",
        ),
      ).toEqual([]);
      expect(eventos.filter((e) => e.evento === "session-end-enviado")).toHaveLength(1);
      expect(eventos.filter((e) => e.evento === "session-end-recebido")).toHaveLength(1);
      expect(eventos.filter((e) => e.evento === "close")).toEqual([
        { evento: "close", codigo: modo === "normal" ? 0 : 17, sinal: null },
      ]);
      expect(execs).toEqual([
        { id: fisico.id, argv: ["pg_dump", "--format=custom", "--dbname=sintetico"] },
      ]);
      expect(fisico.id).not.toBe(handle);
    } else expect(execs).toEqual([]);
    if (modo === "pendente") {
      expect(
        eventos.some(
          (e) => e.evento === "stdout-error" && e.erro === "outro" && e.iteradorReadable === false,
        ),
      ).toBe(true);
      expect(eventos.some((e) => e.evento === "kill" && e.sinal === "SIGKILL")).toBe(true);
      expect(eventos.filter((e) => e.evento === "close")).toEqual([
        { evento: "close", codigo: null, sinal: "SIGKILL" },
      ]);
    }
    return resultado;
  } finally {
    restaurarKill();
    await nucleo.fechar();
    await rm(f.diretorio, { recursive: true });
  }
}
it("liga runner FADM subprocesso à sessão, handles e journal físicos", async () => {
  expect(typeof executarRunnerStdio).toBe("function");
  expect(await fluxoStdio("normal")).toMatchObject({
    codigo: 0,
    cliente: { codigo: 0, sinal: null, encerrado: true },
    sessao: { codigo: 0, erro: null },
  });
});
it.each(["sem-fim", "campo-extra", "id-alheio", "pendente", "exit-invalido"])(
  "ponte FADM física não aprova %s",
  async (modo) => {
    const resultado = await fluxoStdio(modo);
    expect(resultado.codigo).toBe(1);
    if (modo === "exit-invalido") {
      expect(resultado.cliente.codigo).toBe(17);
      expect(resultado.sessao.codigo).toBe(0);
    } else expect(resultado.sessao.codigo).toBe(1);
    if (modo === "pendente") expect(resultado.cliente.sinal).toBe("SIGKILL");
  },
);

it("criação com resposta perdida preserva intenção física e bloqueia repetição", async () => {
  const f = await preparar("perder-criacao");
  const nucleo = await abrirNucleoPrivado({
    diretorio: f.diretorio,
    rodada,
    receitas: { banco: receita() },
    imagens: { [imagem]: { volumes: [] } },
    requisitar: f.cliente,
  });
  try {
    await expect(nucleo.gate.criar("banco")).rejects.toThrow(/HTTP/);
    await expect(nucleo.gate.criar("banco")).rejects.toThrow(/Slot/);
    const recuperado = await recuperarJournalPrivado({ diretorio: f.diretorio, rodada });
    expect(recuperado.registros.at(-1)).toMatchObject({ estado: "incerto", id: null });
    expect(recuperado.liberado).toBe(false);
    const fisico: { existe: boolean; chamadas: unknown[] } = JSON.parse(
      await readFile(f.arquivo, "utf8"),
    );
    expect(fisico.existe).toBe(true);
    expect(fisico.chamadas).toHaveLength(1);
    const fim = await nucleo.gate.encerrar(async () => {});
    expect(fim.preservados).toHaveLength(1);
    expect(
      (JSON.parse(await readFile(f.arquivo, "utf8")) as { chamadas: unknown[] }).chamadas,
    ).toHaveLength(1);
  } finally {
    await nucleo.fechar();
    await rm(f.diretorio, { recursive: true });
  }
});
