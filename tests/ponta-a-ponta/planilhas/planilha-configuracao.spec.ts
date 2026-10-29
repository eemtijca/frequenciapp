// Configuração assistida com banco e Google sintéticos: leitura sem escrita,
// diagnóstico mensal, recuperação de acesso e conferência antes de salvar o mapa.
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  diaLocal,
  mesSeguinte,
  nomeDoMes,
  rotuloData,
  rotuloMes,
} from "../../../src/domain/frequencia";
import { criarGoogleFalso, type GoogleFalso } from "../../helpers/google-falso";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { descartarConfiguracoes, salvarConfiguracoes } from "../helpers/configuracoes";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";
import { selecionarAcaoPlanilha } from "../helpers/planilhas";

test.use({ serviceWorkers: "block" });

let google: GoogleFalso;
let turmaA = "";
const mes = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza").slice(0, 7);

test.beforeEach(async () => {
  google = await criarGoogleFalso();
  google.definirAba("E2E Ano A", [
    ["Aluno", rotuloData(`${mes}-01`)],
    ["E2E Aluno Um", "FJ"],
    ["E2E Aluno Dois", "P"],
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
    const { rows } = await cliente.query<{ id: string }>(
      `select t.id from turmas t join series s on s.id = t.serie_id
       where s.nome = 'E2E Ano' and t.nome = 'A'`,
    );
    turmaA = rows[0]?.id ?? "";
    expect(turmaA).not.toBe("");
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

test.afterEach(async () => {
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

async function abrirPlanilha(page: Page) {
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
  await selecionarAcaoPlanilha(cartao, "Configurar");
  return cartao;
}

async function prepararA(page: Page) {
  await page.goto("/");
  const preparada = await page.request.post("/api/planilha/mensal", {
    headers: { Origin: new URL(page.url()).origin },
    data: { turmaOriginalId: turmaA, mes },
  });
  expect(preparada.status()).toBe(200);
}

async function abrirAssistente(page: Page, cartao: Locator) {
  await cartao.getByRole("button", { name: "Configuração assistida", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Configuração assistida", exact: true });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function conferir(page: Page, dialogo: Locator) {
  const resposta = page.waitForResponse(
    (item) => new URL(item.url()).pathname === "/api/planilha/diagnostico",
  );
  await dialogo.getByRole("button", { name: "Conferir configuração", exact: true }).click();
  expect((await resposta).status()).toBe(200);
  await expect(dialogo.getByRole("list", { name: "Conferência por turma" })).toBeVisible();
  await expect(
    dialogo.getByRole("button", { name: "Conferir configuração", exact: true }),
  ).toBeEnabled();
}

function totalEscritas() {
  return google.chamadas().filter((acao) => acao === "gravar").length;
}

test("confere o mês sem gravar, identifica a turma ausente e leva à revisão com foco", async ({
  page,
}, testInfo) => {
  await prepararA(page);
  const cartao = await abrirPlanilha(page);
  const escritasAntes = totalEscritas();
  const abasAntes = google.abas();
  const dialogo = await abrirAssistente(page, cartao);
  await expect(dialogo.getByRole("button", { name: /^Mês da conferência:/ })).toContainText(
    rotuloMes(mes),
  );
  await expect(dialogo.getByText("Esta conferência apenas lê a planilha.")).toBeVisible();
  await conferir(page, dialogo);
  const lista = dialogo.getByRole("list", { name: "Conferência por turma" });
  await expect(lista.getByRole("listitem")).toHaveCount(2);
  await expect(dialogo.getByText("1/2 conferidas", { exact: true })).toBeVisible();
  await expect(lista.getByRole("listitem").filter({ hasText: "E2E Ano A" })).toContainText(
    `E2E Ano A · ${nomeDoMes(mes)}`,
  );
  await expect(lista.getByRole("listitem").filter({ hasText: "E2E Ano B" })).toContainText(
    "Sem aba para este mês",
  );
  await expect(dialogo.getByText("Automação pausada", { exact: true })).toBeVisible();
  expect(
    await dialogo.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth + 1),
  ).toBe(true);
  const caixa = await dialogo.boundingBox();
  expect(caixa).not.toBeNull();
  expect(caixa?.x).toBeGreaterThanOrEqual(0);
  expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  await testInfo.attach("configuracao-assistida", {
    body: await dialogo.screenshot(),
    contentType: "image/png",
  });
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialogo).toHaveCount(0);
  expect(totalEscritas()).toBe(escritasAntes);
  expect(google.abas()).toEqual(abasAntes);
  expect(google.valor("E2E Ano A", 2, 2)).toBe("FJ");
  expect(google.valor("E2E Ano A", 3, 2)).toBe("P");

  await abrirAssistente(page, cartao);
  await expect(dialogo.getByRole("list", { name: "Conferência por turma" })).toHaveCount(0);
  await conferir(page, dialogo);
  await dialogo.getByRole("button", { name: "Revisar turmas e mês", exact: true }).click();
  await expect(dialogo).toHaveCount(0);
  const etapa = cartao.locator('[tabindex="-1"]').filter({ hasText: "Abas e turmas" });
  await expect(etapa).toBeFocused();
  await expect(
    etapa.getByRole("button", { name: "Conferir estrutura", exact: true }),
  ).toBeVisible();
  await expect(etapa.getByRole("button", { name: "Salvar estrutura", exact: true })).toBeDisabled();
  expect(totalEscritas()).toBe(escritasAntes);
});

test("retira a confirmação antiga após erro de acesso ou troca de mês e permite conferir novamente", async ({
  page,
}) => {
  await prepararA(page);
  const cartao = await abrirPlanilha(page);
  const escritasAntes = totalEscritas();
  const dialogo = await abrirAssistente(page, cartao);
  await conferir(page, dialogo);
  await expect(dialogo.getByText("Acesso conferido", { exact: true })).toBeVisible();
  await expect(dialogo.getByText("1/2 conferidas", { exact: true })).toBeVisible();

  google.recusarLeituras(true);
  await conferir(page, dialogo);
  await expect(dialogo.getByText("Acesso conferido", { exact: true })).toHaveCount(0);
  await expect(dialogo.getByText("1/2 conferidas", { exact: true })).toHaveCount(0);
  await expect(dialogo.getByText("Conferir conexão", { exact: true })).toBeVisible();
  await expect(dialogo.getByText("0/2 conferidas", { exact: true })).toBeVisible();
  await expect(dialogo.getByRole("region", { name: "Conexão da planilha" })).toContainText(
    /acesso|permissão|autoriza/i,
  );

  google.recusarLeituras(false);
  await conferir(page, dialogo);
  await expect(dialogo.getByText("Acesso conferido", { exact: true })).toBeVisible();
  await expect(dialogo.getByText("1/2 conferidas", { exact: true })).toBeVisible();

  const anterior = mesSeguinte(mes, -1);
  await dialogo.getByRole("button", { name: /^Mês da conferência:/ }).click();
  const calendario = page.getByRole("dialog", { name: "Mês da conferência", exact: true });
  if (anterior.slice(0, 4) !== mes.slice(0, 4))
    await calendario.getByRole("button", { name: "Ano anterior", exact: true }).click();
  await calendario.getByRole("button", { name: nomeDoMes(anterior), exact: true }).click();
  await expect(dialogo.getByText("Acesso conferido", { exact: true })).toHaveCount(0);
  await expect(dialogo.getByRole("list", { name: "Conferência por turma" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: /^Mês da conferência:/ })).toContainText(
    rotuloMes(anterior),
  );
  await conferir(page, dialogo);
  await expect(dialogo.getByText("0/2 conferidas", { exact: true })).toBeVisible();
  await expect(dialogo.getByRole("listitem").filter({ hasText: "E2E Ano A" })).toContainText(
    "Sem aba para este mês",
  );
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(totalEscritas()).toBe(escritasAntes);
  expect(google.valor("E2E Ano A", 2, 2)).toBe("FJ");
});

test("salva o mapa somente após conferir a estrutura e invalida a leitura quando o Google falha", async ({
  page,
}) => {
  const mapas: { conferenciaHash: string }[] = [];
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === "/api/planilha/mapa") mapas.push(pedido.postDataJSON());
  });
  let cartao = await abrirPlanilha(page);
  await expect(cartao.getByRole("button", { name: "Salvar estrutura", exact: true })).toHaveCount(
    0,
  );
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await expect(cartao.getByRole("button", { name: "Salvar estrutura", exact: true })).toBeEnabled();
  expect(mapas).toHaveLength(0);
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(
    cartao.getByRole("button", { name: "Revisar estrutura", exact: true }),
  ).toBeVisible();
  expect(mapas).toHaveLength(1);
  expect(mapas[0]?.conferenciaHash).toMatch(/^[a-f0-9]{64}$/);

  // A configuração persistida aparece, mas não vale como uma nova conferência.
  cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Revisar estrutura", exact: true }).click();
  const salvar = cartao.getByRole("button", { name: "Salvar estrutura", exact: true });
  await expect(salvar).toBeDisabled();
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await expect(salvar).toBeEnabled();

  google.recusarLeituras(true);
  const falha = page.waitForResponse(
    (item) => new URL(item.url()).pathname === "/api/planilha/estrutura",
  );
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  expect((await falha).ok()).toBe(false);
  await expect(
    cartao.getByRole("button", { name: "Conferir estrutura", exact: true }),
  ).toBeEnabled();
  await expect(salvar).toBeDisabled();
  expect(mapas).toHaveLength(1);

  google.recusarLeituras(false);
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(
    cartao.getByRole("button", { name: "Revisar estrutura", exact: true }),
  ).toBeVisible();
  expect(mapas).toHaveLength(2);
  expect(mapas[1]?.conferenciaHash).toMatch(/^[a-f0-9]{64}$/);
  expect(mapas[1]?.conferenciaHash).not.toBe(mapas[0]?.conferenciaHash);
  expect(totalEscritas()).toBe(0);
  expect(google.valor("E2E Ano A", 2, 2)).toBe("FJ");
  expect(google.valor("E2E Ano A", 3, 2)).toBe("P");
});

test("desativa a planilha no rascunho e só aplica depois de salvar", async ({ page }) => {
  const cartao = await abrirPlanilha(page);
  const ativa = cartao.getByRole("switch", { name: "Integração ativa", exact: true });
  await expect(ativa).toBeChecked();

  await ativa.click();
  await expect(ativa).not.toBeChecked();
  await expect(page.getByRole("region", { name: "Salvar configurações" })).toBeVisible();

  await descartarConfiguracoes(page);
  await expect(ativa).toBeChecked();

  await ativa.click();
  await salvarConfiguracoes(page);
  await expect(ativa).not.toBeChecked();

  await page.reload();
  await aguardarHidratacao(page);
  const cartaoRecarregado = await abrirPlanilha(page);
  await expect(
    cartaoRecarregado.getByRole("switch", { name: "Integração ativa", exact: true }),
  ).not.toBeChecked();
});
