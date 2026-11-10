// Exercita Requests e streams reais para limitar bytes antes de acumular o corpo.
import { describe, expect, it, vi } from "vitest";
vi.mock("@/infra/ambiente", () => ({ ambiente: {} }));
vi.mock("@/application/sessao", () => ({ identidadeAtual: vi.fn() }));
import { corpoJsonComLimite } from "@/infra/http";

function pedido(fluxo: ReadableStream<Uint8Array>) {
  const opcoes: RequestInit & { duplex: "half" } = { method: "POST", body: fluxo, duplex: "half" };
  return new Request("http://teste.local", opcoes);
}

describe("corpo JSON limitado", () => {
  it("cancela ao cruzar o limite sem ler chunks posteriores", async () => {
    const cancelar = vi.fn();
    let leituras = 0;
    const fluxo = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          leituras++;
          if (leituras <= 3) c.enqueue(new Uint8Array([32, 32, 32]));
          else c.close();
        },
        cancel: cancelar,
      },
      { highWaterMark: 0 },
    );
    await expect(corpoJsonComLimite(pedido(fluxo), 4)).rejects.toMatchObject({ status: 413 });
    expect(leituras).toBe(2);
    expect(cancelar).toHaveBeenCalledOnce();
    expect(fluxo.locked).toBe(false);
  });
  it("conta UTF-8 dividido em chunks no limite exato", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ nome: "ação" }));
    let posicao = 0;
    const fluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (posicao === bytes.length) c.close();
        else c.enqueue(bytes.slice(posicao, ++posicao));
      },
    });
    await expect(corpoJsonComLimite(pedido(fluxo), bytes.length)).resolves.toEqual({
      nome: "ação",
    });
    expect(fluxo.locked).toBe(false);
  });
  it("mantém corpo vazio como null e JSON inválido como 400", async () => {
    await expect(corpoJsonComLimite(new Request("http://teste.local"), 4)).resolves.toBeNull();
    await expect(
      corpoJsonComLimite(new Request("http://teste.local", { method: "POST", body: "{" }), 4),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("não confia em Content-Length menor que o corpo", async () => {
    await expect(
      corpoJsonComLimite(
        new Request("http://teste.local", {
          method: "POST",
          headers: { "Content-Length": "1" },
          body: "12345",
        }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("propaga erro do stream liberando o lock", async () => {
    const falha = new Error("Fluxo sintético interrompido");
    const fluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        c.error(falha);
      },
    });
    await expect(corpoJsonComLimite(pedido(fluxo), 4)).rejects.toBe(falha);
    expect(fluxo.locked).toBe(false);
  });
});
