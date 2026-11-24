// Observa o acesso, a primeira dobra e as superfícies do editor do FrequenciBI.
import type { Locator, Page } from "@playwright/test";

const exato = { exact: true };

export async function observarPortaoBi(page: Page) {
  const campo = page.getByLabel("Chave de acesso", exato);
  await campo.waitFor({ state: "visible" });
  const id = await campo.getAttribute("id");
  const alternar = page.getByRole("button", { name: /^(Mostrar|Ocultar) / });
  return {
    rotulo: await alternar.getAttribute("aria-label"),
    controlaCampo: Boolean(id && (await alternar.getAttribute("aria-controls")) === id),
    instrucaoGestao: await page.getByText("Use a chave criada na Gestão.", exato).isVisible(),
    repeticaoConta: await page
      .getByText(/Não é necessário entrar na conta do FrequenciApp/)
      .isVisible(),
  };
}

export function cartaoInfrequenciaBi(page: Page) {
  return page
    .getByRole("region", { name: "Indicadores gerais", exact: true })
    .getByRole("article")
    .filter({ has: page.getByText("Infrequência", exato) });
}

export async function observarDobraBi(page: Page) {
  const card = cartaoInfrequenciaBi(page);
  await card.getByText("20%", exato).waitFor({ state: "visible" });
  return card.evaluate((el) => {
    const { top, right, bottom, left } = el.getBoundingClientRect();
    return {
      top,
      bottom,
      scrollY,
      cabeInteiro: top >= 0 && bottom <= innerHeight && left >= 0 && right <= innerWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

export async function medirCampoBi(campo: Locator) {
  return campo.evaluate((el) => {
    const superficie = el.closest(".MuiInputBase-root");
    if (!superficie) throw new Error("Superfície do campo não encontrada.");
    const { top, height } = superficie.getBoundingClientRect();
    const rotulo = [...document.querySelectorAll("label")].find(
      (label) => label.htmlFor === el.id && Boolean(el.id),
    );
    return { top, height, rotuloAcima: !!rotulo && rotulo.getBoundingClientRect().bottom <= top };
  });
}

export async function observarEditorBi(editor: Locator) {
  const visual = await medirCampoBi(
    editor.getByRole("combobox", { name: "Visualização", exact: true }),
  );
  const meta = await medirCampoBi(
    editor.getByRole("spinbutton", { name: "Meta ou limiar", exact: true }),
  );
  return { visual, meta, delta: Math.abs(visual.top - meta.top) };
}
