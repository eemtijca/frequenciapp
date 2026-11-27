// Mapa do local da prova: GPS simulado, toque no mapa, coordenadas digitadas, GPS negado, remoção do ponto
// e tiles pedidos só ao OpenStreetMap, interceptados para o teste não depender da rede nem sobrecarregar o servidor público.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { abrirNovaProva } from "./helpers-provas";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const posicao = { latitude: -3.7319, longitude: -38.5267, accuracy: 18 };

test.use({
  serviceWorkers: "block",
  storageState: "tests/ponta-a-ponta/.auth/coordenacao.json",
});

const serie = "E2E Mapa Série";
const alunosDoMapa = ["E2E Mapa Aluno 1", "E2E Mapa Aluno 2", "E2E Mapa Aluno 3"];

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from provas_especificas where nome like 'E2E Mapa %'");
    await banco.query("delete from alunos where nome like 'E2E Mapa Aluno %'");
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
        "insert into series (nome, ordem) values ($1, 91) returning id",
        [serie],
      )
    ).rows[0]?.id;
    const turmaId = (
      await banco.query<{ id: string }>(
        "insert into turmas (nome, serie_id) values ('A', $1) returning id",
        [serieId],
      )
    ).rows[0]?.id;
    for (const [indice, nome] of alunosDoMapa.entries()) {
      await banco.query(
        "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $2, $2, $3)",
        [nome, turmaId, indice + 1],
      );
    }
  });
});
test.afterAll(limpar);

interface Observacao {
  tiles: string[];
  violacoes: string[];
}

/** Intercepta os tiles e anota pedidos externos e violações de política do navegador. */
async function observar(page: Page): Promise<Observacao> {
  const observacao: Observacao = { tiles: [], violacoes: [] };
  await page.route(/^https:\/\/tile\.openstreetmap\.org\//, (rota) => {
    observacao.tiles.push(new URL(rota.request().url()).host);
    return rota.fulfill({ contentType: "image/png", body: PNG_1X1 });
  });
  page.on("console", (mensagem) => {
    if (/Content Security Policy|Permissions policy/i.test(mensagem.text())) {
      observacao.violacoes.push(mensagem.text());
    }
  });
  return observacao;
}

test("marca o local pelo GPS, ajusta no mapa, salva, mostra o link e remove o ponto", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(posicao);
  const observacao = await observar(page);
  const cadastro = await abrirNovaProva(page, "E2E Mapa GPS");
  await expect.poll(() => observacao.tiles.length).toBe(0);

  await cadastro.getByRole("button", { name: "Marcar no mapa" }).click();
  const mapa = page.getByRole("dialog", { name: "Local da prova no mapa" });
  const area = mapa.getByRole("group", { name: "Mapa do local da prova" });
  await expect(area).toBeVisible();
  await expect(mapa.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  await expect(mapa.getByRole("button", { name: "Usar este local" })).toBeDisabled();

  await mapa.getByRole("button", { name: "Usar minha localização" }).click();
  await expect(mapa.getByText(/Posição lida com precisão de cerca de 18 m/)).toBeVisible();
  await expect(mapa.getByRole("textbox", { name: "Latitude" })).toHaveValue("-3,731900");
  await expect(mapa.getByRole("textbox", { name: "Longitude" })).toHaveValue("-38,526700");
  const pino = area.getByTitle("Local da prova");
  await expect(pino).toBeVisible();

  // Arrastar o marcador escolhe outro ponto e atualiza os campos.
  const caixaPino = await pino.boundingBox();
  if (!caixaPino) throw new Error("O pino não tem caixa de layout.");
  await page.mouse.move(caixaPino.x + caixaPino.width / 2, caixaPino.y + caixaPino.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    caixaPino.x + caixaPino.width / 2 + 48,
    caixaPino.y + caixaPino.height / 2 + 24,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(mapa.getByRole("textbox", { name: "Latitude" })).not.toHaveValue("-3,731900");

  // Tocar em outro ponto move o marcador e muda os campos.
  const caixa = await area.boundingBox();
  if (!caixa) throw new Error("O mapa não tem caixa de layout.");
  await page.mouse.click(caixa.x + caixa.width * 0.7, caixa.y + caixa.height * 0.3);
  await expect(mapa.getByRole("textbox", { name: "Latitude" })).not.toHaveValue("-3,731900");

  // Coordenadas digitadas valem como o toque; o ponto exato fica estável.
  await mapa.getByRole("textbox", { name: "Latitude" }).fill("-3,7319");
  await mapa.getByRole("textbox", { name: "Longitude" }).fill("-38,5267");
  await mapa.getByRole("button", { name: "Usar este local" }).click();
  await expect(mapa).toBeHidden();
  await expect(cadastro.getByText("Marcado em -3,731900, -38,526700.")).toBeVisible();

  await cadastro.getByRole("button", { name: "Cadastrar prova" }).click();
  await expect(page.getByRole("heading", { name: "E2E Mapa GPS" })).toBeVisible();
  await expect(page.getByText("Local no mapa: -3,731900, -38,526700")).toBeVisible();
  const link = page.getByRole("link", { name: /Abrir no OpenStreetMap/ });
  await expect(link).toHaveAttribute(
    "href",
    /openstreetmap\.org\/\?mlat=-3\.731900&mlon=-38\.526700/,
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  const gravado = await comBanco(async (banco) =>
    banco.query("select latitude, longitude from provas_especificas where nome = 'E2E Mapa GPS'"),
  );
  expect(gravado.rows).toEqual([{ latitude: -3.7319, longitude: -38.5267 }]);

  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Provas", "provas");
  await page.getByText("E2E Mapa GPS").first().click();
  await expect(page.getByText("Local no mapa: -3,731900, -38,526700")).toBeVisible();

  // Editar: o mapa abre no ponto salvo e o botão remove o local do mapa.
  await page.getByRole("button", { name: "Editar" }).click();
  const edicao = page.getByRole("dialog", { name: "Editar prova" });
  await expect(edicao.getByText("Marcado em -3,731900, -38,526700.")).toBeVisible();
  await edicao.getByRole("button", { name: "Alterar no mapa" }).click();
  const mapaDaEdicao = page.getByRole("dialog", { name: "Local da prova no mapa" });
  await expect(mapaDaEdicao.getByRole("textbox", { name: "Latitude" })).toHaveValue("-3,731900");
  await mapaDaEdicao.getByRole("button", { name: "Remover local do mapa" }).click();
  await expect(edicao.getByText(/Nenhum ponto marcado/)).toBeVisible();
  await edicao.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(/Local no mapa:/)).toHaveCount(0);

  expect(observacao.tiles.length).toBeGreaterThan(0);
  expect(new Set(observacao.tiles)).toEqual(new Set(["tile.openstreetmap.org"]));
  expect(observacao.violacoes).toEqual([]);
});

test("avisa quando a precisão do GPS passa de 100 m", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ ...posicao, accuracy: 150 });
  const observacao = await observar(page);
  const cadastro = await abrirNovaProva(page, "E2E Mapa Precisão");

  await cadastro.getByRole("button", { name: "Marcar no mapa" }).click();
  const mapa = page.getByRole("dialog", { name: "Local da prova no mapa" });
  await mapa.getByRole("button", { name: "Usar minha localização" }).click();

  await expect(mapa.getByText(/Precisão baixa, de cerca de 150 m/)).toBeVisible();
  await expect(mapa.getByRole("textbox", { name: "Latitude" })).toHaveValue("-3,731900");
  expect(observacao.violacoes).toEqual([]);
});

test("o pino mostra quantos alunos fazem prova naquele lugar, sem contar duas vezes quem está em duas provas", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(posicao);
  const observacao = await observar(page);
  const origem = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const cabecalhos = { Origin: origem, "Content-Type": "application/json" };
  const ids = await comBanco(async (banco) =>
    (
      await banco.query<{ id: string }>(
        "select id from alunos where nome like 'E2E Mapa Aluno %' order by nome",
      )
    ).rows.map((linha) => linha.id),
  );
  const aoLado = { latitude: posicao.latitude + 0.0002, longitude: posicao.longitude };
  const provas = [
    { nome: "E2E Mapa Local A", ponto: posicao, alunos: [ids[0], ids[1]] },
    { nome: "E2E Mapa Local B", ponto: aoLado, alunos: [ids[1], ids[2]] },
  ];
  for (const { nome, ponto, alunos } of provas) {
    const criada = await page.request.post("/api/provas", {
      headers: cabecalhos,
      data: { nome, dia: "2026-11-29", latitude: ponto.latitude, longitude: ponto.longitude },
    });
    const { prova } = (await criada.json()) as { prova: { id: string } };
    await page.request.put(`/api/provas/${prova.id}/participantes`, {
      headers: cabecalhos,
      data: { alunoIds: alunos },
    });
  }

  const cadastro = await abrirNovaProva(page, "E2E Mapa Contagem");
  await cadastro.getByRole("button", { name: "Marcar no mapa" }).click();
  const mapa = page.getByRole("dialog", { name: "Local da prova no mapa" });
  const area = mapa.getByRole("group", { name: "Mapa do local da prova" });
  const selo = area.locator(".pino-do-local__contagem");
  await mapa.getByRole("button", { name: "Usar minha localização" }).click();

  // Três alunos distintos: o aluno 2 está nas duas provas e conta uma vez.
  await expect(mapa.getByText("Neste local: 3 alunos em 2 provas.")).toBeVisible();
  await expect(selo).toHaveText("3");
  await expect(area.getByTitle("Local da prova: 3 alunos")).toBeVisible();
  await expect(mapa.getByText(/E2E Mapa Local A: 2 alunos em 29\/11\/2026/)).toBeVisible();
  await expect(mapa.getByText(/E2E Mapa Local B: 2 alunos em 29\/11\/2026/)).toBeVisible();

  // Longe de qualquer prova, o selo some e o texto avisa.
  await mapa.getByRole("textbox", { name: "Latitude" }).fill("-3,6");
  await expect(mapa.getByText("Nenhum aluno inscrito em provas neste local.")).toBeVisible();
  await expect(selo).toHaveCount(0);
  await expect(area.getByTitle("Local da prova")).toBeVisible();

  expect(new Set(observacao.tiles)).toEqual(new Set(["tile.openstreetmap.org"]));
  expect(observacao.violacoes).toEqual([]);
});

test("coordenada inválida mostra o erro e não deixa usar o local", async ({ page }) => {
  await observar(page);
  const cadastro = await abrirNovaProva(page, "E2E Mapa Digitado");
  await cadastro.getByRole("button", { name: "Marcar no mapa" }).click();
  const mapa = page.getByRole("dialog", { name: "Local da prova no mapa" });
  const usar = mapa.getByRole("button", { name: "Usar este local" });

  await mapa.getByRole("textbox", { name: "Latitude" }).fill("abc");
  await expect(mapa.getByText("Informe um número, como -3,7319.")).toBeVisible();
  await mapa.getByRole("textbox", { name: "Latitude" }).fill("95");
  await mapa.getByRole("textbox", { name: "Longitude" }).fill("-38,5");
  await expect(mapa.getByText("A latitude deve ficar entre -90 e 90.")).toBeVisible();
  await expect(usar).toBeDisabled();
  await mapa.getByRole("textbox", { name: "Latitude" }).fill("-3,7");
  await expect(usar).toBeEnabled();
});

test.describe("sem permissão de localização", () => {
  test.use({ permissions: [] });

  test("avisa que o acesso foi negado e mantém o mapa utilizável", async ({ page }) => {
    await observar(page);
    const cadastro = await abrirNovaProva(page, "E2E Mapa Negado");
    await cadastro.getByRole("button", { name: "Marcar no mapa" }).click();
    const mapa = page.getByRole("dialog", { name: "Local da prova no mapa" });
    await mapa.getByRole("button", { name: "Usar minha localização" }).click();
    await expect(mapa.getByRole("alert")).toContainText("O acesso à localização foi negado");
    await mapa.getByRole("textbox", { name: "Latitude" }).fill("-3,7319");
    await mapa.getByRole("textbox", { name: "Longitude" }).fill("-38,5267");
    await expect(mapa.getByRole("button", { name: "Usar este local" })).toBeEnabled();
  });
});
