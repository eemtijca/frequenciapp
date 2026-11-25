// Componentes de layout da Fase 2.1: constantes, variantes de largura,
// colunas, legenda de tabela, diálogo e guardrails de composição.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { DialogoPadrao } from "@/components/layout/dialogo-padrao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { FormularioPadrao, TAMANHO_CAMPO } from "@/components/layout/formulario-padrao";
import { COLUNAS_GRADE, GradeCartoes, TAMANHO_CARTAO } from "@/components/layout/grade-cartoes";
import { LARGURAS_CONTEUDO, LayoutConteudo } from "@/components/layout/layout-conteudo";
import { LayoutPagina } from "@/components/layout/layout-pagina";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";

const DIRETORIO_LAYOUT = fileURLToPath(new URL("../../../src/components/layout/", import.meta.url));

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
  return readFileSync(path.join(DIRETORIO_LAYOUT, nome), "utf8");
}

function fontesDoLayout(): { nome: string; texto: string }[] {
  return readdirSync(DIRETORIO_LAYOUT)
    .filter((nome) => nome.endsWith(".tsx"))
    .sort()
    .map((nome) => ({ nome, texto: fonte(nome) }));
}

const LARGURAS = ["leitura", "gestao", "larga"] as const;

describe("constantes dos componentes de layout", () => {
  it("mapeia as larguras de conteúdo para os tokens do tema", () => {
    expect(LARGURAS_CONTEUDO).toEqual({ leitura: 840, gestao: 1040, larga: 1280 });
    expect(LARGURAS_CONTEUDO).toEqual({
      leitura: TOKENS_LAYOUT.largura.leitura,
      gestao: TOKENS_LAYOUT.largura.gestao,
      larga: TOKENS_LAYOUT.largura.excepcional,
    });
  });

  it("usa as colunas responsivas de 4, 8 e 12 da grade de cartões", () => {
    expect(COLUNAS_GRADE).toEqual({ xs: 4, sm: 8, md: 12 });
    expect(TAMANHO_CARTAO).toEqual({ xs: 4, sm: 4, md: 4, lg: 3 });
  });

  it("mantém o formulário com uma e duas colunas", () => {
    expect(TAMANHO_CAMPO).toEqual({ uma: { xs: 12 }, duas: { xs: 12, md: 6 } });
  });

  it("preserva as medidas de tabela e diálogo do tema", () => {
    expect(TOKENS_LAYOUT.tabela).toEqual({ cabecalho: 56, linha: 52, padding: 16 });
    expect(TOKENS_LAYOUT.dialogo).toEqual({ larguraMaxima: 560, padding: 24, raio: 10 });
  });
});

describe("estrutura de página", () => {
  it("renderiza a página como main com a marca de gaveta", () => {
    const comGaveta = renderizar(criar(LayoutPagina, {}, "Conteúdo"));
    const semGaveta = renderizar(criar(LayoutPagina, { semGaveta: true }, "Conteúdo"));
    expect(comGaveta).toContain("<main");
    expect(comGaveta).toContain("Conteúdo");
    expect(comGaveta).not.toContain("data-sem-gaveta");
    expect(semGaveta).toContain('data-sem-gaveta="true"');
  });

  it("declara altura de tela e as quatro áreas seguras", () => {
    const texto = fonte("layout-pagina.tsx");
    expect(texto).toContain('minHeight: "100dvh"');
    for (const area of ["top", "right", "bottom", "left"]) {
      expect(texto).toContain(`env(safe-area-inset-${area}, 0px)`);
    }
  });

  it("centraliza o conteúdo com a largura da variante", () => {
    for (const largura of LARGURAS) {
      const html = renderizar(criar(LayoutConteudo, { largura }, "Conteúdo"));
      expect(html).toContain("Conteúdo");
      expect(html).toContain(`max-width:${LARGURAS_CONTEUDO[largura]}px`);
      expect(html).toContain("margin-left:auto");
      expect(html).toContain("margin-right:auto");
    }
  });

  it("aplica padding responsivo de 16, 24 e 32", () => {
    const html = renderizar(criar(LayoutConteudo, {}, "Conteúdo"));
    for (const [largura, passo] of [
      [0, 2],
      [600, 3],
      [1240, 4],
    ]) {
      const bloco = html.split(`@media (min-width:${largura}px)`)[1]?.split("}}")[0];
      for (const lado of ["left", "right", "top", "bottom"]) {
        expect(bloco).toContain(`padding-${lado}:calc(${passo} * var(--template-spacing))`);
      }
    }
  });
});

describe("cabeçalho e seção", () => {
  it("usa título de nível 1 e ações no cabeçalho da página", () => {
    const html = renderizar(
      criar(CabecalhoPagina, {
        titulo: "Turmas",
        descricao: "Turmas do ano letivo",
        acoes: createElement("span", null, "Nova turma"),
      }),
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Turmas");
    expect(html).toContain("Turmas do ano letivo");
    expect(html).toContain("Nova turma");
  });

  it("renderiza a seção em superfície plana, sem cartão e com título associado", () => {
    const html = renderizar(
      criar(
        SecaoConteudo,
        {
          titulo: "Indicadores",
          descricao: "Resumo do período",
          acoes: createElement("span", null, "Atualizar"),
        },
        createElement("p", null, "Conteúdo da seção"),
      ),
    );
    expect(html).toContain("<section");
    expect(html).toContain("<h2");
    expect(html).toContain("MuiPaper-outlined");
    expect(html).not.toContain("MuiCard-root");
    expect(html).toContain("Conteúdo da seção");
    const rotulo = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    if (!rotulo) throw new Error("Seção sem aria-labelledby");
    expect(html).toContain(`id="${rotulo}"`);
  });
});

describe("grade de cartões e formulário", () => {
  it("distribui os cartões nas colunas 4, 8 e 12", () => {
    const html = renderizar(
      criar(
        GradeCartoes,
        {},
        createElement("span", null, "Cartão A"),
        createElement("span", null, "Cartão B"),
      ),
    );
    expect(html).toContain("MuiGrid-container");
    expect(html).toContain("--Grid-columns:4");
    expect(html).toContain("--Grid-columns:8");
    expect(html).toContain("--Grid-columns:12");
    expect(html).toContain("@media (min-width:905px)");
    expect(html.match(/MuiGrid-grid-xs-4/g)).toHaveLength(2);
    expect(html.match(/MuiGrid-grid-lg-3/g)).toHaveLength(2);
    expect(html).toContain("--Grid-rowSpacing:calc(2 * var(--template-spacing))");
  });

  it("aceita espaçamento 3 na grade de cartões", () => {
    const html = renderizar(
      criar(GradeCartoes, { spacing: 3 }, createElement("span", null, "Cartão")),
    );
    expect(html).toContain("--Grid-rowSpacing:calc(3 * var(--template-spacing))");
  });

  it("usa duas colunas no desktop e uma no celular", () => {
    const html = renderizar(
      criar(
        FormularioPadrao,
        { acoes: createElement("span", null, "Salvar") },
        createElement("span", null, "Campo A"),
        createElement("span", null, "Campo B"),
      ),
    );
    expect(html.match(/MuiGrid-grid-xs-12/g)).toHaveLength(3);
    expect(html.match(/MuiGrid-grid-md-6/g)).toHaveLength(2);
    expect(html).toContain("--Grid-rowSpacing:calc(3 * var(--template-spacing))");
    expect(html).toContain("justify-content:flex-end");
    expect(html).toContain("Salvar");
  });

  it("força uma coluna quando solicitado", () => {
    const html = renderizar(
      criar(
        FormularioPadrao,
        { colunas: 1 },
        createElement("span", null, "Campo A"),
        createElement("span", null, "Campo B"),
      ),
    );
    expect(html.match(/MuiGrid-grid-xs-12/g)).toHaveLength(2);
    expect(html).not.toContain("MuiGrid-grid-md-6");
  });
});

describe("tabela padrão", () => {
  function tabela(caption?: string, primeiraColunaFixa = false): string {
    return renderizar(
      criar(
        TabelaPadrao,
        { caption, primeiraColunaFixa },
        createElement(
          TableHead,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, { component: "th", scope: "col" }, "Turma"),
            createElement(TableCell, { component: "th", scope: "col", align: "right" }, "Faltas"),
          ),
        ),
        createElement(
          TableBody,
          null,
          createElement(
            TableRow,
            null,
            createElement(TableCell, { component: "th", scope: "row" }, "1A"),
            createElement(TableCell, { align: "right" }, "3"),
          ),
        ),
      ),
    );
  }

  it("renderiza contêiner de superfície, legenda e escopos", () => {
    const html = tabela("Frequência por turma");
    expect(html).toContain("MuiTableContainer-root");
    expect(html).toContain("MuiPaper-outlined");
    expect(html).toMatch(/<caption[^>]*>Frequência por turma<\/caption>/);
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("MuiTableCell-alignRight");
  });

  it("fixa a primeira coluna e alinha números à direita", () => {
    const html = tabela("Frequência por turma", true);
    expect(html).toContain("position:sticky");
    expect(html).toContain("left:0");
    expect(html).toContain("text-align:right");
    expect(html).toContain("font-variant-numeric:tabular-nums");
  });

  it("nomeia a tabela quando a legenda não é informada", () => {
    const html = tabela();
    expect(html).toContain('aria-label="Tabela de dados"');
    expect(html).not.toContain("<caption");
    expect(html).not.toContain("position:sticky");
  });
});

describe("diálogo padrão", () => {
  it("permanece fechado sem renderizar o conteúdo", () => {
    const html = renderizar(
      criar(
        DialogoPadrao,
        {
          aberto: false,
          onFechar: () => {},
          titulo: "Confirmar ação",
        },
        createElement("p", null, "Conteúdo"),
      ),
    );
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Conteúdo");
  });

  it("declara foco contido, retorno de foco, rótulos e fechamento", () => {
    const texto = fonte("dialogo-padrao.tsx");
    expect(texto).toContain("aria-labelledby={tituloId}");
    expect(texto).toContain("aria-describedby={descricao ? descricaoId : undefined}");
    expect(texto).toContain('role={alerta ? "alertdialog" : "dialog"}');
    expect(texto).toContain("disableEnforceFocus={false}");
    expect(texto).toContain("disableRestoreFocus={false}");
    expect(texto).toContain('aria-label="Fechar"');
    expect(texto).toContain('fullScreen={tamanho === "grande" && telaPequena}');
    expect(texto).toContain("fullWidth");
  });
});

describe("estado vazio", () => {
  it("mostra ícone decorativo, título, descrição e ação", () => {
    const html = renderizar(
      criar(EstadoVazio, {
        icone: createElement("svg", { viewBox: "0 0 24 24" }),
        titulo: "Nenhuma turma",
        descricao: "Cadastre uma turma para começar.",
        acao: createElement("span", null, "Cadastrar turma"),
      }),
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<h2");
    expect(html).toContain("Nenhuma turma");
    expect(html).toContain("Cadastre uma turma para começar.");
    expect(html).toContain("Cadastrar turma");
  });
});

describe("guardrails de composição", () => {
  it("não usa any, ts-ignore nem classes utilitárias do Tailwind", () => {
    for (const { nome, texto } of fontesDoLayout()) {
      expect(texto, nome).not.toMatch(/\bany\b/);
      expect(texto, nome).not.toContain("@ts-ignore");
      expect(texto, nome).not.toMatch(
        /className="[^"]*(?:\b(?:flex|grid|hidden|p-|m-|w-|max-w-)\b)/,
      );
    }
  });

  it("reserva a largura de página ao LayoutConteudo", () => {
    for (const { nome, texto } of fontesDoLayout()) {
      if (nome === "layout-conteudo.tsx") continue;
      // Não é uma largura de conteúdo: o grupo de ações pode quebrar dentro do cabeçalho.
      const semLimiteDasAcoes =
        nome === "cabecalho-pagina.tsx"
          ? texto.replace('...(compacto && { maxWidth: "100%" }),', "")
          : texto;
      expect(semLimiteDasAcoes, nome).not.toContain("maxWidth");
    }

    const acoes = createElement("button", null, "Nova turma");
    const padrao = renderizar(criar(CabecalhoPagina, { titulo: "Turmas", acoes }));
    const compacto = renderizar(
      criar(CabecalhoPagina, { titulo: "Turmas", acoes, compacto: true }),
    );
    expect(padrao).not.toContain("max-width:");
    const grupo = compacto.match(/<div class="([^"]+)"[^>]*><button>Nova turma<\/button>/)?.[1];
    const classeCss = grupo?.split(" ").find((classe) => classe.startsWith("css-"));
    if (!classeCss) throw new Error("Estilo do grupo de ações compacto ausente");
    expect(compacto.match(/max-width:[^;}]+/g)).toEqual(["max-width:100%"]);
    expect(compacto).toMatch(new RegExp(`\\.${classeCss}\\{[^{}]*max-width:100%[;}]`));
  });

  it("não cria display grid fora dos componentes de grade", () => {
    for (const { nome, texto } of fontesDoLayout()) {
      expect(texto, nome).not.toMatch(/display:\s*["']grid["']/);
    }
  });
});
