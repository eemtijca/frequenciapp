// Confere a data real do salvamento no histórico de frequências.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";

it("distingue o dia da chamada da data em que ela foi salva", () => {
  const html = renderToStaticMarkup(
    createElement(VistaHistorico, {
      frequencias: [
        {
          dia: "2025-12-01",
          turmaId: "turma-teste",
          revisao: 1,
          atualizadoEm: "2026-01-01T01:30:00.000Z",
          atualizadoPorNome: "Pessoa de teste",
          faltas: [],
        },
      ],
      turmas: [],
      series: [],
      mes: "2025-12",
      mesCorrente: "2026-01",
      fuso: "America/Fortaleza",
      onMes: () => {},
      onAbrir: () => {},
      bloqueado: false,
      rotuloTurma: () => "Turma de teste",
    }),
  );
  expect(html).toContain("salva em 31/12/2025 às 22:30 por Pessoa de teste");
});
