// Trava do calendário: quem salva chamada e quem grava feriado travam a tabela antes de ler.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ordem = vi.hoisted(() => [] as string[]);
const transacao = vi.hoisted(() => ({
  $executeRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    const modo = valores[1] as { sql?: string } | undefined;
    ordem.push(`${partes.join("?").trim()} [${String(valores[0])}] [${modo?.sql ?? ""}]`);
    return 0;
  }),
  feriado: {
    findUnique: vi.fn(async () => {
      ordem.push("ler feriado");
      return null;
    }),
    create: vi.fn(async ({ data }: { data: { dia: Date; nome: string } }) => {
      ordem.push("gravar feriado");
      return data;
    }),
  },
  frequencia: {
    findFirst: vi.fn(async () => {
      ordem.push("ler chamada");
      return null;
    }),
  },
  frequenciaParcial: { findFirst: vi.fn(async () => null) },
}));

vi.mock("@/infra/banco", () => ({
  banco: vi.fn(),
  objetoDoBanco: (nome: string) => nome,
}));
vi.mock("@/infra/transacoes", () => ({
  comTransacao: (operacao: (tx: typeof transacao) => Promise<unknown>) => operacao(transacao),
}));
vi.mock("@/infra/trava-planilha-frequencia", () => ({
  comTravaPlanilhaFrequencia: (tarefa: () => Promise<unknown>) => tarefa(),
  controleTravaPlanilhaFrequencia: () => undefined,
}));
vi.mock("@/infra/auditoria", () => ({ auditar: vi.fn(async () => undefined) }));

import type { Prisma } from "../../generated/prisma/client";
import { criarFeriado, exigirDiaLetivo } from "@/application/calendario-letivo";

const tx = transacao as unknown as Prisma.TransactionClient;

beforeEach(() => {
  ordem.length = 0;
  vi.clearAllMocks();
});

describe("trava do calendário", () => {
  it("a chamada trava os feriados em modo compartilhado antes de consultar a data", async () => {
    await exigirDiaLetivo("2026-10-13", tx);
    expect(ordem).toEqual(["LOCK TABLE ? IN ? MODE [feriados] [SHARE]", "ler feriado"]);
  });

  it("o cadastro de feriado trava em modo exclusivo antes de ler chamadas e gravar", async () => {
    await criarFeriado(
      { id: "00000000-0000-4000-8000-000000000001" },
      {
        dia: "2026-10-13",
        nome: "Feriado sintético",
      },
    );
    expect(ordem[0]).toBe("LOCK TABLE ? IN ? MODE [feriados] [SHARE ROW EXCLUSIVE]");
    expect(ordem.slice(1)).toEqual(["ler feriado", "ler chamada", "gravar feriado"]);
  });
});
