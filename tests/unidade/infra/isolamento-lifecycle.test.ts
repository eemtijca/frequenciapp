// Exercita acompanhamento e parada por ID, sem confundir cliente de logs com a tarefa.
import { expect, it } from "vitest";
import { acompanharContainer } from "../../isolamento/lifecycle.mjs";

it("não aceita logs encerrados enquanto a tarefa permanece ativa", async () => {
  const eventos: string[] = [];
  await expect(
    acompanharContainer("id-proprio", {
      logs: async () => ({ codigo: 0, sinal: null }),
      esperar: async (id: string) => {
        eventos.push(`wait:${id}`);
        return { codigo: 0, sinal: null, saida: "0" };
      },
      inspecionar: () => ({ State: { Running: true, ExitCode: 0 } }),
    }),
  ).rejects.toThrow(/ativa|encerramento/i);
  expect(eventos).toEqual(["wait:id-proprio"]);
});
it.each([
  { codigo: 7, sinal: null },
  { codigo: null, sinal: "SIGTERM" },
])("preserva a falha do cliente de acompanhamento: %j", async (resultado) => {
  await expect(
    acompanharContainer("id-proprio", {
      logs: async () => resultado,
      esperar: async () => ({ codigo: 0, sinal: null, saida: "0" }),
      inspecionar: () => ({ State: { Running: false, ExitCode: 0 } }),
    }),
  ).rejects.toThrow(/acompanhamento/i);
});
it("comprova wait, parada e código da tarefa pelo mesmo ID", async () => {
  const ids: string[] = [];
  expect(
    await acompanharContainer("id-proprio", {
      logs: async (id: string) => {
        ids.push(id);
        return { codigo: 0, sinal: null };
      },
      esperar: async (id: string) => {
        ids.push(id);
        return { codigo: 0, sinal: null, saida: "23" };
      },
      inspecionar: (id: string) => {
        ids.push(id);
        return { State: { Running: false, ExitCode: 23 } };
      },
    }),
  ).toBe(23);
  expect(ids).toEqual(["id-proprio", "id-proprio", "id-proprio"]);
});
it.each(["", "NaN", "0\n9"])("recusa wait sem código inequívoco: %j", async (saida) => {
  await expect(
    acompanharContainer("id", {
      logs: async () => ({ codigo: 0, sinal: null }),
      esperar: async () => ({ codigo: 0, sinal: null, saida }),
      inspecionar: () => ({ State: { Running: false, ExitCode: 0 } }),
    }),
  ).rejects.toThrow(/encerramento/i);
});
