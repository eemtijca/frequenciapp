// A política pública descreve o tratamento real e abre sem sessão.
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";
import { tema } from "@/theme/tema";
import VistaPrivacidade, { LACUNAS_PRIVACIDADE } from "@/components/privacidade/vista-privacidade";
import { REDIRECIONAMENTO_PRIVACIDADE, ROTA_PRIVACIDADE } from "@/lib/rotas-publicas";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => createElement("img", { alt: props.alt ?? "" }),
}));

function htmlDaPolitica(): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme: tema }, createElement(VistaPrivacidade)),
  );
}

it("expõe a política, o escopo drive.file e as lacunas institucionais", () => {
  const html = htmlDaPolitica();
  expect(html).toContain("Política de privacidade");
  expect(html).toContain("EEMTI José Cláudio de Araújo");
  expect(html).toContain("Mucambo");
  expect(html).toContain("https://frequenciapp.jcelab.com.br");
  expect(html).toContain("https://www.googleapis.com/auth/drive.file");
  expect(html).toContain("Google API Services User Data Policy");
  expect(html).toContain("Limited Use");
  expect(html).toContain("não são vendidos");
  expect(html).toContain("publicidade");
  expect(html).toContain(LACUNAS_PRIVACIDADE.encarregado);
  expect(html).toContain(LACUNAS_PRIVACIDADE.email);
  expect(html).toContain('data-lacuna="email"');
  expect(html).toContain('<h1 class="');
  expect(html).not.toContain("tailwind");
  expect(html).not.toMatch(/\bvocês?\b/i);
  for (const titulo of [
    "Controladora e âmbito",
    "Dados tratados",
    "Finalidades",
    "Base legal",
    "Crianças e adolescentes",
    "Integração com o Google",
    "Compartilhamento",
    "Retenção",
    "Segurança",
    "Direitos da pessoa titular",
    "Contato",
  ]) {
    expect(html).toContain(titulo);
  }
});

it("não exige sessão e permanece alcançável pelo proxy e pelo nome alternativo", async () => {
  const pagina = readFileSync("src/app/privacidade/page.tsx", "utf8");
  expect(pagina).not.toMatch(/exigirSessao|identidadeAtual/);
  const proxy = readFileSync("src/proxy.ts", "utf8");
  expect(proxy).toContain(ROTA_PRIVACIDADE);
  expect(proxy).toContain("/politica-de-privacidade");
  const entrada = readFileSync("src/components/entrada/tela-login.tsx", "utf8");
  const sobre = readFileSync("src/components/dialogo-sobre.tsx", "utf8");
  expect(entrada).toContain("ROTA_PRIVACIDADE");
  expect(sobre).toContain("ROTA_PRIVACIDADE");
  expect(sobre).not.toContain("docs/lgpd.md");
  const redirecionar = nextConfig.redirects;
  if (!redirecionar) throw new Error("Redirecionamento da política ausente.");
  expect(await redirecionar()).toContainEqual(REDIRECIONAMENTO_PRIVACIDADE);
});
