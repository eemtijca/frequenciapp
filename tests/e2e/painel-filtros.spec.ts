// Painel: cada botão mostra só o seu escopo. Escola tem um gráfico, a série
// escolhida mostra só as próprias turmas e Desistentes tem gráfico à parte.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

async function limparMassa(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Painel %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome like 'E2E Painel %')",
    );
    await cliente.query("delete from series where nome like 'E2E Painel %'");
  });
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    for (const [indice, nome] of ["E2E Painel Um", "E2E Painel Dois"].entries()) {
      const serie = await cliente.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, $2) returning id",
        [nome, 90 + indice],
      );
      const turma = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
        [serie.rows[0]?.id],
      );
      await cliente.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ($1, $2, $2, 1, true, $3)",
        [`E2E Painel Aluno ${indice + 1}`, turma.rows[0]?.id, indice === 0 ? "2020-01-01" : null],
      );
    }
  });
});

test.afterAll(async () => {
  await limparMassa();
});

test("cada botão do Painel mostra só o gráfico do seu escopo", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const filtros = page.getByRole("group", { name: "Filtro por série" });
  // Só o chip da Cobertura do dia: o mesmo nome também está em seletores da página.
  const pendente = (turma: string) => page.locator("span.bg-falta-fraca", { hasText: turma });

  await expect(filtros.getByRole("button", { name: "Escola" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^E2E Painel (Um|Dois)$/ })).toHaveCount(0);
  await expect(pendente("E2E Painel Dois A")).toBeVisible();

  await filtros.getByRole("button", { name: "E2E Painel Um" }).click();
  await expect(page.getByRole("heading", { name: "E2E Painel Um" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "E2E Painel Dois" })).toHaveCount(0);
  await expect(pendente("E2E Painel Dois A")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toHaveCount(0);

  await filtros.getByRole("button", { name: "Desistentes" }).click();
  await expect(page.getByRole("heading", { name: "Desistentes até este dia" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Desistentes por série" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Toda a escola" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cobertura do dia" })).toHaveCount(0);
});

test("no celular, a fila de botões quebra linha sem cortar o Desistentes", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Painel", "painel");
  const botao = page
    .getByRole("group", { name: "Filtro por série" })
    .getByRole("button", { name: "Desistentes" });
  await expect(botao).toBeInViewport({ ratio: 1 });
});
