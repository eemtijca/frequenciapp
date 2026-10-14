// Preparo mensal pela Gestão contra o Google sintético: confirmação, reuso,
// vínculos fixos e prévia de envio para as abas do mês.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  diaDaSemanaIso,
  diaLocal,
  diasDoMes,
  mesSeguinte,
  nomeDoMes,
  rotuloData,
  rotuloMes,
} from "../../src/domain/frequencia";
import { diasDaPlanilhaMensal, nomeAbaMensal } from "../../src/domain/planilha-mensal";
import { criarGoogleFalso, type GoogleFalso } from "../helpers/google-falso";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

let google: GoogleFalso;
const mes = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza").slice(0, 7);
const turmas = ["E2E Ano A", "E2E Ano B"];
const abasMensais = turmas.map((turma) => `${turma} · ${nomeDoMes(mes)}`);
const diasUteis = diasDoMes(mes)
  .filter((dia) => diaDaSemanaIso(dia) <= 5)
  .map(rotuloData);

test.beforeEach(async () => {
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
  return cartao;
}

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
  const cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(page.getByText("Estrutura salva.", { exact: true })).toBeVisible();

  const preparar = cartao.getByRole("button", { name: "Preparar mês", exact: true });
  await preparar.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(
    dialogo.getByText(/Retira Turma atual, domingos e sábados sem chamada/),
  ).toBeVisible();
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
    expect(
      Array.from({ length: diasUteis.length + 1 }, (_, indice) => google.valor(aba, 1, indice + 1)),
    ).toEqual(["Aluno", ...diasUteis]);
  }
  expect(google.abasVisiveis().sort()).toEqual(["E2E Ano A", ...abasMensais].sort());
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

test("interrompe a autorização recusada e recupera o mês após reconectar sem envio automático", async ({
  page,
}, testInfo) => {
  const preparos: { turmaOriginalId: string; mes: string }[] = [];
  const reconexoes: unknown[] = [];
  const mesAnterior = mesSeguinte(mes, -1);
  page.on("request", (pedido) => {
    if (pedido.url().endsWith("/api/planilha/mensal")) preparos.push(pedido.postDataJSON());
  });
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.dataset.sessoesExpiradas = "0";
    });
    window.addEventListener("sessao-expirada", () => {
      document.documentElement.dataset.sessoesExpiradas = "1";
    });
  });
  google.recusarAutorizacao(true);
  const cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Preparar mês", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  await dialogo.getByRole("button", { name: /Mês das novas abas/ }).click();
  const calendario = page.getByRole("dialog", { name: "Mês das novas abas", exact: true });
  if (mesAnterior.slice(0, 4) !== mes.slice(0, 4)) {
    await calendario.getByRole("button", { name: "Ano anterior", exact: true }).click();
  }
  await calendario.getByRole("button", { name: nomeDoMes(mesAnterior), exact: true }).click();
  const escritasAntes = google.chamadas().filter((acao) => acao === "gravar").length;
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(
    dialogo.getByRole("button", { name: "Tentar pendentes", exact: true }),
  ).toBeEnabled();
  await expect(dialogo.getByText(/0 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("alert")).toHaveCount(1);
  await expect(dialogo.getByText("Não preparada", { exact: true })).toHaveCount(2);
  await expect(page.locator("html")).toHaveAttribute("data-sessoes-expiradas", "0");
  expect(preparos).toHaveLength(1);
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritasAntes);
  await dialogo.screenshot({ path: testInfo.outputPath("planilha-mensal-reconectar.png") });

  // O contrato de API cobre o OAuth real; aqui o retorno confere navegação e consentimento.
  await page.route("**/api/planilha/google/iniciar", async (rota) => {
    reconexoes.push(rota.request().postDataJSON());
    google.recusarAutorizacao(false);
    const retorno = new URL("/", page.url());
    retorno.searchParams.set("visao", "gestao");
    retorno.searchParams.set("google", "reconectado");
    retorno.searchParams.set("googleFinalidade", "FREQUENCIA");
    retorno.searchParams.set("googleMes", mesAnterior);
    await rota.fulfill({ json: { url: retorno.toString() } });
  });
  await dialogo
    .getByRole("button", { name: "Reconectar conta Google", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(page.getByText("Conta Google reconectada.", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("button", { name: /Mês do envio para a planilha/ })).toContainText(
    rotuloMes(mesAnterior),
  );
  await expect(dialogo).toHaveCount(0);
  expect(reconexoes).toEqual([{ finalidade: "FREQUENCIA", reconectar: true, mes: mesAnterior }]);
  expect(preparos).toHaveLength(1);
  expect(new URL(page.url()).searchParams.has("googleMes")).toBe(false);
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritasAntes);

  await cartao.getByRole("button", { name: "Preparar mês", exact: true }).click();
  await expect(dialogo.getByRole("button", { name: /Mês das novas abas/ })).toContainText(
    rotuloMes(mesAnterior),
  );
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Fechar", exact: true })).toBeEnabled();
  expect(preparos).toHaveLength(3);
  expect(preparos.every((pedido) => pedido.mes === mesAnterior)).toBe(true);
});

test("interrompe o lote uma vez em falha temporária do Google e mantém as turmas pendentes", async ({
  page,
}) => {
  const preparos: { turmaOriginalId: string; mes: string }[] = [];
  await page.route("**/api/planilha/mensal", async (rota) => {
    preparos.push(rota.request().postDataJSON());
    await rota.continue();
  });
  const cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Preparar mês", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  const escritasAntes = google.chamadas().filter((acao) => acao === "gravar").length;
  google.falharLeituras(503);
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(
    dialogo.getByRole("button", { name: "Tentar pendentes", exact: true }),
  ).toBeEnabled();
  await expect(dialogo.getByText(/0 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("alert")).toHaveCount(1);
  await expect(dialogo.getByText("Não preparada", { exact: true })).toHaveCount(2);
  // O lote para na primeira falha, sem repetir o erro turma a turma, e não oferece reconexão.
  expect(preparos).toHaveLength(1);
  await expect(
    dialogo.getByRole("button", { name: "Reconectar conta Google", exact: true }),
  ).toHaveCount(0);
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritasAntes);

  google.falharLeituras(null);
  await dialogo.getByRole("button", { name: "Tentar pendentes", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("alert")).toHaveCount(0);
  expect(preparos).toHaveLength(3);
});

test("repete somente turmas pendentes e preserva a aba concluída no toque duplo", async ({
  page,
}) => {
  const preparos: { turmaOriginalId: string; mes: string }[] = [];
  await page.route("**/api/planilha/mensal", async (rota) => {
    preparos.push(rota.request().postDataJSON());
    if (preparos.length === 2) google.recusarAutorizacao(true);
    await rota.continue();
  });
  const cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Preparar mês", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(
    dialogo.getByRole("button", { name: "Tentar pendentes", exact: true }),
  ).toBeEnabled();
  await expect(dialogo.getByText(/1 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByText("Não preparada", { exact: true })).toHaveCount(1);
  expect(preparos).toHaveLength(2);
  const primeiraAba = abasMensais[0] ?? "";
  google.definirValor(primeiraAba, 2, 3, "FJ");
  google.recusarAutorizacao(false);
  await dialogo
    .getByRole("button", { name: "Tentar pendentes", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Fechar", exact: true })).toBeEnabled();
  await expect(dialogo.getByRole("alert")).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Tentar pendentes", exact: true })).toHaveCount(
    0,
  );
  expect(preparos).toHaveLength(3);
  expect(preparos[2]).toEqual(preparos[1]);
  expect(google.valor(primeiraAba, 2, 3)).toBe("FJ");
  expect(google.abas().sort()).toEqual(["E2E Ano A", ...abasMensais].sort());
});

test("atualiza abas antigas pelo preparo do mês e preserva marcas úteis e vínculos", async ({
  page,
}) => {
  const antiga = `E2E Ano A · ${mes.slice(5)}-${mes.slice(0, 4)}`;
  const datas = diasDoMes(mes).map(rotuloData);
  const primeiroUtil = diasUteis[0] ?? "";
  const primeiroFimDeSemana = diasDoMes(mes).find((dia) => diaDaSemanaIso(dia) > 5) ?? "";
  let alunoId = "";
  await comBanco(async (cliente) => {
    const alunos = await cliente.query<{ id: string; turma_id: string }>(
      "select id, turma_id from alunos where nome = 'E2E Aluno Um'",
    );
    const aluno = alunos.rows[0];
    if (!aluno) throw new Error("Aluno sintético ausente.");
    alunoId = aluno.id;
    google.definirAba(
      antiga,
      [
        ["Aluno", "Turma atual", ...datas],
        [
          "E2E Aluno Um",
          "E2E Ano A",
          ...datas.map((dia) =>
            dia === primeiroUtil ? "FJ" : dia === rotuloData(primeiroFimDeSemana) ? "F" : "",
          ),
        ],
      ],
      {
        mensal: {
          turmaOriginalId: aluno.turma_id,
          mes,
          geracao: randomUUID(),
          vinculos: [{ linha: 2, alunoId: aluno.id }],
        },
      },
    );
  });
  const cartao = await abrirPlanilha(page);
  const preparar = cartao.getByRole("button", { name: "Preparar mês", exact: true });
  await preparar.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(
    dialogo.getByText(/Retira Turma atual, domingos e sábados sem chamada/),
  ).toBeVisible();
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  const nova = abasMensais[0] ?? "";
  const resultado = dialogo.getByRole("list", { name: "Resultado da preparação por turma" });
  await expect(resultado.getByRole("listitem").filter({ hasText: nova })).toContainText(
    "Atualizada",
  );
  expect(google.abas()).not.toContain(antiga);
  expect(
    Array.from({ length: 36 }, (_, indice) => google.valor(nova, 1, indice + 1)).filter(Boolean),
  ).toEqual(["Aluno", ...diasUteis]);
  expect(google.valor(nova, 2, 2)).toBe("FJ");
  expect(google.vinculos(nova)).toEqual([{ linha: 2, alunoId }]);
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await preparar.click();
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(resultado.getByText("Reutilizada", { exact: true })).toHaveCount(2);
  expect(google.valor(nova, 2, 2)).toBe("FJ");
  expect(google.vinculos(nova)).toEqual([{ linha: 2, alunoId }]);
});

test("abre turmas por mês sem esconder o histórico", async ({ page }, testInfo) => {
  const anterior = mesSeguinte(mes, -1);
  await comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ id: string }>(
      "select id from turmas where nome = 'A' and serie_id in (select id from series where nome = 'E2E Ano')",
    );
    const turma = rows[0];
    if (!turma) throw new Error("Turma ausente.");
    for (const periodo of [mes, anterior])
      google.definirAba(
        nomeAbaMensal("E2E Ano A", periodo),
        [
          ["Aluno", ...diasDaPlanilhaMensal(periodo).map(rotuloData)],
          ["E2E Aluno Um", "FJ"],
        ],
        {
          mensal: { turmaOriginalId: turma.id, mes: periodo, geracao: randomUUID(), vinculos: [] },
        },
      );
  });
  const cartao = await abrirPlanilha(page);
  const escritas = google.chamadas().filter((acao) => acao === "gravar").length;
  await cartao.getByRole("button", { name: "Meses da frequência", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Meses da frequência", exact: true });
  await expect(
    dialogo.getByRole("link", { name: `Abrir ${nomeAbaMensal("E2E Ano A", mes)}`, exact: true }),
  ).toHaveAttribute("href", /#gid=\d+$/);
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritas);
  await dialogo.getByRole("combobox", { name: "Mês das frequências" }).click();
  await page.getByRole("option", { name: rotuloMes(anterior), exact: true }).click();
  await expect(
    dialogo.getByRole("link", {
      name: `Abrir ${nomeAbaMensal("E2E Ano A", anterior)}`,
      exact: true,
    }),
  ).toBeVisible();
  await dialogo.getByRole("button", { name: "Liberar meses", exact: true }).evaluate((elemento) => {
    (elemento as HTMLButtonElement).click();
    (elemento as HTMLButtonElement).click();
  });
  await expect(dialogo.getByRole("status")).toContainText(
    "Todos os meses preparados estão acessíveis",
  );
  expect(google.abasVisiveis()).toEqual(
    expect.arrayContaining([nomeAbaMensal("E2E Ano A", mes), nomeAbaMensal("E2E Ano A", anterior)]),
  );
  expect(google.valor(nomeAbaMensal("E2E Ano A", anterior), 2, 2)).toBe("FJ");
  await dialogo.screenshot({ path: testInfo.outputPath("meses-da-frequencia.png") });
  expect(await dialogo.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(
    true,
  );
});

test("mantém o preparo quando a organização das abas falha e permite concluí-la depois", async ({
  page,
}) => {
  await page.route("**/api/planilha/mensal/visibilidade", async (rota) => {
    await rota.fulfill({
      status: 503,
      json: { error: "Não foi possível organizar as abas agora.", codigo: "GOOGLE_TEMPORARIO" },
    });
  });
  const cartao = await abrirPlanilha(page);
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(page.getByText("Estrutura salva.", { exact: true })).toBeVisible();
  await cartao.getByRole("button", { name: "Preparar mês", exact: true }).click();
  const dialogo = page.getByRole("alertdialog");
  await dialogo.getByRole("button", { name: "Preparar 2 turmas", exact: true }).click();
  await expect(dialogo.getByText(/2 de 2 turmas prontas/)).toBeVisible();
  await expect(dialogo.getByRole("alert")).toContainText(
    "Não foi possível organizar as abas agora.",
  );
  expect(google.abasVisiveis()).toHaveLength(3);
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.unroute("**/api/planilha/mensal/visibilidade");
  await cartao.getByRole("button", { name: "Meses da frequência", exact: true }).click();
  const acesso = page.getByRole("dialog", { name: "Meses da frequência", exact: true });
  await acesso.getByRole("button", { name: "Liberar meses", exact: true }).click();
  await expect(acesso.getByRole("status")).toContainText(
    "Todos os meses preparados estão acessíveis",
  );
  expect(google.abasVisiveis().sort()).toEqual(["E2E Ano A", ...abasMensais].sort());
});

test("confere e transfere uma aba antiga sem perder as frequências", async ({ page }, testInfo) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  google.removerAba("E2E Ano A");
  const headers = { Origin: new URL(page.url()).origin };
  const criada = await page.request.post("/api/planilha/criar-aba", {
    headers,
    data: { nome: "E2E Ano A", cabecalho: ["Aluno", "29/09/2026"] },
  });
  expect(criada.status()).toBe(200);
  google.definirAba(
    "E2E Ano A",
    [
      ["Aluno", "29/09/2026", "Total"],
      ["E2E Aluno Um", "FJ", "1"],
    ],
    {
      formulas: { C2: '=COUNTIF(B2:B2;"FJ")' },
      notas: { A2: "E2E Nota reservada" },
    },
  );
  await comBanco(async (cliente) => {
    const { rows } = await cliente.query<{ id: string }>(
      "select id from turmas where nome = 'A' and serie_id in (select id from series where nome = 'E2E Ano')",
    );
    const preparada = await page.request.post("/api/planilha/mensal", {
      headers,
      data: { turmaOriginalId: rows[0]?.id, mes: "2026-09" },
    });
    expect(preparada.status()).toBe(200);
  });
  const cartao = await abrirPlanilha(page);
  const revisar = cartao.getByRole("button", { name: "Revisar estrutura", exact: true });
  const conferir = cartao.getByRole("button", { name: "Conferir estrutura", exact: true });
  await expect(revisar.or(conferir)).toBeVisible();
  if (await revisar.isVisible()) await revisar.click();
  await cartao.getByRole("button", { name: "Conferir estrutura", exact: true }).click();
  await cartao.getByRole("button", { name: "Salvar estrutura", exact: true }).click();
  await expect(page.getByText("Estrutura salva.", { exact: true })).toBeVisible();
  await cartao.getByRole("button", { name: "Meses da frequência", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Meses da frequência", exact: true });
  await dialogo.getByText("Abas sem mês", { exact: true }).click();
  await dialogo.getByRole("button", { name: "Conferir abas antigas", exact: true }).click();
  const confirmar = dialogo.getByRole("button", { name: /^Transferir e retirar/ });
  await expect(confirmar).toBeVisible();
  await expect(confirmar).toBeDisabled();
  await expect(
    dialogo.getByText("Fórmulas: 1 · Notas: 1 · Totais: 0", { exact: true }),
  ).toBeVisible();
  await dialogo.getByText("Ver exemplos de células", { exact: true }).click();
  await expect(dialogo.getByRole("link", { name: "C2 (fórmula)", exact: true })).toHaveAttribute(
    "href",
    /&range=C2$/,
  );
  await expect(dialogo).not.toContainText("E2E Nota reservada");
  const autorizar = dialogo.getByRole("checkbox", {
    name: "Autorizo descartar os totais e notas antigos listados",
    exact: true,
  });
  await expect(autorizar).not.toBeChecked();
  await autorizar.check();
  await expect(confirmar).toBeDisabled();
  await dialogo.getByLabel("Senha administrativa", { exact: true }).fill("E2E Senha incorreta");
  await confirmar.click();
  await expect(
    dialogo.getByRole("status").filter({ hasText: "A senha do administrador está incorreta" }),
  ).toBeVisible();
  expect(google.abas()).toContain("E2E Ano A");
  await expect(dialogo.getByLabel("Senha administrativa", { exact: true })).toHaveValue("");
  await dialogo.getByLabel("Senha administrativa", { exact: true }).fill("DirecaoFrequencia2026");
  await expect(confirmar).toBeEnabled();
  expect(google.abas()).toContain("E2E Ano A");
  await dialogo.screenshot({ path: testInfo.outputPath("previa-aba-sem-mes.png") });
  const escritas = google.chamadas().filter((acao) => acao === "gravar").length;
  await confirmar.evaluate((elemento) => {
    (elemento as HTMLButtonElement).click();
    (elemento as HTMLButtonElement).click();
  });
  await expect(dialogo.getByText("Transferida e retirada", { exact: true })).toBeVisible();
  expect(google.chamadas().filter((acao) => acao === "gravar")).toHaveLength(escritas + 1);
  expect(google.abas()).not.toContain("E2E Ano A");
  const mensal = "E2E Ano A · Setembro";
  const cabecalho = Array.from({ length: 31 }, (_, indice) => google.valor(mensal, 1, indice + 1));
  const nomes = Array.from({ length: 4 }, (_, indice) => google.valor(mensal, indice + 1, 1));
  expect(
    google.valor(mensal, nomes.indexOf("E2E Aluno Um") + 1, cabecalho.indexOf("29/09/2026") + 1),
  ).toBe("FJ");
});
