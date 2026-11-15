// Saída antecipada: registro durante a aula com texto opcional, justificativa
// escrita no intervalo e o nome de quem liberou vindo do catálogo da Gestão.
import { expect, test, type Page } from "@playwright/test";
import { criarLiberadoresE2E, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaDeChamada } from "../helpers/dia";
import {
  aguardarHidratacao,
  prepararChamadaParaSaida,
  registrarSaida,
  trocarVisao,
} from "../helpers/pagina";

/** Cada cenário de remoção recebe as duas saídas, sem depender dos testes de registro. */
async function prepararSaidasParaRemocao(page: Page) {
  const resposta = await page.request.get("/api/alunos");
  expect(resposta.status()).toBe(200);
  const { alunos } = (await resposta.json()) as { alunos: { id: string; nome: string }[] };
  for (const [nome, texto, momento, liberadoPorCodigo] of [
    ["E2E Aluno Um", "Saiu para a coordenação", "aula_1", "E2EDIRETOR"],
    ["E2E Aluno Dois", "Foi buscar o irmão", "intervalo_1", "E2ECOORD"],
  ]) {
    const aluno = alunos.find((item) => item.nome === nome);
    if (!aluno) throw new Error(`Aluno da massa não encontrado: ${nome}.`);
    const criada = await page.request.post("/api/saidas", {
      data: {
        alunoId: aluno.id,
        dia: diaDeChamada(),
        momento,
        horario: "08:10",
        texto,
        liberadoPorCodigo,
      },
    });
    expect(criada.status(), await criada.text()).toBe(201);
  }
}

test.describe("saída durante a aula", () => {
  test.beforeEach(async ({ page }) => {
    await criarMassaE2E();
    await criarLiberadoresE2E();
    await prepararChamadaParaSaida(page, "E2E Ano A");
  });

  test.afterAll(async () => {
    await limparMassaE2E();
  });

  test("registra com texto opcional e mostra na lista do dia", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e Entradas", "saidas");

    await page.locator("#saida-turma").click();
    await page.getByRole("option", { name: "E2E Ano A" }).click();
    await page.locator("#saida-aluno").click();
    await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
    await page.locator("#saida-momento").click();
    await page.getByRole("option", { name: "1ª aula" }).click();
    await page.locator("#saida-justificativa").click();
    await page.getByRole("option", { name: "D · Doente" }).click();
    await page.locator("#saida-responsavel").click();
    await page.getByRole("option", { name: "Diretor E2E" }).click();

    const campoTexto = page.locator("#saida-texto");
    await expect(campoTexto).toBeVisible();
    await campoTexto.fill("Saiu para a coordenação");
    await expect(page.getByText("23/100")).toBeVisible();
    await registrarSaida(page);
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Saiu para a coordenação").first()).toBeVisible();
    await expect(
      lista.getByText(/Liberado por Diretor E2E em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/).first(),
    ).toBeVisible();
    // O resumo por turma e o relatório por aluno saíram da aba; o relatório fica em Relatórios.
    await expect(page.getByRole("heading", { name: "Saídas por turma" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Relatório por aluno" })).toHaveCount(0);
  });

  test("registra a justificativa escrita e a coordenadora que liberou", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e Entradas", "saidas");

    await page.locator("#saida-turma").click();
    await page.getByRole("option", { name: "E2E Ano A" }).click();
    await page.locator("#saida-aluno").click();
    await page.getByRole("option", { name: /E2E Aluno Dois/ }).click();
    await page.locator("#saida-momento").click();
    await page.getByRole("option", { name: "1º intervalo" }).click();
    await page.getByRole("radio", { name: "Escrever", exact: true }).click();
    await page.locator("#saida-texto").fill("Foi buscar o irmão");
    await page.locator("#saida-responsavel").click();
    await page.getByRole("option", { name: "Coordenadora E2E" }).click();
    await registrarSaida(page);
    await expect(page.getByText("Saída registrada.")).toBeVisible();
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Foi buscar o irmão").first()).toBeVisible();
    await expect(lista.getByText("Liberado por Coordenadora E2E").first()).toBeVisible();
  });

  test("bloqueia de novo a remoção das saídas ao tocar em Bloquear", async ({ page }) => {
    await prepararSaidasParaRemocao(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e Entradas", "saidas");
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await page.getByRole("button", { name: /^Desbloquear remoção das saídas de/ }).click();
    await expect(lista.getByRole("button", { name: /^Remover saída de/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Bloquear remoção das saídas de/ }).click();
    await expect(lista.getByRole("button", { name: /^Remover saída de/ })).toHaveCount(0);
  });

  test("remove uma saída pela lista do dia para corrigir o registro", async ({ page }) => {
    await prepararSaidasParaRemocao(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e Entradas", "saidas");
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByText("Foi buscar o irmão")).toBeVisible();
    // A lista abre bloqueada: sem lixeira até desbloquear.
    await expect(lista.getByRole("button", { name: /^Remover saída de/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Desbloquear remoção das saídas de/ }).click();
    await lista.getByRole("button", { name: "Remover saída de E2E Aluno Dois" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remover" }).click();
    await expect(page.getByText("Saída removida.")).toBeVisible();
    await expect(lista.getByText("Foi buscar o irmão")).toHaveCount(0);
    await expect(lista.getByText("Saiu para a coordenação").first()).toBeVisible();
  });
});
