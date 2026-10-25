// Cache do BI contra o worker real: casca pública offline, dados em IndexedDB e revogação na reconexão.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao } from "../helpers/pagina";
import { comBanco } from "../helpers/banco";
const rotulo = "E2E BI Offline";

async function aba(page: Page, nome: string) {
  const navegacao = page.getByRole("navigation", { name: "Seções do FrequenciBI" });
  const seletor = page.getByRole("combobox", { name: "Seção do FrequenciBI", exact: true });
  await expect(navegacao.or(seletor).first()).toBeVisible();
  if (await navegacao.isVisible().catch(() => false)) {
    await navegacao.getByRole("button", { name: nome, exact: true }).click();
    return;
  }
  await seletor.click();
  await page.getByRole("option", { name: nome, exact: true }).click();
}

test("reabre o retrato offline e apaga os dados quando a chave é revogada", async ({
  page,
  context,
}) => {
  const id = randomUUID();
  const serieId = randomUUID();
  const turmaId = randomUUID();
  const alunoId = randomUUID();
  const frequenciaId = randomUUID();
  const aluno = `E2E BI Aluno ${alunoId.slice(0, 8)}`;
  const dia = new Date().toISOString().slice(0, 10);
  const chave = `fbi_${randomBytes(32).toString("base64url")}`;
  try {
    await comBanco(async (db) => {
      await db.query("insert into series (id,nome,ordem) values ($1,$2,99)", [
        serieId,
        `E2E BI Série ${serieId.slice(0, 8)}`,
      ]);
      await db.query("insert into turmas (id,serie_id,nome) values ($1,$2,'A')", [
        turmaId,
        serieId,
      ]);
      await db.query(
        "insert into alunos (id,nome,turma_id,turma_original_id,ordem) values ($1,$2,$3,$3,1)",
        [alunoId, aluno, turmaId],
      );
      await db.query(
        "insert into frequencias (id,turma_id,dia,atualizado_em) values ($1,$2,$3::date,now())",
        [frequenciaId, turmaId, dia],
      );
      await db.query("insert into alunos_chamada (frequencia_id,aluno_id) values ($1,$2)", [
        frequenciaId,
        alunoId,
      ]);
      await db.query(
        "insert into chaves_bi (id,rotulo,segredo_hash,escopo,atualizado_em) values ($1,$2,$3,$4::jsonb,now())",
        [
          id,
          rotulo,
          createHash("sha256").update(chave).digest("hex"),
          JSON.stringify({
            turmas: [turmaId],
            recursos: ["chamadas", "alunos", "turmas", "series"],
          }),
        ],
      );
    });
    // Mantém gráficos abaixo da dobra para testar a abertura offline antes do módulo visual.
    await page.setViewportSize({ width: 393, height: 400 });
    await page.goto("/bi");
    await aguardarHidratacao(page, "#chave-bi");
    await page.getByLabel("Chave de acesso", { exact: true }).fill(chave);
    await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
    await expect(page.getByRole("region", { name: "Indicadores gerais" })).toBeVisible();
    const indicadores = page.getByRole("region", { name: "Indicadores gerais" });
    await expect(indicadores.locator("article").filter({ hasText: "Alunos ativos" })).toHaveText(
      "Alunos ativos1",
    );
    await expect(indicadores.locator("article").filter({ hasText: "Infrequência" })).toHaveText(
      "Infrequência0%",
    );
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload();
    await expect(page.getByRole("region", { name: "Indicadores gerais" })).toBeVisible();
    await expect(indicadores.locator("article").filter({ hasText: "Dias com chamada" })).toHaveText(
      "Dias com chamada1",
    );
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const nomes = await caches.keys();
          for (const n of nomes) {
            const cache = await caches.open(n);
            if (await cache.match("/bi")) return true;
          }
          return false;
        }),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("region", { name: "Indicadores gerais" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Consulta offline" })).toBeVisible();
    await expect(indicadores.locator("article").filter({ hasText: "Alunos ativos" })).toHaveText(
      "Alunos ativos1",
    );
    await aba(page, "Ajuda");
    await page.getByRole("button", { name: "Alunos: 1", exact: true }).click();
    await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("table").locator("tbody tr")).toContainText(aluno);
    await aba(page, "Visão geral");
    const grafico = page.locator("article[data-grafico-id]").first();
    await grafico.scrollIntoViewIfNeeded();
    await grafico.getByRole("button", { name: "Tabela", exact: true }).click();
    await expect(grafico.getByRole("table")).toBeVisible();
    await expect(grafico.getByRole("table").locator("tbody tr")).toHaveCount(1);
    expect(
      await page.evaluate(async () => {
        const urls = [];
        for (const n of await caches.keys())
          for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname);
        return urls.filter((p) => p.startsWith("/api/"));
      }),
    ).toEqual([]);
    await comBanco((db) => db.query("update chaves_bi set revogada_em=now() where id=$1", [id]));
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: "Testar e entrar", exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
  } finally {
    await context.setOffline(false);
    await comBanco(async (db) => {
      await db.query("delete from chaves_bi where id=$1 and rotulo=$2", [id, rotulo]);
      await db.query("delete from frequencias where id=$1", [frequenciaId]);
      await db.query("delete from alunos where id=$1", [alunoId]);
      await db.query("delete from turmas where id=$1", [turmaId]);
      await db.query("delete from series where id=$1", [serieId]);
    });
  }
});
