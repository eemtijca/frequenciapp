// Bloqueio da Chamada após salvar: correção explícita por turma e dia,
// sem editar nem reenviar uma frequência por toque acidental.
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, liberarSabadoSeNecessario, trocarVisao } from "./helpers/pagina";

async function limparMassa(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'E2E Bloqueio'))",
    );
    await cliente.query("delete from alunos where nome like 'E2E Bloqueio %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Bloqueio')",
    );
    await cliente.query("delete from series where nome = 'E2E Bloqueio'");
  });
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ('E2E Bloqueio', 96) returning id",
    );
    const serieId = serie.rows[0]?.id;
    const turmaA = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serieId],
    );
    const turmaB = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
      [serieId],
    );
    const aId = turmaA.rows[0]?.id;
    const bId = turmaB.rows[0]?.id;
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', $3, true), ($2, 1, '07:00', '07:50', $3, true)",
      [aId, bId, [1, 2, 3, 4, 5, 6, 7]],
    );
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Bloqueio Um', $1, $1, 1, true), ('E2E Bloqueio Dois', $2, $2, 1, true)",
      [aId, bId],
    );
  });
});

test.afterAll(async () => {
  await limparMassa();
});

test("salva, bloqueia, libera correção e bloqueia novamente", async ({ page }) => {
  let salvamentos = 0;
  page.on("request", (requisicao) => {
    if (
      requisicao.method() === "POST" &&
      new URL(requisicao.url()).pathname === "/api/frequencias"
    ) {
      salvamentos += 1;
    }
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.locator('section[aria-label="Fazer chamada"]');
  const turmas = secao.getByRole("group", { name: "Turma atual" });
  const turmaA = turmas.getByRole("button", { name: /E2E Bloqueio A/ });
  const turmaB = turmas.getByRole("button", { name: /E2E Bloqueio B/ });
  await turmaA.click();
  await liberarSabadoSeNecessario(secao);
  const aluno = secao.getByRole("button", { name: /^E2E Bloqueio Um:/ });
  await expect(aluno).toBeEnabled();
  await expect(secao.getByRole("button", { name: /bloquear chamada de/i })).toHaveCount(0);

  await aluno.click();
  await secao.getByRole("button", { name: "Salvar" }).click();
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  expect(salvamentos).toBe(1);
  await expect(aluno).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar" })).toBeDisabled();

  // Aos sábados o resumo divide a linha com a liberação; a correção fica abaixo.
  const resumo = secao.getByRole("button", { name: /^Resumo d/ });
  const botaoBloqueio = secao.getByRole("button", { name: /^Desbloquear chamada de/ });
  const [caixaResumo, caixaBloqueio] = await Promise.all([
    resumo.boundingBox(),
    botaoBloqueio.boundingBox(),
  ]);
  expect(caixaResumo).not.toBeNull();
  expect(caixaBloqueio).not.toBeNull();
  if (caixaResumo && caixaBloqueio) {
    if (await secao.getByRole("button", { name: "Sábado letivo", exact: true }).count()) {
      expect(caixaBloqueio.y).toBeGreaterThanOrEqual(caixaResumo.y + caixaResumo.height);
    } else {
      expect(Math.abs(caixaResumo.y - caixaBloqueio.y)).toBeLessThan(8);
      expect(caixaBloqueio.x).toBeGreaterThan(caixaResumo.x + caixaResumo.width);
    }
  }
  await expect(secao.getByText("Desbloqueie para corrigir a frequência.")).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await turmaB.click();
  await liberarSabadoSeNecessario(secao);
  await expect(secao.getByRole("button", { name: /^E2E Bloqueio Dois:/ })).toBeEnabled();
  await turmaA.click();
  await expect(aluno).toBeDisabled();

  const desbloquear = secao.getByRole("button", { name: /Desbloquear chamada de E2E Bloqueio A/ });
  await desbloquear.click();
  await expect(aluno).toBeEnabled();
  await secao.getByRole("button", { name: /Bloquear chamada de E2E Bloqueio A/ }).click();
  await expect(aluno).toBeDisabled();
  expect(salvamentos).toBe(1);

  await desbloquear.click();
  await aluno.click();
  await expect(
    secao.getByRole("button", { name: /Bloquear chamada de E2E Bloqueio A/ }),
  ).toBeDisabled();
  await secao.getByRole("button", { name: "Salvar" }).click();
  await expect(aluno).toBeDisabled();
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  expect(salvamentos).toBe(2);

  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  await turmaA.click();
  await expect(aluno).toBeDisabled();
});
