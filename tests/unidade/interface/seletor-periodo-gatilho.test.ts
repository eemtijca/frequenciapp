// O Radix precisa registrar o botão como Trigger, não apenas como âncora.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

it.each(["dia", "mes"] as const)("registra o gatilho Radix para o modo %s", (modo) => {
  const valor = modo === "dia" ? "2026-10-12" : "2026-10";
  const html = renderToStaticMarkup(
    createElement(SeletorPeriodo, {
      id: "periodo",
      modo,
      valor,
      max: valor,
      rotuloAcessivel: "Período",
      rotulo: valor,
      onValor: () => {},
    }),
  );
  expect(html).toContain('data-slot="popover-trigger"');
  expect(html).toContain('data-state="closed"');
  expect(html).toContain('aria-expanded="false"');
});
