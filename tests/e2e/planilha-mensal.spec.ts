// Preparo mensal pela Gestão contra o Google sintético: confirmação, reuso,
// vínculos fixos e prévia de envio para as abas do mês.
import { expect, test } from "@playwright/test";
import { diaLocal, rotuloMes } from "../../src/domain/frequencia";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

let google: GoogleFalso;
const mes = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza").slice(0, 7);
const turmas = ["E2E Ano A", "E2E Ano B"];
const abasMensais = turmas.map((turma) => `${turma} · ${mes.slice(5)}-${mes.slice(0, 4)}`);

test.beforeAll(async () => {
  google = await criarGoogleFalso();
  google.definirAba("E2E Ano A", [
    ["Aluno", "29/09/2026"],
    ["E2E Aluno Um", "F"],
  ]);
  await criarMassaE2E();
  await comBanco(async (cliente) => {
    await cliente.query(
      "insert into turmas (serie_id, nome) select id, 'B' from series where nome = 'E2E Ano'",
    );
    await cliente.query(
      `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo)
       select 'E2E Aluno Três', t.id, t.id, 1, true
       from turmas t join series s on s.id = t.serie_id
       where s.nome = 'E2E Ano' and t.nome = 'B'`,
    );
    await cliente.query("delete from sincronizacoes_planilha");
    await cliente.query("delete from tentativas_entrada where chave like 'planilha:%'");
    await cliente.query(
      `insert into integracoes_planilha (id, ativa, modo, atualizado_em)
       values ('principal', false, 'CONSERVADOR', now())
       on conflict (id) do update set ativa = false, envio_automatico = false,
         esquema = null, assinatura_esquema = null, esquema_em = null,
         modo = 'CONSERVADOR', modo_completo_ate = null, atualizado_em = now()`,
    );
    await google.conectar(cliente, "FREQUENCIA");
  });
});

test.afterAll(async () => {
  await comBanco(async (cliente) => {
    await cliente.query("delete from sincronizacoes_planilha");
    await cliente.query(
      `update integracoes_planilha set ativa = false, envio_automatico = false,
         google_refresh_token = null, google_planilha_id = null, google_planilha_nome = null,
         esquema = null, assinatura_esquema = null, esquema_em = null
       where id = 'principal'`,
    );
  });
  await limparMassaE2E();
  await google.fechar();
});

test("prepara duas turmas uma vez, reutiliza o mês e conserva o histórico antigo", async ({
  page,
}, testInfo) => {
  const preparos: { turmaOriginalId: string; mes: string }[] = [];
  const mapas: {
    mapa: { aba: string; turmaOriginalId: string; mes?: string; destino?: string }[];
  }[] = [];
  page.on("request", (pedido) => {
    if (pedido.url().endsWith("/api/planilha/mensal")) preparos.push(pedido.postDataJSON());
    if (pedido.url().endsWith("/api/planilha/mapa")) mapas.push(pedido.postDataJSON());
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Planilhas", exact: true })
    .click();
  const cartao = page.locator('[data-secao="planilha-frequencia"]');
  await cartao.getByRole("button", { name: /Planilha de frequência/ }).click();
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(page.getByText("Estrutura salva.", { exact: true })).toBeVisible();

  const preparar = cartao.getByRole("button", { name: "Preparar mês", exact: true });
  await preparar.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo.getByText(/o histórico antigo é preservado/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: /Mês das novas abas/ })).toContainText(
    rotuloMes(mes),
  );
  await dialogo.screenshot({ path: testInfo.outputPath("planilha-mensal-confirmacao.png") });
  const escritasAntes = google.chamadas().filter((acao) => acao === "gravar").length;
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(preparos).toHaveLength(0);
  expect(google.abas()).toEqual(["E2E Ano A"]);
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritasAntes);

  await preparar.click();
  await dialogo
    .getByRole("button", { name: "Preparar 2 turmas", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Fechar", exact: true })).toBeEnabled();
  const resultado = dialogo.getByRole("list", { name: "Resultado da preparação por turma" });
  await expect(resultado.getByRole("listitem")).toHaveCount(2);
  for (const aba of abasMensais) {
    await expect(resultado.getByRole("listitem").filter({ hasText: aba })).toContainText("Criada");
    expect(google.valor(aba, 1, 1)).toBe("Aluno");
    expect(google.valor(aba, 1, 3)).toBe(`01/${mes.slice(5)}/${mes.slice(0, 4)}`);
  }
  expect(preparos).toHaveLength(2);
  expect(new Set(preparos.map((item) => item.turmaOriginalId)).size).toBe(2);
  expect(preparos.every((item) => item.mes === mes)).toBe(true);
  expect(google.abas().sort()).toEqual(["E2E Ano A", ...abasMensais].sort());
  const abaA = abasMensais[0] ?? "";
  const abaB = abasMensais[1] ?? "";
  expect([google.valor(abaA, 2, 1), google.valor(abaA, 3, 1)]).toEqual(
    expect.arrayContaining(["E2E Aluno Um", "E2E Aluno Dois"]),
  );
  expect(google.valor(abaB, 2, 1)).toBe("E2E Aluno Três");
  expect(google.vinculos(abaA)).toHaveLength(2);
  expect(google.vinculos(abaB)).toHaveLength(1);
  expect(google.valor("E2E Ano A", 2, 2)).toBe("F");
  await dialogo.screenshot({ path: testInfo.outputPath("planilha-mensal-resultado.png") });
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();

  // Repetir o preparo conserva marcas já lançadas e não cria abas duplicadas.
  google.definirValor(abaA, 2, 3, "FJ");
  await preparar.click();
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Fechar", exact: true })).toBeEnabled();
  for (const aba of abasMensais)
    await expect(resultado.getByRole("listitem").filter({ hasText: aba })).toContainText(
      "Reutilizada",
    );
  expect(preparos).toHaveLength(4);
  expect(google.abas()).toHaveLength(3);
  expect(google.valor(abaA, 2, 3)).toBe("FJ");
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();

  await cartao.getByRole("button", { name: "Revisar estrutura", exact: true }).click();
  for (const aba of abasMensais) {
    const vinculo = cartao.getByText(aba, { exact: true }).locator("..");
    await expect(vinculo).toContainText(rotuloMes(mes));
    await expect(vinculo.getByRole("combobox")).toHaveCount(0);
  }
  await expect(
    cartao.getByRole("combobox", { name: "Turma de origem da aba E2E Ano A", exact: true }),
  ).toBeVisible();
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(
    cartao.getByRole("button", { name: "Revisar estrutura", exact: true }),
  ).toBeVisible();
  for (const aba of abasMensais)
    expect(mapas.at(-1)?.mapa.find((item) => item.aba === aba)).toMatchObject({
      aba,
      mes,
      destino: expect.any(String),
      turmaOriginalId: expect.any(String),
    });

  // As prévias do período seguem para as duas abas mensais, sem gravar o histórico.
  await cartao.getByRole("button", { name: "Enviar todas as turmas", exact: true }).click();
  const previa = page.getByRole("dialog");
  await expect(previa.getByText(/Nenhuma chamada pendente/)).toBeVisible();
  await previa.getByLabel(/O período inteiro/).check();
  const lista = previa.getByRole("list", { name: "Turmas do envio" });
  await expect(lista.getByRole("listitem")).toHaveCount(2);
  for (const aba of abasMensais) await expect(lista.locator(`[data-aba="${aba}"]`)).toBeVisible();
  await expect(lista.locator('[data-aba="E2E Ano A"]')).toHaveCount(0);
  await previa.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(google.valor("E2E Ano A", 2, 2)).toBe("F");
  expect(google.valor(abaA, 2, 3)).toBe("FJ");
});
