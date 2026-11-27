// Provas específicas: a coordenação cadastra uma prova no domingo, escolhe os alunos, marca presente e ausente,
// confere as contagens depois de recarregar e remove a prova com confirmação.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { abrirNovaProva, abrirProvas } from "./helpers-provas";

test.use({
  serviceWorkers: "block",
  storageState: "tests/ponta-a-ponta/.auth/coordenacao.json",
});
const serie = "E2E Provas Específicas";
const prova = "E2E Enem";
const alunos = ["E2E Prova Ana", "E2E Prova Bruno", "E2E Prova Carla"];
const origem = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from provas_especificas where nome like 'E2E %'");
    await banco.query("delete from alunos where nome like 'E2E Prova %'");
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [serie],
    );
    await banco.query("delete from series where nome = $1", [serie]);
  });
}

test.beforeAll(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serieId = (
      await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 92) returning id",
        [serie],
      )
    ).rows[0]?.id;
    const turmaId = (
      await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ('A', $1) returning id",
        [serieId],
      )
    ).rows[0]?.id;
    for (const [indice, nome] of alunos.entries()) {
      await banco.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3)",
        [nome, turmaId, indice + 1],
      );
    }
  });
});

test.afterAll(limpar);

async function idDoAluno(nome: string): Promise<string> {
  const id = await comBanco(async (banco) => {
    const resposta = await banco.query<{ id: string }>("select id from alunos where nome = $1", [
      nome,
    ]);
    return resposta.rows[0]?.id;
  });
  expect(id).toBeTruthy();
  return id ?? "";
}

async function criarProvaComAlunos(page: Page, nome: string, alunoIds: string[]): Promise<string> {
  const criada = await page.request.post("/api/provas", {
    headers: { Origin: origem, "Content-Type": "application/json" },
    data: { nome, dia: "2026-11-30" },
  });
  expect(criada.status()).toBe(201);
  const { prova: nova } = (await criada.json()) as { prova: { id: string } };
  const inscrita = await page.request.put(`/api/provas/${nova.id}/participantes`, {
    headers: { Origin: origem, "Content-Type": "application/json" },
    data: { alunoIds },
  });
  expect(inscrita.status()).toBe(200);
  return nova.id;
}

test("cadastra a prova, inscreve os alunos, marca a frequência e remove a prova", async ({
  page,
}) => {
  const cadastro = await abrirNovaProva(page, prova);
  await cadastro.getByRole("textbox", { name: "Local da prova (opcional)" }).fill("Escola Central");
  await cadastro.getByRole("spinbutton", { name: "Dia" }).fill("08");
  await cadastro.getByRole("spinbutton", { name: "Mês" }).fill("11");
  await cadastro.getByRole("spinbutton", { name: "Ano" }).fill("2026");
  await cadastro.getByRole("button", { name: "Cadastrar prova" }).click();
  await expect(page.getByRole("heading", { name: prova })).toBeVisible();
  await expect(page.getByText(/Domingo, 08\/11\/2026/)).toBeVisible();
  await expect(page.getByText("Nenhum aluno nesta prova")).toBeVisible();

  await page.getByRole("button", { name: "Adicionar alunos" }).click();
  const escolha = page.getByRole("dialog", { name: "Alunos da prova" });
  await escolha.getByRole("searchbox").fill("E2E Prova");
  for (const nome of alunos) await escolha.getByRole("checkbox", { name: nome }).check();
  await expect(escolha.getByText("3 alunos escolhidos")).toBeVisible();
  await escolha.getByRole("button", { name: "Salvar alunos" }).click();
  await expect(escolha).toBeHidden();
  await expect(page.getByText("3 alunos", { exact: true })).toBeVisible();
  await expect(page.getByText("0 presentes")).toBeVisible();
  await expect(page.getByText("0 ausentes")).toBeVisible();
  await expect(page.getByText("3 sem registro")).toBeVisible();

  const ana = page.getByRole("group", { name: "Frequência de E2E Prova Ana" });
  const bruno = page.getByRole("group", { name: "Frequência de E2E Prova Bruno" });
  await ana.getByRole("button", { name: "Presente" }).click();
  await bruno.getByRole("button", { name: "Ausente" }).click();
  await expect(ana.getByRole("button", { name: "Presente" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("1 presente")).toBeVisible();
  await expect(page.getByText("1 ausente")).toBeVisible();
  await expect(page.getByText("1 sem registro")).toBeVisible();

  // Tocar de novo no botão marcado limpa o registro.
  await bruno.getByRole("button", { name: "Ausente" }).click();
  await expect(bruno.getByRole("button", { name: "Ausente" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByText("2 sem registro")).toBeVisible();

  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Provas", "provas");
  await page.getByText(prova).first().click();
  await expect(
    page
      .getByRole("group", { name: "Frequência de E2E Prova Ana" })
      .getByRole("button", { name: "Presente" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Remover" }).click();
  await page
    .getByRole("alertdialog", { name: "Remover a prova?" })
    .getByRole("button", { name: "Remover prova" })
    .click();
  await expect(page.getByRole("heading", { name: "Provas", exact: true })).toBeVisible();
  await expect(page.getByText(prova)).toHaveCount(0);
});

test("serializa a frequência e preserva a marca anterior quando uma gravação falha", async ({
  page,
}) => {
  const anaId = await idDoAluno("E2E Prova Ana");
  const brunoId = await idDoAluno("E2E Prova Bruno");
  await criarProvaComAlunos(page, "E2E Corrida Falha", [anaId, brunoId]);
  await abrirProvas(page);
  await page.getByText("E2E Corrida Falha").first().click();

  const ana = page.getByRole("group", { name: "Frequência de E2E Prova Ana" });
  const bruno = page.getByRole("group", { name: "Frequência de E2E Prova Bruno" });
  await bruno.getByRole("button", { name: "Presente" }).click();
  await expect(bruno.getByRole("button", { name: "Presente" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  let liberarFalha = () => {};
  const falha = new Promise<void>((resolver) => {
    liberarFalha = resolver;
  });
  let chegou = () => {};
  const requisicaoChegou = new Promise<void>((resolver) => {
    chegou = resolver;
  });
  await page.route("**/api/provas/*/frequencia", async (rota) => {
    const corpo = rota.request().postDataJSON() as {
      marcas?: Array<{ alunoId?: string }>;
    };
    if (corpo.marcas?.some((marca) => marca.alunoId === anaId)) {
      chegou();
      await falha;
      await rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha simulada." }),
      });
      return;
    }
    await rota.continue();
  });

  await ana.getByRole("button", { name: "Presente" }).click();
  await requisicaoChegou;
  await expect(bruno.getByRole("button", { name: "Presente" })).toBeDisabled();
  liberarFalha();

  await expect(ana.getByRole("button", { name: "Presente" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(bruno.getByRole("button", { name: "Presente" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("não deixa uma resposta atrasada trocar a prova aberta", async ({ page }) => {
  const anaId = await idDoAluno("E2E Prova Ana");
  const brunoId = await idDoAluno("E2E Prova Bruno");
  await criarProvaComAlunos(page, "E2E Corrida A", [anaId]);
  await criarProvaComAlunos(page, "E2E Corrida B", [brunoId]);
  await abrirProvas(page);
  await page.getByText("E2E Corrida A").first().click();

  let liberar = () => {};
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  let chegou = () => {};
  const requisicaoChegou = new Promise<void>((resolver) => {
    chegou = resolver;
  });
  await page.route("**/api/provas/*/frequencia", async (rota) => {
    const corpo = rota.request().postDataJSON() as {
      marcas?: Array<{ alunoId?: string }>;
    };
    if (corpo.marcas?.some((marca) => marca.alunoId === anaId)) {
      chegou();
      await espera;
      await rota.continue();
      return;
    }
    await rota.continue();
  });

  await page
    .getByRole("group", { name: "Frequência de E2E Prova Ana" })
    .getByRole("button", { name: "Presente" })
    .click();
  await requisicaoChegou;
  await page.getByRole("button", { name: "Todas as provas" }).click();
  await page.getByText("E2E Corrida B").first().click();
  await expect(page.getByRole("heading", { name: "E2E Corrida B" })).toBeVisible();

  const respostaA = page.waitForResponse((resposta) => resposta.url().includes("/frequencia"));
  liberar();
  await respostaA;

  await expect(page.getByRole("heading", { name: "E2E Corrida B" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Frequência de E2E Prova Ana" })).toHaveCount(0);
});
