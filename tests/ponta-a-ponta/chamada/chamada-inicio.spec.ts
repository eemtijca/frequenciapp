// Distingue a chamada ainda não iniciada do rascunho, da chamada salva e da leitura indisponível.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaDeChamada } from "../helpers/dia";
import {
  aguardarHidratacao,
  desbloquearChamada,
  escolherTurmaNaChamada,
  liberarSabadoSeNecessario,
  salvarChamada,
  trocarVisao,
} from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

let alunoId = "";
let turmaId = "";

test.beforeEach(async () => {
  await criarMassaE2E();
  await comBanco(async (cliente) => {
    const resultado = await cliente.query<{ id: string; turma_id: string }>(
      "select id, turma_id from alunos where nome = 'E2E Aluno Um'",
    );
    const aluno = resultado.rows[0];
    if (!aluno) throw new Error("Aluno da massa de início da chamada não encontrado.");
    alunoId = aluno.id;
    turmaId = aluno.turma_id;
  });
});

test.afterAll(async () => {
  await limparMassaE2E();
});

function situacao(secao: Locator): Locator {
  return secao.getByRole("region", { name: "Situação da chamada", exact: true });
}

async function abrirChamada(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  if (await secao.getByRole("group", { name: "Turma atual", exact: true }).count()) {
    await escolherTurmaNaChamada(secao, /E2E Ano A/);
  }
  await liberarSabadoSeNecessario(secao);
  await expect(
    situacao(secao).getByRole("heading", { name: "Chamada não iniciada", exact: true }),
  ).toBeVisible();
  return secao;
}

async function lerChamada(page: Page) {
  const resposta = await page.request.get(
    `/api/frequencias?dia=${diaDeChamada()}&turmaId=${turmaId}`,
  );
  expect(resposta.ok()).toBe(true);
  return resposta.json() as Promise<{
    frequencia: { faltas: { alunoId: string; justificativa?: string }[] } | null;
  }>;
}

test("inicia sem faltas, restaura o rascunho e permite descartar o início", async ({ page }) => {
  const secao = await abrirChamada(page);
  const primeiroAluno = secao.getByRole("button", { name: /^E2E Aluno Um/ });
  await situacao(secao).getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(
    situacao(secao).getByRole("heading", { name: "Em andamento", exact: true }),
  ).toBeVisible();
  await expect(primeiroAluno).toBeFocused();
  await expect(primeiroAluno).toHaveAttribute("aria-pressed", "false");
  expect((await lerChamada(page)).frequencia).toBeNull();

  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  if (await secao.getByRole("group", { name: "Turma atual", exact: true }).count()) {
    await escolherTurmaNaChamada(secao, /E2E Ano A/);
  }
  await expect(
    situacao(secao).getByRole("heading", { name: "Em andamento", exact: true }),
  ).toBeVisible();
  await expect(primeiroAluno).toHaveAttribute("aria-pressed", "false");
  await expect(secao.getByRole("button", { name: /^Dia anterior/ })).toBeDisabled();
  expect((await lerChamada(page)).frequencia).toBeNull();

  await secao.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?", exact: true });
  await dialogo.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await liberarSabadoSeNecessario(secao);
  await expect(
    situacao(secao).getByRole("heading", { name: "Chamada não iniciada", exact: true }),
  ).toBeVisible();
  await expect(situacao(secao).getByRole("button", { name: "Iniciar", exact: true })).toBeEnabled();
  await expect(secao.getByRole("button", { name: /^Dia anterior/ })).toBeEnabled();
});

test("salva todos presentes sem exigir o botão Iniciar", async ({ page }) => {
  const secao = await abrirChamada(page);
  await salvarChamada(secao);
  await expect(
    situacao(secao).getByRole("heading", { name: "Chamada salva", exact: true }),
  ).toBeVisible();
  await expect(situacao(secao).getByRole("button", { name: "Iniciar", exact: true })).toHaveCount(
    0,
  );
  await expect(secao.getByRole("button", { name: /^E2E Aluno Um/ })).toBeDisabled();
  expect((await lerChamada(page)).frequencia?.faltas).toEqual([]);
});

test("marcar um aluno inicia a chamada e a correção preserva a indicação de salvamento pendente", async ({
  page,
}) => {
  const secao = await abrirChamada(page);
  const aluno = secao.getByRole("button", { name: /^E2E Aluno Um/ });
  await aluno.click();
  await expect(aluno).toHaveAttribute("aria-pressed", "true");
  await expect(
    situacao(secao).getByRole("heading", { name: "Em andamento", exact: true }),
  ).toBeVisible();
  await salvarChamada(secao);
  await expect(
    situacao(secao).getByRole("heading", { name: "Chamada salva", exact: true }),
  ).toBeVisible();
  await expect(aluno).toBeDisabled();
  expect((await lerChamada(page)).frequencia?.faltas).toEqual([
    expect.objectContaining({ alunoId }),
  ]);

  await desbloquearChamada(secao);
  await aluno.click();
  await expect(aluno).toHaveAttribute("aria-pressed", "false");
  await expect(
    situacao(secao).getByRole("heading", { name: "Alterações não salvas", exact: true }),
  ).toBeVisible();
  await expect(situacao(secao).getByRole("button", { name: "Iniciar", exact: true })).toHaveCount(
    0,
  );
  await salvarChamada(secao);
  expect((await lerChamada(page)).frequencia?.faltas).toEqual([]);
});

test("aguarda uma leitura válida antes de anunciar que a chamada não foi iniciada", async ({
  page,
}) => {
  const secao = await abrirChamada(page);
  let liberarLeitura: (() => void) | undefined;
  const leituraPendente = new Promise<void>((resolver) => {
    liberarLeitura = resolver;
  });
  const caminho = "**/api/frequencias?dia=**";
  await page.route(caminho, async (rota) => {
    await leituraPendente;
    await rota.fulfill({
      status: 503,
      json: { error: "Não foi possível carregar a frequência." },
    });
  });
  try {
    await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
    await expect(secao.getByText("Carregando chamada...", { exact: true })).toBeVisible();
    await expect(situacao(secao)).toHaveCount(0);
    liberarLeitura?.();
    await expect(
      secao.getByRole("button", { name: "Tentar novamente", exact: true }),
    ).toBeVisible();
    await expect(situacao(secao)).toHaveCount(0);
  } finally {
    liberarLeitura?.();
    await page.unroute(caminho);
  }
  await secao.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await liberarSabadoSeNecessario(secao);
  await expect(
    situacao(secao).getByRole("heading", { name: "Chamada não iniciada", exact: true }),
  ).toBeVisible();
});

test("uma justificativa antecipada preserva o motivo e a chamada ainda não iniciada", async ({
  page,
}) => {
  const resposta = await page.request.post("/api/frequencias-parciais", {
    data: {
      alunoId,
      turmaId,
      dia: diaDeChamada(),
      tipo: "JUSTIFICADA",
      justificativa: "O",
      observacao: "E2E Justificativa antecipada",
    },
  });
  expect(resposta.ok()).toBe(true);
  const secao = await abrirChamada(page);
  const aluno = secao.getByRole("button", { name: /^E2E Aluno Um/ });
  await expect(aluno).toHaveAttribute("aria-pressed", "true");
  await expect(secao.locator(`#justificativa-${alunoId}`)).toContainText("Outros");
  await expect(
    secao.getByRole("textbox", { name: "Observação da falta de E2E Aluno Um", exact: true }),
  ).toHaveValue("E2E Justificativa antecipada");
  expect((await lerChamada(page)).frequencia).toBeNull();
  await situacao(secao).getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(
    situacao(secao).getByRole("heading", { name: "Em andamento", exact: true }),
  ).toBeVisible();
  await expect(secao.locator(`#justificativa-${alunoId}`)).toContainText("Outros");
  await salvarChamada(secao);
  expect((await lerChamada(page)).frequencia?.faltas).toEqual([
    expect.objectContaining({ alunoId, justificativa: "O" }),
  ]);
});
