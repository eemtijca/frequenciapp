// Presenças recuperadas aparecem na Grade e na resposta da Chamada em qualquer largura.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, escolherTurmaNaGrade, trocarVisao } from "../helpers/pagina";

const nomes = {
  serie: "E2E Histórico de presenças",
  presente: "E2E Histórico Presente",
  movido: "E2E Histórico Remanejado",
  faltoso: "E2E Histórico Ausente",
};
let turmaId: string;
let presentes: string[];

async function limpar() {
  await comBanco(async (cliente) => {
    const frequencias = await cliente.query<{ id: string }>(
      "SELECT id FROM frequencias WHERE turma_id IN (SELECT id FROM turmas WHERE serie_id IN (SELECT id FROM series WHERE nome=$1))",
      [nomes.serie],
    );
    await cliente.query("DELETE FROM auditoria WHERE alvo=ANY($1::text[])", [
      frequencias.rows.map((item) => `frequencia:${item.id}`),
    ]);
    await cliente.query("DELETE FROM frequencias WHERE id=ANY($1::uuid[])", [
      frequencias.rows.map((item) => item.id),
    ]);
    await cliente.query("DELETE FROM alunos WHERE nome=ANY($1::text[])", [
      [nomes.presente, nomes.movido, nomes.faltoso],
    ]);
    await cliente.query(
      "DELETE FROM turmas WHERE serie_id IN (SELECT id FROM series WHERE nome=$1)",
      [nomes.serie],
    );
    await cliente.query("DELETE FROM series WHERE nome=$1", [nomes.serie]);
  });
}

test.beforeEach(async () => {
  await limpar();
  await comBanco(async (cliente) => {
    const corte = await cliente.query<{ started_at: Date }>(
      "SELECT started_at FROM _prisma_migrations WHERE migration_name='20260928124039_lista_da_chamada' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    const limite = corte.rows[0]?.started_at;
    if (!limite) throw new Error("Migração da lista histórica ausente na base de testes.");
    const cadastrado = new Date(limite.getTime() - 120_000);
    const salvamento = new Date(limite.getTime() - 60_000);
    const serie = await cliente.query<{ id: string }>(
      "INSERT INTO series (nome,ordem) VALUES ($1,96) RETURNING id",
      [nomes.serie],
    );
    const turma = await cliente.query<{ id: string }>(
      "INSERT INTO turmas (serie_id,nome) VALUES ($1,'A'),($1,'B') RETURNING id,nome",
      [serie.rows[0]?.id],
    );
    const a = turma.rows[0]?.id;
    const b = turma.rows[1]?.id;
    if (!a || !b) throw new Error("Turmas históricas de teste não foram criadas.");
    turmaId = a;
    const alunos = await cliente.query<{ id: string; nome: string }>(
      `INSERT INTO alunos (nome,turma_id,turma_original_id,ordem,criado_em)
       VALUES ($1,$4,$4,1,$6),($2,$5,$4,2,$6),($3,$4,$4,3,$6) RETURNING id,nome`,
      [nomes.presente, nomes.movido, nomes.faltoso, a, b, cadastrado],
    );
    presentes = alunos.rows.filter((item) => item.nome !== nomes.faltoso).map((item) => item.id);
    const faltoso = alunos.rows.find((item) => item.nome === nomes.faltoso)?.id;
    const aula = await cliente.query<{ id: string }>(
      "INSERT INTO horarios (turma_id,ordem,inicio,fim,dias_semana) VALUES ($1,1,'07:00','07:50',ARRAY[1,2,3,4,5]) RETURNING id",
      [a],
    );
    const chamada = await cliente.query<{ id: string }>(
      "INSERT INTO frequencias (turma_id,dia,atualizado_em) VALUES ($1,'2026-09-15',$2) RETURNING id",
      [a, salvamento],
    );
    await cliente.query("INSERT INTO alunos_chamada (frequencia_id,aluno_id) VALUES ($1,$2)", [
      chamada.rows[0]?.id,
      faltoso,
    ]);
    await cliente.query(
      "INSERT INTO faltas (frequencia_id,aluno_id,horario_id) VALUES ($1,$2,$3)",
      [chamada.rows[0]?.id, faltoso, aula.rows[0]?.id],
    );
    await cliente.query("INSERT INTO aulas_chamada (frequencia_id,horario_id) VALUES ($1,$2)", [
      chamada.rows[0]?.id,
      aula.rows[0]?.id,
    ]);
  });
});
test.afterEach(limpar);

test("restaura os pontos verdes sem salvar novamente nem apagar faltas", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Grade", exact: true }).click();
  const grade = page.getByRole("region", { name: "Grade de frequência" });
  await escolherTurmaNaGrade(page, new RegExp(`${nomes.serie} A`));
  await grade.locator("#mes-grade").click();
  await page
    .getByRole("dialog", { name: "Mês da consulta" })
    .getByRole("button", { name: "Setembro", exact: true })
    .click();
  await expect(
    grade.getByRole("img", { name: `${nomes.presente} sem frequência em 2026-09-15`, exact: true }),
  ).toBeAttached();

  await comBanco(async (cliente) => {
    await cliente.query(
      await readFile(
        "prisma/migrations/20261013224456_recupera_lista_chamadas_antigas/migration.sql",
        "utf8",
      ),
    );
  });
  await page.getByRole("button", { name: "Atualizar tela", exact: true }).first().click();
  for (const nome of [nomes.presente, nomes.movido]) {
    await expect(
      grade.getByRole("img", { name: `${nome} presente em 2026-09-15`, exact: true }),
    ).toBeVisible();
    await expect(
      grade.getByRole("img", { name: `${nome} sem frequência em 2026-09-23`, exact: true }),
    ).toBeAttached();
  }
  await expect(
    grade.getByRole("img", { name: `${nomes.faltoso} com falta em 2026-09-15`, exact: true }),
  ).toHaveText("F");
  const resposta = await page.request.get(`/api/frequencias?turmaId=${turmaId}&dia=2026-09-15`);
  expect(resposta.status()).toBe(200);
  const { frequencia } = (await resposta.json()) as {
    frequencia: { alunos: string[]; faltas: unknown[]; revisao: number };
  };
  expect(frequencia.alunos).toEqual(expect.arrayContaining(presentes));
  expect(frequencia.faltas).toHaveLength(1);
  expect(frequencia.revisao).toBe(2);
});
