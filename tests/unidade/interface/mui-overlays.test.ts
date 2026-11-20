// Overlays da Fase 2.4: diálogo, confirmação, popover, abas e acordeão,
// com foco, vínculos ARIA e guardrails de composição.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { Abas, type AbasProps } from "@/components/ui/mui/abas";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Popover, POSICOES_POPOVER } from "@/components/ui/mui/popover";

const DIRETORIO_OVERLAYS = fileURLToPath(
  new URL("../../../src/components/ui/mui/", import.meta.url),
);

const ARQUIVOS = [
  "dialogo.tsx",
  "dialogo-confirmacao.tsx",
  "popover.tsx",
  "abas.tsx",
  "acordeao.tsx",
] as const;

function criar<P extends object>(
  componente: (props: P) => ReactNode,
  props: Omit<NoInfer<P>, "children">,
  ...filhos: ReactNode[]
): ReactNode {
  // Os filhos vão como argumentos, como exige a regra do React no repositório.
  return createElement(componente, props as P, ...filhos);
}

function renderizar(elemento: ReactNode): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme: tema }, elemento));
}

function fonte(nome: string): string {
  return readFileSync(path.join(DIRETORIO_OVERLAYS, nome), "utf8");
}

function extrairAtributo(html: string, atributo: string): string {
  const valor = html.match(new RegExp(`${atributo}="([^"]+)"`))?.[1];
  if (!valor) throw new Error(`Atributo ${atributo} ausente`);
  return valor;
}

type ValorAbaTeste = "resumo" | "historico";

function renderizarAbas(props: AbasProps<ValorAbaTeste>): string {
  return renderizar(createElement(Abas<ValorAbaTeste>, props));
}

describe("diálogo", () => {
  it("permanece fechado sem montar o conteúdo", () => {
    const html = renderizar(
      criar(
        Dialogo,
        { aberto: false, onFechar: () => {}, titulo: "Editar turma" },
        createElement("p", null, "Formulário"),
      ),
    );
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Formulário");
  });

  it("declara rótulos, foco contido, retorno de foco e botão de fechar", () => {
    const texto = fonte("dialogo.tsx");
    expect(texto).toContain("aria-labelledby={tituloId}");
    expect(texto).toContain("aria-describedby={descricao ? descricaoId : undefined}");
    expect(texto).toContain('role="dialog"');
    expect(texto).toContain("disableEnforceFocus={false}");
    expect(texto).toContain("disableRestoreFocus={false}");
    expect(texto).toContain('aria-label="Fechar"');
    expect(texto).toContain("fullScreen={telaCheia}");
    expect(texto).toContain('breakpoints.down("sm")');
  });

  it("usa as medidas de diálogo do tema e tela cheia no celular", () => {
    const texto = fonte("dialogo.tsx");
    expect(texto).toContain("TOKENS_LAYOUT.dialogo.larguraMaxima");
    expect(texto).toContain("TOKENS_LAYOUT.dialogo.padding");
    expect(texto).toContain("RAIOS.dialogo");
    expect(texto).toContain('tamanho === "grande"');
    expect(TOKENS_LAYOUT.dialogo).toEqual({ larguraMaxima: 560, padding: 24, raio: 10 });
  });
});

describe("diálogo de confirmação", () => {
  it("permanece fechado sem montar o conteúdo", () => {
    const html = renderizar(
      criar(DialogoConfirmacao, {
        aberto: false,
        titulo: "Excluir turma",
        onConfirmar: () => {},
        onCancelar: () => {},
      }),
    );
    expect(html).not.toContain('role="alertdialog"');
    expect(html).not.toContain("Excluir turma");
  });

  it("usa alertdialog, ação principal e cancelamento com foco seguro", () => {
    const texto = fonte("dialogo-confirmacao.tsx");
    expect(texto).toContain('role="alertdialog"');
    expect(texto).toContain("aria-labelledby={tituloId}");
    expect(texto).toContain("aria-describedby={descricao ? descricaoId : undefined}");
    expect(texto).toContain("disableEnforceFocus={false}");
    expect(texto).toContain("disableRestoreFocus={false}");
    expect(texto).toContain("autoFocus");
    expect(texto).toContain("onCancelar");
    expect(texto).toContain("onConfirmar");
    expect(texto).toContain('color={destrutivo ? "error" : "secondary"}');
  });

  it("bloqueia o fechamento durante a operação e no clique fora", () => {
    const texto = fonte("dialogo-confirmacao.tsx");
    expect(texto).toContain('motivo === "backdropClick"');
    expect(texto).toContain("operacaoEmAndamento ||");
    expect(texto).toContain('"aria-busy": operacaoEmAndamento');
    expect(texto.match(/disabled=\{operacaoEmAndamento\}/g)).toHaveLength(2);
    expect(texto).not.toContain('aria-label="Fechar"');
  });
});

describe("popover", () => {
  it("permanece fechado sem montar o conteúdo", () => {
    const html = renderizar(
      criar(
        Popover,
        { aberto: false, ancora: null, onFechar: () => {} },
        createElement("p", null, "Conteúdo"),
      ),
    );
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Conteúdo");
  });

  it("mapeia as seis posições para âncora e transformação", () => {
    expect(Object.keys(POSICOES_POPOVER)).toHaveLength(6);
    expect(POSICOES_POPOVER["inferior-inicio"]).toEqual({
      anchorOrigin: { vertical: "bottom", horizontal: "left" },
      transformOrigin: { vertical: "top", horizontal: "left" },
    });
    expect(POSICOES_POPOVER["superior-fim"]).toEqual({
      anchorOrigin: { vertical: "top", horizontal: "right" },
      transformOrigin: { vertical: "bottom", horizontal: "right" },
    });
  });

  it("preserva âncora, posicionamento, foco e papel de diálogo", () => {
    const texto = fonte("popover.tsx");
    expect(texto).toContain("anchorEl={ancora}");
    expect(texto).toContain("anchorOrigin={origem.anchorOrigin}");
    expect(texto).toContain("transformOrigin={origem.transformOrigin}");
    expect(texto).toContain("disableEnforceFocus={false}");
    expect(texto).toContain("disableRestoreFocus={false}");
    expect(texto).toContain('role: "dialog"');
    expect(texto).toContain('"aria-modal": true');
    expect(texto).toContain('"aria-labelledby": rotuloId');
    expect(texto).toContain('"aria-describedby": descricaoId');
    expect(texto).toContain('"aria-label": rotuloId ? undefined : rotuloAcessivel');
    expect(texto).toContain("tabIndex: -1");
    expect(texto).toContain("onClose={onFechar}");
  });
});

describe("abas", () => {
  const itens = [
    {
      valor: "resumo",
      rotulo: "Resumo",
      conteudo: createElement("p", null, "Painel de resumo"),
    },
    {
      valor: "historico",
      rotulo: "Histórico",
      conteudo: createElement("p", null, "Painel de histórico"),
    },
  ] as const;

  it("renderiza tablist, aba ativa e apenas o painel visitado", () => {
    const html = renderizarAbas({
      itens,
      ativo: "resumo",
      onChange: () => {},
      rotuloAcessivel: "Seções do relatório",
      dataPager: "relatorios",
    });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Seções do relatório"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("Painel de resumo");
    expect(html).not.toContain("Painel de histórico");
    expect(html).toContain('data-pager="relatorios"');
    expect(html).toContain("MuiTabs-scrollableX");
  });

  it("liga cada aba ao seu painel e usa o painel visitado como foco", () => {
    const html = renderizarAbas({
      itens,
      ativo: "resumo",
      onChange: () => {},
      rotuloAcessivel: "Seções do relatório",
    });
    const controles = extrairAtributo(html, "aria-controls");
    const rotuloPainel = extrairAtributo(html, "aria-labelledby");
    expect(html).toContain(`id="${controles}"`);
    expect(html).toContain(`id="${rotuloPainel}"`);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-hidden="false"');
  });

  it("omite data-pager quando não informado e usa variante padrão", () => {
    const html = renderizarAbas({
      itens,
      ativo: "resumo",
      onChange: () => {},
      rotuloAcessivel: "Seções",
    });
    expect(html).not.toContain("data-pager");
    expect(html).toContain("MuiTabs-scrollableX");
  });

  it("preserva painéis visitados e os marca como inertes fora de foco", () => {
    const texto = fonte("abas.tsx");
    expect(texto).toContain("visitados.has(item.valor)");
    expect(texto).toContain("inert={!selecionado}");
    expect(texto).toContain("hidden={!selecionado}");
    expect(texto).toContain("aria-hidden={!selecionado}");
    expect(texto).toContain("aria-labelledby={idAba(item.valor)}");
    expect(texto).toContain("aria-controls={idPainel(item.valor)}");
  });
});

describe("acordeão", () => {
  it("associa cabeçalho e região, com título e resumo", () => {
    const html = renderizar(
      criar(
        Acordeao,
        { titulo: "Configurações", resumo: "Escola e horários", aberto: false },
        createElement("p", null, "Conteúdo da seção"),
      ),
    );
    const controles = extrairAtributo(html, "aria-controls");
    const rotuloRegiao = extrairAtributo(html, "aria-labelledby");
    expect(html).toContain("<h3");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Configurações");
    expect(html).toContain("Escola e horários");
    expect(html).toContain('role="region"');
    expect(html).toContain(`id="${controles}"`);
    expect(html).toContain(`id="${rotuloRegiao}"`);
    expect(html).toContain("Conteúdo da seção");
  });

  it("reflete o estado aberto e permite trocar o nível do título", () => {
    const aberto = renderizar(
      criar(
        Acordeao,
        { titulo: "Configurações", aberto: true },
        createElement("p", null, "Conteúdo da seção"),
      ),
    );
    expect(aberto).toContain('aria-expanded="true"');
    expect(aberto).toContain("Mui-expanded");

    const nivel = renderizar(
      criar(
        Acordeao,
        { titulo: "Nível quatro", nivelTitulo: "h4" },
        createElement("p", null, "Conteúdo"),
      ),
    );
    expect(nivel).toContain("<h4");
  });

  it("expõe troca controlada e usa a altura de duas linhas", () => {
    const texto = fonte("acordeao.tsx");
    expect(texto).toContain("expanded={aberto}");
    expect(texto).toContain("onChange?.(expandido)");
    expect(texto).toContain("TOKENS_LAYOUT.lista.duasLinhas");
    expect(texto).toContain("slotProps={{ heading: { component: nivelTitulo } }}");
  });
});

describe("guardrails dos overlays", () => {
  it("mantém cabeçalho, ausência de any e nenhuma classe utilitária", () => {
    for (const nome of ARQUIVOS) {
      const texto = fonte(nome);
      const linhas = texto.split("\n");
      expect(linhas[0], nome).toBe('"use client";');
      expect(linhas[2]?.startsWith("// "), nome).toBe(true);
      expect(texto, nome).not.toMatch(/\bany\b/);
      expect(texto, nome).not.toContain("@ts-ignore");
      expect(texto, nome).not.toContain("className=");
      expect(texto, nome).not.toContain("@/components/ui/mui/botao");
      expect(texto, nome).not.toMatch(/from "(?:@radix|sonner|lucide|next-themes)/);
    }
  });

  it("não importa primitivas de outras subetapas da Fase 2", () => {
    for (const nome of ARQUIVOS) {
      const texto = fonte(nome);
      expect(texto, nome).not.toMatch(/@\/components\/ui\/mui\/(?:botao|campo|selecionar|selo)/);
    }
  });
});
