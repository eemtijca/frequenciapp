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
    for (const alvo of document.querySelectorAll(alvoTexto)) {
      if (!(alvo instanceof HTMLElement) || alvo.closest("[hidden]")) continue;
      const estilo = getComputedStyle(alvo);
      if (estilo.display === "none" || estilo.visibility === "hidden") continue;
      if (Object.keys(alvo).some((chave) => chave.startsWith("__reactProps"))) return true;
    }
    return false;
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

/** Troca de visão com um clique; a Chamada Parcial abre pelo ícone da Chamada. */
export async function trocarVisao(page: Page, rotulo: string, visao: string): Promise<void> {
  // A Chamada Parcial não tem item na navegação: abre pelo ícone da Chamada.
  if (visao === "chamada-parcial") {
    await trocarVisao(page, "Chamada", "chamada");
    const icone = page
      .locator('section[aria-label="Fazer chamada"]')
      .getByRole("button", { name: "Chamada Parcial", exact: true });
    await icone.click();
    await expect(page.locator("main")).toHaveAttribute("data-visao", "chamada-parcial");
    return;
  }
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
    elemento.scrollTo({ left: cartao.offsetLeft - primeiro.offsetLeft, behavior: "instant" });
  }, nome);
  await expect(page.getByRole("article", { name: new RegExp(`: ${nome}$`) })).toBeInViewport();
  return faixa;
}

/**
 * Escolhe uma turma na Chamada. As turmas ficam em botões de série que
 * mostram só as turmas da série ativa; percorre as séries até a turma aparecer.
 */
export async function escolherTurmaNaChamada(secao: Locator, nome: RegExp): Promise<void> {
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  const turma = grupo.getByRole("button", { name: nome }).first();
  // O primeiro bloco do grupo é o controle de séries; tocar numa série mostra as turmas dela.
  const seriesBotoes = grupo.locator(":scope > div").first().getByRole("button");
  const total = await seriesBotoes.count();
  for (let indice = 0; indice < total && !(await turma.isVisible().catch(() => false)); indice++) {
    await seriesBotoes.nth(indice).click();
  }
  await turma.click();
}
