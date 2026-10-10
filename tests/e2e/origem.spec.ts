// Origem configurável na Chamada, consulta por origem nos Alunos
// e definição da turma original em massa na Gestão.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import {
  aguardarHidratacao,
  escolherTurmaNaChamada,
  liberarSabadoSeNecessario,
  trocarVisao,
} from "./helpers/pagina";
import { definirOrigem, lerOrigem, type ConfiguracaoOrigem } from "./helpers/configuracoes";

let configuracaoInicial: ConfiguracaoOrigem;

async function criarMassaOrigem(): Promise<void> {
  configuracaoInicial = await lerOrigem();
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from alunos where nome like 'E2E Origem %' or nome like 'E2E Movimento %'",
    );
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome in ('3º ano E2E Origem', '2º ano E2E Movimento'))",
    );
    await cliente.query(
      "delete from series where nome in ('3º ano E2E Origem', '2º ano E2E Movimento')",
    );
    const serie = await cliente.query(
      "insert into series (nome, ordem) values ('3º ano E2E Origem', 98) returning id",
    );
    const serieId = serie.rows[0]?.id as string;
    await cliente.query("update configuracoes set origem_na_chamada = true where id = 'principal'");
    await cliente.query(
      "delete from configuracoes_origem_series where configuracao_id = 'principal'",
    );
    await cliente.query(
      "delete from configuracoes_origem_turmas where configuracao_id = 'principal'",
    );
    await cliente.query(
      "insert into configuracoes_origem_series (configuracao_id, serie_id) values ('principal', $1)",
      [serieId],
    );
    const turmaA = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serieId],
    );
    const turmaB = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
      [serieId],
    );
    const aId = turmaA.rows[0]?.id as string;
    const bId = turmaB.rows[0]?.id as string;
    await cliente.query(
      `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo)
       values ('E2E Origem Um', $1, $2, 1, true), ('E2E Origem Dois', $1, $1, 2, true)`,
      [aId, bId],
    );
    const segunda = await cliente.query(
      "insert into series (nome, ordem) values ('2º ano E2E Movimento', 97) returning id",
    );
    const segundaId = segunda.rows[0]?.id as string;
    const segundaA = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [segundaId],
    );
    const segundaB = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
      [segundaId],
    );
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', $2, true)",
      [segundaB.rows[0]?.id, [1, 2, 3, 4, 5, 6, 7]],
    );
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Movimento Um*', $1, $2, 1, true)",
      [segundaB.rows[0]?.id, segundaA.rows[0]?.id],
    );
  });
}

async function limparMassaOrigem(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from alunos where nome like 'E2E Origem %' or nome like 'E2E Movimento %'",
    );
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome in ('3º ano E2E Origem', '2º ano E2E Movimento'))",
    );
    await cliente.query(
      "delete from series where nome in ('3º ano E2E Origem', '2º ano E2E Movimento')",
    );
  });
  await definirOrigem(configuracaoInicial);
}

test.describe("consulta por origem (coordenação)", () => {
  test.use({ storageState: "tests/e2e/.auth/coordenacao.json" });

  test.beforeAll(async () => {
    await criarMassaOrigem();
  });

  test.afterAll(async () => {
    await limparMassaOrigem();
  });

  test("agrupa os alunos pela turma de origem", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Alunos", "alunos");
    await page.getByRole("button", { name: "Turma de origem" }).click();
    const secao = page.locator('section[aria-label="Lista de alunos"]');
    await expect(secao.getByText("E2E Origem Um")).toBeVisible();
    await expect(secao.getByText("Atual 3º ano E2E Origem A").first()).toBeVisible();
  });

  test("busca na Chamada pela turma de origem e mostra a origem na linha", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    await escolherTurmaNaChamada(secao, /E2E Origem A/);
    await page.getByLabel("Buscar aluno ou turma de origem").fill("E2E Origem B");
    await expect(secao.getByText("E2E Origem Um")).toBeVisible();
    await expect(secao.getByText("E2E Origem Dois")).toBeHidden();
    const circulo = secao.getByRole("img", { name: "Turma original 3º ano E2E Origem B" });
    await expect(circulo).toHaveText("3º B");
  });

  test("mostra a turma original em círculo para toda a turma reorganizada", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    await escolherTurmaNaChamada(secao, /E2E Origem A/);
    await expect(
      secao.getByRole("button", { name: /^E2E Origem Um\*, turma original 3º ano E2E Origem B:/ }),
    ).toBeVisible();
    await expect(
      secao.getByRole("button", { name: /^E2E Origem Dois, turma original 3º ano E2E Origem A:/ }),
    ).toBeVisible();
  });

  test("oculta a origem e o asterisco de aluno movido na segunda série", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.locator('section[aria-label="Fazer chamada"]');
    await escolherTurmaNaChamada(secao, /2º ano E2E Movimento B/);
    await liberarSabadoSeNecessario(secao);
    const linha = secao.getByRole("button", { name: /^E2E Movimento Um:/ });
    await expect(linha).toBeVisible();
    await expect(linha.getByText("E2E Movimento Um", { exact: true })).toBeVisible();
    await expect(linha.getByRole("img", { name: /Turma original/ })).toHaveCount(0);
    await linha.click();
    await secao.getByRole("button", { name: "Resumo de hoje" }).click();
    await expect(secao.getByText("Origem 2º ano E2E Movimento A")).toHaveCount(0);
  });
});

test.describe("origem em massa (administração)", () => {
  test.beforeAll(async () => {
    await criarMassaOrigem();
  });

  test.afterAll(async () => {
    await limparMassaOrigem();
  });

  test("define a origem de vários alunos sem mover de turma", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: "Alunos" }).click();
    const painel = page.locator("#painel-alunos");
    await painel.getByRole("button", { name: "Definir origem" }).click();
    await page.locator("#busca-gestao-aluno").fill("E2E Origem");
    await painel.getByRole("button", { name: "Selecionar todos" }).click();
    await page.locator("#origem-em-massa").click();
    await page.getByRole("option", { name: "E2E Origem B" }).click();
    await painel.getByRole("button", { name: "Aplicar origem" }).click();
    await expect(page.getByText("Origem de 2 alunos atualizada.")).toBeVisible();
    await expect(painel.getByText("Origem 3º ano E2E Origem B").first()).toBeVisible();
  });
});
