// Utilidades comuns dos testes de ponta a ponta.
import { expect, type Locator, type Page } from "@playwright/test";
import {
  exporNivelGestao,
  fecharNavegacaoMovel,
  menuMovel,
  voltarAoMenuPrincipal,
} from "../../helpers/categorias-configuracoes";
import { nomeDoMes } from "@/domain/frequencia";
import { navegarCalendario } from "./calendario-historico";
import { validarDiaCivil } from "./navegacao-periodo";
import { diaDeChamada, hojeEDomingo } from "./dia";

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
  const visao = await page.locator("main").first().getAttribute("data-visao");
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
  opcoes?: { manterResumo?: boolean; relatorio?: Relatorio },
): Promise<void> {
  if (visao === "relatorios") {
    await selecionarRelatorio(page, opcoes?.relatorio ?? "Resumo");
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", visao);
    return;
  }
  // O indicador de rascunho integra o nome acessível depois da recuperação em segundo plano.
  const nome = rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const navegacao = await abrirNavegacao(page);
  if (visao === "gestao") {
    if ((await page.locator("main").first().getAttribute("data-visao")) !== "gestao") {
      const nav = await exporNivelGestao(page);
      await nav.getByRole("button", { name: "Séries", exact: true }).click();
    } else await fecharNavegacaoMovel(page);
  } else {
    await voltarAoMenuPrincipal(navegacao);
    await navegacao
      .getByRole("button", { name: new RegExp(`^${nome}(?: Alterações não salvas)?$`) })
      .click();
  }
  await expect(page.getByRole("dialog", { name: "Menu do aplicativo", exact: true })).toBeHidden();
  await expect(page.locator("main").first()).toHaveAttribute("data-visao", visao);
  if (!opcoes?.manterResumo && VISOES_COM_RESUMO.has(visao)) await abrirDiaSeResumo(page);
}

const regioesRelatorios = {
  Resumo: "Resumo dos relatórios",
  Histórico: "Histórico de frequências",
  Grade: "Grade de frequência",
  "Por aluno": "Relatório por aluno",
  "Saídas e Entradas": "Relatório de saídas e entradas",
} as const;

export type Relatorio = keyof typeof regioesRelatorios;

export async function exporRelatorios(page: Page): Promise<Locator> {
  const nav = await abrirNavegacao(page);
  const resumo = nav.getByRole("button", { name: "Resumo", exact: true });
  const principal = nav.getByRole("button", { name: "Relatórios", exact: true });
  const voltar = nav.getByRole("button", { name: /^Voltar (para Gestão|ao menu principal)$/ });
  await expect(resumo.or(principal).or(voltar).first()).toBeVisible();
  if (!(await resumo.isVisible())) {
    await voltarAoMenuPrincipal(nav);
    await principal.click();
  }
  await expect(resumo).toBeVisible();
  return nav;
}

/** Seleciona o destino pelo painel lateral e aguarda o conteúdo, não a animação da lista. */
export async function selecionarRelatorio(page: Page, rotulo: Relatorio): Promise<Locator> {
  const nav = await exporRelatorios(page);
  await nav.getByRole("button", { name: rotulo, exact: true }).click();
  await expect(menuMovel(page)).not.toBeAttached();
  const painel = page.getByRole("region", { name: regioesRelatorios[rotulo], exact: true });
  await expect(painel).toBeVisible();
  return painel;
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

/** Prepara pela API a chamada com participantes e aulas exigida pelas saídas retroativas. */
export async function prepararChamadaParaSaida(
  page: Page,
  rotuloTurma: string,
  dia = diaDeChamada(),
): Promise<string> {
  const respostaTurmas = await page.request.get("/api/turmas");
  expect(respostaTurmas.status()).toBe(200);
  const { turmas } = (await respostaTurmas.json()) as {
    turmas: { id: string; rotulo: string }[];
  };
  const turma = turmas.find((item) => item.rotulo === rotuloTurma);
  if (!turma) throw new Error(`Turma da massa não encontrada: ${rotuloTurma}.`);
  const url = `/api/frequencias?dia=${dia}&turmaId=${turma.id}`;
  const anterior = await page.request.get(url);
  expect(anterior.status()).toBe(200);
  if ((await anterior.json()).frequencia === null) {
    const salva = await page.request.post("/api/frequencias", {
      data: { dia, turmaId: turma.id, faltas: [], revisao: 0 },
    });
    expect(salva.status(), await salva.text()).toBe(200);
  }
  // Não confirma histórico incerto nem completa silenciosamente um retrato incompleto.
  const leitura = await page.request.get(url);
  expect(leitura.status()).toBe(200);
  const { frequencia } = (await leitura.json()) as {
    frequencia: { turmaId: string; dia: string; alunos: string[]; aulas: string[] };
  };
  expect(frequencia).toMatchObject({ turmaId: turma.id, dia });
  expect(frequencia.alunos.length).toBeGreaterThan(0);
  expect(frequencia.aulas.length).toBeGreaterThan(0);
  return turma.id;
}

/** Clica em Registrar saída, confirma o resumo e aguarda o formulário limpar. */
export async function registrarSaida(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar saída", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Registrar saída?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Registrar saída", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("#saida-aluno")).toHaveValue("");
}

/** Clica em Registrar entrada, confirma o resumo e aguarda o formulário limpar. */
export async function registrarEntrada(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Registrar entrada?", exact: true });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.locator("#entrada-aluno")).toHaveAttribute("placeholder", "Selecione o aluno");
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

/** Desbloqueia a chamada salva após confirmação. */
export async function desbloquearChamada(secao: Locator): Promise<void> {
  await secao.getByRole("button", { name: /^Desbloquear chamada de/ }).click();
  const dialogo = secao
    .page()
    .getByRole("alertdialog", { name: "Desbloquear chamada?", exact: true });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('input[type="password"]')).toHaveCount(0);
  await dialogo.getByRole("button", { name: "Desbloquear", exact: true }).click();
  await expect(dialogo).toBeHidden();
}

/**
 * Aos sábados a chamada começa bloqueada, mesmo com aula na grade: libera o
 * sábado letivo da turma aberta. Nos demais dias o botão não existe e nada muda.
 */
export async function liberarSabadoSeNecessario(secao: Locator): Promise<void> {
  const liberar = secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true });
  if (!(await liberar.isVisible().catch(() => false))) return;
  const jaLiberado = secao.getByRole("button", { name: "Sábado letivo", exact: true });
  // Depois de recarregar, o botão aparece desabilitado enquanto a chamada é lida.
  await expect
    .poll(async () => {
      if (await jaLiberado.isVisible().catch(() => false)) return "liberado";
      return (await liberar.isEnabled().catch(() => false)) ? "liberar" : "aguardando";
    })
    .not.toBe("aguardando");
  if (await jaLiberado.isVisible().catch(() => false)) return;
  await liberar.click();
  const dialogo = secao
    .page()
    .getByRole("alertdialog", { name: "Desbloquear sábado letivo?", exact: true });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.locator('input[type="password"]')).toHaveCount(0);
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
  const campo = page
    .locator(id)
    .locator('xpath=ancestor::div[contains(@class,"MuiPickersInputBase-root")]')
    .first();
  await campo.getByRole("spinbutton", { name: "Horas", exact: true }).click();
  await page.keyboard.type(hora ?? "");
  await campo.getByRole("spinbutton", { name: "Minutos", exact: true }).click();
  await page.keyboard.type(minuto ?? "");
  await page.keyboard.press("Tab");
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
  validarDiaCivil(diaIso);
  const mes = diaIso.slice(0, 7);
  const gatilho = page.getByRole("button", {
    name: new RegExp(`^${rotuloAcessivel}:`),
  });
  const diaFormatado = diaIso.split("-").reverse().join("/");
  if ((await gatilho.getAttribute("aria-label"))?.includes(diaFormatado)) return;
  await gatilho.click();
  const painel = page.getByRole("dialog", { name: rotuloAcessivel, exact: true });
  await navegarCalendario(painel, mes);
  await expect(
    painel.getByRole("group", {
      name: `Dias de ${nomeDoMes(mes)} de ${diaIso.slice(0, 4)}`,
      exact: true,
    }),
  ).toBeVisible();
  const nomeDoDia = `${Number(diaIso.slice(8))} de ${nomeDoMes(mes).toLowerCase()} de ${diaIso.slice(0, 4)}`;
  const dia = painel.getByRole("group", { name: /^Dias de / }).getByRole("button", {
    name: new RegExp(`^${nomeDoDia}(,|$)`),
  });
  await expect(dia).toBeVisible();
  if (!(await dia.isEnabled())) {
    throw new Error(
      `Dia ${diaIso} está desabilitado pelo intervalo do seletor ${rotuloAcessivel}.`,
    );
  }
  await dia.click();
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
