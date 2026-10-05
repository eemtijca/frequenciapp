// Confirmação da Seduc na chamada normal: persiste por aluno, funciona com
// chamada bloqueada e exige reconfirmação somente de frequências corrigidas.
import { expect, test, type Page } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
let turmaId = "";
let alunoId = "";
const prefixo = "E2E Seduc Normal";
async function limpar() {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from auditoria where alvo like 'chamada:%:aluno:%' and substring(alvo from ':aluno:(.*)$') in (select id::text from alunos where nome like $1)",
      [`${prefixo}%`],
    );
    await cliente.query(
      "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
      [prefixo],
    );
    await cliente.query("delete from alunos where nome like $1", [`${prefixo}%`]);
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [prefixo],
    );
    await cliente.query("delete from series where nome = $1", [prefixo]);
  });
}
test.beforeAll(async () => {
  await limpar();
  await comBanco(async (cliente) => {
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 98) returning id",
      [prefixo],
    );
    turmaId =
      (
        await cliente.query<{ id: string }>(
          "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
          [serie.rows[0]?.id],
        )
      ).rows[0]?.id ?? "";
    const alunos = await cliente.query<{ id: string; nome: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $3, $3, 1), ($2, $3, $3, 2) returning id, nome",
      [`${prefixo} Um`, `${prefixo} Dois`, turmaId],
    );
    alunoId = alunos.rows.find((aluno) => aluno.nome === `${prefixo} Um`)?.id ?? "";
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2), ($1, 2, '07:50', '08:40', $2)",
      [turmaId, [1, 2, 3, 4, 5, 6, 7]],
    );
  });
});
test.beforeEach(async () => {
  await comBanco((cliente) =>
    cliente.query("delete from frequencias where turma_id = $1", [turmaId]),
  );
});
test.afterAll(limpar);
async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  if (await secao.getByRole("group", { name: "Turma atual", exact: true }).isVisible())
    await escolherTurmaNaChamada(secao, /E2E Seduc Normal A/);
  await expect(secao.getByText(`${prefixo} Um`, { exact: true })).toBeVisible();
  return secao;
}

test("confirma e desmarca por aluno, persiste após recarga e preserva os demais ao corrigir", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const secao = await abrir(page);
  const primeiro = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Um`,
    exact: true,
  });
  const segundo = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Dois`,
    exact: true,
  });
  await expect(primeiro).toBeDisabled();
  await expect(segundo).toBeDisabled();
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(secao.getByText("Chamada bloqueada", { exact: true })).toBeVisible();
  await expect(primeiro).toBeEnabled();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
  await expect(segundo).not.toBeChecked();
  await segundo.click();
  await expect(segundo).toBeChecked();
  const resposta = await page.request.get(
    `/api/frequencias?dia=${diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza")}&turmaId=${turmaId}`,
  );
  expect(resposta.ok()).toBe(true);
  const antes = (await resposta.json()) as { frequencia: { revisao: number; faltas: unknown[] } };
  expect(antes.frequencia.revisao).toBe(1);
  expect(antes.frequencia.faltas).toEqual([]);
  await abrir(page);
  await expect(primeiro).toBeChecked();
  await expect(segundo).toBeChecked();
  await expect(secao.getByText(/Registrado na Seduc por/)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `docs/imagens/locais/seduc-chamada-${test.info().project.name}.png`,
    fullPage: true,
  });

  await secao.getByRole("button", { name: /Desbloquear chamada de E2E Seduc Normal A/ }).click();
  await expect(primeiro).toBeDisabled();
  await secao.getByRole("button", { name: new RegExp(`${prefixo} Um: presente`) }).click();
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(primeiro).toBeEnabled();
  await expect(primeiro).not.toBeChecked();
  await expect(segundo).toBeChecked();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
  await segundo.click();
  await expect(segundo).not.toBeChecked();
  await expect(secao.getByText(/Registrado na Seduc por/)).toHaveCount(1);
});

test("recusa uma confirmação desatualizada e recarrega a versão salva", async ({ page }) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  const primeiro = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Um`,
    exact: true,
  });
  await expect(primeiro).toBeEnabled();
  const resposta = await page.request.get(
    `/api/frequencias?dia=${diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza")}&turmaId=${turmaId}`,
  );
  const dados = (await resposta.json()) as {
    frequencia: { dia: string; revisao: number; alunos: string[] };
  };
  const alteracao = await page.request.post("/api/frequencias", {
    data: {
      dia: dados.frequencia.dia,
      turmaId,
      revisao: dados.frequencia.revisao,
      faltas: [alunoId],
    },
  });
  expect(alteracao.ok()).toBe(true);
  await primeiro.click();
  await expect(
    page.getByText("A chamada mudou. Recarregue e confira antes de confirmar na Seduc."),
  ).toBeVisible();
  await expect(primeiro).toBeEnabled();
  await expect(primeiro).not.toBeChecked();
  await expect(
    secao.getByRole("button", { name: new RegExp(`${prefixo} Um: falta`) }),
  ).toBeVisible();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
});
