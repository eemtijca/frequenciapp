// Animações reais da Chamada e das seções da Gestão, com massa própria.
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

const nomeSerie = `E2E Animacao ${randomUUID()}`;
let serieId: string | undefined;

// Uma transação evita deixar uma massa incompleta se a preparação falhar.
test.beforeAll(async () => {
  await comBanco(async (banco) => {
    await banco.query("begin");
    try {
      const serie = await banco.query<{ id: string }>(
        "insert into series (nome, ordem) values ($1, 97) returning id",
        [nomeSerie],
      );
      serieId = serie.rows[0].id;
      for (const nome of ["A", "B"]) {
        const turma = await banco.query<{ id: string }>(
          "insert into turmas (serie_id, nome) values ($1, $2) returning id",
          [serieId, nome],
        );
        await banco.query(
          "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $2, 1, true)",
          [`${nomeSerie} Aluno ${nome}`, turma.rows[0].id],
        );
        await banco.query(
          "insert into horarios (turma_id, ordem, inicio, fim, dias_semana) values ($1, 1, '07:00', '07:50', $2)",
          [turma.rows[0].id, [1, 2, 3, 4, 5, 6, 7]],
        );
      }
      await banco.query("commit");
    } catch (erro) {
      await banco.query("rollback");
      serieId = undefined;
      throw erro;
    }
  });
});

test.afterAll(async () => {
  if (!serieId) return;
  await comBanco(async (banco) => {
    await banco.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id = $1)",
      [serieId],
    );
    await banco.query(
      "delete from alunos where turma_id in (select id from turmas where serie_id = $1)",
      [serieId],
    );
    await banco.query("delete from turmas where serie_id = $1", [serieId]);
    await banco.query("delete from series where id = $1", [serieId]);
  });
});

type Registro = {
  alvo: string;
  estado: string | null;
  nome: string;
  duracao: string;
  nomeEvento: string;
  inert: boolean;
};

declare global {
  interface Window {
    registrosAnimacao: Registro[];
  }
}

// Registra o evento e o estilo enquanto o elemento ainda pode estar montado.
// Não consulta getAnimations()/getKeyframes(): em WebKit o efeito pode não estar
// disponível quando o evento é entregue; reversões também partem de altura parcial.
async function observarAnimacoes(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.registrosAnimacao = [];
    document.addEventListener(
      "animationstart",
      (evento) => {
        const el = evento.target;
        if (!(el instanceof HTMLElement)) return;
        let alvo = "";
        if (el.closest('[role="group"][aria-label="Turma atual"]')) {
          if (el.querySelector(':scope > [role="group"][aria-label="Séries"]')) alvo = "painel";
          else if (el.querySelector(':scope > [role="group"][aria-label^="Turmas de "]'))
            alvo = "serie";
        }
        if (el.matches(".secao-animada") && el.closest('[data-secao="config-recursos"]'))
          alvo = "secao";
        if (!alvo) return;
        const css = getComputedStyle(el);
        window.registrosAnimacao.push({
          alvo,
          estado: el.dataset.state ?? null,
          nome: css.animationName,
          duracao: css.animationDuration,
          nomeEvento: evento.animationName,
          inert: el.inert,
        });
      },
      true,
    );
  });
}

async function conferirAnimacao(
  page: Page,
  alvo: string,
  estado: "open" | "closed",
): Promise<Registro> {
  await expect
    .poll(async () =>
      page.evaluate(
        ({ alvo, estado }) =>
          window.registrosAnimacao.some(
            (r) => r.alvo === alvo && r.estado === estado && r.nome === r.nomeEvento,
          ),
        { alvo, estado },
      ),
    )
    .toBe(true);
  const registro = await page.evaluate(
    ({ alvo, estado }) =>
      window.registrosAnimacao.find(
        (r) => r.alvo === alvo && r.estado === estado && r.nome === r.nomeEvento,
      ),
    { alvo, estado },
  );
  if (!registro) throw new Error(`Animação ausente: ${alvo} ${estado}`);
  expect(registro.nome).not.toBe("none");
  expect(registro.nomeEvento).not.toBe("");
  expect(parseFloat(registro.duracao)).toBeGreaterThan(0);
  return registro;
}

async function limparRegistros(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.registrosAnimacao = [];
  });
}

async function abrirSeletor(
  page: Page,
): Promise<{ gatilho: Locator; serie: Locator; turma: Locator }> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const grupo = page
    .getByRole("region", { name: "Fazer chamada", exact: true })
    .getByRole("group", { name: "Turma atual", exact: true });
  const gatilho = grupo.getByRole("button", { name: "Turmas", exact: true });
  const serie = grupo.getByRole("button", { name: nomeSerie, exact: true });
  const turma = grupo.getByRole("button", { name: `${nomeSerie} B`, exact: true });
  await expect(gatilho).toBeEnabled();
  return { gatilho, serie, turma };
}

async function abrirRecursos(page: Page): Promise<{ gatilho: Locator; conteudo: Locator }> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  const secao = page.locator('[data-secao="config-recursos"]');
  const gatilho = secao.getByRole("button", { name: /^Recursos da escola/ });
  await expect(gatilho).toBeVisible();
  const conteudo = secao.locator(".secao-animada");
  if ((await gatilho.getAttribute("aria-expanded")) === "true") {
    await gatilho.click();
    await expect(conteudo).toBeHidden();
  }
  return { gatilho, conteudo };
}

test("painel e série animam abertura e saída e preservam seleção e foco", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { gatilho, serie, turma } = await abrirSeletor(page);
  await observarAnimacoes(page);
  await gatilho.click();
  const aberturaPainel = await conferirAnimacao(page, "painel", "open");
  await expect(serie).toBeVisible();
  if ((await serie.getAttribute("aria-expanded")) !== "true") await serie.click();
  await expect(serie).toHaveAttribute("aria-expanded", "true");
  await expect(turma).toBeEnabled();
  await turma.click();
  await expect(turma).toHaveAttribute("aria-pressed", "true");

  await limparRegistros(page);
  await serie.click();
  const saidaSerie = await conferirAnimacao(page, "serie", "closed");
  await expect(turma).toBeHidden();
  await expect(serie).toHaveAttribute("aria-expanded", "false");
  await serie.focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="group"][aria-label^="Turmas de "]') !== null,
    ),
  ).toBe(false);
  await limparRegistros(page);
  await serie.click();
  const aberturaSerie = await conferirAnimacao(page, "serie", "open");
  expect(aberturaSerie.nomeEvento).not.toBe(saidaSerie.nomeEvento);
  await expect(turma).toHaveAttribute("aria-pressed", "true");

  await limparRegistros(page);
  await gatilho.click();
  const saidaPainel = await conferirAnimacao(page, "painel", "closed");
  expect(saidaPainel.nomeEvento).not.toBe(aberturaPainel.nomeEvento);
  await expect(serie).toBeHidden();
  await expect(turma).toBeHidden();
  // Reabrir o pai mantém a série e a turma escolhida, sem outro clique nela.
  await gatilho.focus();
  await gatilho.press("Enter");
  await expect(serie).toHaveAttribute("aria-expanded", "true");
  await expect(turma).toHaveAttribute("aria-pressed", "true");
  // Interrompe sucessivamente a saída e a entrada do painel externo.
  await gatilho.evaluate(async (botao: HTMLButtonElement) => {
    for (let i = 0; i < 3; i++) {
      botao.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  });
  await expect(gatilho).toHaveAttribute("aria-expanded", "false");
  await expect(serie).toBeHidden();
  await gatilho.click();
  await expect(serie).toHaveAttribute("aria-expanded", "true");
  await expect(turma).toHaveAttribute("aria-pressed", "true");
  // Alterna a série em quadros consecutivos enquanto ela ainda pode estar animando.
  await serie.evaluate(async (botao: HTMLButtonElement) => {
    for (let i = 0; i < 3; i++) {
      botao.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  });
  await expect(serie).toHaveAttribute("aria-expanded", "false");
  await expect(turma).toBeHidden();
  await serie.click();
  await expect(turma).toHaveAttribute("aria-pressed", "true");
  await turma.focus();
  await turma.press("Escape");
  await expect(gatilho).toBeFocused();
  await expect(turma).toBeHidden();
  // Um controle desmontado/oculto não pode ser alcançado pelo teclado.
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('[role="group"][aria-label="Séries"]') !== null,
    ),
  ).toBe(false);
});

test("movimento reduzido desativa a animação dos dois níveis sem quebrar a navegação", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { gatilho, serie, turma } = await abrirSeletor(page);
  await gatilho.click();
  await expect(serie).toBeVisible();
  if ((await serie.getAttribute("aria-expanded")) !== "true") await serie.click();
  await expect(turma).toBeVisible();
  const estilos = await gatilho.evaluate((botao, nome) => {
    const raiz = botao.closest('[role="group"][aria-label="Turma atual"]');
    if (!raiz) throw new Error("Seletor não encontrado");
    const painel = raiz.querySelector('[role="group"][aria-label="Séries"]')?.parentElement;
    const faixa = [...raiz.querySelectorAll('[role="group"][aria-label^="Turmas de "]')].find(
      (el) => el.getAttribute("aria-label") === `Turmas de ${nome}`,
    )?.parentElement;
    if (!painel || !faixa) throw new Error("Conteúdos do seletor não encontrados");
    return [painel, faixa].map((el) => ({
      nome: getComputedStyle(el).animationName,
      duracao: getComputedStyle(el).animationDuration,
    }));
  }, nomeSerie);
  for (const estilo of estilos) {
    expect(estilo.nome === "none" || parseFloat(estilo.duracao) <= 0.00001).toBe(true);
  }
  await serie.click();
  await expect(turma).toBeHidden();
  await serie.click();
  await expect(turma).toBeVisible();
  await gatilho.click();
  await expect(serie).toBeHidden();
  await gatilho.press("Enter");
  await expect(turma).toBeVisible();
});

test("seção real anima entrada e saída, fica inerte ao fechar e aceita alternância rápida", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { gatilho, conteudo } = await abrirRecursos(page);
  await observarAnimacoes(page);
  await gatilho.click();
  const abertura = await conferirAnimacao(page, "secao", "open");
  const controle = conteudo.getByRole("switch", { name: "Chamada por aula" });
  await expect(controle).toBeVisible();
  await limparRegistros(page);
  await gatilho.click();
  const saida = await conferirAnimacao(page, "secao", "closed");
  expect(saida.nomeEvento).not.toBe(abertura.nomeEvento);
  expect(saida.inert).toBe(true);
  await expect(conteudo).toBeHidden();
  await gatilho.focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(
      () =>
        document.activeElement?.closest('[data-secao="config-recursos"] .secao-animada') !== null,
    ),
  ).toBe(false);

  // Quadros consecutivos deixam React confirmar cada mudança, sem sleeps fixos.
  await gatilho.evaluate(async (botao: HTMLButtonElement) => {
    for (let i = 0; i < 3; i++) {
      botao.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  });
  await expect(gatilho).toHaveAttribute("aria-expanded", "true");
  await expect(controle).toBeVisible();
  await gatilho.press("Space");
  await expect(gatilho).toHaveAttribute("aria-expanded", "false");
  await expect(conteudo).toBeHidden();
  await expect(gatilho).toBeFocused();
});

test("seção respeita movimento reduzido e continua operável", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { gatilho, conteudo } = await abrirRecursos(page);
  await gatilho.click();
  await expect(conteudo).toBeVisible();
  const estilo = await conteudo.evaluate((el) => ({
    nome: getComputedStyle(el).animationName,
    duracao: getComputedStyle(el).animationDuration,
  }));
  expect(estilo.nome === "none" || parseFloat(estilo.duracao) <= 0.00001).toBe(true);
  await gatilho.click();
  await expect(conteudo).toBeHidden();
  await gatilho.press("Enter");
  await expect(conteudo.getByRole("switch", { name: "Chamada por aula" })).toBeVisible();
});
