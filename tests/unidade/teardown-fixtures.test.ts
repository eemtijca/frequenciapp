import { expect, it, vi } from "vitest";
// As consultas são dublês, sem banco ou runtime. A guarda tem regressão própria.
vi.mock("../helpers/isolamento.mjs", () => ({ verificarIsolamento: async () => ({}) }));
import {
  conectarDiretores,
  finalizarDiretores,
  finalizarSabado,
  removerFeriadoEmConexaoNova,
} from "../helpers/teardown-fixtures";

function cliente() {
  return {
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    query: vi.fn<(sql: string, params?: unknown[]) => Promise<object>>().mockResolvedValue({}),
  };
}

it("diretores tenta todas as consultas e fecha mesmo após erro", async () => {
  const banco = cliente();
  const erro = new Error("consulta");
  banco.query.mockRejectedValueOnce(erro);
  banco.end.mockRejectedValueOnce(new Error("end"));
  await expect(finalizarDiretores(banco as never)).rejects.toBe(erro);
  expect(banco.query).toHaveBeenCalledTimes(7);
  expect(
    banco.query.mock.calls.map(
      (args) => String(args[0]).match(/(?:delete from|update)\s+(\w+)/)?.[1],
    ),
  ).toEqual([
    "usuarios",
    "tentativas_entrada",
    "frequencias",
    "alunos",
    "turmas",
    "series",
    "parametros_acesso",
  ]);
  expect(banco.end).toHaveBeenCalledOnce();
});

it("diretores fecha após connect falhar sem mascarar o erro", async () => {
  const banco = cliente();
  const erro = new Error("connect");
  banco.connect.mockRejectedValueOnce(erro);
  banco.end.mockRejectedValueOnce(new Error("end"));
  const selecionar = vi.fn(async () => {});
  await expect(conectarDiretores(banco as never, selecionar)).rejects.toBe(erro);
  expect(banco.end).toHaveBeenCalledOnce();
  expect(selecionar).not.toHaveBeenCalled();
});

it("sábado tenta todas as consultas e fecha, preservando primeiro erro", async () => {
  const banco = cliente();
  const erro = new Error("consulta");
  banco.query.mockRejectedValueOnce(erro);
  banco.query.mockRejectedValueOnce(new Error("outra"));
  banco.end.mockRejectedValueOnce(new Error("end"));
  await expect(finalizarSabado(banco as never, true, false, "QA", "COD")).rejects.toBe(erro);
  expect(banco.query).toHaveBeenCalledTimes(5);
  expect(
    banco.query.mock.calls.map((args) => String(args[0]).match(/delete from\s+(\w+)/)?.[1]),
  ).toEqual(["frequencias", "alunos", "turmas", "series", "justificativas"]);
  expect(banco.query.mock.calls[1]?.[1]).toEqual(["QA%"]);
  expect(banco.query.mock.calls[4]?.[1]).toEqual(["COD"]);
  expect(banco.end).toHaveBeenCalledOnce();
});

it("sábado sem schema não consulta e ainda fecha", async () => {
  const banco = cliente();
  await finalizarSabado(banco as never, false, false, "QA", "COD");
  expect(banco.query).not.toHaveBeenCalled();
  expect(banco.end).toHaveBeenCalledOnce();
});

it("feriado usa nova conexão verificada e remove apenas data e nome", async () => {
  const banco = cliente();
  const conferir = vi.fn();
  const selecionar = vi.fn(async () => {});
  const remover = vi.fn(async () => {});
  await removerFeriadoEmConexaoNova(
    banco as never,
    conferir,
    selecionar,
    remover,
    "2026-01-01",
    "único",
  );
  expect(conferir).toHaveBeenCalledWith(banco);
  expect(selecionar).toHaveBeenCalledWith(banco);
  expect(remover).toHaveBeenCalledWith(banco, "2026-01-01", "único");
  expect(banco.end).toHaveBeenCalledOnce();
});

it("feriado não remove sem schema e preserva a falha ao fechar", async () => {
  const banco = cliente();
  const erro = new Error("schema");
  const remover = vi.fn(async () => {});
  banco.end.mockRejectedValueOnce(new Error("end"));
  await expect(
    removerFeriadoEmConexaoNova(
      banco as never,
      vi.fn(),
      async () => {
        throw erro;
      },
      remover,
      "2026-01-01",
      "único",
    ),
  ).rejects.toBe(erro);
  expect(remover).not.toHaveBeenCalled();
  expect(banco.end).toHaveBeenCalledOnce();
});

it("feriado não conecta nem remove se a guarda rejeita e tenta fechar", async () => {
  const banco = cliente();
  const erro = new Error("guarda");
  const remover = vi.fn(async () => {});
  await expect(
    removerFeriadoEmConexaoNova(
      banco as never,
      () => {
        throw erro;
      },
      vi.fn(),
      remover,
      "2026-01-01",
      "único",
    ),
  ).rejects.toBe(erro);
  expect(banco.connect).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
  expect(banco.end).toHaveBeenCalledOnce();
});

it("feriado propaga falha da remoção e tenta fechar", async () => {
  const banco = cliente();
  const erro = new Error("remoção incerta");
  banco.end.mockRejectedValueOnce(new Error("end"));
  await expect(
    removerFeriadoEmConexaoNova(
      banco as never,
      vi.fn(),
      vi.fn(),
      async () => {
        throw erro;
      },
      "2026-01-01",
      "único",
    ),
  ).rejects.toBe(erro);
  expect(banco.end).toHaveBeenCalledOnce();
});
