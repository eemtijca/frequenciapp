// Exclusão distribuída do envio e liberação da conexão em qualquer resultado.
import { beforeEach, describe, expect, it, vi } from "vitest";
const dubl = vi.hoisted(() => ({
  conectar: vi.fn(),
  consultar: vi.fn(),
  encerrar: vi.fn(),
  criar: vi.fn(),
  eventos: new Map<string, () => void>(),
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor(opcoes: unknown) {
        dubl.criar(opcoes);
      }
      connect = dubl.conectar;
      query = dubl.consultar;
      end = dubl.encerrar;
      on(evento: string, escutar: () => void) {
        dubl.eventos.set(evento, escutar);
      }
    },
  },
}));
vi.mock("@/infra/ambiente", () => ({
  ambiente: { databaseUrl: "postgresql://qa:qa@localhost:5432/qa" },
}));
import { CHAVE_TRAVA_PARCIAL, comTravaPlanilhaParcial } from "@/infra/trava-planilha-parcial";
beforeEach(() => {
  vi.clearAllMocks();
  dubl.eventos.clear();
  dubl.conectar.mockResolvedValue(undefined);
  dubl.consultar.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT") ? [{ obtida: true }] : [],
  }));
  dubl.encerrar.mockResolvedValue(undefined);
});
describe("trava do envio parcial", () => {
  it("adquire exclusão antes da tarefa e libera a transação depois do resultado", async () => {
    const tarefa = vi.fn(async (controle) => {
      expect(dubl.consultar.mock.calls.at(-1)).toEqual([
        "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
        [CHAVE_TRAVA_PARCIAL.namespace, CHAVE_TRAVA_PARCIAL.recurso],
      ]);
      expect(controle.signal.aborted).toBe(false);
      controle.conferir();
      return "enviado";
    });
    expect(await comTravaPlanilhaParcial(tarefa)).toBe("enviado");
    expect(tarefa).toHaveBeenCalledTimes(1);
    expect(dubl.consultar.mock.calls.map((chamada) => chamada[0])).toEqual([
      "BEGIN",
      "SET LOCAL idle_in_transaction_session_timeout = '5min'",
      "SELECT pg_try_advisory_xact_lock($1::integer, $2::integer) AS obtida",
      "ROLLBACK",
    ]);
    expect(dubl.criar).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: 5000, query_timeout: 10000 }),
    );
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
  });
  it("recusa outra instância ocupada sem começar leitura nem escrita", async () => {
    dubl.consultar.mockImplementation(async () => ({ rows: [{ obtida: false }] }));
    const tarefa = vi.fn();
    await expect(comTravaPlanilhaParcial(tarefa)).rejects.toMatchObject({ status: 409 });
    expect(tarefa).not.toHaveBeenCalled();
    expect(dubl.consultar).toHaveBeenLastCalledWith("ROLLBACK");
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
  });
  it("libera a trava sem repetir efeitos da tarefa após resposta perdida", async () => {
    const tarefa = vi.fn(async () => {
      throw new Error("Resposta perdida");
    });
    await expect(comTravaPlanilhaParcial(tarefa)).rejects.toThrow("Resposta perdida");
    expect(tarefa).toHaveBeenCalledTimes(1);
    expect(dubl.consultar).toHaveBeenLastCalledWith("ROLLBACK");
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
  });
  it.each(["error", "end"])("interrompe o envio quando a conexão comunica %s", async (evento) => {
    let signal: AbortSignal | undefined;
    const tarefa = vi.fn(async (controle) => {
      signal = controle.signal;
      dubl.eventos.get(evento)?.();
      controle.conferir();
      return "não deve confirmar";
    });
    await expect(comTravaPlanilhaParcial(tarefa)).rejects.toMatchObject({ status: 502 });
    expect(signal?.aborted).toBe(true);
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
    expect(dubl.consultar.mock.calls.some((chamada) => chamada[0] === "ROLLBACK")).toBe(false);
  });
  it("não anuncia sucesso se a conexão termina antes da conclusão da tarefa", async () => {
    const tarefa = vi.fn(async () => {
      dubl.eventos.get("end")?.();
      return "enviado";
    });
    await expect(comTravaPlanilhaParcial(tarefa)).rejects.toMatchObject({ status: 502 });
    expect(tarefa).toHaveBeenCalledTimes(1);
  });
  it("recusa falha de conexão sem executar efeitos e sempre encerra o cliente", async () => {
    dubl.conectar.mockRejectedValue(new Error("Banco indisponível"));
    const tarefa = vi.fn();
    await expect(comTravaPlanilhaParcial(tarefa)).rejects.toMatchObject({ status: 503 });
    expect(tarefa).not.toHaveBeenCalled();
    expect(dubl.consultar).not.toHaveBeenCalled();
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
  });
  it("encerra o cliente mesmo se a liberação SQL falhar", async () => {
    dubl.consultar.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("Conexão perdida durante liberação");
      return { rows: [{ obtida: true }] };
    });
    expect(await comTravaPlanilhaParcial(async () => "enviado")).toBe("enviado");
    expect(dubl.encerrar).toHaveBeenCalledTimes(1);
  });
});
