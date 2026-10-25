// Saída aparece na Chamada Parcial, com conferência manual e personalização preservada.
import { expect, test } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { diaDeChamada } from "../helpers/dia";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });
const prefixo = "E2E Saída Parcial";
const dia = diaDeChamada();
let turmaId = "";
let alunoId = "";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from alunos where nome=$1", [`${prefixo} Um`]);
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome=$1)",
      [prefixo],
    );
    await banco.query("delete from series where nome=$1", [prefixo]);
    await banco.query("delete from liberadores where codigo='QASPAR'");
  });
}

test.beforeAll(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serie = (
      await banco.query<{ id: string }>(
        "insert into series (nome,ordem) values ($1,96) returning id",
        [prefixo],
      )
    ).rows[0]?.id;
    turmaId =
      (
        await banco.query<{ id: string }>(
          "insert into turmas (nome,serie_id) values ('A',$1) returning id",
          [serie],
        )
      ).rows[0]?.id ?? "";
    alunoId =
      (
        await banco.query<{ id: string }>(
          "insert into alunos (nome,turma_id,turma_original_id,ordem) values ($1,$2,$2,1) returning id",
          [`${prefixo} Um`, turmaId],
        )
      ).rows[0]?.id ?? "";
    await banco.query(
      "insert into horarios (turma_id,ordem,inicio,fim,dias_semana) values ($1,1,'07:00','07:50',array[1,2,3,4,5,6]),($1,2,'07:50','08:40',array[1,2,3,4,5,6]),($1,3,'13:00','13:50',array[1,2,3,4,5,6])",
      [turmaId],
    );
    await banco.query(
      "insert into liberadores (codigo,rotulo) values ('QASPAR','QA Coordenação saída parcial')",
    );
  });
});
test.afterAll(limpar);

test("migra a saída, confirma na Seduc e preserva a edição após remover a origem", async ({
  page,
  isMobile,
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 720 });
  await comBanco((banco) =>
    banco.query("delete from frequencias_parciais where aluno_id=$1", [alunoId]),
  );
  const criada = await page.request.post("/api/saidas", {
    data: {
      alunoId,
      dia,
      momento: "aula_2",
      horario: "08:10",
      texto: "QA Atendimento externo",
      liberadoPorCodigo: "QASPAR",
    },
  });
  expect(criada.status()).toBe(201);
  const { saida } = (await criada.json()) as { saida: { id: string } };
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: `${prefixo} A`, exact: true }).click();
  const linha = page.getByTestId(`parcial-aluno-${alunoId}`);
  await expect(linha.getByText("Presente · 1ª aula", { exact: true })).toBeVisible();
  const confirmar = linha.getByRole("switch", {
    name: `Registro na Seduc: ${prefixo} Um`,
    exact: true,
  });
  await expect(confirmar).not.toBeChecked();
  await linha.screenshot({ path: test.info().outputPath("saida-na-chamada-parcial.png") });
  await confirmar.click();
  await expect(confirmar).toBeChecked();
  await expect(linha.getByRole("status")).toContainText("Confirmado por");
  await linha
    .getByRole("button", { name: `Editar frequência parcial de ${prefixo} Um`, exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: /frequência parcial/ });
  await expect(
    editor.getByRole("checkbox", { name: "1ª aula frequentada", exact: true }),
  ).toBeChecked();
  await editor.getByRole("checkbox", { name: "2ª aula frequentada", exact: true }).click();
  await editor.getByRole("button", { name: "Salvar frequência parcial", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(linha.getByText("Presente · 1ª à 2ª aula", { exact: true })).toBeVisible();
  await expect(confirmar).not.toBeChecked();
  expect((await page.request.delete(`/api/saidas/${saida.id}`)).status()).toBe(200);
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: `${prefixo} A`, exact: true }).click();
  await expect(linha.getByText("Presente · 1ª à 2ª aula", { exact: true })).toBeVisible();
  await expect(
    linha.getByRole("button", { name: `Remover frequência parcial de ${prefixo} Um`, exact: true }),
  ).toBeVisible();
});
