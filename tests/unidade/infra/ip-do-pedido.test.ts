// IP usado pelos limitadores: só o item escrito pelo proxy diante do aplicativo conta.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/infra/ambiente", () => ({ ambiente: { authSecret: "segredo-sintetico-do-ip" } }));
vi.mock("@/application/sessao", () => ({ identidadeAtual: vi.fn() }));
import { ipDoPedido } from "@/infra/http";

const pedido = (cabecalhos: Record<string, string>) =>
  new Request("http://localhost/api/auth/entrar", { headers: cabecalhos });

describe("ipDoPedido", () => {
  it("ignora os itens que o cliente põe antes do proxy", () => {
    expect(ipDoPedido(pedido({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
    expect(ipDoPedido(pedido({ "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("usa x-real-ip ou uma chave local sem cabeçalho de encaminhamento", () => {
    expect(ipDoPedido(pedido({ "x-real-ip": " 198.51.100.8 " }))).toBe("198.51.100.8");
    expect(ipDoPedido(pedido({}))).toBe("local");
  });
});
