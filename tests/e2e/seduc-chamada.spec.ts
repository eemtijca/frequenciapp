// A Chamada Parcial concentra a confirmação da Seduc e permite personalizar
// a frequência diária sem alterar a chamada salva pela coordenação.
import { expect, test, type Page } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
let turmaId = "";
let alunoId = "";
let segundoAlunoId = "";
const prefixo = "E2E Seduc Normal";
async function limpar() {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from auditoria where alvo like 'chamada:%:aluno:%' and substring(alvo from ':aluno:(.*)$') in (select id::text from alunos where nome like $1)",
      [`${prefixo}%`],
    );
    await cliente.query("delete from frequencias_parciais where aluno_nome like $1", [
      `${prefixo}%`,
    ]);
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
    segundoAlunoId = alunos.rows.find((aluno) => aluno.nome === `${prefixo} Dois`)?.id ?? "";
    await cliente.query(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2), ($1, 2, '07:50', '08:40', $2)",
      [turmaId, [1, 2, 3, 4, 5, 6, 7]],
    );
  });
});
test.beforeEach(async () => {
  await comBanco(async (cliente) => {
    await cliente.query("delete from frequencias_parciais where turma_id = $1", [turmaId]);
    await cliente.query("delete from frequencias where turma_id = $1", [turmaId]);
  });
});
test.afterAll(limpar);
async function abrirChamada(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  if (await secao.getByRole("group", { name: "Turma atual", exact: true }).isVisible())
    await escolherTurmaNaChamada(secao, /E2E Seduc Normal A/);
  await expect(secao.getByText(`${prefixo} Um`, { exact: true })).toBeVisible();
  return secao;
}

async function abrirParcial(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: `${prefixo} A`, exact: true }).click();
  const secao = page.getByTestId("chamada-parcial");
  await expect(secao.getByRole("button", { name: "Atualizar lista", exact: true })).toBeEnabled();
  await expect(secao.getByTestId(`parcial-aluno-${alunoId}`)).toBeVisible();
  return secao;
}

function diaAtual() {
  return diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
}

async function chamadaSalva(page: Page) {
  const resposta = await page.request.get(`/api/frequencias?dia=${diaAtual()}&turmaId=${turmaId}`);
  expect(resposta.ok()).toBe(true);
  return (await resposta.json()) as {
    frequencia: {
      dia: string;
      revisao: number;
      faltas: unknown[];
      confirmacoesSeduc: { alunoId: string; registradoSeduc: boolean }[];
    };
  };
}

test("mostra presença e motivo completo sob o nome, sem selo da origem e sem corte no celular", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const motivo =
    "Comparecimento a compromisso familiar informado pela pessoa responsável, com retorno previsto para o próximo dia letivo.";
  const resposta = await page.request.post("/api/frequencias", {
    data: {
      dia: diaAtual(),
      turmaId,
      revisao: 0,
      faltas: [{ alunoId, justificativa: "O", observacao: motivo }],
    },
  });
  expect(resposta.ok()).toBe(true);
  const secao = await abrirParcial(page);
  const justificada = secao.getByTestId(`parcial-aluno-${alunoId}`);
  const presente = secao.getByTestId(`parcial-aluno-${segundoAlunoId}`);
  await expect(justificada.getByText(`Outros: ${motivo}`, { exact: true })).toBeVisible();
  await expect(presente.getByText("Presente", { exact: true })).toBeVisible();
  await expect(secao.getByText("Chamada", { exact: true })).toHaveCount(0);
  await expect(secao.getByText("Personalizada", { exact: true })).toHaveCount(0);
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await justificada.screenshot({
      path: testInfo.outputPath(`justificativa-parcial-${tema}.png`),
    });
  }
});

test("retira RS da Chamada e confirma a frequência diária na Parcial, preservando os demais ao corrigir", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const chamada = await abrirChamada(page);
  await expect(chamada.getByRole("switch")).toHaveCount(0);
  await chamada.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(chamada.getByText("Chamada bloqueada", { exact: true })).toBeVisible();
  await expect(chamada.getByRole("switch")).toHaveCount(0);

  const secao = await abrirParcial(page);
  const primeiro = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Um`,
    exact: true,
  });
  const segundo = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Dois`,
    exact: true,
  });
  await expect(secao.getByTestId(`parcial-aluno-${alunoId}`).getByText("Presente")).toBeVisible();
  await expect(
    secao.getByTestId(`parcial-aluno-${segundoAlunoId}`).getByText("Presente"),
  ).toBeVisible();
  await expect(primeiro).toBeEnabled();
  await expect(segundo).toBeEnabled();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
  await expect(segundo).not.toBeChecked();
  await segundo.click();
  await expect(segundo).toBeChecked();
  const antes = await chamadaSalva(page);
  expect(antes.frequencia.revisao).toBe(1);
  expect(antes.frequencia.faltas).toEqual([]);
  await abrirParcial(page);
  await expect(primeiro).toBeChecked();
  await expect(segundo).toBeChecked();
  await expect(secao.getByText(/Confirmado por/)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `docs/imagens/locais/seduc-na-parcial-${test.info().project.name}.png`,
    fullPage: true,
  });

  await abrirChamada(page);
  await chamada.getByRole("button", { name: /Desbloquear chamada de E2E Seduc Normal A/ }).click();
  await expect(chamada.getByRole("switch")).toHaveCount(0);
  await chamada.getByRole("button", { name: new RegExp(`${prefixo} Um: presente`) }).click();
  await chamada.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(chamada.getByText("Chamada bloqueada", { exact: true })).toBeVisible();
  await abrirParcial(page);
  await expect(
    secao.getByTestId(`parcial-aluno-${alunoId}`).getByText("Falta", { exact: true }),
  ).toBeVisible();
  await expect(primeiro).toBeEnabled();
  await expect(primeiro).not.toBeChecked();
  await expect(segundo).toBeChecked();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
  await segundo.click();
  await expect(segundo).not.toBeChecked();
  await expect(secao.getByText(/Confirmado por/)).toHaveCount(1);
});

test("recusa na Parcial uma confirmação desatualizada da Chamada e recarrega a versão salva", async ({
  page,
}) => {
  const chamada = await abrirChamada(page);
  await chamada.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(chamada.getByText("Chamada bloqueada", { exact: true })).toBeVisible();
  const secao = await abrirParcial(page);
  const primeiro = secao.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Um`,
    exact: true,
  });
  await expect(primeiro).toBeEnabled();
  const dados = await chamadaSalva(page);
  const alteracao = await page.request.post("/api/frequencias", {
    data: {
      dia: dados.frequencia.dia,
      turmaId,
      revisao: dados.frequencia.revisao,
      faltas: [alunoId],
    },
  });
  expect(alteracao.ok()).toBe(true);
  const conflito = page.waitForResponse(
    (resposta) =>
      resposta.url().endsWith("/api/frequencias/seduc") && resposta.request().method() === "POST",
  );
  await primeiro.click();
  expect((await conflito).status()).toBe(409);
  await expect(
    page.getByText("A chamada mudou. Recarregue e confira antes de confirmar na Seduc."),
  ).toBeVisible();
  await expect(primeiro).toBeEnabled();
  await expect(primeiro).not.toBeChecked();
  await expect(
    secao.getByTestId(`parcial-aluno-${alunoId}`).getByText("Falta", { exact: true }),
  ).toBeVisible();
  await primeiro.click();
  await expect(primeiro).toBeChecked();
});

test("personaliza a frequência diária e confirma a Seduc sem alterar a chamada da coordenação", async ({
  page,
}) => {
  const chamada = await abrirChamada(page);
  await chamada.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(chamada.getByText("Chamada bloqueada", { exact: true })).toBeVisible();
  const secao = await abrirParcial(page);
  const linha = secao.getByTestId(`parcial-aluno-${alunoId}`);
  const confirmacao = linha.getByRole("switch", {
    name: `RS, Registrado na Seduc: ${prefixo} Um`,
    exact: true,
  });
  await expect(linha.getByText("Presente", { exact: true })).toBeVisible();
  await confirmacao.click();
  await expect(confirmacao).toBeChecked();
  const antes = await chamadaSalva(page);
  expect(
    antes.frequencia.confirmacoesSeduc.find((item) => item.alunoId === alunoId)?.registradoSeduc,
  ).toBe(true);

  await linha.getByRole("button", { name: `Editar frequência parcial de ${prefixo} Um` }).click();
  const dialogo = page.getByRole("dialog", { name: "Registrar frequência parcial", exact: true });
  await dialogo.getByRole("radio", { name: "Turno inteiro", exact: true }).click();
  await dialogo.locator("#parcial-turno").click();
  await page.getByRole("option", { name: "Tarde", exact: true }).click();
  await dialogo.getByRole("button", { name: "Salvar frequência parcial", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(linha.getByText("Presente · Tarde", { exact: true })).toBeVisible();
  await expect(confirmacao).not.toBeChecked();
  await confirmacao.click();
  await expect(confirmacao).toBeChecked();
  expect(await chamadaSalva(page)).toEqual(antes);

  await abrirParcial(page);
  await expect(linha.getByText("Presente · Tarde", { exact: true })).toBeVisible();
  await expect(confirmacao).toBeChecked();
  const resposta = await page.request.get(
    `/api/frequencias-parciais?dia=${diaAtual()}&turmaId=${turmaId}`,
  );
  expect(resposta.ok()).toBe(true);
  const dados = (await resposta.json()) as {
    registros: { alunoId: string; tipo: string; turno: string; registradoSeduc: boolean }[];
  };
  expect(dados.registros).toHaveLength(1);
  expect(dados.registros[0]).toMatchObject({
    alunoId,
    tipo: "TURNO",
    turno: "TARDE",
    registradoSeduc: true,
  });
  const lista = await page.request.get(
    `/api/frequencias-personalizadas?dia=${diaAtual()}&turmaId=${turmaId}`,
  );
  expect(lista.ok()).toBe(true);
  const personalizada = (await lista.json()) as {
    registros: { alunoId: string; tipo: string; registradoSeduc: boolean }[];
  };
  expect(personalizada.registros).toHaveLength(2);
  expect(personalizada.registros).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ alunoId, tipo: "TURNO", registradoSeduc: true }),
      expect.objectContaining({ alunoId: segundoAlunoId, tipo: "CHAMADA" }),
    ]),
  );
  await expect(
    secao.getByTestId(`parcial-aluno-${segundoAlunoId}`).getByText("Presente", { exact: true }),
  ).toBeVisible();
  await abrirChamada(page);
  await expect(chamada.getByRole("switch")).toHaveCount(0);
  await expect(
    chamada.getByRole("button", { name: new RegExp(`${prefixo} Um: presente`) }),
  ).toBeVisible();
});
