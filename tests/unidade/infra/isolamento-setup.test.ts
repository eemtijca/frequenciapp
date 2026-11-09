// Protege setup e teardown mesmo quando o filtro ignora todos os casos.
import { afterEach, expect, it, vi } from "vitest";
import globalSetup from "../../ponta-a-ponta/global-setup";
import {
  conectarDiretores,
  limparDiretores,
  limparSabado,
  removerFeriadoEmConexaoNova,
} from "../../helpers/teardown-fixtures";

const { massa, contas, contexto } = vi.hoisted(() => ({
  massa: vi.fn(async () => false),
  contas: vi.fn(async () => undefined),
  contexto: vi.fn(async () => ({
    post: async () => ({ ok: () => true }),
    storageState: async () => undefined,
    dispose: async () => undefined,
  })),
}));
vi.mock("../../ponta-a-ponta/helpers/banco", () => ({
  ADMIN_E2E: {},
  COORD_E2E: {},
  massaDeDemonstracaoPresente: massa,
  garantirContasDeTeste: contas,
}));
vi.mock("@playwright/test", () => ({ request: { newContext: contexto } }));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it.each(["", "1"])(
  "recusa setup, inclusive capturas=%s, antes da primeira leitura",
  async (capturas) => {
    vi.stubEnv("FREQUENCIAPP_ISOLAMENTO", "");
    vi.stubEnv("CAPTURAS", capturas);
    const erro = await globalSetup().then(
      () => null,
      (erro: unknown) => erro,
    );
    expect(erro).toBeInstanceOf(Error);
    expect(massa).not.toHaveBeenCalled();
    expect(contas).not.toHaveBeenCalled();
    expect(contexto).not.toHaveBeenCalled();
  },
);
it("não conecta nem limpa no teardown sem prova", async () => {
  vi.stubEnv("FREQUENCIAPP_ISOLAMENTO", "");
  const banco = {
    connect: vi.fn(async () => undefined),
    query: vi.fn(async () => ({})),
    end: vi.fn(async () => undefined),
  };
  const remover = vi.fn(async () => undefined);
  for (const acao of [
    () => conectarDiretores(banco as never, async () => undefined),
    () => limparDiretores(banco as never),
    () => limparSabado(banco as never, "QA", "COD"),
    () =>
      removerFeriadoEmConexaoNova(
        banco as never,
        () => undefined,
        async () => undefined,
        remover,
        "2026-01-01",
        "QA",
      ),
  ]) {
    expect(
      await acao().then(
        () => null,
        (erro: unknown) => erro,
      ),
    ).toBeInstanceOf(Error);
  }
  expect(banco.connect).not.toHaveBeenCalled();
  expect(banco.query).not.toHaveBeenCalled();
  expect(remover).not.toHaveBeenCalled();
});
