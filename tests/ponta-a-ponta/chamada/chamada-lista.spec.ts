// Lista da Chamada: justificativas bloqueadas, estados suaves e acumulado mensal.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import {
  abrirDiaSeResumo,
  aguardarHidratacao,
  desbloquearChamada,
  salvarChamada,
  trocarVisao,
} from "../helpers/pagina";
import { diaDeChamada } from "../helpers/dia";
import { diaDaSemanaIso, diasDoMes } from "@/domain/frequencia";

test.use({ serviceWorkers: "block" });
const prefixo = "E2E Lista Mensal";
let turmaId = "";
const ids: string[] = [];
const dia = diaDeChamada();
const mes = dia.slice(0, 7);
const anterior = new Date(`${mes}-01T12:00:00Z`);
anterior.setUTCDate(0);
const mesAnterior = anterior.toISOString().slice(0, 7);
const diasAnteriores = diasDoMes(mesAnterior).filter((d) => diaDaSemanaIso(d) === 1);
const primeiro = diasAnteriores[0] ?? `${mesAnterior}-01`;
const segundo = diasAnteriores[1] ?? `${mesAnterior}-08`;

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id=t.serie_id where s.nome=$1)",
      [prefixo],
    );
    await banco.query("delete from alunos where nome like $1", [`${prefixo}%`]);
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome=$1)",
      [prefixo],
    );
    await banco.query("delete from series where nome=$1", [prefixo]);
  });
}
test.beforeAll(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const serie = (
      await banco.query<{ id: string }>(
        "insert into series (nome,ordem) values ($1,98) returning id",
        [prefixo],
      )
    ).rows[0]?.id;
    turmaId =
      (
        await banco.query<{ id: string }>(
          "insert into turmas (nome,serie_id) values ('A',$1) returning id",
          [serie],
        )
      ).rows[0]?.id ?? "";
    for (const [i, nome] of ["Falta", "Justificada", "Presente"].entries()) {
      const r = await banco.query<{ id: string }>(
        "insert into alunos (nome,turma_id,turma_original_id,ordem) values ($1,$2,$2,$3) returning id",
        [`${prefixo} ${nome}`, turmaId, i + 1],
      );
      ids.push(r.rows[0]?.id ?? "");
    }
    await banco.query(
      "insert into horarios (turma_id,ordem,inicio,fim,dias_semana) values ($1,1,'07:00','07:50',array[1,2,3,4,5,6])",
      [turmaId],
    );
  });
});
test.afterAll(limpar);
test.beforeEach(async ({ page }) => {
  await comBanco((banco) => banco.query("delete from frequencias where turma_id=$1", [turmaId]));
  for (const data of [primeiro, segundo, dia]) {
    const resposta = await page.request.post("/api/frequencias", {
      data: {
        dia: data,
        turmaId,
        revisao: 0,
        ...(diaDaSemanaIso(data) === 6 ? { sabadoLetivo: true } : {}),
        faltas: [
          { alunoId: ids[0] },
          ...(data === segundo
            ? []
            : [{ alunoId: ids[1], justificativa: "O", observacao: "Motivo de demonstração" }]),
        ],
      },
    });
    expect(resposta.ok()).toBe(true);
  }
});
async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  await expect(
    secao.getByRole("button", { name: new RegExp(`^Desbloquear chamada de ${prefixo}`) }),
  ).toBeVisible();
  return secao;
}
async function mesPassado(page: Page) {
  await page.locator("#dia-frequencia").click();
  const calendario = page.getByRole("dialog", { name: "Data da chamada", exact: true });
  await calendario.getByRole("button", { name: "Mês anterior", exact: true }).click();
  const nome = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${primeiro}T12:00:00Z`));
  await calendario.getByRole("button", { name: new RegExp(`^${nome}(,|$)`) }).click();
}

test("simplifica a chamada bloqueada, destaca os estados e atualiza o mês após corrigir", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: info.project.name === "chromium" ? 1280 : 320, height: 900 });
  const secao = await abrir(page);
  const lista = secao.getByRole("list", { name: "Alunos da chamada", exact: true });
  const falta = lista.getByRole("listitem").filter({ hasText: `${prefixo} Falta` });
  const justificada = lista.getByRole("listitem").filter({ hasText: `${prefixo} Justificada` });
  await expect(secao.getByRole("searchbox")).toHaveCount(0);
  await expect(lista.locator("..").getByText(/^\d+ alunos$/)).toHaveCount(0);
  await expect(falta.getByRole("combobox")).toHaveCount(0);
  await expect(justificada.getByRole("combobox")).toHaveCount(0);
  await expect(justificada.getByRole("textbox", { name: /Observação da falta/ })).toHaveCount(0);
  await expect(justificada.getByText("Outros", { exact: true })).toHaveCount(1);
  await expect(falta.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
  await expect(
    justificada.getByRole("img", { name: "1 falta justificada", exact: true }),
  ).toBeVisible();
  const corF = await falta.evaluate((e) => getComputedStyle(e).backgroundColor);
  const corFj = await justificada.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(corF).toBe(corFj);
  const marcaF = falta.locator('[data-estado="F"]');
  const marcaFj = justificada.locator('[data-estado="FJ"]');
  expect(await marcaF.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(
    await marcaFj.evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  await expect
    .poll(async () => (await marcaF.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await marcaFj.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const tema of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: tema });
    await lista.screenshot({ path: info.outputPath(`lista-${tema}.png`), animations: "disabled" });
  }
  await desbloquearChamada(secao);
  await expect(justificada.getByRole("textbox", { name: /Observação da falta/ })).toHaveValue(
    "Motivo de demonstração",
  );
  await falta.getByRole("combobox").click();
  await page.getByRole("option", { name: "Doente", exact: true }).click();
  await expect(falta.getByRole("combobox")).toHaveText("Doente");
  await expect(falta.getByText("Doente", { exact: true })).toHaveCount(1);
  await salvarChamada(secao);
  await expect(falta.getByRole("combobox")).toHaveCount(0);
  await expect(falta.getByText("Doente", { exact: true })).toHaveCount(1);
  await expect(falta.getByRole("img", { name: "1 falta justificada", exact: true })).toBeVisible();
  await expect(falta.getByRole("img", { name: "1 falta", exact: true })).toHaveCount(0);
});

test("troca o acumulado com o mês consultado e ignora respostas atrasadas", async ({ page }) => {
  const secao = await abrir(page);
  const linha = secao
    .getByRole("list", { name: "Alunos da chamada", exact: true })
    .getByRole("listitem")
    .filter({ hasText: `${prefixo} Falta` });
  await expect(linha.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
  await mesPassado(page);
  await expect(linha.getByRole("img", { name: "2 faltas", exact: true })).toBeVisible();
  await secao.getByRole("button", { name: "Voltar para hoje", exact: true }).click();
  await abrirDiaSeResumo(page);
  await expect(linha.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
  let liberar: () => void = () => {};
  const pendente = new Promise<void>((r) => {
    liberar = r;
  });
  await page.route(`**/api/frequencias/resumo?de=${mesAnterior}-01&**`, async (rota) => {
    await pendente;
    await rota.continue();
  });
  await mesPassado(page);
  await expect(secao.getByRole("button", { name: "Voltar para hoje", exact: true })).toBeEnabled();
  const resposta = page.waitForResponse((r) => r.url().includes(`resumo?de=${mesAnterior}-01`));
  await secao.getByRole("button", { name: "Voltar para hoje", exact: true }).click();
  await abrirDiaSeResumo(page);
  await expect(linha.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
  liberar();
  await (await resposta).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolver) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolver())),
      ),
  );
  await expect(linha.getByRole("img", { name: "2 faltas", exact: true })).toHaveCount(0);
  await expect(linha.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
});
