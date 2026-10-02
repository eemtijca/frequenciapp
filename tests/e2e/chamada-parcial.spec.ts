// Chamada parcial independente, confirmação manual na Seduc e revisão de conflitos.
import { expect, test, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

let turmaId = "";
let alunoId = "";
let segundoAlunoId = "";
let desistenteId = "";
let outraTurmaId = "";

async function limparMassa() {
  await comBanco(async (cliente) => {
    await cliente.query("delete from frequencias_parciais where aluno_nome like 'E2E Parcial %'");
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'E2E Parcial'))",
    );
    await cliente.query("delete from alunos where nome like 'E2E Parcial %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Parcial')",
    );
    await cliente.query("delete from series where nome = 'E2E Parcial'");
  });
}

async function abrirParcial(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: "E2E Parcial A", exact: true }).click();
  const secao = page.getByTestId("chamada-parcial");
  await expect(secao.getByRole("button", { name: "Atualizar lista", exact: true })).toBeEnabled();
  return secao;
}

async function abrirRegistro(page: Page) {
  const secao = await abrirParcial(page);
  await secao
    .getByRole("button", { name: "Registrar frequência parcial de E2E Parcial Um", exact: true })
    .click();
  const dialogo = page.getByRole("dialog", { name: "Registrar frequência parcial", exact: true });
  await expect(dialogo.locator("#parcial-aluno")).toHaveText("E2E Parcial Um");
  return { secao, dialogo };
}

async function registrosDoDia(page: Page) {
  const resposta = await page.request.get(`/api/frequencias-parciais?turmaId=${turmaId}`);
  expect(resposta.ok()).toBe(true);
  return (await resposta.json()) as {
    registros: {
      id: string;
      dia: string;
      revisao: number;
      tipo: string;
      turno: string | null;
      aulas: number[];
      observacao: string | null;
      registradoSeduc: boolean;
      registradoSeducEm: string | null;
    }[];
  };
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ('E2E Parcial', 97) returning id",
    );
    const turma = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serie.rows[0]?.id],
    );
    turmaId = turma.rows[0]?.id ?? "";
    expect(turmaId).not.toBe("");
    const aluno = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Parcial Um', $1, $1, 1, true) returning id",
      [turmaId],
    );
    alunoId = aluno.rows[0]?.id ?? "";
    expect(alunoId).not.toBe("");
    const outraTurma = await cliente.query<{ id: string }>(
      "insert into turmas (serie_id, nome) values ($1, 'B') returning id",
      [serie.rows[0]?.id],
    );
    outraTurmaId = outraTurma.rows[0]?.id ?? "";
    const segundo = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Parcial Dois', $1, $1, 2, true) returning id",
      [turmaId],
    );
    segundoAlunoId = segundo.rows[0]?.id ?? "";
    const desistente = await cliente.query<{ id: string }>(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, desistente_em) values ('E2E Parcial Desistente', $1, $1, 3, true, '2020-01-01') returning id",
      [turmaId],
    );
    desistenteId = desistente.rows[0]?.id ?? "";
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Parcial Inativo', $1, $1, 4, false), ('E2E Parcial Outra Turma', $2, $2, 1, true)",
      [turmaId, outraTurmaId],
    );
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', $2, true), ($1, 2, '07:50', '08:40', $2, true), ($1, 3, '08:40', '09:30', $2, true)",
      [turmaId, [1, 2, 3, 4, 5, 6, 7]],
    );
  });
});

test.beforeEach(async () => {
  await comBanco(async (cliente) => {
    await cliente.query("delete from frequencias_parciais where aluno_nome like 'E2E Parcial %'");
    await cliente.query(
      "update alunos set nome = 'E2E Parcial Um', turma_id = $1, ativo = true where id = $2",
      [turmaId, alunoId],
    );
    await cliente.query("delete from frequencias where turma_id = $1", [turmaId]);
  });
});

test.afterAll(limparMassa);

test("mostra a turma na ordem da chamada antes de salvar e registra diretamente pela linha", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const secao = await abrirParcial(page);
  const linhas = secao.getByRole("listitem");
  await expect(linhas).toHaveCount(3);
  await expect(linhas.nth(0).getByRole("heading")).toHaveText("E2E Parcial Um");
  await expect(linhas.nth(1).getByRole("heading")).toHaveText("E2E Parcial Dois");
  await expect(linhas.nth(0).getByText("01", { exact: true })).toBeVisible();
  await expect(linhas.nth(1).getByText("02", { exact: true })).toBeVisible();
  const primeiro = secao.getByTestId(`parcial-aluno-${alunoId}`);
  const segundo = secao.getByTestId(`parcial-aluno-${segundoAlunoId}`);
  await expect(primeiro.getByRole("switch")).toBeDisabled();
  await expect(segundo.getByRole("switch")).toBeDisabled();
  await expect(
    secao.getByTestId(`parcial-aluno-${desistenteId}`).getByRole("button"),
  ).toBeDisabled();
  await expect(secao.getByText("E2E Parcial Inativo", { exact: true })).toHaveCount(0);
  await expect(secao.getByText("E2E Parcial Outra Turma", { exact: true })).toHaveCount(0);
  expect((await registrosDoDia(page)).registros).toHaveLength(0);
  await page.screenshot({
    path: `docs/imagens/chamada-parcial-lista-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await secao.locator("#parcial-busca").fill("Dois");
  await expect(linhas).toHaveCount(1);
  await expect(segundo).toBeVisible();
  await secao.getByRole("button", { name: "Ver todos", exact: true }).click();
  await expect(linhas).toHaveCount(3);
  await primeiro
    .getByRole("button", { name: "Registrar frequência parcial de E2E Parcial Um" })
    .click();
  const dialogo = page.getByRole("dialog", { name: "Registrar frequência parcial", exact: true });
  await expect(dialogo.locator("#parcial-aluno")).toHaveText("E2E Parcial Um");
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(primeiro.getByRole("switch")).toBeEnabled();
  await expect(segundo.getByRole("switch")).toBeDisabled();
  await expect(linhas).toHaveCount(3);
  expect((await registrosDoDia(page)).registros).toHaveLength(1);

  await secao.locator("#parcial-filtro").click();
  await page.getByRole("option", { name: "Sem frequência parcial", exact: true }).click();
  await expect(primeiro).toBeHidden();
  await expect(segundo).toBeVisible();
  await secao.locator("#parcial-filtro").click();
  await page.getByRole("option", { name: "Pendentes na Seduc", exact: true }).click();
  await expect(linhas).toHaveCount(1);
  await expect(primeiro).toBeVisible();
  await primeiro.getByRole("switch").click();
  await expect(linhas).toHaveCount(0);
  await secao.locator("#parcial-filtro").click();
  await page.getByRole("option", { name: "Registrados na Seduc", exact: true }).click();
  await expect(primeiro.getByRole("switch")).toBeChecked();
});

test("preserva a linha histórica após transferência e desativação do aluno", async ({ page }) => {
  const { dialogo } = await abrirRegistro(page);
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(dialogo).toBeHidden();
  await comBanco((cliente) =>
    cliente.query(
      "update alunos set nome = 'E2E Parcial Nome Atual', turma_id = $1, ativo = false where id = $2",
      [outraTurmaId, alunoId],
    ),
  );
  const secao = await abrirParcial(page);
  const linha = secao.getByTestId(`parcial-aluno-${alunoId}`);
  await expect(linha.getByRole("heading")).toHaveText("E2E Parcial Um");
  await expect(
    linha.getByRole("button", { name: "Editar frequência parcial de E2E Parcial Um" }),
  ).toBeEnabled();
  await expect(linha.getByRole("switch")).toBeEnabled();
  await expect(secao.getByTestId(`parcial-aluno-${segundoAlunoId}`)).toBeVisible();
  await linha.getByRole("button", { name: "Editar frequência parcial de E2E Parcial Um" }).click();
  await expect(page.getByRole("dialog").locator("#parcial-aluno")).toHaveText("E2E Parcial Um");
});

test("confirma a Seduc, mantém a confirmação após recarga e exige novo lançamento após corrigir", async ({
  page,
}) => {
  const { secao, dialogo } = await abrirRegistro(page);
  await dialogo.locator("#parcial-turno").click();
  await page.getByRole("option", { name: "Tarde", exact: true }).click();
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  const linha = secao.getByTestId(`parcial-aluno-${alunoId}`);
  await expect(linha.getByText("Tarde", { exact: true })).toBeVisible();
  const dados = await registrosDoDia(page);
  const parcial = dados.registros[0];
  expect(parcial?.tipo).toBe("TURNO");
  expect(parcial?.aulas).toEqual([]);
  expect(parcial?.registradoSeduc).toBe(false);
  const dia = parcial?.dia ?? "";

  // Uma chamada já salva deve permanecer idêntica depois dos registros parciais.
  const normal = await page.request.post("/api/frequencias", {
    data: { dia, turmaId, faltas: [alunoId], revisao: 0 },
  });
  expect(normal.ok()).toBe(true);
  const antes = await (
    await page.request.get(`/api/frequencias?dia=${dia}&turmaId=${turmaId}`)
  ).json();
  await linha.getByRole("switch", { name: "Registrado na Seduc: E2E Parcial Um" }).click();
  await expect(linha.getByRole("switch")).toBeChecked();
  await expect(linha.getByText(/Confirmado por/)).toBeVisible();
  expect((await registrosDoDia(page)).registros[0]?.registradoSeducEm).not.toBeNull();

  await page.reload();
  await abrirParcial(page);
  await expect(linha.getByRole("switch")).toBeChecked();
  await linha.getByRole("button", { name: "Editar frequência parcial de E2E Parcial Um" }).click();
  const editar = page.getByRole("dialog", { name: "Editar frequência parcial" });
  await editar.getByRole("radio", { name: "Por aulas" }).click();
  for (const aula of [3, 4, 6])
    await editar.getByRole("checkbox", { name: `${aula}ª aula frequentada`, exact: true }).click();
  await expect(
    editar.getByText("A alteração deixará este registro pendente de conferência na Seduc."),
  ).toBeVisible();
  await editar.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(linha.getByRole("switch")).not.toBeChecked();
  await expect(linha.getByText("Aulas 3, 4, 6", { exact: true })).toBeVisible();
  const corrigido = (await registrosDoDia(page)).registros[0];
  expect(corrigido?.aulas).toEqual([3, 4, 6]);
  expect(corrigido?.turno).toBeNull();
  expect(corrigido?.registradoSeducEm).toBeNull();
  const depois = await (
    await page.request.get(`/api/frequencias?dia=${dia}&turmaId=${turmaId}`)
  ).json();
  expect(depois).toEqual(antes);
});

test("marca um intervalo e permite retirar aulas específicas antes de salvar", async ({ page }) => {
  const { secao, dialogo } = await abrirRegistro(page);
  await dialogo.getByRole("radio", { name: "Por aulas" }).click();
  await dialogo.locator("#parcial-aula-inicial").click();
  await page.getByRole("option", { name: "3ª aula", exact: true }).click();
  await dialogo.locator("#parcial-aula-final").click();
  await page.getByRole("option", { name: "5ª aula", exact: true }).click();
  await dialogo.getByRole("button", { name: "Marcar intervalo de aulas" }).click();
  await expect(
    dialogo.getByRole("checkbox", { name: "3ª aula frequentada", exact: true }),
  ).toBeChecked();
  await dialogo.getByRole("checkbox", { name: "4ª aula frequentada", exact: true }).click();
  await dialogo.locator("#parcial-observacao").fill("Presença nas aulas informadas");
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(secao.getByText("Aulas 3, 5", { exact: true })).toBeVisible();
  expect((await registrosDoDia(page)).registros[0]?.aulas).toEqual([3, 5]);
  await page.reload();
  await abrirParcial(page);
  await expect(secao.getByText("Presença nas aulas informadas")).toBeVisible();
});

test("pede confirmação para descartar o rascunho e para remover um registro", async ({ page }) => {
  const { secao, dialogo } = await abrirRegistro(page);
  await dialogo.locator("#parcial-observacao").fill("Rascunho ainda não salvo");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  const descartar = page.getByRole("alertdialog", { name: "Descartar as alterações?" });
  await descartar.getByRole("button", { name: "Continuar editando" }).click();
  await expect(dialogo.locator("#parcial-observacao")).toHaveValue("Rascunho ainda não salvo");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  await descartar.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(dialogo).toBeHidden();
  expect((await registrosDoDia(page)).registros).toHaveLength(0);

  await secao
    .getByRole("button", { name: "Registrar frequência parcial de E2E Parcial Um", exact: true })
    .click();
  await expect(dialogo.locator("#parcial-aluno")).toHaveText("E2E Parcial Um");
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  const linha = secao.getByTestId(`parcial-aluno-${alunoId}`);
  await linha.getByRole("button", { name: "Remover frequência parcial de E2E Parcial Um" }).click();
  const remover = page.getByRole("alertdialog", { name: "Remover a frequência parcial?" });
  await remover.getByRole("button", { name: "Cancelar" }).click();
  await expect(linha).toBeVisible();
  await linha.getByRole("button", { name: "Remover frequência parcial de E2E Parcial Um" }).click();
  await remover.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(linha).toBeVisible();
  await expect(
    linha.getByRole("button", { name: "Registrar frequência parcial de E2E Parcial Um" }),
  ).toBeEnabled();
  await expect(linha.getByRole("switch")).toBeDisabled();
  expect((await registrosDoDia(page)).registros).toHaveLength(0);
});

test("mantém a edição local em um conflito e carrega a versão salva antes de corrigir", async ({
  page,
}) => {
  const { secao, dialogo } = await abrirRegistro(page);
  await dialogo.getByRole("button", { name: "Salvar frequência parcial" }).click();
  const linha = secao.getByTestId(`parcial-aluno-${alunoId}`);
  await linha.getByRole("button", { name: "Editar frequência parcial de E2E Parcial Um" }).click();
  const editar = page.getByRole("dialog", { name: "Editar frequência parcial" });
  await editar.locator("#parcial-observacao").fill("Edição deste aparelho");
  const vigente = (await registrosDoDia(page)).registros[0];
  const concorrente = await page.request.post("/api/frequencias-parciais", {
    data: {
      alunoId,
      turmaId,
      dia: vigente?.dia,
      revisao: vigente?.revisao,
      tipo: "TURNO",
      turno: "TARDE",
      observacao: "Edição salva em outro aparelho",
    },
  });
  expect(concorrente.ok()).toBe(true);
  await editar.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(
    editar.getByText("Este registro mudou. Recarregue a lista antes de corrigir."),
  ).toBeVisible();
  await expect(editar.locator("#parcial-observacao")).toHaveValue("Edição deste aparelho");
  await expect(editar.getByRole("button", { name: "Salvar frequência parcial" })).toBeDisabled();
  await editar.getByRole("button", { name: "Carregar versão salva" }).click();
  await expect(editar.locator("#parcial-observacao")).toHaveValue("Edição salva em outro aparelho");
  await editar.locator("#parcial-observacao").fill("Correção após a conferência");
  await editar.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await expect(linha.getByText("Correção após a conferência")).toBeVisible();
  expect((await registrosDoDia(page)).registros[0]?.turno).toBe("TARDE");
});

test("refaz a prévia ao incluir atualizações de registros já enviados", async ({ page }) => {
  await page.route("**/api/planilha-parcial/estado", (rota) =>
    rota.fulfill({
      json: {
        podeEnviar: true,
        planilhaNome: "Terceira planilha de teste",
        aba: "Chamada Parcial",
      },
    }),
  );
  let atualizacoes = false;
  let simulacoes = 0;
  await page.route("**/api/planilha-parcial/simular", async (rota) => {
    atualizacoes = (rota.request().postDataJSON() as { atualizarExistentes: boolean })
      .atualizarExistentes;
    simulacoes++;
    await rota.fulfill({
      json: {
        aba: "Chamada Parcial",
        assinatura: "estrutura",
        bloqueado: !atualizacoes,
        criar: [],
        novas: 0,
        existentes: 1,
        divergentes: 1,
        pendentesManuais: 0,
        avisos: [],
        planoHash: atualizacoes ? "b".repeat(64) : "a".repeat(64),
        atualizar: atualizacoes
          ? [
              {
                linha: 2,
                nome: "E2E Parcial Um",
                codigo: "registro",
                anteriores: [
                  "02/10/2026",
                  "E2E Parcial Um",
                  "E2E Parcial A",
                  "Tarde",
                  "Não",
                  "",
                  "Observação anterior",
                  "registro",
                  "1",
                ],
                celulas: [
                  { coluna: 5, valor: "Sim" },
                  { coluna: 6, valor: "2026-10-02T18:30:00.000Z" },
                  { coluna: 7, valor: "Observação conferida" },
                  { coluna: 9, valor: "2" },
                ],
              },
            ]
          : [],
        atualizacoes: atualizacoes ? 1 : 0,
      },
    });
  });
  let corpoEnviado: Record<string, unknown> | null = null;
  await page.route("**/api/planilha-parcial/enviar", async (rota) => {
    corpoEnviado = rota.request().postDataJSON() as Record<string, unknown>;
    await rota.fulfill({ json: { resultado: "sucesso", linhasCriadas: 0, linhasAtualizadas: 1 } });
  });
  const secao = await abrirParcial(page);
  await secao.getByRole("button", { name: "Enviar para planilha" }).click();
  const enviar = page.getByRole("dialog", { name: "Enviar chamada parcial" });
  await enviar.getByRole("button", { name: "Conferir envio" }).click();
  await expect(enviar.getByRole("button", { name: "Confirmar envio" })).toBeDisabled();
  await enviar.getByRole("switch", { name: "Atualizar registros já enviados" }).click();
  await expect(enviar.getByRole("button", { name: "Conferir envio" })).toBeVisible();
  await enviar.getByRole("button", { name: "Conferir envio" }).click();
  await expect(enviar.getByText("0 novos · 1 atualizações · 1 já enviados")).toBeVisible();
  const previa = enviar.getByRole("region", { name: "Prévia da chamada parcial" });
  await expect(previa.getByRole("cell", { name: "02/10/2026", exact: true })).toBeVisible();
  await expect(previa.getByRole("cell", { name: "Tarde", exact: true })).toBeVisible();
  const alteracoes = previa.getByRole("table", {
    name: "Campos alterados de E2E Parcial Um",
    exact: true,
  });
  const seduc = alteracoes
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Registrado na Seduc", exact: true }) });
  await expect(seduc.getByRole("cell", { name: "Não", exact: true })).toBeVisible();
  await expect(seduc.getByRole("cell", { name: "Sim", exact: true })).toBeVisible();
  const observacao = alteracoes
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Observação", exact: true }) });
  await expect(
    observacao.getByRole("cell", { name: "Observação anterior", exact: true }),
  ).toBeVisible();
  await expect(
    observacao.getByRole("cell", { name: "Observação conferida", exact: true }),
  ).toBeVisible();
  const confirmacao = alteracoes
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Confirmação Seduc", exact: true }) });
  await expect(confirmacao.getByRole("cell", { name: "Vazio", exact: true })).toBeVisible();
  await expect(
    confirmacao.getByRole("cell", { name: "2026-10-02T18:30:00.000Z", exact: true }),
  ).toBeVisible();
  await expect(previa.getByRole("rowheader", { name: "Código", exact: true })).toHaveCount(0);
  await expect(previa.getByRole("rowheader", { name: "Revisão", exact: true })).toHaveCount(0);
  await enviar.getByRole("button", { name: "Confirmar envio" }).click();
  await expect(enviar).toBeHidden();
  expect(simulacoes).toBe(2);
  expect(corpoEnviado).toMatchObject({ atualizarExistentes: true, planoHash: "b".repeat(64) });
});
