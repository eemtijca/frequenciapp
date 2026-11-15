// Confere a massa de domingo no salvamento real do sábado, sem alterar o relógio do servidor.
import { mock } from "node:test";
import { expect, test } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao } from "../helpers/pagina";

const DOMINGO_DA_MASSA = new Date("2025-01-05T12:00:00Z");
const SABADO_DA_CHAMADA = "2025-01-04";

test.use({ serviceWorkers: "block" });
test.afterAll(limparMassaE2E);

test("a massa de domingo permite salvar o sábado sem confirmação histórica", async ({ page }) => {
  // Só a geração da massa recebe o domingo fixo. PostgreSQL e aplicativo mantêm o tempo real.
  mock.timers.enable({ apis: ["Date"], now: DOMINGO_DA_MASSA });
  try {
    await criarMassaE2E();
  } finally {
    mock.timers.reset();
  }

  await page.goto("/");
  await aguardarHidratacao(page);
  const respostaTurmas = await page.request.get("/api/turmas");
  expect(respostaTurmas.status()).toBe(200);
  const { turmas } = (await respostaTurmas.json()) as {
    turmas: { id: string; rotulo: string }[];
  };
  const turma = turmas.find((item) => item.rotulo === "E2E Ano A");
  if (!turma) throw new Error("Turma da massa de domingo não encontrada.");

  const resposta = await page.request.post("/api/frequencias", {
    data: { dia: SABADO_DA_CHAMADA, turmaId: turma.id, faltas: [], revisao: 0 },
  });
  expect(resposta.status(), await resposta.text()).toBe(200);

  const leitura = await page.request.get(
    `/api/frequencias?dia=${SABADO_DA_CHAMADA}&turmaId=${turma.id}`,
  );
  expect(leitura.status()).toBe(200);
  const { frequencia } = (await leitura.json()) as {
    frequencia: { faltas: unknown[] } | null;
  };
  expect(frequencia).not.toBeNull();
  expect(frequencia?.faltas).toEqual([]);
});
