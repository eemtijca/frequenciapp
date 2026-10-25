// Domingo não tem chamada: o calendário da Chamada não mostra a coluna do domingo, as setas de
// dia pulam do sábado para a segunda e, aos domingos, as telas abrem no resumo da semana.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  celulasDoMesSegundaDomingo,
  diaDaSemanaIso,
  diaLocal,
  diaSeguinte,
  ehDomingo,
  rotuloData,
  rotuloDataCurta,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { semanaEncerrada } from "@/domain/resumo-semana";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");

test.beforeAll(async () => {
  await criarMassaE2E();
  // Uma grade antiga com domingo não pode trazer o domingo de volta.
  await comBanco((cliente) =>
    cliente.query(
      "update horarios set dias_semana = $1 where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'E2E Ano')",
      [[1, 2, 3, 4, 5, 6, 7]],
    ),
  );
});

test.afterAll(async () => {
  await limparMassaE2E();
});

async function abrirChamada(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  // Com uma única turma cadastrada a Chamada não mostra o seletor de turmas.
  if (await secao.getByRole("group", { name: "Turma atual", exact: true }).count()) {
    await escolherTurmaNaChamada(secao, /^E2E Ano A$/);
  }
  return secao;
}

async function escolherDia(page: Page, secao: Locator, dia: string): Promise<void> {
  await secao.locator("#dia-frequencia").click();
  const calendario = page.getByRole("dialog", { name: "Data da chamada", exact: true });
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dia}T12:00:00Z`));
  const mesCompleto = `${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  for (let indice = 0; indice < 3; indice += 1) {
    if (await calendario.getByRole("group", { name: `Dias de ${mesCompleto}` }).count()) break;
    const grade = calendario.getByRole("group", { name: /^Dias de / });
    const anterior = await grade.getAttribute("aria-label");
    await calendario.getByRole("button", { name: "Mês anterior", exact: true }).click();
    await expect(grade).not.toHaveAttribute("aria-label", anterior ?? "");
  }
  const rotulo = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dia}T12:00:00Z`));
  await calendario.getByRole("button", { name: new RegExp(`^${rotulo}(,|$)`) }).click();
  await expect(calendario).toHaveCount(0);
}

/** Segunda-feira anterior a hoje, para a seta de dia seguinte ter para onde ir. */
function segundaAnterior(): string {
  let dia = diaSeguinte(hoje, -1);
  while (diaDaSemanaIso(dia) !== 1) dia = diaSeguinte(dia, -1);
  return dia;
}

function rotuloAcessivelDe(prefixo: string, dia: string): RegExp {
  return new RegExp(`^${prefixo}: ${rotuloData(dia)}(,|$)`);
}

test("o calendário da Chamada vai de segunda a domingo e destaca o resumo", async ({ page }) => {
  const secao = await abrirChamada(page);
  await secao.locator("#dia-frequencia").click();
  const calendario = page.getByRole("dialog", { name: "Data da chamada", exact: true });
  const grade = calendario.getByRole("group", { name: /^Dias de / });
  const mes = hoje.slice(0, 7);

  await expect(grade.getByRole("button")).toHaveCount(celulasDoMesSegundaDomingo(mes).length);
  // Os rótulos das colunas ficam num bloco escondido dos leitores de tela: sete, de segunda a domingo.
  await expect(grade.locator("div[aria-hidden='true'] > span > span:first-child")).toHaveText([
    "S",
    "T",
    "Q",
    "Q",
    "S",
    "S",
    "D",
  ]);
  await expect(grade.locator('[data-domingo-resumo="true"]').first()).toBeVisible();
  await expect(grade.locator('[data-domingo-resumo="true"]').first()).toHaveAttribute(
    "aria-label",
    /resumo da semana anterior/,
  );
});

test("as setas levam ao domingo e voltam para a segunda", async ({ page }) => {
  const secao = await abrirChamada(page);
  const segunda = diaSeguinte(segundaAnterior(), -7);
  const sabado = diaSeguinte(segunda, 5);
  const domingo = diaSeguinte(segunda, 6);
  const semana = [0, 1, 2, 3, 4, 5].map((deslocamento) => diaSeguinte(domingo, -6 + deslocamento));
  await escolherDia(page, secao, sabado);
  const seletor = secao.locator("#dia-frequencia");
  await expect(seletor).toHaveAttribute("aria-label", rotuloAcessivelDe("Data da chamada", sabado));

  await secao.getByRole("button", { name: "Dia seguinte", exact: true }).click();
  await expect(seletor).toHaveAttribute(
    "aria-label",
    `Resumo da semana: ${rotuloDataCurta(semana[0] ?? "")} a ${rotuloDataCurta(semana[5] ?? "")}`,
  );

  await secao.getByRole("button", { name: "Dia seguinte", exact: true }).click();
  await expect(seletor).toHaveAttribute(
    "aria-label",
    rotuloAcessivelDe("Data da chamada", diaSeguinte(domingo, 1)),
  );
});

test("Chamada, Chamada Parcial e Painel não abrem a chamada de domingo", async ({ page }) => {
  const esperado = ultimoDiaDeChamada(hoje);
  await page.goto("/");
  await aguardarHidratacao(page);

  if (!ehDomingo(hoje)) {
    await trocarVisao(page, "Painel", "painel");
    await expect(page.locator("#dia-painel")).toHaveAttribute(
      "aria-label",
      rotuloAcessivelDe("Dia do painel", esperado),
    );
    await trocarVisao(page, "Chamada", "chamada");
    await expect(page.locator("#dia-frequencia")).toHaveAttribute(
      "aria-label",
      rotuloAcessivelDe("Data da chamada", esperado),
    );
    await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
    await expect(page.locator("#dia-chamada-parcial")).toHaveAttribute(
      "aria-label",
      rotuloAcessivelDe("Data da chamada parcial", esperado),
    );
    return;
  }

  const semana = semanaEncerrada(hoje);
  const inicio = semana?.[0];
  const fim = semana?.[semana.length - 1];
  expect(inicio).toBeTruthy();
  expect(fim).toBe(esperado);
  const rotuloResumo = new RegExp(
    `^Resumo da semana: ${rotuloDataCurta(inicio ?? "")} a ${rotuloDataCurta(fim ?? "")}$`,
  );

  await trocarVisao(page, "Painel", "painel", { manterResumo: true });
  await expect(page.locator("#dia-painel")).toHaveAttribute("aria-label", rotuloResumo);
  await expect(page.getByRole("region", { name: "Resumo da semana", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dia seguinte", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Dia anterior", exact: true }).click();
  await expect(page.locator("#dia-painel")).toHaveAttribute(
    "aria-label",
    rotuloAcessivelDe("Dia do painel", esperado),
  );
  await page.getByRole("button", { name: "Voltar para hoje", exact: true }).click();
  await expect(page.locator("#dia-painel")).toHaveAttribute("aria-label", rotuloResumo);

  await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
  await expect(page.locator("#dia-frequencia")).toHaveAttribute("aria-label", rotuloResumo);
  await expect(page.getByRole("button", { name: "Dia seguinte", exact: true })).toBeDisabled();

  await trocarVisao(page, "Chamada Parcial", "chamada-parcial", { manterResumo: true });
  await expect(page.locator("#dia-chamada-parcial")).toHaveAttribute("aria-label", rotuloResumo);
  await expect(
    page.getByRole("button", { name: "Dia seguinte da chamada parcial", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Dia anterior da chamada parcial", exact: true }).click();
  await expect(page.locator("#dia-chamada-parcial")).toHaveAttribute(
    "aria-label",
    rotuloAcessivelDe("Data da chamada parcial", esperado),
  );
  await page.getByRole("button", { name: "Voltar para hoje", exact: true }).click();
  await expect(page.locator("#dia-chamada-parcial")).toHaveAttribute("aria-label", rotuloResumo);
});

test("a API recusa a chamada de domingo mesmo com domingo na grade da turma", async ({
  request,
}) => {
  const domingo = ultimoDomingo();
  const turma = await comBanco(async (cliente) => {
    const resultado = await cliente.query<{ id: string }>(
      "select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'E2E Ano'",
    );
    return resultado.rows[0]?.id ?? "";
  });
  const resposta = await request.post("/api/frequencias", {
    data: { dia: domingo, turmaId: turma, faltas: [], revisao: 0 },
  });
  expect(resposta.status()).toBe(400);
  expect(await resposta.json()).toMatchObject({ error: "Domingo não tem aula nem chamada." });
});

function ultimoDomingo(): string {
  let dia = hoje;
  while (!ehDomingo(dia)) dia = diaSeguinte(dia, -1);
  return dia;
}
