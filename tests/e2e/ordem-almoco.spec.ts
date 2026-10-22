// Ordem do almoço: a administração ordena as turmas na Gestão e a aba Horários mostra a ordem do dia, com a turma em destaque.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
const serie = "E2E Almoco";
const DIA = 3;
const ROTULO_DIA = "Quarta-feira";
let anterior: { turma_id: string; posicao: number; inicio: string | null }[] = [];

async function limparTurmas() {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [serie],
    );
    await banco.query("delete from series where nome = $1", [serie]);
  });
}

test.beforeAll(async () => {
  await limparTurmas();
  await comBanco(async (banco) => {
    anterior = (
      await banco.query(
        "select turma_id, posicao, inicio from ordens_almoco where dia_semana = $1",
        [DIA],
      )
    ).rows;
    await banco.query("delete from ordens_almoco where dia_semana = $1", [DIA]);
    const serieId = (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 94) returning id",
        [serie],
      )
    ).rows[0]?.id;
    for (const nome of ["A", "B"]) {
      await banco.query("insert into turmas (nome, serie_id) values ($1, $2)", [nome, serieId]);
    }
  });
});

test.afterAll(async () => {
  await comBanco(async (banco) => {
    await banco.query("delete from ordens_almoco where dia_semana = $1", [DIA]);
    for (const linha of anterior) {
      await banco.query(
        "insert into ordens_almoco (dia_semana, turma_id, posicao, inicio, atualizado_em) values ($1, $2, $3, $4, now())",
        [DIA, linha.turma_id, linha.posicao, linha.inicio],
      );
    }
  });
  await limparTurmas();
});

async function escolher(page: Page, combobox: ReturnType<Page["getByRole"]>, opcao: string) {
  await combobox.click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
}

test("a ordem definida na Gestão aparece na aba Horários do dia", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);

  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await page.locator("#categoria-config-horarios").click();
  const secao = page.locator('[data-secao="config-ordem-almoco"]');
  await secao.getByRole("button", { name: /Ordem do almoço/ }).click();
  const regiao = secao.getByRole("region", { name: "Ordem do almoço" });
  await expect(regiao).toBeVisible();

  await escolher(page, regiao.getByRole("combobox", { name: "Dia da semana" }), ROTULO_DIA);
  await expect(regiao.getByText(`Nenhuma turma na ordem de ${ROTULO_DIA}.`)).toBeVisible();
  // B vai primeiro, A depois; em seguida A sobe para o primeiro lugar.
  await escolher(page, regiao.getByRole("combobox", { name: "Turma" }), `${serie} B`);
  await regiao.getByRole("button", { name: "Adicionar à ordem" }).click();
  await escolher(page, regiao.getByRole("combobox", { name: "Turma" }), `${serie} A`);
  await regiao.getByRole("button", { name: "Adicionar à ordem" }).click();
  await regiao.getByRole("button", { name: `Subir ${serie} A` }).click();
  await regiao.getByRole("button", { name: `Salvar ordem de ${ROTULO_DIA}` }).click();
  await expect(page.getByText(`Ordem do almoço de ${ROTULO_DIA} salva.`)).toBeVisible();

  const editada = regiao.getByRole("list", { name: `Ordem do almoço de ${ROTULO_DIA}` });
  await expect(editada.getByRole("listitem").nth(0)).toContainText(`${serie} A`);
  await expect(editada.getByRole("listitem").nth(1)).toContainText(`${serie} B`);

  await trocarVisao(page, "Horários", "horarios");
  const vista = page.getByRole("region", { name: "Horários semanais", exact: true });
  await escolher(page, vista.getByRole("combobox", { name: "Turma", exact: true }), `${serie} B`);
  await escolher(
    page,
    vista.getByRole("combobox", { name: "Dia da semana", exact: true }),
    ROTULO_DIA,
  );
  const cartao = vista.getByRole("region", { name: `Ordem do almoço de ${ROTULO_DIA}` });
  await expect(cartao).toBeVisible();
  const itens = cartao.getByRole("listitem");
  await expect(itens.nth(0)).toContainText(`${serie} A`);
  await expect(itens.nth(1)).toContainText(`${serie} B`);
  await expect(itens.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(itens.nth(0)).not.toHaveAttribute("aria-current", "true");

  // Outro dia sem ordem não mostra o cartão.
  await escolher(
    page,
    vista.getByRole("combobox", { name: "Dia da semana", exact: true }),
    "Sábado",
  );
  await expect(vista.getByRole("region", { name: /^Ordem do almoço de/ })).toHaveCount(
    (
      await comBanco((banco) =>
        banco.query("select 1 from ordens_almoco where dia_semana = 6 limit 1"),
      )
    ).rowCount
      ? 1
      : 0,
  );
});
