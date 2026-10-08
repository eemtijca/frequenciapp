// Revisão de linhas após a transferência, mesmo sem chamadas pendentes.
// A remoção exige modo completo e confirmação explícita; dados sintéticos.
import { expect, test, type Page } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);

async function abrir(page: Page, modoCompleto: boolean, falharReleitura = false) {
  const envios: {
    removerLinhas?: number[];
    somenteAlteradas?: boolean;
    planoHashGeral?: string;
  }[] = [];
  await page.route("**/api/planilha/estado", (rota) =>
    rota.fulfill({
      json: {
        estado: { ativa: true, podeEnviar: true, modo: modoCompleto ? "completo" : "conservador" },
      },
    }),
  );
  await page.route("**/api/planilha/simular", (rota) => {
    const entrada = rota.request().postDataJSON() as {
      turmaOriginalId: string;
      somenteAlteradas: boolean;
      removerLinhas?: number[];
    };
    const semEnvio = entrada.somenteAlteradas;
    const removidas = entrada.removerLinhas?.includes(4) ? 1 : 0;
    if (falharReleitura && removidas) {
      return rota.fulfill({
        status: 502,
        json: { error: "Não foi possível conferir a linha selecionada." },
      });
    }
    const planoHash = (removidas ? "b" : "a").repeat(64);
    return rota.fulfill({
      json: {
        modalidade: modoCompleto ? "completo" : "conservador",
        planoHashGeral: planoHash,
        planos: [
          {
            turmaOriginalId: entrada.turmaOriginalId,
            rotulo: "E2E Ano A",
            aba: "E2E Ano A · Outubro",
            dias: [],
            semEnvio,
            bloqueado: false,
            planoHashTurma: planoHash,
            resumo: {
              preencher: 0,
              sinalizar: 0,
              substituir: 0,
              limpar: 0,
              novasColunas: 0,
              novosAlunos: 0,
              vincular: 0,
              removerLinhas: removidas,
              removerColunas: 0,
              puladasFormula: 0,
              puladasOcupadas: 0,
              ambiguidades: 0,
            },
            avisos: [],
            novasColunas: [],
            novosAlunos: [],
            substituir: [],
            sinalizar: [],
            candidatosRemocaoLinhas: semEnvio ? [] : [{ linha: 4, nome: "E2E Transferida" }],
            candidatosRemocaoColunas: semEnvio
              ? []
              : [{ coluna: 3, letra: "C", rotulo: "Total antigo" }],
          },
        ],
      },
    });
  });
  await page.route("**/api/planilha/aplicar", (rota) => {
    envios.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { resultados: [{ resultado: "sucesso" }] } });
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Grade", exact: true }).click();
  await page.getByRole("button", { name: "Enviar para a planilha", exact: true }).click();
  return { dialogo: page.getByRole("dialog"), envios };
}

test("modo completo mostra a linha transferida sem pendências e só envia a remoção marcada", async ({
  page,
}) => {
  const { dialogo, envios } = await abrir(page, true);
  await expect(dialogo.getByLabel(/O período inteiro/)).toBeChecked();
  const remover = dialogo.getByLabel("Remover E2E Transferida (linha 4)", { exact: true });
  await expect(remover).toBeVisible();
  await expect(remover).not.toBeChecked();
  expect(envios).toHaveLength(0);
  await expect(dialogo.getByText(/confira primeiro a aba de destino/)).toBeVisible();
  await remover.check();
  await expect(dialogo.getByText("Excluir: 1 linha e 0 colunas", { exact: true })).toBeVisible();
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect.poll(() => envios.length).toBe(1);
  expect(envios[0]).toMatchObject({
    removerLinhas: [4],
    somenteAlteradas: false,
    planoHashGeral: "b".repeat(64),
  });
});

test("falha ao reler a remoção impede enviar o plano anterior", async ({ page }) => {
  const { dialogo, envios } = await abrir(page, true, true);
  await dialogo.getByLabel("Remover E2E Transferida (linha 4)", { exact: true }).check();
  await expect(
    dialogo.getByText("Não foi possível conferir a linha selecionada.", { exact: true }),
  ).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
  await expect(dialogo.getByRole("button", { name: "Repetir prévia", exact: true })).toBeEnabled();
  await expect(
    dialogo.getByLabel("Remover E2E Transferida (linha 4)", { exact: true }),
  ).toBeChecked();
  expect(envios).toHaveLength(0);
});

test("modo conservador oferece conferência sem permitir marcar exclusões", async ({ page }) => {
  const { dialogo, envios } = await abrir(page, false);
  await expect(dialogo.getByText(/Nenhuma chamada pendente/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Conferir linhas da turma", exact: true }).click();
  await expect(dialogo.getByLabel(/O período inteiro/)).toBeChecked();
  await expect(dialogo.getByLabel("Remover E2E Transferida (linha 4)")).toBeDisabled();
  await expect(dialogo.getByLabel("Remover coluna Total antigo (C)")).toBeDisabled();
  await expect(dialogo.getByText(/exige liberar o modo completo na Gestão/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(envios).toHaveLength(0);
});
