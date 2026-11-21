// Painel sem botão de atualizar (atualiza sozinho) e botão da planilha ao lado
// das abas Saídas e Entradas. Dados sintéticos.
import { expect, test } from "@playwright/test";
import { mesSeguinte, ultimoDiaDeChamada } from "@/domain/frequencia";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { escolherMesNoPeriodo } from "../helpers/calendario";
import { diaCorrente } from "../helpers/dia";
import { aguardarHidratacao, escolherDataNoPeriodo, trocarVisao } from "../helpers/pagina";

test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

test.describe("atualização do Painel ao voltar para a aba", () => {
  test.use({ serviceWorkers: "block" });

  for (const mesCoincide of [true, false]) {
    test(`sem botão de atualizar, com mês ${mesCoincide ? "coincidente" : "diferente"}`, async ({
      page,
    }) => {
      const mesAtual = diaCorrente().slice(0, 7);
      const mesDia = mesSeguinte(mesAtual, -1);
      const dia = ultimoDiaDeChamada(`${mesDia}-15`);
      const mesCompartilhado = mesCoincide ? mesDia : mesAtual;
      expect(dia.slice(0, 7) === mesCompartilhado).toBe(mesCoincide);

      await page.goto("/");
      await aguardarHidratacao(page);

      // A resposta sintética usa os IDs da massa isolada, sem gravar frequências no banco.
      const respostaAlunos = await page.request.get("/api/alunos");
      expect(respostaAlunos.status()).toBe(200);
      const { alunos } = (await respostaAlunos.json()) as {
        alunos: { id: string; nome: string; turmaId: string }[];
      };
      const alunosE2E = alunos.filter((aluno) => /^E2E Aluno (Um|Dois)$/.test(aluno.nome));
      expect(alunosE2E).toHaveLength(2);
      const [primeiroAluno, segundoAluno] = alunosE2E;
      if (!primeiroAluno || !segundoAluno) throw new Error("Massa E2E incompleta.");
      expect(primeiroAluno.turmaId).toBe(segundoAluno.turmaId);
      const turmaId = primeiroAluno.turmaId;
      let acionado = false;
      let atualizado = false;
      await page.route("**/api/frequencias?*", async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        const doMes = url.searchParams.size === 1 && url.searchParams.get("mes") === mesDia;
        const doDia = url.searchParams.size === 1 && url.searchParams.get("dia") === dia;
        if (pedido.method() !== "GET" || (!doMes && !doDia)) {
          await rota.continue();
          return;
        }
        // No mês compartilhado, só a consulta disparada sincronicamente pelo
        // evento recebe o novo dado; uma consulta paralela não serve de prova.
        const requisicaoDeAtualizacao =
          acionado &&
          (mesCoincide ? doMes && pedido.headers()["x-e2e-visibilidade"] === "1" : doDia);
        if (requisicaoDeAtualizacao) atualizado = true;
        const frequencia = {
          dia,
          turmaId,
          revisao: 1,
          atualizadoEm: `${dia}T12:00:00.000Z`,
          atualizadoPorNome: "E2E",
          alunos: alunosE2E.map((aluno) => aluno.id),
          aulas: ["aula-sintetica"],
          faltas: atualizado ? [{ alunoId: primeiroAluno.id, horarios: ["aula-sintetica"] }] : [],
        };
        await rota.fulfill({
          json: {
            ...(doDia ? { feriado: null } : {}),
            frequencias: [frequencia],
          },
        });
      });
      await trocarVisao(page, "Relatórios", "relatorios");
      await page.getByRole("tab", { name: "Histórico" }).click();
      const historico = page.getByRole("region", { name: "Histórico de frequências", exact: true });
      const cargaDoMes = page.waitForResponse((resposta) => {
        const url = new URL(resposta.url());
        return (
          url.pathname === "/api/frequencias" && url.searchParams.get("mes") === mesCompartilhado
        );
      });
      await escolherMesNoPeriodo(page, historico, "Mês do histórico", mesCompartilhado);
      const mesCarregado = await cargaDoMes;
      expect(mesCarregado.status()).toBe(200);
      expect(await mesCarregado.finished()).toBeNull();
      await trocarVisao(page, "Painel", "painel");
      await expect(page.getByRole("button", { name: "Atualizar indicadores" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Painel" })).toBeAttached();

      const consultaInicial = page.waitForResponse((resposta) => {
        const url = new URL(resposta.url());
        return url.pathname === "/api/frequencias" && url.searchParams.get("dia") === dia;
      });
      await escolherDataNoPeriodo(page, "Dia do painel", dia);
      const inicial = await consultaInicial;
      expect(inicial.status()).toBe(200);
      expect(await inicial.finished()).toBeNull();

      const resumo = page.getByRole("group", { name: "Resumo do dia" });
      const indicador = resumo.getByRole("progressbar", { name: "Infrequência do dia" });
      await expect(resumo.getByText("0%", { exact: true })).toBeVisible();
      await expect(indicador).toHaveAttribute("aria-valuenow", "0");

      // O mês compartilhado usa ?mes=; fora dele o Painel refaz ?dia=.
      // Armamos a observação antes do evento e só aguardamos depois de dispará-lo.
      const consulta = page.waitForResponse((resposta) => {
        const url = new URL(resposta.url());
        return (
          resposta.request().method() === "GET" &&
          url.pathname === "/api/frequencias" &&
          url.searchParams.size === 1 &&
          (mesCoincide
            ? url.searchParams.get("mes") === mesCompartilhado &&
              resposta.request().headers()["x-e2e-visibilidade"] === "1"
            : url.searchParams.get("dia") === dia)
        );
      });
      // O fechamento do calendário reinstala o listener em um efeito React.
      // Marca apenas fetches síncronos ao dispatch e exige a configuração, que
      // o listener solicita nas duas variantes, antes de considerar o evento atendido.
      await expect
        .poll(
          async () => {
            acionado = true;
            return page.evaluate(
              (mesEsperado) => {
                const original = window.fetch;
                const caminhos: string[] = [];
                window.fetch = (entrada, opcoes) => {
                  const pedido = new Request(entrada, opcoes);
                  const url = new URL(pedido.url);
                  caminhos.push(`${url.pathname}${url.search}`);
                  pedido.headers.set("x-e2e-visibilidade", "1");
                  return original(pedido);
                };
                try {
                  document.dispatchEvent(new Event("visibilitychange"));
                } finally {
                  window.fetch = original;
                }
                return (
                  caminhos.includes("/api/configuracoes") &&
                  (!mesEsperado || caminhos.includes(`/api/frequencias?mes=${mesEsperado}`))
                );
              },
              mesCoincide ? mesCompartilhado : "",
            );
          },
          { timeout: 15_000, intervals: [500] },
        )
        .toBe(true);
      const resposta = await consulta;
      expect(resposta.status()).toBe(200);
      expect(await resposta.finished()).toBeNull();
      await expect(resumo.getByText("50%", { exact: true })).toBeVisible();
      await expect(indicador).toHaveAttribute("aria-valuetext", /50% de infrequência/);
    });
  }
});

test("Saídas e entradas: o botão da planilha fica na linha das abas", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  const abas = page.getByRole("tablist", { name: "Tipo de registro" });
  const botao = page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" });
  const caixaAbas = await abas.boundingBox();
  const caixaBotao = await botao.boundingBox();
  if (!caixaAbas || !caixaBotao) throw new Error("Abas ou botão da planilha indisponíveis.");
  expect(caixaBotao.width).toBe(48);
  expect(caixaBotao.height).toBe(48);
  expect(caixaBotao.y + caixaBotao.height / 2).toBeCloseTo(caixaAbas.y + caixaAbas.height / 2, 0);
  expect(caixaBotao.x + caixaBotao.width).toBeLessThanOrEqual(360);
  await expect(botao).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const raio = (elemento: Element) =>
    Number.parseFloat(getComputedStyle(elemento).borderBottomLeftRadius);
  const selecionada = abas.getByRole("tab", { name: "Saídas", selected: true, exact: true });
  const caixaSelecionada = await selecionada.boundingBox();
  if (!caixaSelecionada) throw new Error("Aba Saídas não selecionada.");
  expect((await abas.evaluate(raio)) - (await selecionada.evaluate(raio))).toBeCloseTo(
    caixaSelecionada.x - caixaAbas.x,
    0,
  );

  // Sem faixa de título vazia: a data vem logo abaixo da linha das abas.
  const data = page.locator("#dia-saidas");
  const caixaData = await data.boundingBox();
  if (!caixaData) throw new Error("Seletor de data indisponível.");
  expect(caixaData.y - (caixaAbas.y + caixaAbas.height)).toBeLessThan(40);

  const estouro = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(estouro).toBe(false);

  // O mesmo botão único atende as duas abas: não há botão separado nas Entradas.
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await expect(botao).toHaveCount(1);
  await expect(botao).toBeVisible();
});

test("Planilha disponível abre a mesma janela por teclado nas Entradas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Só o estado da integração é simulado; o teste não confirma envio.
  await page.route("**/api/planilha-saidas/estado", (rota) =>
    rota.fulfill({
      json: {
        estado: {
          ativa: true,
          modo: "conservador",
          modoCompletoAte: null,
          configurada: true,
          podeEnviar: true,
        },
      },
    }),
  );
  await page.goto("/?visao=saidas&aba=entradas");
  await aguardarHidratacao(page);
  const botao = page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" });
  await expect(botao).toBeEnabled();
  await expect(botao).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await botao.focus();
  await page.keyboard.press("Enter");
  const janela = page.getByRole("dialog", { name: /^Enviar saídas e entradas/ });
  await expect(janela).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(janela).toBeHidden();
  await expect(botao).toBeFocused();
});
