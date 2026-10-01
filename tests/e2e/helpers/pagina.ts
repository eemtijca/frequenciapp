// Utilidades comuns dos testes de ponta a ponta.
import { expect, type Page } from "@playwright/test";

/**
 * Aguarda a hidratação do React. O HTML do servidor pode estar visível antes
 * de os manipuladores de evento existirem, e um clique nesse intervalo se perde.
 * O seletor pode apontar para o elemento que será clicado em seguida.
 */
export async function aguardarHidratacao(page: Page, seletor = "nav button"): Promise<void> {
  await page.waitForFunction((alvoTexto) => {
    const alvo = document.querySelector(alvoTexto) ?? document.querySelector("button");
    if (!alvo) return false;
    return Object.keys(alvo).some((chave) => chave.startsWith("__reactProps"));
  }, seletor);
}

/**
 * Troca de visão pela navegação. Em desenvolvimento o Fast Refresh pode trocar
 * os nós durante a hidratação, então o clique é repetido até o painel mudar.
 */
export async function trocarVisao(page: Page, rotulo: string, visao: string): Promise<void> {
  const botao = page
    .getByRole("navigation", { name: "Seções do aplicativo" })
    .getByRole("button", { name: rotulo });
  await expect
    .poll(
      async () => {
        await botao.click({ force: true });
        return page.locator("main").getAttribute("data-visao");
      },
      { timeout: 20_000 },
    )
    .toBe(visao);
}

/** Escolhe um horário "HH:MM" pelo popover próprio, como a pessoa faria com o mouse. */
export async function escolherHorario(page: Page, id: string, horario: string): Promise<void> {
  const [hora, minuto] = horario.split(":");
  await page.locator(id).click();
  const painel = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("listbox", { name: "Horas" }) });
  await painel
    .getByRole("listbox", { name: "Horas" })
    .getByRole("option", { name: hora ?? "", exact: true })
    .click();
  await painel
    .getByRole("listbox", { name: "Minutos" })
    .getByRole("option", { name: minuto ?? "", exact: true })
    .click();
  await expect(painel).toHaveCount(0);
}

/** Abre uma aba da área de saídas e entradas. */
export async function abrirAbaMovimentacao(
  page: Page,
  rotulo: "Saídas" | "Entradas",
): Promise<void> {
  await page.getByRole("tab", { name: rotulo, exact: true }).click();
}

/** Rola a faixa nativa até o cartão de gráfico indicado. */
export async function rolarAteGrafico(page: Page, nome: string) {
  const faixa = page.getByRole("group", { name: "Cartões de gráficos" });
  await faixa.evaluate((elemento, rotulo) => {
    const primeiro = elemento.firstElementChild;
    const cartao = Array.from(elemento.children).find((item) =>
      item.getAttribute("aria-label")?.endsWith(`: ${rotulo}`),
    );
    if (!(primeiro instanceof HTMLElement) || !(cartao instanceof HTMLElement))
      throw new Error("Cartão não encontrado.");
    elemento.scrollTo({ left: cartao.offsetLeft - primeiro.offsetLeft, behavior: "instant" });
  }, nome);
  await expect(page.getByRole("article", { name: new RegExp(`: ${nome}$`) })).toBeInViewport();
  return faixa;
}
