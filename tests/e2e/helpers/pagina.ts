// Utilidades comuns dos testes de ponta a ponta.
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Aguarda a hidratação do React. O HTML do servidor pode estar visível antes
 * de os manipuladores de evento existirem, e um clique nesse intervalo se perde.
 * O seletor pode apontar para o elemento que será clicado em seguida.
 */
export async function aguardarHidratacao(
  page: Page,
  seletor = 'button[aria-label="Abrir menu"], nav button',
): Promise<void> {
  await page.waitForFunction((alvoTexto) => {
    const visivel = (alvo: Element): boolean => {
      if (!(alvo instanceof HTMLElement) || alvo.closest("[hidden]")) return false;
      const estilo = getComputedStyle(alvo);
      return estilo.display !== "none" && estilo.visibility !== "hidden";
    };
    const hidratado = (alvo: Element): boolean =>
      visivel(alvo) && Object.keys(alvo).some((chave) => chave.startsWith("__reactProps"));
    const preferidos = [...document.querySelectorAll(alvoTexto)];
    // Com o menu na tela, o clique só vale depois que esse controle hidrata.
    // Na entrada não há menu: qualquer botão visível, como Entrar, serve.
    if (preferidos.some(visivel)) return preferidos.some(hidratado);
    return [...document.querySelectorAll("button")].some(hidratado);
  }, seletor);
}

/**
 * Expõe as seções na barra lateral do desktop ou abre o menu do celular.
 * Espera o controle visível: o botão do celular fica oculto no desktop e
 * não pode ser o alvo de um clique longo.
 */
export async function abrirNavegacao(page: Page): Promise<Locator> {
  await aguardarHidratacao(page);
  const navegacao = page
    .getByRole("navigation", { name: "Seções do aplicativo", exact: true })
    .locator("visible=true");
  const abrir = page
    .getByRole("button", { name: "Abrir menu", exact: true })
    .locator("visible=true");
  await expect(navegacao.or(abrir).first()).toBeVisible();
  if ((await navegacao.count()) > 0) return navegacao.first();
  await abrir.click();
  const menu = page.getByRole("dialog", { name: "Menu do aplicativo", exact: true });
  await expect(menu).toBeVisible();
  return menu.getByRole("navigation", { name: "Seções do aplicativo", exact: true });
}

/** Troca de visão pelo mesmo menu no desktop e no celular. */
export async function trocarVisao(page: Page, rotulo: string, visao: string): Promise<void> {
  // O indicador de rascunho integra o nome acessível depois da recuperação em segundo plano.
  const nome = rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const navegacao = await abrirNavegacao(page);
  await navegacao
    .getByRole("button", { name: new RegExp(`^${nome}(?: Alterações não salvas)?$`) })
    .click();
  await expect(page.getByRole("dialog", { name: "Menu do aplicativo", exact: true })).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("data-visao", visao);
}

/**
 * Aos sábados a chamada começa bloqueada, mesmo com aula na grade: libera o
 * sábado letivo da turma aberta. Nos demais dias o botão não existe e nada muda.
 */
export async function liberarSabadoSeNecessario(secao: Locator): Promise<void> {
  const liberar = secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true });
  if (!(await liberar.isVisible().catch(() => false))) return;
  await expect(liberar).toBeEnabled();
  await liberar.click();
  await expect(secao.getByRole("button", { name: "Sábado letivo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
    // A faixa só troca o cartão vigente em um gesto ou neste pedido explícito.
    elemento.setAttribute("data-rolagem-intencional", "true");
    elemento.scrollTo({ left: cartao.offsetLeft - primeiro.offsetLeft, behavior: "instant" });
  }, nome);
  await expect(page.getByRole("article", { name: new RegExp(`: ${nome}$`) })).toBeInViewport();
  return faixa;
}

/** Escolhe a turma dentro da série, abrindo o painel Turmas quando necessário. */
export async function escolherTurmaNaChamada(secao: Locator, nome: RegExp): Promise<void> {
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  if ((await gatilho.getAttribute("aria-expanded")) !== "true") await gatilho.click();
  const turma = grupo.getByRole("button", { name: nome }).first();
  if (!(await turma.isVisible().catch(() => false))) {
    const series = grupo.locator("button[aria-expanded][aria-pressed]");
    const total = await series.count();
    for (let indice = 0; indice < total; indice++) {
      const serie = series.nth(indice);
      if ((await serie.getAttribute("aria-expanded")) !== "true") await serie.click();
      if (await turma.isVisible().catch(() => false)) break;
    }
  }
  await turma.click();
}
