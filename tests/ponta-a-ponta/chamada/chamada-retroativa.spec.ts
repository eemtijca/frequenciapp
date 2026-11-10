// Chamada retroativa sem composição comprovada: confirmação com motivo,
// cancelamento sem gravação e auditoria na mesma transação. Dados sintéticos.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaLocal, diaSeguinte } from "@/domain/frequencia";
import { procurarDia } from "../../helpers/calendario-fixture";
import { lerFeriados } from "../../helpers/feriados-banco";
import { comBanco } from "../helpers/banco";
import {
  aguardarHidratacao,
  escolherDataNoPeriodo,
  escolherTurmaNaChamada,
  trocarVisao,
} from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

const SERIE = "E2E Retroativa";
let turmaId = "";
let alunoId = "";
let dia = "";

async function limparMassa(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
      [SERIE],
    );
    await cliente.query("delete from alunos where nome = 'E2E Retroativa Aluna'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [SERIE],
    );
    await cliente.query("delete from series where nome = $1", [SERIE]);
  });
}

async function abrirChamada(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  // Com uma única turma visível, o seletor de turmas não é renderizado e a
  // chamada já abre nela.
  if (await grupo.getByRole("button", { name: "Turmas", exact: true }).count()) {
    await escolherTurmaNaChamada(secao, new RegExp(`^${SERIE} A$`));
  }
  await expect(secao.getByRole("button", { name: /^E2E Retroativa Aluna:/ })).toBeVisible();
  await escolherDataNoPeriodo(page, "Data da chamada", dia);
  return secao;
}

async function pedirSalvamento(page: Page, secao: Locator) {
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  const resumo = page.getByRole("alertdialog", { name: "Salvar chamada?", exact: true });
  await expect(resumo).toBeVisible();
  await resumo.getByRole("button", { name: "Salvar chamada", exact: true }).click();
  const historica = page.getByRole("alertdialog", {
    name: "Confirmar chamada histórica?",
    exact: true,
  });
  await expect(historica).toBeVisible();
  return historica;
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    dia = procurarDia(diaSeguinte(hoje, -1), -1, [1, 2, 3, 4, 5], await lerFeriados(cliente), 365);
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 96) returning id",
      [SERIE],
    );
    const turma = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serie.rows[0]?.id],
    );
    turmaId = turma.rows[0]?.id ?? "";
    const aluna = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Retroativa Aluna', $1, $1, 1, true) returning id",
      [turmaId],
    );
    alunoId = aluna.rows[0]?.id ?? "";
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', array[1,2,3,4,5], true)",
      [turmaId],
    );
  });
});

test.afterAll(limparMassa);

test("cancela ou confirma a chamada histórica e registra o motivo na auditoria", async ({
  page,
}) => {
  const secao = await abrirChamada(page);
  await secao.getByRole("button", { name: /^E2E Retroativa Aluna:/ }).click();

  let historica = await pedirSalvamento(page, secao);
  await historica.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(historica).toBeHidden();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  const antes = await comBanco((cliente) =>
    cliente.query("select 1 from frequencias where turma_id = $1 and dia = $2", [turmaId, dia]),
  );
  expect(antes.rowCount).toBe(0);

  historica = await pedirSalvamento(page, secao);
  await historica.getByLabel("Motivo").fill("Chamada do diário de papel");
  await historica.getByRole("button", { name: "Confirmar e salvar", exact: true }).click();
  await expect(historica).toBeHidden();
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible({
    timeout: 15_000,
  });

  const auditoria = await comBanco(async (cliente) => {
    const resultado = await cliente.query<{
      tipo: string;
      motivo: string;
      dia: string;
      alunos_snapshot: string[];
    }>(
      "select tipo, motivo, to_char(dia, 'YYYY-MM-DD') as dia, alunos_snapshot from confirmacoes_historicas where turma_id = $1 and dia = $2",
      [turmaId, dia],
    );
    return resultado.rows;
  });
  expect(auditoria).toEqual([
    {
      tipo: "CHAMADA_RETROATIVA",
      motivo: "Chamada do diário de papel",
      dia,
      alunos_snapshot: [alunoId],
    },
  ]);
});
