// Telas de estado: página 404 e aviso de sessão expirada na entrada.
import { expect, test } from "@playwright/test";
import { mesSeguinte, ultimoDiaDeChamada } from "@/domain/frequencia";
import { escolherMesNoPeriodo } from "../helpers/calendario";
import { diaCorrente } from "../helpers/dia";
import { aguardarHidratacao, escolherDataNoPeriodo, trocarVisao } from "../helpers/pagina";

test.describe("telas de estado", () => {
  // A consulta interceptada deve passar pelo navegador; o worker tem suíte própria.
  test.use({ serviceWorkers: "block" });

  test("a rota desconhecida mostra a página 404 com volta ao início", async ({ page }) => {
    await page.goto("/rota-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByText("Erro 404")).toBeVisible();
    await page.getByRole("link", { name: "Ir para o início" }).click();
    await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  });

  for (const mesCoincide of [true, false]) {
    test(`a sessão expirada avisa na tela de entrada com mês ${mesCoincide ? "coincidente" : "diferente"}`, async ({
      page,
    }) => {
      const mesAtual = diaCorrente().slice(0, 7);
      const mesDia = mesSeguinte(mesAtual, -1);
      // Dia não futuro, sempre no mês anterior e fora do resumo de domingo.
      const dia = ultimoDiaDeChamada(`${mesDia}-15`);
      const mesCompartilhado = mesCoincide ? mesDia : mesAtual;
      expect(dia.slice(0, 7) === mesCompartilhado).toBe(mesCoincide);

      await page.goto("/");
      await aguardarHidratacao(page);
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
      await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

      // Aguarda terminar a consulta inicial do dia antes de armar a interceptação.
      const leituraInicial = page.waitForResponse((resposta) => {
        const url = new URL(resposta.url());
        return url.pathname === "/api/frequencias" && url.searchParams.get("dia") === dia;
      });
      await escolherDataNoPeriodo(page, "Dia do painel", dia);
      const leitura = await leituraInicial;
      expect(leitura.status()).toBe(200);
      expect(await leitura.finished()).toBeNull();

      let acionado = false;
      let interceptando = false;
      let status: number | undefined;
      await page.route("**/api/frequencias?*", async (rota) => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        const alvo =
          url.pathname === "/api/frequencias" &&
          url.searchParams.size === 1 &&
          (mesCoincide
            ? url.searchParams.get("mes") === mesCompartilhado
            : url.searchParams.get("dia") === dia);
        if (!acionado || interceptando || pedido.method() !== "GET" || !alvo) {
          await rota.continue();
          return;
        }
        acionado = false;
        interceptando = true;
        // A consulta já começou com a sessão válida. Expira somente o cookie de sessão
        // deste contexto antes de liberar o 401, inclusive para o router.refresh().
        expect(await page.context().cookies(pedido.url())).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "frequenciapp_sessao" })]),
        );
        await page.context().clearCookies({ name: "frequenciapp_sessao" });
        expect(
          (await page.context().cookies(pedido.url())).some(
            (cookie) => cookie.name === "frequenciapp_sessao",
          ),
        ).toBe(false);
        const resposta = await rota.fetch({ headers: { ...pedido.headers(), cookie: "" } });
        await rota.fulfill({ response: resposta });
        status = resposta.status();
      });
      // O evento pode anteceder o registro do ouvinte; só aguarda a resposta após acioná-lo.
      await expect
        .poll(
          async () => {
            if (status !== undefined) return status;
            acionado = true;
            await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
            return status;
          },
          { timeout: 15_000, intervals: [500] },
        )
        .toBe(401);

      await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("Sessão expirada")).toBeVisible();
      await expect(page.getByText("Por segurança, entre novamente para continuar.")).toBeVisible();
    });
  }
});
