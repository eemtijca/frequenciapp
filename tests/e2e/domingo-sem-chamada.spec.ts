// Domingo não tem chamada: o calendário da Chamada não mostra a coluna do domingo, as setas de
// dia pulam do sábado para a segunda e, aos domingos, as telas abrem no sábado anterior.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  diaDaSemanaIso,
  diaLocal,
  diaSeguinte,
  diasDoMes,
  ehDomingo,
  rotuloData,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

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

test("o calendário da Chamada vai de segunda a sábado e não oferece o domingo", async ({
  page,
}) => {
  const secao = await abrirChamada(page);
  await secao.locator("#dia-frequencia").click();
  const calendario = page.getByRole("dialog", { name: "Data da chamada", exact: true });
  const grade = calendario.getByRole("group", { name: /^Dias de / });
  const mes = hoje.slice(0, 7);
  const domingos = diasDoMes(mes).filter(ehDomingo);
  expect(domingos.length).toBeGreaterThan(0);

  await expect(grade.getByRole("button")).toHaveCount(diasDoMes(mes).length - domingos.length);
  // Os rótulos das colunas ficam num bloco escondido dos leitores de tela: seis, de S a S.
  await expect(grade.locator("div[aria-hidden='true'] > span")).toHaveText([
    "S",
    "T",
    "Q",
    "Q",
    "S",
    "S",
  ]);
  for (const domingo of domingos) {
    const numero = Number(domingo.slice(8));
    await expect(grade.getByRole("button", { name: new RegExp(`^${numero} de `) })).toHaveCount(0);
  }
});

test("as setas de dia pulam o domingo entre o sábado e a segunda", async ({ page }) => {
  const secao = await abrirChamada(page);
  const segunda = segundaAnterior();
  await escolherDia(page, secao, segunda);
  const seletor = secao.locator("#dia-frequencia");
  await expect(seletor).toHaveAttribute(
    "aria-label",
    rotuloAcessivelDe("Data da chamada", segunda),
  );

  const sabado = diaSeguinte(segunda, -2);
  await secao.getByRole("button", { name: "Dia anterior", exact: true }).click();
  await expect(seletor).toHaveAttribute("aria-label", rotuloAcessivelDe("Data da chamada", sabado));

  await secao.getByRole("button", { name: "Dia seguinte", exact: true }).click();
  await expect(seletor).toHaveAttribute(
    "aria-label",
    rotuloAcessivelDe("Data da chamada", segunda),
  );
});

test("Chamada, Chamada Parcial e Painel abrem no último dia de chamada, nunca num domingo", async ({
  page,
}) => {
  const esperado = ultimoDiaDeChamada(hoje);
  await page.goto("/");
  await aguardarHidratacao(page);

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
