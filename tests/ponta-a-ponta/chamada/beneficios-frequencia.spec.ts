// Benefícios e frequência mínima: a regra criada e editada na Gestão muda o alerta que a Chamada mostra.
import { test, expect, type Page } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { aguardarHidratacao, escolherDataNoPeriodo, trocarVisao } from "../helpers/pagina";
import {
  descartarConfiguracoes,
  selecionarAcaoConfiguracoes,
  salvarConfiguracoes,
} from "../helpers/configuracoes";
import { diaDeChamada } from "../helpers/dia";
import { diaDaSemanaIso, diasDoMes } from "@/domain/frequencia";
import { contidoNosLimites } from "../helpers/geometria";

test.use({ serviceWorkers: "block" });
const prefixo = "E2E Beneficio";
let turmaId = "";
const ids: string[] = [];
const dia = diaDeChamada();
const anterior = new Date(`${dia.slice(0, 7)}-01T12:00:00Z`);
anterior.setUTCDate(0);
const mesAnterior = anterior.toISOString().slice(0, 7);
const diasUteis = diasDoMes(mesAnterior).filter((d) => diaDaSemanaIso(d) <= 5);
const NOME_BENEFICIO = "E2E Beneficio Rigoroso";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from feriados where nome like $1", [`${prefixo}%`]);
    await banco.query("delete from beneficios_frequencia where nome like $1", [`${prefixo}%`]);
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
        "insert into series (nome,ordem) values ($1,97) returning id",
        [prefixo],
      )
    ).rows[0]?.id;
    turmaId =
      (
        await banco.query<{ id: string }>(
          "insert into turmas (nome,serie_id,criado_em) values ('A',$1,'2020-01-01T12:00:00Z') returning id",
          [serie],
        )
      ).rows[0]?.id ?? "";
    for (const [i, nome] of ["Muitas faltas", "Uma falta"].entries()) {
      const r = await banco.query<{ id: string }>(
        "insert into alunos (nome,turma_id,turma_original_id,ordem,criado_em) values ($1,$2,$2,$3,'2020-01-01T12:00:00Z') returning id",
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

async function abrirBeneficios(page: Page) {
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await selecionarAcaoConfiguracoes(page, "Escola", "Frequência");
  const secao = page.locator('[data-secao="config-beneficios"]');
  const regiao = secao.getByRole("region", { name: "Benefícios e frequência mínima" });
  if (!(await regiao.isVisible())) {
    await secao.getByRole("button", { name: /Benefícios e frequência mínima/ }).click();
  }
  await expect(regiao).toBeVisible();
  return secao;
}

/** A data consultada permanece ao voltar à Chamada, então só a primeira abertura navega até o mês anterior. */
async function abrirChamadaDoMesAnterior(page: Page, navegar: boolean) {
  await trocarVisao(page, "Chamada", "chamada");
  if (navegar) {
    const primeiro = diasUteis[0] ?? `${mesAnterior}-01`;
    await escolherDataNoPeriodo(page, "Data da chamada", primeiro);
  }
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  const lista = secao.getByRole("list", { name: "Alunos da chamada", exact: true });
  return {
    muitas: lista.getByRole("listitem").filter({ hasText: `${prefixo} Muitas faltas` }),
    uma: lista.getByRole("listitem").filter({ hasText: `${prefixo} Uma falta` }),
  };
}

for (const largura of [320, 390, 800, 1280]) {
  test(`em ${largura} px, o aviso não impede salvar ou descartar o rascunho`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto("/");
    await aguardarHidratacao(page);
    const secao = await abrirBeneficios(page);
    await secao.getByRole("button", { name: "Novo benefício" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo benefício" });
    await dialogo.getByLabel("Nome do benefício").fill(NOME_BENEFICIO);
    await dialogo.getByLabel("Frequência mínima, em %").fill("99");
    await dialogo.getByRole("button", { name: "Aplicar ao rascunho" }).click();
    const aviso = page.getByText("Benefício adicionado ao rascunho.", { exact: true });
    await expect(aviso).toBeVisible();
    await page.getByRole("button", { name: "Salvar configurações", exact: true }).click({
      trial: true,
      timeout: 2_000,
    });
    await page.getByRole("button", { name: "Descartar", exact: true }).click({
      trial: true,
      timeout: 2_000,
    });
    await expect(aviso).toBeVisible();
    await descartarConfiguracoes(page);
    await expect(secao.getByText(NOME_BENEFICIO, { exact: true })).toHaveCount(0);
  });
}

test("a regra criada e editada na Gestão muda o alerta mostrado na Chamada", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  if (isMobile) await page.setViewportSize({ width: 320, height: 720 });
  await comBanco((banco) => banco.query("delete from frequencias where turma_id=$1", [turmaId]));
  // Uma aula por dia útil: seis dias com falta para o primeiro aluno e um dia para o segundo.
  for (const [indice, data] of diasUteis.slice(0, 6).entries()) {
    const resposta = await page.request.post("/api/frequencias", {
      data: {
        dia: data,
        turmaId,
        revisao: 0,
        faltas: [
          { alunoId: ids[0], ...(indice === 5 ? { justificativa: "O" } : {}) },
          ...(indice === 0 ? [{ alunoId: ids[1] }] : []),
        ],
      },
    });
    expect(resposta.ok()).toBe(true);
  }

  await page.goto("/");
  await aguardarHidratacao(page);

  // A administração cria um benefício rigoroso: 99% de frequência quase não admite falta.
  const secao = await abrirBeneficios(page);
  await secao.getByRole("button", { name: "Novo benefício" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo benefício" });
  await dialogo.getByLabel("Nome do benefício").fill(NOME_BENEFICIO);
  await dialogo.getByLabel("Frequência mínima, em %").fill("99");
  await expect(dialogo.getByLabel("Aulas por dia", { exact: true })).toHaveValue("9");
  await expect(dialogo).toBeInViewport({ ratio: 1 });
  await dialogo.screenshot({ path: test.info().outputPath("aulas-por-dia.png") });
  await dialogo.getByLabel("Aulas por dia", { exact: true }).fill("");
  await dialogo.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  const avisoRascunho = page.getByText("Benefício adicionado ao rascunho.", { exact: true });
  await expect(avisoRascunho).toBeVisible();
  // O aviso não pode bloquear o salvamento enquanto permanece visível.
  await page.getByRole("button", { name: "Salvar configurações", exact: true }).click({
    trial: true,
    timeout: 2_000,
  });
  await expect(avisoRascunho).toBeVisible();
  await salvarConfiguracoes(page);
  await expect(secao.getByText(NOME_BENEFICIO)).toBeVisible();
  await expect(secao.getByText(/Mínimo de 99% de frequência/)).toBeVisible();

  // Na Chamada, os dois alunos passam do limite desse benefício.
  const { muitas, uma } = await abrirChamadaDoMesAnterior(page, true);
  await expect(muitas).toBeVisible();
  const botaoMuitas = muitas.getByRole("button", { name: /passou do limite de faltas do mês/ });
  const botaoUma = uma.getByRole("button", { name: /passou do limite de faltas do mês/ });
  await expect(botaoMuitas).toBeVisible();
  await expect(botaoUma).toBeVisible();
  await botaoMuitas.click();
  const painel = page.locator('[data-slot="popover-content"][data-state="open"]');
  const detalhe = painel
    .locator("div.divide-y > div")
    .filter({ hasText: "Frequência estimada" })
    .first();
  await expect(detalhe.getByText(/^5 de \d+ aulas$/)).toBeVisible();
  await expect(detalhe.getByText("Frequência estimada")).toBeVisible();
  await expect(detalhe.getByText("5 aulas acima do limite.", { exact: true })).toBeVisible();
  await expect(
    detalhe.getByText("1 aula justificada desconsiderada.", { exact: true }),
  ).toBeVisible();
  await expect(
    painel.getByText("Estimativa mensal. Não determina o pagamento do benefício.", { exact: true }),
  ).toBeVisible();
  // Razões de interseção podem arredondar para menos de 1 mesmo sem recorte perceptível.
  // Confira os quatro lados do próprio popover em CSS px, com tolerância máxima de 0,5 px.
  await expect
    .poll(async () => {
      const { caixa, tela } = await painel.evaluate((elemento) => {
        const r = elemento.getBoundingClientRect();
        return {
          caixa: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
          tela: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
        };
      });
      return contidoNosLimites(caixa, tela);
    })
    .toBe(true);

  // Se o painel rolar, cada informação continua alcançável dentro de sua área visível.
  const posicaoInicial = await painel.evaluate((elemento) => elemento.scrollTop);
  for (const texto of [
    detalhe.getByText(/^5 de \d+ aulas$/),
    detalhe.getByText("Frequência estimada"),
    detalhe.getByText("5 aulas acima do limite.", { exact: true }),
    detalhe.getByText("1 aula justificada desconsiderada.", { exact: true }),
    painel.getByText("Estimativa mensal. Não determina o pagamento do benefício.", { exact: true }),
  ]) {
    await texto.scrollIntoViewIfNeeded();
    await expect
      .poll(async () => {
        const { caixa, area } = await texto.evaluate((elemento) => {
          const painel = elemento.closest<HTMLElement>('[data-slot="popover-content"]');
          if (!painel) throw new Error("Conteúdo fora do popover");
          const r = elemento.getBoundingClientRect();
          const p = painel.getBoundingClientRect();
          const left = p.left + painel.clientLeft;
          const top = p.top + painel.clientTop;
          return {
            caixa: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            area: {
              left: Math.max(0, left),
              top: Math.max(0, top),
              right: Math.min(innerWidth, left + painel.clientWidth),
              bottom: Math.min(innerHeight, top + painel.clientHeight),
            },
          };
        });
        return contidoNosLimites(caixa, area);
      })
      .toBe(true);
  }
  await painel.evaluate((elemento, posicao) => {
    elemento.scrollTop = posicao;
  }, posicaoInicial);
  await painel.screenshot({ path: test.info().outputPath("aviso-frequencia-resumido.png") });
  await page.keyboard.press("Escape");
  await botaoUma.click();
  await expect(painel.getByText(NOME_BENEFICIO, { exact: true })).toBeVisible();
  await expect(painel.getByText(/Mínimo 99%/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Um feriado no fim do mês muda o percentual com a Chamada já montada,
  // sem trocar o mês ou salvar outra frequência. Remover a data restaura a base.
  await abrirBeneficios(page);
  await selecionarAcaoConfiguracoes(page, "Escola", "Calendário");
  const calendarioLetivo = page.locator('[data-secao="config-calendario"]');
  await calendarioLetivo.getByRole("button", { name: /^Calendário letivo/ }).click();
  const dataFeriado = diasUteis[diasUteis.length - 1] ?? "";
  await escolherDataNoPeriodo(page, "Data do feriado", dataFeriado);
  const nomeFeriado = `${prefixo} calendário mensal`;
  await calendarioLetivo.getByLabel("Nome do feriado", { exact: true }).fill(nomeFeriado);
  await calendarioLetivo.getByRole("button", { name: "Adicionar feriado", exact: true }).click();
  await expect(calendarioLetivo.getByText(nomeFeriado, { exact: true })).toBeVisible();
  await salvarConfiguracoes(page);
  await abrirChamadaDoMesAnterior(page, false);
  await botaoMuitas.click();
  await expect(detalhe.getByText(new RegExp(`^5 de ${diasUteis.length - 1} aulas$`))).toBeVisible();
  await expect(detalhe.getByText(/Mínimo 99%/)).toBeVisible();
  await page.keyboard.press("Escape");
  await abrirBeneficios(page);
  await selecionarAcaoConfiguracoes(page, "Escola", "Calendário");
  await calendarioLetivo
    .getByRole("button", { name: `Remover feriado ${nomeFeriado}`, exact: true })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remover", exact: true }).click();
  await expect(calendarioLetivo.getByText(nomeFeriado, { exact: true })).toHaveCount(0);
  await salvarConfiguracoes(page);
  await abrirChamadaDoMesAnterior(page, false);
  await botaoMuitas.click();
  await expect(detalhe.getByText(new RegExp(`^5 de ${diasUteis.length} aulas$`))).toBeVisible();
  await page.keyboard.press("Escape");

  // Nove aulas na projeção aumentam o limite, preservando a aula já salva de cada dia.
  const carga = await abrirBeneficios(page);
  await carga.getByRole("button", { name: `Editar ${NOME_BENEFICIO}` }).click();
  const configurarCarga = page.getByRole("dialog", { name: "Editar benefício" });
  await configurarCarga.getByLabel("Aulas por dia", { exact: true }).fill("9");
  await configurarCarga.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await salvarConfiguracoes(page);
  await expect(carga.getByText("Projeção de 9 aulas por dia.", { exact: true })).toBeVisible();
  await abrirChamadaDoMesAnterior(page, false);
  await expect(botaoUma).toHaveCount(0);
  await botaoMuitas.click();
  await expect(detalhe.getByText(/^5 de \d+ aulas$/)).toBeVisible();
  await expect(painel.getByText(/Mínimo 99%/)).toBeVisible();
  await page.keyboard.press("Escape");

  // A administração afrouxa a regra para 50%: nenhum dos dois passa mais do limite do benefício.
  const edicao = await abrirBeneficios(page);
  await edicao.getByRole("button", { name: `Editar ${NOME_BENEFICIO}` }).click();
  const editar = page.getByRole("dialog", { name: "Editar benefício" });
  await editar.getByLabel("Frequência mínima, em %").fill("50");
  await editar.getByRole("button", { name: "Aplicar ao rascunho" }).click();
  await salvarConfiguracoes(page);
  await expect(edicao.getByText(/Mínimo de 50% de frequência/)).toBeVisible();

  await abrirChamadaDoMesAnterior(page, false);
  await expect(uma.getByRole("button", { name: /passou do limite de faltas do mês/ })).toHaveCount(
    0,
  );
  if (await botaoMuitas.count()) {
    // Se outro benefício ativo também alerta, o rigoroso não pode estar entre eles.
    await expect(botaoMuitas).not.toHaveAttribute("aria-label", new RegExp(NOME_BENEFICIO));
  }

  // Desativar o benefício também o tira da lista de alertas, e excluir remove a regra.
  const final = await abrirBeneficios(page);
  await final.getByRole("button", { name: `Desativar ${NOME_BENEFICIO}` }).click();
  await expect(
    final.getByText("Benefício desativado no rascunho.").or(final.getByText("Inativo")),
  ).toBeVisible();
  await salvarConfiguracoes(page);
  await final.getByRole("button", { name: `Excluir ${NOME_BENEFICIO}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await expect(final.getByText(NOME_BENEFICIO)).toHaveCount(0);
  await salvarConfiguracoes(page);
});
