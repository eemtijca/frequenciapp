// Primitivas restantes da Fase 2: busca, atualização, carrossel, opções e rodapé.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { ProvedorAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { BarraBusca, type BarraBuscaProps } from "@/components/ui/mui/barra-busca";
import { BotaoAtualizar, type BotaoAtualizarProps } from "@/components/ui/mui/botao-atualizar";
import {
  CarrosselCartoes,
  type CarrosselCartoesProps,
  type ItemCarrossel,
} from "@/components/ui/mui/carrossel-cartoes";
import { GrupoOpcoes, type GrupoOpcoesProps } from "@/components/ui/mui/grupo-opcoes";
import { PainelAcoes, type PainelAcoesProps } from "@/components/ui/mui/painel-acoes";

const DIRETORIO = path.resolve(process.cwd(), "src/components/ui/mui");
const ARQUIVOS = [
  "barra-busca.tsx",
  "botao-atualizar.tsx",
  "carrossel-cartoes.tsx",
  "grupo-opcoes.tsx",
  "painel-acoes.tsx",
] as const;

type ValorGrupo = "presente" | "falta" | "justificada";

function renderizar(elemento: ReactNode): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme: tema }, elemento));
}

function semEstilos(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function criar<P extends object>(
  componente: (props: P) => ReactNode,
  props: Omit<NoInfer<P>, "children">,
  ...filhos: ReactNode[]
): ReactNode {
  return createElement(componente, props as P, ...filhos);
}

function fonte(nome: string): string {
  return readFileSync(path.join(DIRETORIO, nome), "utf8");
}

function arquivosDe(diretorio: string, extensoes: string[]): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) return arquivosDe(caminho, extensoes);
    return extensoes.some((extensao) => entrada.name.endsWith(extensao)) ? [caminho] : [];
  });
}

function renderizarBusca(props: BarraBuscaProps): string {
  return renderizar(createElement(BarraBusca, props));
}

function renderizarAtualizar(props: BotaoAtualizarProps): string {
  return renderizar(createElement(BotaoAtualizar, props));
}

function renderizarCarrossel(props: CarrosselCartoesProps): string {
  return renderizar(createElement(CarrosselCartoes, props));
}

function renderizarGrupo(props: GrupoOpcoesProps<ValorGrupo>): string {
  return renderizar(createElement(GrupoOpcoes<ValorGrupo>, props));
}

function renderizarPainel(props: PainelAcoesProps): string {
  return renderizar(createElement(PainelAcoes, props));
}

const ITENS: ItemCarrossel[] = [
  { id: "primeiro", rotulo: "Primeiro", render: () => createElement("p", null, "Cartão um") },
  { id: "segundo", rotulo: "Segundo", render: () => createElement("p", null, "Cartão dois") },
  { id: "terceiro", rotulo: "Terceiro", render: () => createElement("p", null, "Cartão três") },
];

const OPCOES: GrupoOpcoesProps<ValorGrupo>["opcoes"] = [
  { valor: "presente", rotulo: "Presente" },
  { valor: "falta", rotulo: "Falta" },
  { valor: "justificada", rotulo: "Justificada", disabled: true },
];

function descreverArquivo(nome: string): { cabecalho: string[]; restante: string[] } {
  const linhas = fonte(nome).split("\n");
  let inicio = linhas[0]?.startsWith('"use client"') ? 1 : 0;
  while (linhas[inicio]?.trim() === "") inicio += 1;
  const cabecalho: string[] = [];
  while (linhas[inicio]?.trim().startsWith("//")) {
    const linha = linhas[inicio];
    if (linha) cabecalho.push(linha);
    inicio += 1;
  }
  return { cabecalho, restante: linhas.slice(inicio) };
}

describe("BarraBusca", () => {
  it("renderiza busca controlada, lupa e botão de limpar", () => {
    const html = renderizarBusca({
      id: "busca-alunos",
      valor: "Ana",
      onValor: () => {},
      placeholder: "Buscar aluno",
    });

    expect(html).toContain('type="search"');
    expect(html).toContain('id="busca-alunos"');
    expect(html).toContain('value="Ana"');
    expect(html).toContain('placeholder="Buscar aluno"');
    expect(html).toContain('aria-label="Buscar aluno"');
    expect(html).toContain('aria-label="Limpar busca"');
    expect(html).toContain("MuiInputAdornment-positionStart");
    expect(html).toContain("MuiInputAdornment-positionEnd");
  });

  it("usa um rótulo acessível diferente do texto de exemplo", () => {
    const html = renderizarBusca({
      id: "busca-turmas",
      valor: "",
      onValor: () => {},
      placeholder: "Digite o nome",
      rotulo: "Buscar turma",
    });

    expect(html).toContain('aria-label="Buscar turma"');
    expect(html).toContain('placeholder="Digite o nome"');
    expect(html).not.toContain('aria-label="Limpar busca"');
  });

  it("mantém a altura de alvo de toque e as cores do tema", () => {
    const texto = fonte("barra-busca.tsx");
    expect(texto).toContain("TOKENS_LAYOUT.alvoToque");
    expect(texto).toContain("theme.vars");
    expect(texto).toContain('type="search"');
    expect(texto).toContain('autoComplete="off"');
  });
});

describe("BotaoAtualizar", () => {
  it("expõe o rótulo, a ação explícita e o estado disponível", () => {
    const html = semEstilos(renderizarAtualizar({ onAtualizar: () => {} }));

    expect(html).toContain('aria-label="Atualizar tela"');
    expect(html).toContain("<button");
    expect(html).not.toContain("disabled");
  });

  it("desabilita quando a visão não registra atualização", () => {
    const html = renderizarAtualizar({ disponivel: false });
    expect(html).toContain("disabled");
  });

  it("desabilita sem ação quando não há contexto de atualização", () => {
    const html = renderizar(createElement(BotaoAtualizar, null));
    expect(html).toContain("disabled");
  });

  it("lê o contexto da visão ativa", () => {
    const html = renderizar(
      criar(ProvedorAtualizacao, { ativo: "painel" }, createElement(BotaoAtualizar, null)),
    );
    expect(html).toContain('aria-label="Atualizar tela"');
    expect(html).toContain("disabled");
  });

  it("mostra progresso e bloqueia o toque durante a atualização", () => {
    const html = renderizarAtualizar({ onAtualizar: () => {}, ocupado: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("MuiCircularProgress-root");
    expect(html).toContain("disabled");
  });

  it("usa ícone de 48 dp, dica e o contexto existente", () => {
    const texto = fonte("botao-atualizar.tsx");
    expect(texto).toContain("useContextoAtualizacao");
    expect(texto).toContain("BotaoIcone");
    expect(texto).toContain("Tooltip");
    expect(texto).toContain("TOKENS_LAYOUT.alvoToque");
    expect(texto).toContain("Atualização indisponível nesta tela");
  });
});

describe("CarrosselCartoes", () => {
  it("monta o cartão ativo e os visitados, sem montar os demais", () => {
    const html = renderizarCarrossel({
      itens: ITENS,
      valor: "segundo",
      visitados: ["primeiro", "segundo"],
      onValor: () => {},
      rotuloAcessivel: "Cartões de gráficos",
    });

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-roledescription="carrossel"');
    expect(html).toContain('aria-label="Cartões de gráficos"');
    expect(html).toContain('data-cartao="primeiro"');
    expect(html).toContain('data-ativo="false"');
    expect(html).toContain('data-cartao="segundo"');
    expect(html).toContain('data-ativo="true"');
    expect(html).not.toContain('data-cartao="terceiro"');
    expect(html).toContain('aria-label="1 de 3: Primeiro"');
    expect(html).toContain('aria-label="2 de 3: Segundo"');
    expect(html).toContain("2 de 3");
    expect(html).toContain("Segundo");
    expect(html).toContain("Cartão um");
    expect(html).toContain("Cartão dois");
    expect(html).not.toContain("Cartão três");
  });

  it("marca o cartão ativo como ocupado e oferece o conteúdo complementar", () => {
    const html = renderizarCarrossel({
      itens: ITENS,
      valor: "primeiro",
      visitados: ["primeiro"],
      onValor: () => {},
      rotuloAcessivel: "Cartões de gráficos",
      ocupado: true,
      children: (ativo, indice) => createElement("span", null, `${indice + 1}: ${ativo.rotulo}`),
    });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("1: Primeiro");
  });

  it("usa trilho com scroll snap, teclado e área de rolagem contida", () => {
    const texto = fonte("carrossel-cartoes.tsx");
    expect(texto).toContain("scrollSnapType");
    expect(texto).toContain("scrollSnapAlign");
    expect(texto).toContain("overflowX");
    expect(texto).toContain("prefers-reduced-motion");
    expect(texto).toContain("ArrowLeft");
    expect(texto).toContain("ArrowRight");
    expect(texto).toContain("Home");
    expect(texto).toContain("End");
    expect(texto).toContain("data-cartao");
    expect(texto).toContain("data-ativo");
    expect(texto).not.toMatch(/swiper|embla|slick|keen-slider/i);
  });
});

describe("GrupoOpcoes", () => {
  it("usa radiogroup, aria-checked e mantém uma opção marcada", () => {
    const html = renderizarGrupo({
      rotulo: "Situação da falta",
      valor: "presente",
      opcoes: OPCOES,
      onValor: () => {},
    });

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Situação da falta"');
    expect(html).toContain('role="radio"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
    expect(html).not.toContain("aria-pressed");
    expect(html).toContain("Presente");
    expect(html).toContain("Falta");
    expect(html).toContain("Justificada");
  });

  it("desabilita o grupo inteiro quando solicitado", () => {
    const html = renderizarGrupo({
      rotulo: "Situação da falta",
      valor: "presente",
      opcoes: OPCOES,
      onValor: () => {},
      disabled: true,
    });
    expect(html).toContain("disabled");
  });

  it("usa ToggleButtonGroup e o alvo de 48 dp", () => {
    const texto = fonte("grupo-opcoes.tsx");
    expect(texto).toContain("ToggleButtonGroup");
    expect(texto).toContain('role="radiogroup"');
    expect(texto).toContain('role="radio"');
    expect(texto).toContain("aria-checked={selecionada}");
    expect(texto).toContain("onKeyDown={aoTeclar}");
    expect(texto).toContain("ArrowRight");
    expect(texto).toContain("Home");
    expect(texto).toContain("TOKENS_LAYOUT.alvoToque");
  });
});

describe("PainelAcoes", () => {
  it("renderiza o rodapé rotulado com as ações recebidas", () => {
    const html = renderizarPainel({
      rotulo: "Ações da chamada",
      children: createElement("button", { type: "button" }, "Salvar chamada"),
    });

    expect(html).toContain("<footer");
    expect(html).toContain('aria-label="Ações da chamada"');
    expect(html).toContain('data-fixo="false"');
    expect(html).toContain("Salvar chamada");
  });

  it("marca o comportamento fixo quando solicitado", () => {
    const html = renderizarPainel({
      rotulo: "Ações da chamada",
      fixo: true,
      children: createElement("button", { type: "button" }, "Salvar chamada"),
    });
    expect(html).toContain('data-fixo="true"');
  });

  it("aplica área segura e posição fixa apenas na variante presa", () => {
    const texto = fonte("painel-acoes.tsx");
    expect(texto).toContain("safe-area-inset-bottom");
    expect(texto).toContain("safe-area-inset-left");
    expect(texto).toContain("safe-area-inset-right");
    expect(texto).toContain('position: "fixed"');
    expect(texto).toContain("TOKENS_LAYOUT.cartao.padding");
    expect(texto).toContain("theme.vars");
  });
});

describe("restrições estáticas das primitivas restantes", () => {
  it("mantém cabeçalho curto, imports diretos e nenhuma classe utilitária", () => {
    for (const arquivo of ARQUIVOS) {
      const conteudo = fonte(arquivo);
      const { cabecalho } = descreverArquivo(arquivo);
      expect(cabecalho.length, `${arquivo} deve ter cabeçalho`).toBeGreaterThan(0);
      expect(cabecalho.length, `${arquivo} deve ter no máximo duas linhas`).toBeLessThanOrEqual(2);
      expect(conteudo, `${arquivo} não usa className`).not.toContain("className=");
      expect(conteudo, `${arquivo} não usa @ts-ignore`).not.toContain("@ts-ignore");
      expect(conteudo, `${arquivo} não usa any`).not.toMatch(/\bany\b/);
      expect(conteudo, `${arquivo} não usa Tailwind`).not.toContain("tailwind");
      expect(conteudo, `${arquivo} não importa a UI antiga`).not.toContain("@/components/ui/");
      expect(conteudo, `${arquivo} não importa os campos da subetapa 2.3`).not.toMatch(
        /from "@\/components\/ui\/mui\/(campo|campo-texto|selecionar|seletor-periodo)"/,
      );
    }
  });

  it("usa os tokens de layout e as variáveis do tema nos cinco arquivos", () => {
    for (const arquivo of ARQUIVOS) {
      const conteudo = fonte(arquivo);
      expect(conteudo, `${arquivo} deve usar tokens de layout`).toContain("TOKENS_LAYOUT");
      expect(conteudo, `${arquivo} deve usar theme.vars`).toContain("theme.vars");
    }
    expect(TOKENS_LAYOUT.alvoToque).toBe(48);
  });
});

describe("limpeza do stack visual", () => {
  const proibidos = [
    "tailwindcss",
    "@tailwindcss/postcss",
    "tw-animate-css",
    "prettier-plugin-tailwindcss",
    "tailwind-merge",
    "class-variance-authority",
    "clsx",
    "lucide-react",
    "sonner",
    "next-themes",
    "motion",
  ];

  it("não carrega as dependências antigas no package.json", () => {
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const nomes = [
      ...Object.keys(pacote.dependencies ?? {}),
      ...Object.keys(pacote.devDependencies ?? {}),
    ];
    for (const proibido of proibidos) expect(nomes).not.toContain(proibido);
    expect(nomes.some((nome) => nome.startsWith("@radix-ui/"))).toBe(false);
  });

  it("não importa o stack antigo e mantém Recharts apenas no BI", () => {
    for (const arquivo of arquivosDe("src", [".ts", ".tsx"])) {
      const texto = readFileSync(arquivo, "utf8");
      for (const proibido of proibidos) {
        expect(texto, `${arquivo} importa ${proibido}`).not.toContain(`from "${proibido}`);
      }
      expect(texto, arquivo).not.toContain("@radix-ui/");
      expect(texto, arquivo).not.toContain("@/app/globals.css");
      expect(texto, arquivo).not.toContain("@/lib/utils");
      if (!arquivo.replaceAll("\\", "/").startsWith("src/components/bi/")) {
        expect(texto, arquivo).not.toContain('from "recharts"');
      }
    }
  });

  it("não mantém classes utilitárias do Tailwind no produto", () => {
    const utilitaria =
      /(?:^|\s)(?:flex|grid|hidden|w-\S+|h-\S+|p[trblxy]?-\S+|m[trblxy]?-\S+|gap-\S+|text-\S+|bg-\S+|rounded\S*|shadow\S*|items-\S+|justify-\S+)(?:\s|$)/;
    for (const arquivo of arquivosDe("src", [".tsx"])) {
      const texto = readFileSync(arquivo, "utf8");
      for (const achado of texto.matchAll(/className=(?:"([^"]*)"|`([^`]*)`)/g)) {
        const valor = achado[1] ?? achado[2] ?? "";
        expect(utilitaria.test(valor), `${arquivo}: ${valor}`).toBe(false);
      }
    }
  });
});
