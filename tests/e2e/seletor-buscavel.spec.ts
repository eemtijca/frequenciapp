// Busca compartilhada dentro de diálogo e em lista longa, com toque e área reduzida.
import { expect, test } from "@playwright/test";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.beforeAll(async () => {
  await criarMassaE2E();
  await comBanco((banco) =>
    banco.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) select 'E2E Lista ' || lpad(n::text, 2, '0'), t.id, t.id, n + 2 from turmas t join series s on s.id = t.serie_id cross join generate_series(1, 30) n where s.nome = 'E2E Ano' and t.nome = 'A'",
    ),
  );
});
test.afterAll(limparMassaE2E);

test("buscar uma turma mantém o formulário aberto ao reduzir a tela e cancelar a lista", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos", exact: true }).click();
  await page.getByRole("button", { name: "Novo aluno", exact: true }).click();
  const formulario = page.getByRole("dialog", { name: "Novo aluno", exact: true });
  const turma = formulario.getByRole("combobox", { name: "Turma atual", exact: true });
  await turma.click();
  const busca = page.getByRole("textbox", { name: "Filtrar opções", exact: true });
  if (isMobile) await busca.tap();
  else await busca.click();
  await page.setViewportSize({ width: 360, height: 500 });
  await busca.pressSequentially("E2E Ano");
  await expect(busca).toHaveValue("E2E Ano");
  await expect(busca).toBeFocused();
  await expect(formulario).toBeVisible();
  await busca.press("Escape");
  await expect(busca).toHaveCount(0);
  await expect(turma).toBeFocused();
  await expect(formulario).toBeVisible();
  await turma.click();
  await expect(busca).toHaveValue("");
  await busca.pressSequentially("E2E Ano A");
  await busca.press("Enter");
  await expect(turma).toContainText("E2E Ano A");
  await expect(formulario).toBeVisible();
  await formulario.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(formulario).toHaveCount(0);
});

test("a lista longa rola dentro do painel e seleciona por toque ou teclado", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  const aluno = page.locator("#saida-aluno");
  await aluno.click();
  const busca = page.getByRole("textbox", { name: "Filtrar opções", exact: true });
  const lista = page.getByRole("listbox", { name: "Opções", exact: true });
  await expect(lista.getByRole("option")).toHaveCount(32);
  await lista.evaluate((elemento) => {
    elemento.scrollTop = elemento.scrollHeight;
  });
  const ultima = lista.getByRole("option", { name: /E2E Lista 30/ });
  await expect(ultima).toBeInViewport();
  if (isMobile) await ultima.tap();
  else await ultima.click();
  await expect(aluno).toContainText("E2E Lista 30");
  await expect(busca).toHaveCount(0);
  await aluno.press("ArrowDown");
  await expect(busca).toBeFocused();
  await busca.press("ArrowDown");
  await expect(lista.getByRole("option").first()).toBeInViewport();
  await busca.press("Enter");
  await expect(aluno).toContainText("E2E Aluno Dois");
  await aluno.click();
  await busca.pressSequentially("E2E Lista 01");
  await expect(lista.getByRole("option")).toHaveCount(1);
  // Clicar fora cancela a escolha sem alterar o aluno selecionado.
  await page.getByRole("heading", { name: "Registro", exact: true }).click();
  await expect(busca).toHaveCount(0);
  await expect(aluno).toContainText("E2E Aluno Dois");
});
