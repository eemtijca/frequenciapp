// Sábado letivo excepcional na Chamada: liberação por turma e dia, rascunho,
// bloqueio após salvar e controles lado a lado no celular. Dados sintéticos.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaDaSemanaIso, diaLocal, diaSeguinte } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

const SERIE = "E2E Sábado Letivo";
interface TurmaDoTeste {
  id: string;
  alunoId: string;
  horarios: string[];
}
interface GradeDoTeste {
  turma_id: string;
  ordem: number;
  dias_semana: number[];
  ativo: boolean;
}
const turmas = new Map<string, TurmaDoTeste>();
let gradeOriginal: GradeDoTeste[] = [];

function ultimoSabado(): string {
  let dia = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
  while (diaDaSemanaIso(dia) !== 6) dia = diaSeguinte(dia, -1);
  return dia;
}

async function limparChamadas(): Promise<void> {
  await comBanco((cliente) =>
    cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
      [SERIE],
    ),
  );
}

async function limparMassa(): Promise<void> {
  await limparChamadas();
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like 'E2E Sábado Aluna %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [SERIE],
    );
    await cliente.query("delete from series where nome = $1", [SERIE]);
  });
}

async function lerGrade(): Promise<GradeDoTeste[]> {
  return comBanco(async (cliente) => {
    const resultado = await cliente.query<GradeDoTeste>(
      "select h.turma_id, h.ordem, h.dias_semana, h.ativo from horarios h join turmas t on t.id = h.turma_id join series s on s.id = t.serie_id where s.nome = $1 order by t.nome, h.ordem",
      [SERIE],
    );
    return resultado.rows;
  });
}

async function escolherDia(page: Page, secao: Locator, dia: string): Promise<void> {
  await secao.locator("#dia-frequencia").click();
  const calendario = page.getByRole("dialog", { name: "Data da chamada", exact: true });
  const data = new Date(`${dia}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
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
  }).format(data);
  await calendario.getByRole("button", { name: new RegExp(`^${rotulo}(,|$)`) }).click();
  await expect(calendario).toHaveCount(0);
}

async function abrirTurma(page: Page, turma: string, dia: string): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  await escolherTurmaNaChamada(secao, new RegExp(`^${SERIE} ${turma}$`));
  await escolherDia(page, secao, dia);
  return secao;
}

function aluno(secao: Locator, turma: string): Locator {
  return secao.getByRole("button", { name: new RegExp(`^E2E Sábado Aluna ${turma}:`) });
}

async function salvar(page: Page, secao: Locator) {
  const [requisicao] = await Promise.all([
    page.waitForRequest(
      (pedido) =>
        pedido.method() === "POST" && new URL(pedido.url()).pathname === "/api/frequencias",
    ),
    secao.getByRole("button", { name: "Salvar", exact: true }).click(),
  ]);
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  return requisicao.postDataJSON() as {
    turmaId: string;
    dia: string;
    sabadoLetivo?: boolean;
    revisao: number;
    faltas: { alunoId: string; horarios: string[] }[];
  };
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 94) returning id",
      [SERIE],
    );
    for (const nome of ["A", "B", "C"]) {
      const turma = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, $2) returning id",
        [serie.rows[0]?.id, nome],
      );
      const id = turma.rows[0]?.id ?? "";
      const estudante = await cliente.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $2, 1, true) returning id",
        [`E2E Sábado Aluna ${nome}`, id],
      );
      const horarios = await cliente.query<{ id: string; ativo: boolean }>(
        "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', $2, true), ($1, 2, '07:50', '08:40', $2, true), ($1, 3, '08:40', '09:30', array[6], false) returning id, ativo",
        [id, nome === "C" ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]],
      );
      turmas.set(nome, {
        id,
        alunoId: estudante.rows[0]?.id ?? "",
        horarios: horarios.rows.filter((horario) => horario.ativo).map((horario) => horario.id),
      });
    }
  });
  gradeOriginal = await lerGrade();
});

test.beforeEach(async ({ page }) => {
  await limparChamadas();
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
});

test.afterAll(limparMassa);

test("libera apenas o sábado selecionado, salva e exige o desbloqueio comum para corrigir", async ({
  page,
}) => {
  const dia = ultimoSabado();
  let secao = await abrirTurma(page, "A", dia);
  const liberar = secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true });
  await expect(liberar).toBeEnabled();
  await expect(aluno(secao, "A")).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await liberar.click();
  const liberado = secao.getByRole("button", { name: "Sábado letivo", exact: true });
  await expect(liberado).toHaveAttribute("aria-pressed", "true");
  await expect(aluno(secao, "A")).toBeEnabled();
  await aluno(secao, "A").click();

  const pedido = await salvar(page, secao);
  expect(pedido).toMatchObject({
    dia,
    turmaId: turmas.get("A")?.id,
    sabadoLetivo: true,
    revisao: 0,
  });
  expect(pedido.faltas).toMatchObject([
    { alunoId: turmas.get("A")?.alunoId, horarios: turmas.get("A")?.horarios },
  ]);
  await expect(aluno(secao, "A")).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await expect(liberado).toHaveAttribute("aria-pressed", "true");

  await secao.getByRole("button", { name: /^Desbloquear chamada de E2E Sábado Letivo A/ }).click();
  await expect(aluno(secao, "A")).toBeEnabled();
  await aluno(secao, "A").click();
  const correcao = await salvar(page, secao);
  expect(correcao).toMatchObject({ dia, revisao: 1, sabadoLetivo: true, faltas: [] });
  await expect(aluno(secao, "A")).toBeDisabled();

  secao = await abrirTurma(page, "A", dia);
  await expect(secao.getByRole("button", { name: "Sábado letivo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  await expect(aluno(secao, "A")).toBeDisabled();
  expect(await lerGrade()).toEqual(gradeOriginal);
});

test("a liberação não alcança outra turma ou data e o rascunho recupera o sábado letivo", async ({
  page,
}, info) => {
  const dia = ultimoSabado();
  const anterior = diaSeguinte(dia, -7);
  let secao = await abrirTurma(page, "A", dia);
  const resumo = secao.getByRole("button", { name: /^Resumo d/ });
  const liberar = secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true });
  await expect(liberar).toBeEnabled();
  for (const largura of [1280, 320, 360]) {
    await page.setViewportSize({ width: largura, height: 780 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const [caixaResumo, caixaLiberar] = await Promise.all([
      resumo.boundingBox(),
      liberar.boundingBox(),
    ]);
    expect(caixaResumo).not.toBeNull();
    expect(caixaLiberar).not.toBeNull();
    if (caixaResumo && caixaLiberar) {
      expect(caixaResumo.height).toBeGreaterThanOrEqual(44);
      expect(caixaLiberar.height).toBeGreaterThanOrEqual(44);
      expect(caixaLiberar.x).toBeGreaterThan(caixaResumo.x + caixaResumo.width);
      expect(caixaLiberar.x + caixaLiberar.width).toBeLessThanOrEqual(largura);
      expect(
        Math.abs(caixaResumo.y + caixaResumo.height / 2 - caixaLiberar.y - caixaLiberar.height / 2),
      ).toBeLessThan(4);
    }
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await expect(page.locator("html")).toHaveClass(tema === "dark" ? /dark/ : /light/);
      await info.attach(`Sábado letivo ${largura}px ${tema}`, {
        body: await resumo.locator("..").screenshot(),
        contentType: "image/png",
      });
    }
  }
  await liberar.click();
  await escolherTurmaNaChamada(secao, new RegExp(`^${SERIE} B$`));
  await expect(
    secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }),
  ).toBeEnabled();
  await expect(aluno(secao, "B")).toBeDisabled();
  await escolherDia(page, secao, anterior);
  await expect(
    secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }),
  ).toBeEnabled();
  await expect(aluno(secao, "B")).toBeDisabled();
  await escolherTurmaNaChamada(secao, new RegExp(`^${SERIE} A$`));
  await expect(
    secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }),
  ).toBeEnabled();
  await expect(aluno(secao, "A")).toBeDisabled();
  await secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }).click();
  await aluno(secao, "A").click();
  await expect
    .poll(() =>
      page.evaluate(
        ({ turmaId, data }) => {
          const chave = Object.keys(sessionStorage).find((item) =>
            item.endsWith(`:${data}:${turmaId}`),
          );
          return chave ? JSON.parse(sessionStorage.getItem(chave) ?? "{}").sabadoLetivo : null;
        },
        { turmaId: turmas.get("A")?.id, data: anterior },
      ),
    )
    .toBe(true);

  secao = await abrirTurma(page, "A", anterior);
  await expect(secao.getByRole("button", { name: "Sábado letivo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(aluno(secao, "A")).toHaveAttribute("aria-pressed", "true");
  await expect(aluno(secao, "A")).toBeEnabled();
  expect(await salvar(page, secao)).toMatchObject({ dia: anterior, sabadoLetivo: true });
  expect(await lerGrade()).toEqual(gradeOriginal);
});

test("reconhece sábado recorrente e não mostra a ação nos dias úteis ou no domingo", async ({
  page,
}) => {
  const sabado = ultimoSabado();
  const secao = await abrirTurma(page, "C", sabado);
  await expect(
    secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }),
  ).toHaveCount(0);
  await expect(secao.getByRole("button", { name: "Sábado letivo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(aluno(secao, "C")).toBeEnabled();
  expect(await salvar(page, secao)).toMatchObject({ dia: sabado, faltas: [] });

  const sexta = diaSeguinte(sabado, -1);
  await escolherDia(page, secao, sexta);
  await expect(
    secao.getByRole("button", { name: /^(Desbloquear sábado letivo|Sábado letivo)$/ }),
  ).toHaveCount(0);
  await expect(aluno(secao, "C")).toBeEnabled();
  const pedido = await salvar(page, secao);
  expect(pedido).toMatchObject({ dia: sexta, faltas: [] });
  expect(pedido.sabadoLetivo).toBeUndefined();

  await escolherDia(page, secao, diaSeguinte(sabado, -6));
  await expect(
    secao.getByRole("button", { name: /^(Desbloquear sábado letivo|Sábado letivo)$/ }),
  ).toHaveCount(0);
  expect(await lerGrade()).toEqual(gradeOriginal);
});

test("falha de leitura bloqueia a liberação e preserva o rascunho até tentar novamente", async ({
  page,
}) => {
  const dia = ultimoSabado();
  let secao = await abrirTurma(page, "A", dia);
  await secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }).click();
  await aluno(secao, "A").click();
  const turmaId = turmas.get("A")?.id;
  await expect
    .poll(() =>
      page.evaluate(
        ({ data, id }) =>
          Object.keys(sessionStorage).some((chave) => chave.endsWith(`:${data}:${id}`)),
        { data: dia, id: turmaId },
      ),
    )
    .toBe(true);
  const rascunho = await page.evaluate(
    ({ data, id }) => {
      const chave = Object.keys(sessionStorage).find((item) => item.endsWith(`:${data}:${id}`));
      if (!chave) throw new Error("Rascunho de sábado não encontrado.");
      const bruto = sessionStorage.getItem(chave);
      if (!bruto) throw new Error("Rascunho de sábado vazio.");
      return { chave, bruto };
    },
    { data: dia, id: turmaId },
  );
  expect(JSON.parse(rascunho.bruto)).toMatchObject({
    sabadoLetivo: true,
    revisao: 0,
    faltas: [{ alunoId: turmas.get("A")?.alunoId, horarios: turmas.get("A")?.horarios }],
  });
  let falhar = true;
  await page.route("**/api/frequencias?dia=**", async (rota) => {
    if (falhar && new URL(rota.request().url()).searchParams.get("dia") === dia) {
      await rota.fulfill({
        status: 503,
        json: { error: "Não foi possível carregar a frequência." },
      });
    } else {
      await rota.continue();
    }
  });

  secao = await abrirTurma(page, "A", dia);
  const tentar = secao.getByRole("button", { name: "Tentar novamente", exact: true });
  await expect(tentar).toBeEnabled();
  await expect(
    secao.getByRole("button", { name: "Desbloquear sábado letivo", exact: true }),
  ).toBeDisabled();
  await expect(aluno(secao, "A")).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await expect(secao.locator("#dia-frequencia")).toBeEnabled();
  await expect(
    secao.getByRole("group", { name: "Turma atual", exact: true }).getByRole("button", {
      name: `${SERIE} B`,
      exact: true,
    }),
  ).toBeEnabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBe(
    rascunho.bruto,
  );

  falhar = false;
  await tentar.click();
  await expect(secao.getByRole("button", { name: "Sábado letivo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(aluno(secao, "A")).toHaveAttribute("aria-pressed", "true");
  await expect(aluno(secao, "A")).toBeEnabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
  expect(
    JSON.parse(
      (await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)) ?? "{}",
    ),
  ).toEqual(JSON.parse(rascunho.bruto));
  const pedido = await salvar(page, secao);
  expect(pedido).toMatchObject({
    dia,
    turmaId,
    sabadoLetivo: true,
    faltas: [{ alunoId: turmas.get("A")?.alunoId, horarios: turmas.get("A")?.horarios }],
  });
  await expect(aluno(secao, "A")).toBeDisabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBeNull();
});
