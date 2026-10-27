// Utilidades comuns dos testes de ponta a ponta.
import { expect, type Locator, type Page } from "@playwright/test";
import { ADMIN_E2E } from "./banco";
import { hojeEDomingo } from "./dia";

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

const VISOES_COM_RESUMO = new Set(["painel", "chamada", "chamada-parcial", "saidas"]);

/**
 * No domingo a Chamada, o Painel e a Chamada Parcial abrem no resumo da semana.
 * Quem precisa da chamada do dia segue para o sábado com a seta anterior.
 */
export async function abrirDiaSeResumo(page: Page): Promise<void> {
  if (!hojeEDomingo()) return;
  const visao = await page.locator("main").getAttribute("data-visao");
  const seletores: Record<string, string[]> = {
    painel: ["#dia-painel"],
    chamada: ["#dia-frequencia"],
    "chamada-parcial": ["#dia-chamada-parcial"],
    saidas: ["#dia-saidas", "#entrada-dia"],
  };
  const lista = seletores[visao ?? ""] ?? [];
  if (lista.length === 0) return;
  const gatilho = page.locator(lista.map((seletor) => `${seletor}:visible`).join(", ")).first();
  const vazio = page.getByText("Nenhuma turma cadastrada", { exact: true }).locator("visible=true");
  await expect
    .poll(
      async () => {
        const rotulo = (await gatilho.count())
          ? ((await gatilho.getAttribute("aria-label")) ?? "")
          : "";
        if (
          /^(Resumo da semana:|Data da chamada|Dia do painel|Data da chamada parcial|Data da saída|Data da entrada)/.test(
            rotulo,
          )
        )
          return "dia";
        if (
          await vazio
            .first()
            .isVisible()
            .catch(() => false)
        )
          return "vazio";
        return "";
      },
      { timeout: 15000 },
    )
    .not.toBe("");
  if (!(await gatilho.count())) return;
  const rotulo = (await gatilho.getAttribute("aria-label")) ?? "";
  if (!rotulo.startsWith("Resumo da semana")) return;
  await page
    .getByRole("button", { name: /^Dia anterior/ })
    .locator("visible=true")
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Resumo da semana", exact: true })).toBeHidden();
}

/** Troca de visão pelo mesmo menu no desktop e no celular. */
export async function trocarVisao(
  page: Page,
  rotulo: string,
  visao: string,
  opcoes?: { manterResumo?: boolean },
): Promise<void> {
  // O indicador de rascunho integra o nome acessível depois da recuperação em segundo plano.
  const nome = rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const navegacao = await abrirNavegacao(page);
  await navegacao
    .getByRole("button", { name: new RegExp(`^${nome}(?: Alterações não salvas)?$`) })
    .click();
  await expect(page.getByRole("dialog", { name: "Menu do aplicativo", exact: true })).toBeHidden();
  await expect(page.locator("main")).toHaveAttribute("data-visao", visao);
  if (!opcoes?.manterResumo && VISOES_COM_RESUMO.has(visao)) await abrirDiaSeResumo(page);
}

/** Clica em Salvar e confirma o resumo, sem esperar o resultado da gravação. */
export async function confirmarSalvarChamada(secao: Locator): Promise<void> {
  await secao.getByRole("button", { name: "Salvar", exact: true }).click();
  const dialogo = secao
    .page()
    .getByRole("alertdialog", { name: /^Salvar (chamada|correção da chamada)\?$/ });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Salvar chamada", exact: true }).click();
  await expect(dialogo).toBeHidden();
}

/** Salva a chamada e aguarda a confirmação de que ela voltou a ficar bloqueada. */
export async function salvarChamada(secao: Locator): Promise<void> {
  await confirmarSalvarChamada(secao);
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible({
    timeout: 15_000,
  });
}

/** Clica em Registrar saída, confirma o resumo e aguarda o formulário limpar. */
export async function registrarSaida(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar saída", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Registrar saída?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Registrar saída", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("#saida-aluno")).toContainText("Selecione o aluno");
}

/** Clica em Registrar entrada, confirma o resumo e aguarda o formulário limpar. */
export async function registrarEntrada(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Registrar entrada?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("#entrada-aluno")).toContainText("Selecione o aluno");
}

/** Confirma o salvamento de uma frequência parcial no diálogo já aberto. */
export async function salvarFrequenciaParcial(dialogo: Locator): Promise<void> {
  await dialogo.getByRole("button", { name: "Salvar frequência parcial", exact: true }).click();
  const confirmacao = dialogo.page().getByRole("dialog").last();
  await expect(
    confirmacao.getByRole("button", { name: "Confirmar e salvar frequência", exact: true }),
  ).toBeVisible();
  await confirmacao
    .getByRole("button", { name: "Confirmar e salvar frequência", exact: true })
    .click();
  await expect(confirmacao).toBeHidden({ timeout: 15_000 });
}

/** Confirma o agendamento de uma justificativa no diálogo já aberto. */
export async function salvarJustificativaParcial(dialogo: Locator): Promise<void> {
  await dialogo.getByRole("button", { name: "Salvar justificativa", exact: true }).click();
  const confirmacao = dialogo.page().getByRole("dialog").last();
  await expect(
    confirmacao.getByRole("button", { name: "Confirmar e salvar justificativa", exact: true }),
  ).toBeVisible();
  await confirmacao
    .getByRole("button", { name: "Confirmar e salvar justificativa", exact: true })
    .click();
  await expect(confirmacao).toBeHidden({ timeout: 15_000 });
}

/** Desbloqueia a chamada salva com a senha da conta usada pela suíte. */
export async function desbloquearChamada(secao: Locator, senha = ADMIN_E2E.senha): Promise<void> {
  await secao.getByRole("button", { name: /^Desbloquear chamada de/ }).click();
  const dialogo = secao.page().getByRole("dialog", { name: "Desbloquear chamada?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Senha da sua conta").fill(senha);
  await dialogo.getByRole("button", { name: "Desbloquear", exact: true }).click();
  await expect(dialogo).toBeHidden();
}

/**
 * Aos sábados a chamada começa bloqueada, mesmo com aula na grade: libera o
 * sábado letivo da turma aberta. Nos demais dias o botão não existe e nada muda.
 */
export async function liberarSabadoSeNecessario(
  secao: Locator,
  senha = ADMIN_E2E.senha,
): Promise<void> {
  const liberar = secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true });
  if (!(await liberar.isVisible().catch(() => false))) return;
  await expect(liberar).toBeEnabled();
  await liberar.click();
  const dialogo = secao
    .page()
    .getByRole("dialog", { name: "Desbloquear sábado letivo?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Senha da sua conta").fill(senha);
  await dialogo.getByRole("button", { name: "Desbloquear", exact: true }).click();
  await expect(dialogo).toBeHidden();
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
  // Cada aba tem o próprio calendário e, no domingo, abre no resumo.
  await abrirDiaSeResumo(page);
}

/** Escolhe o cartão de gráfico indicado no seletor da faixa. */
export async function rolarAteGrafico(page: Page, nome: string) {
  const faixa = page.getByRole("group", { name: "Cartões de gráficos" });
  const seletor = page.getByRole("combobox", { name: "Gráfico em exibição", exact: true });
  await seletor.click();
  await page.getByRole("option", { name: nome, exact: true }).click();
  await expect(page.getByRole("article", { name: new RegExp(`: ${nome}$`) })).toBeVisible();
  return faixa;
}

/** Escolhe uma data no popover de período, navegando pelos meses até o alvo. */
export async function escolherDataNoPeriodo(
  page: Page,
  rotuloAcessivel: string,
  diaIso: string,
): Promise<void> {
  const gatilho = page.getByRole("button", {
    name: new RegExp(`^${rotuloAcessivel}:`),
  });
  const diaFormatado = diaIso.split("-").reverse().join("/");
  if ((await gatilho.getAttribute("aria-label"))?.includes(diaFormatado)) return;
  await gatilho.click();
  const painel = page.getByRole("dialog", { name: rotuloAcessivel, exact: true });
  const data = new Date(`${diaIso}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  const mesCompleto = `${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  const nomesDosMeses = Array.from({ length: 12 }, (_, indice) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, indice, 1)),
    ),
  );
  for (let tentativa = 0; tentativa < 36; tentativa += 1) {
    if (await painel.getByRole("group", { name: `Dias de ${mesCompleto}`, exact: true }).count())
      break;
    const grade = painel.getByRole("group", { name: /^Dias de / });
    const rotuloAtual = (await grade.getAttribute("aria-label")) ?? "";
    const partes = /^Dias de (\S+) de (\d{4})$/.exec(rotuloAtual);
    const numeroDoMes = nomesDosMeses.indexOf((partes?.[1] ?? "").toLowerCase()) + 1;
    if (!partes?.[2] || numeroDoMes < 1)
      throw new Error("Mês visível do calendário não encontrado.");
    const mesVisivel = `${partes[2]}-${String(numeroDoMes).padStart(2, "0")}`;
    await painel
      .getByRole("button", {
        name: mesVisivel > diaIso.slice(0, 7) ? "Mês anterior" : "Mês seguinte",
        exact: true,
      })
      .click();
    await expect(grade).not.toHaveAttribute("aria-label", rotuloAtual);
  }
  const nomeDoDia = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  await painel.getByRole("button", { name: new RegExp(`^${nomeDoDia}(,|$)`) }).click();
  await expect(painel).toHaveCount(0);
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

/** Abre o menu flutuante da conta a partir do botão de perfil visível. */
export async function abrirMenuConta(page: Page, _escopo?: Locator): Promise<Locator> {
  const perfil = page.getByRole("button", { name: /^Conta de / }).last();
  await perfil.click();
  const menu = page.getByRole("menu", { name: "Conta", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

/** Abre o diálogo de notificações pelo cabeçalho móvel ou pelo menu da conta. */
export async function abrirNotificacoes(page: Page): Promise<void> {
  const noCabecalho = page
    .getByRole("banner")
    .getByRole("button", { name: "Configurar notificações", exact: true });
  if (await noCabecalho.isVisible().catch(() => false)) {
    await noCabecalho.click();
    return;
  }
  const navegacao = await abrirNavegacao(page);
  const conta = await abrirMenuConta(page, navegacao);
  await conta.getByRole("menuitem", { name: "Notificações", exact: true }).click();
}

/** Abre o seletor de tema no cabeçalho móvel ou no menu da conta. */
export async function abrirSeletorTema(page: Page): Promise<Locator> {
  const noCabecalho = page.getByRole("banner").getByRole("button", { name: /tema/i });
  if (await noCabecalho.isVisible().catch(() => false)) {
    await noCabecalho.click();
  } else {
    const navegacao = await abrirNavegacao(page);
    const conta = await abrirMenuConta(page, navegacao);
    await conta.getByRole("button", { name: /tema/i }).click();
  }
  const temas = page.getByRole("radiogroup", { name: "Tema do aplicativo" });
  await expect(temas).toBeVisible();
  return temas;
}

/** Escolhe a turma de origem na Grade, no seletor móvel ou nos botões do desktop. */
export async function escolherTurmaNaGrade(page: Page, nome: RegExp): Promise<void> {
  const grade = page.getByRole("region", { name: "Grade de frequência", exact: true });
  const seletor = grade.getByRole("combobox", {
    name: "Turma de origem da grade",
    exact: true,
  });
  if (await seletor.isVisible().catch(() => false)) {
    await seletor.click();
    await page.getByRole("option", { name: nome }).first().click();
    return;
  }
  await grade.getByRole("button", { name: nome }).first().click();
}
