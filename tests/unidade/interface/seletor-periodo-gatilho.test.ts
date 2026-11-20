// O gatilho do seletor de período é um botão do Material UI e não um Trigger do Radix.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

function renderizar(modo: "dia" | "mes") {
  const valor = modo === "dia" ? "2026-10-12" : "2026-10";
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme: tema },
      createElement(SeletorPeriodo, {
        id: "periodo",
        modo,
        valor,
        max: valor,
        rotuloAcessivel: "Período",
        rotulo: valor,
        onValor: () => {},
      }),
    ),
  );
}

it.each(["dia", "mes"] as const)("renderiza o gatilho do MUI para o modo %s", (modo) => {
  const html = renderizar(modo);
  expect(html).toContain("MuiButtonBase-root");
  expect(html).toContain('id="periodo"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("data-slot");
  expect(html).not.toContain("data-state");
});
