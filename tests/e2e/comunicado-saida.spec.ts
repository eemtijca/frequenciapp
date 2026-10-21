// Comunicado local de saída: dados salvos, revisão, cópia e recuperação no celular.
import { expect, test } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco, criarLiberadoresE2E, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

let dia = "";
test.describe("comunicado de saída", () => {
  test.beforeEach(async () => {
    await criarMassaE2E();
    await criarLiberadoresE2E();
    dia = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    await comBanco(async (cliente) => {
      await cliente.query(
        `insert into saidas_antecipadas (aluno_id, dia, momento, horario, justificativa, texto, liberado_por_codigo)
         select id, $1::date, 'aula_1', '09:15', 'D', 'E2E Texto reservado', 'E2ECOORD'
         from alunos where nome in ('E2E Aluno Um', 'E2E Aluno Dois')`,
        [dia],
      );
    });
  });
  test.afterEach(async () => {
    await limparMassaE2E();
  });

  test("gera, revisa e copia o comunicado, preservando o texto quando a cópia falha", async ({
    page,
  }, testInfo) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e entradas", "saidas");
    const lista = page.getByRole("list", { name: /^Saídas de / });
    await expect(lista.getByRole("button", { name: /^Remover saída de/ })).toHaveCount(0);
    await lista.getByRole("button", { name: "Gerar comunicado de E2E Aluno Um" }).click();
    const dialogo = page.getByRole("dialog", { name: "Comunicado de saída" });
    const campo = dialogo.getByRole("textbox", { name: "Mensagem" });
    await expect(campo).not.toBeFocused();
    const original = await campo.inputValue();
    expect(original).toContain("autorizou a saída antecipada de E2E Aluno Um, da turma E2E Ano A");
    expect(original).toContain(`em ${dia.split("-").reverse().join("/")}, às 09:15.`);
    expect(original).not.toContain("Doente");
    expect(original).not.toContain("E2E Texto reservado");
    await page.screenshot({ path: testInfo.outputPath("comunicado-inicial.png") });

    for (const tema of ["dark", "light"]) {
      await page.setViewportSize({ width: 320, height: 720 });
      await page.evaluate(
        (escuro) => document.documentElement.classList.toggle("dark", escuro),
        tema === "dark",
      );
      const limites = await dialogo.boundingBox();
      expect(limites).not.toBeNull();
      expect(limites?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((limites?.x ?? 0) + (limites?.width ?? 0)).toBeLessThanOrEqual(321);
      await expect(dialogo.getByRole("button", { name: "Copiar texto" })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`comunicado-${tema}.png`) });
    }
    const revisado = `${original}\nE2E Assinatura revisada`;
    await campo.fill(revisado);
    // Simula a área de transferência, sem encaminhar a mensagem para serviço externo.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (texto: string) => {
            document.documentElement.dataset.comunicadoCopiado = texto;
          },
        },
      });
    });
    await dialogo.getByRole("button", { name: "Copiar texto" }).click();
    await expect(page.getByText("Comunicado copiado.")).toBeVisible();
    expect(await page.locator("html").getAttribute("data-comunicado-copiado")).toBe(revisado);
    await dialogo.getByRole("button", { name: "Fechar", exact: true }).first().click();
    await lista.getByRole("button", { name: "Gerar comunicado de E2E Aluno Dois" }).click();
    await expect(campo).toHaveValue(/E2E Aluno Dois/);
    expect(await campo.inputValue()).not.toContain("E2E Assinatura revisada");
    expect(await campo.inputValue()).not.toContain("Foi buscar o irmão");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("E2E Cópia indisponível");
          },
        },
      });
    });
    await dialogo.getByRole("button", { name: "Copiar texto" }).click();
    await expect(
      dialogo.getByText("Não foi possível copiar. Selecione o texto para copiar manualmente."),
    ).toBeVisible();
    await expect(campo).toBeFocused();
    expect(
      await campo.evaluate(
        (elemento: HTMLTextAreaElement) => elemento.selectionEnd - elemento.selectionStart,
      ),
    ).toBe((await campo.inputValue()).length);
    await campo.fill("");
    await expect(dialogo.getByRole("button", { name: "Copiar texto" })).toBeDisabled();
  });
});
