// Chamada: aula criada depois do registro não reclassifica o histórico.
import { expect, test, type Page } from "@playwright/test";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaDeChamada } from "../helpers/dia";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

const AULA_EXTRA = 9;

interface Massa {
  dia: string;
  turmaId: string;
  aulas: string[];
  faltas: { alunoId: string; horarios: string[] }[];
}

async function preparar(page: Page): Promise<Massa> {
  const respostaTurmas = await page.request.get("/api/turmas");
  const { turmas } = (await respostaTurmas.json()) as {
    turmas: { id: string; rotulo: string; horarios: { id: string }[] }[];
  };
  const turma = turmas.find((item) => item.rotulo === "E2E Ano A");
  if (!turma) throw new Error("Turma E2E não encontrada.");
  const respostaAlunos = await page.request.get("/api/alunos");
  const { alunos } = (await respostaAlunos.json()) as { alunos: { id: string; nome: string }[] };
  const um = alunos.find((item) => item.nome === "E2E Aluno Um");
  const dois = alunos.find((item) => item.nome === "E2E Aluno Dois");
  if (!um || !dois || !turma.horarios[0]) throw new Error("Massa E2E não encontrada.");

  const dia = diaDeChamada();
  const aulas = turma.horarios.map((aula) => aula.id);
  // Falta integral em Um e falta parcial em Dois, no mesmo dia.
  const faltas = [
    { alunoId: um.id, horarios: aulas },
    { alunoId: dois.id, horarios: [turma.horarios[0].id] },
  ];

  // Retentativas recomeçam do zero para o retrato ser determinístico.
  await comBanco(async (cliente) => {
    await cliente.query("delete from horarios where turma_id = $1 and ordem = $2", [
      turma.id,
      AULA_EXTRA,
    ]);
    await cliente.query("delete from frequencias where turma_id = $1 and dia = $2", [
      turma.id,
      dia,
    ]);
  });

  const salva = await page.request.post("/api/frequencias", {
    data: { dia, turmaId: turma.id, faltas, revisao: 0 },
  });
  expect(salva.status()).toBe(200);
  const { frequencia } = (await salva.json()) as { frequencia: { aulas: string[] } };
  expect([...frequencia.aulas].sort()).toEqual([...aulas].sort());
  return { dia, turmaId: turma.id, aulas, faltas };
}

test("mantém faltas e retrato quando a grade ganha aulas", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  const massa = await preparar(page);

  // A aula nova fica fora do retrato e não reclassifica o dia.
  const criada = await page.request.post("/api/horarios", {
    data: {
      turmaId: massa.turmaId,
      ordem: AULA_EXTRA,
      inicio: "10:00",
      fim: "10:50",
      diasSemana: [1, 2, 3, 4, 5, 6],
    },
  });
  expect(criada.status()).toBe(201);
  const nova = ((await criada.json()) as { horario: { id: string } }).horario;

  // Correção depois da aula nova também não amplia o retrato congelado.
  const corrigida = await page.request.post("/api/frequencias", {
    data: { dia: massa.dia, turmaId: massa.turmaId, faltas: massa.faltas, revisao: 1 },
  });
  expect(corrigida.status()).toBe(200);
  const { frequencia } = (await corrigida.json()) as { frequencia: { aulas: string[] } };
  expect([...frequencia.aulas].sort()).toEqual([...massa.aulas].sort());
  expect(frequencia.aulas).not.toContain(nova.id);

  await page.reload();
  await aguardarHidratacao(page);

  // Painel: a falta integral continua contando e a parcial fica visível.
  const resumoDia = page.getByRole("group", { name: "Resumo do dia" });
  await expect(resumoDia).toContainText("50%");
  await expect(resumoDia).toContainText("1 presença parcial");

  // Resumo dos Relatórios: integral e parcial contam na turma filtrada.
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Resumo", exact: true }).click();
  const painel = page.getByRole("region", { name: "Resumo dos relatórios", exact: true });
  await expect(painel).toHaveAttribute("aria-busy", "false");
  await painel.getByRole("combobox", { name: "Série do resumo" }).click();
  await page.getByRole("option", { name: "E2E Ano", exact: true }).click();
  await painel.getByRole("combobox", { name: "Turma do resumo" }).click();
  await page.getByRole("option", { name: "E2E Ano A", exact: true }).click();
  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  await expect(painel).toHaveAttribute("aria-busy", "false");
  await expect(painel.locator("dd")).toHaveText(["1", "0", "1", "50%"]);
  await painel.getByText("Ver dados diários", { exact: true }).click();
  const rotulo = `${massa.dia.slice(8, 10)}/${massa.dia.slice(5, 7)}`;
  await expect(painel.getByRole("row").filter({ hasText: rotulo }).locator("td")).toHaveText([
    "1",
    "2",
    "1",
    "50%",
  ]);
});
