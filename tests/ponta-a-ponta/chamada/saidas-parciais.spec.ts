// Saída aparece na Chamada Parcial, com conferência manual e personalização preservada.
import { expect, test } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { diaCorrente, diaDeChamada } from "../helpers/dia";
import {
  aguardarHidratacao,
  prepararChamadaParaSaida,
  salvarFrequenciaParcial,
  trocarVisao,
} from "../helpers/pagina";

test.use({ serviceWorkers: "block" });
const prefixo = "E2E Saída Parcial";
const dia = diaDeChamada();
let turmaId = "";
let alunoId = "";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id=t.serie_id where s.nome=$1)",
      [prefixo],
    );
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
  const criadoEm = `${dia}T12:00:00Z`;
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
          "insert into turmas (nome,serie_id,criado_em) values ('A',$1,$2) returning id",
          [serie, criadoEm],
        )
      ).rows[0]?.id ?? "";
    alunoId =
      (
        await banco.query<{ id: string }>(
          "insert into alunos (nome,turma_id,turma_original_id,ordem,criado_em) values ($1,$2,$2,1,$3) returning id",
          [`${prefixo} Um`, turmaId, criadoEm],
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
  await prepararChamadaParaSaida(page, `${prefixo} A`, dia);
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
  const { saida } = (await criada.json()) as {
    saida: { id: string; origemReferencia: string; turmaHistoricaId: string };
  };
  expect(saida).toMatchObject({
    turmaHistoricaId: turmaId,
    origemReferencia: dia === diaCorrente() ? "MATRICULA_VIGENTE" : "CHAMADA_HISTORICA",
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  const parcial = page.getByRole("region", { name: "Chamada Parcial", exact: true });
  const turma = parcial.getByRole("combobox", { name: "Turma", exact: true });
  await turma.click();
  await page.getByRole("option", { name: `${prefixo} A`, exact: true }).click();
  const linha = parcial.getByTestId(`parcial-aluno-${alunoId}`);
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
  await salvarFrequenciaParcial(editor);
  await expect(linha.getByText("Presente · 1ª à 2ª aula", { exact: true })).toBeVisible();
  await expect(confirmar).not.toBeChecked();
  expect((await page.request.delete(`/api/saidas/${saida.id}`)).status()).toBe(200);
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await turma.click();
  await page.getByRole("option", { name: `${prefixo} A`, exact: true }).click();
  await expect(linha.getByText("Presente · 1ª à 2ª aula", { exact: true })).toBeVisible();
  await expect(
    linha.getByRole("button", { name: `Remover frequência parcial de ${prefixo} Um`, exact: true }),
  ).toBeVisible();
});
