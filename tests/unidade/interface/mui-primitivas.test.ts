// Primitivas de exibição do Material UI: variantes, acessibilidade, semântica
// e limites conferidos no HTML renderizado e no próprio código-fonte.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import { ThemeProvider } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { tema } from "@/theme/tema";
import { Alerta } from "@/components/ui/mui/alerta";
import { AtualizadoEm } from "@/components/ui/mui/atualizado-em";
import { BarraProgresso } from "@/components/ui/mui/barra-progresso";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import {
  Cartao,
  CartaoAcoes,
  CartaoCabecalho,
  CartaoConteudo,
  CartaoTitulo,
} from "@/components/ui/mui/cartao";
import {
  CirculoContagem,
  CirculoValor,
  CirculosAcumulado,
  fraseAcumulado,
} from "@/components/ui/mui/circulo-contagem";
import { ItemLegendaGrafico } from "@/components/ui/mui/item-legenda-grafico";
import { Logotipo } from "@/components/ui/mui/logotipo";
import { Rotulo } from "@/components/ui/mui/rotulo";
import { Selo } from "@/components/ui/mui/selo";
import { AlertaCompacto, TelaEstado, type VarianteEstado } from "@/components/ui/mui/tela-estado";

function renderizar(elemento: ReactElement): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme: tema }, elemento));
}

function semEstilos(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
}

function contarClasse(html: string, classe: string): number {
  return [...html.matchAll(/class="([^"]*)"/g)]
    .flatMap((achado) => (achado[1] ?? "").split(/\s+/))
    .filter((nome) => nome === classe).length;
}

const TITULOS: Record<VarianteEstado, string> = {
  nao_encontrado: "Página não encontrada",
  erro_interno: "Algo saiu do esperado",
  indisponivel: "Serviço indisponível",
  dados_invalidos: "Confira os dados",
  sessao_expirada: "Sessão expirada",
  sem_permissao: "Acesso restrito",
  conta_desativada: "Conta desativada",
  limite: "Muitas tentativas",
  conflito: "Não foi possível concluir",
  offline: "Sem conexão",
};

const VARIANTES_ESTADO: readonly VarianteEstado[] = [
  "nao_encontrado",
  "erro_interno",
  "indisponivel",
  "dados_invalidos",
  "sessao_expirada",
  "sem_permissao",
  "conta_desativada",
  "limite",
  "conflito",
  "offline",
];

describe("Botao", () => {
  it("mapeia as cinco variantes e os dois tamanhos", () => {
    const casos = [
      ["primario", "MuiButton-contained", "MuiButton-colorPrimary"],
      ["secundario", "MuiButton-contained", "MuiButton-colorSecondary"],
      ["contorno", "MuiButton-outlined", "MuiButton-colorPrimary"],
      ["texto", "MuiButton-text", "MuiButton-colorPrimary"],
      ["destrutivo", "MuiButton-contained", "MuiButton-colorError"],
    ] as const;

    for (const [variante, classe, cor] of casos) {
      const html = renderizar(createElement(Botao, { variante, tamanho: "pequeno" }, "Salvar"));
      expect(html).toContain(classe);
      expect(html).toContain(cor);
      expect(html).toContain("MuiButton-sizeSmall");
    }

    const medio = renderizar(
      createElement(Botao, { variante: "primario", tamanho: "medio" }, "Salvar"),
    );
    expect(medio).toContain("MuiButton-sizeMedium");
  });

  it("expõe o estado de carregamento e bloqueia a interação", () => {
    const html = renderizar(
      createElement(Botao, { carregando: true, onClick: () => {} }, "Enviar"),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("MuiCircularProgress-root");
  });

  it("encaminha o href pelo link do Next", () => {
    const html = renderizar(createElement(Botao, { href: "/painel" }, "Painel"));
    expect(html).toMatch(/<a[^>]*href="\/painel"/);
    expect(html).toContain("MuiButton-root");
  });

  it("usa um botão nativo quando recebe apenas onClick", () => {
    const html = renderizar(
      createElement(Botao, { onClick: () => {}, variante: "contorno" }, "Abrir"),
    );
    expect(html).toContain("<button");
    expect(html).not.toContain("<a");
  });

  it("rotula o botão de ícone e usa o tamanho do tema", () => {
    const html = renderizar(
      createElement(BotaoIcone, {
        rotulo: "Atualizar",
        icone: createElement(ScheduleRoundedIcon),
      }),
    );
    expect(html).toContain('aria-label="Atualizar"');
    expect(html).toContain("MuiIconButton-sizeMedium");
  });
});

describe("Rotulo", () => {
  it("associa o texto ao campo e marca o obrigatório", () => {
    const html = renderizar(
      createElement(Rotulo, { htmlFor: "email", obrigatorio: true }, "E-mail"),
    );
    expect(html).toContain("<label");
    expect(html).toContain('for="email"');
    expect(html).toContain("E-mail");
    expect(html).toContain("*");
  });
});

describe("Selo", () => {
  it("mapeia os quatro tons para as cores do tema", () => {
    const casos = [
      ["neutro", "MuiChip-colorDefault"],
      ["sucesso", "MuiChip-colorSuccess"],
      ["atencao", "MuiChip-colorWarning"],
      ["perigo", "MuiChip-colorError"],
    ] as const;

    for (const [tom, classe] of casos) {
      const html = renderizar(createElement(Selo, { tom, rotulo: "Ativo" }));
      expect(html).toContain(classe);
      expect(html).toContain("Ativo");
    }
  });
});

describe("Alerta", () => {
  it("renderiza severidade, título, mensagem e ação", () => {
    const html = renderizar(
      createElement(
        Alerta,
        {
          severity: "warning",
          titulo: "Atenção",
          acao: createElement("button", { type: "button" }, "Ver"),
        },
        "Mensagem",
      ),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("MuiAlert-standard");
    expect(html).toContain("MuiAlert-colorWarning");
    expect(html).toContain("Atenção");
    expect(html).toContain("Mensagem");
    expect(html).toContain("Ver");
  });
});

describe("BarraProgresso", () => {
  it("expõe rótulo, valor e texto acessível", () => {
    const html = renderizar(
      createElement(BarraProgresso, {
        valor: 25,
        max: 50,
        rotulo: "Cobertura",
        descricao: "Metade da turma",
      }),
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Cobertura"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuetext="Metade da turma"');
  });

  it("limita o valor ao intervalo de zero a cem por cento", () => {
    const cheio = renderizar(createElement(BarraProgresso, { valor: 150, rotulo: "Excesso" }));
    expect(cheio).toContain('aria-valuenow="100"');
    expect(cheio).toContain('aria-valuetext="100%"');

    const vazio = renderizar(createElement(BarraProgresso, { valor: -10, rotulo: "Vazio" }));
    expect(vazio).toContain('aria-valuenow="0"');
  });
});

describe("Círculos de contagem", () => {
  it("preserva a leitura por extenso do valor e da sigla", () => {
    const html = renderizar(
      createElement(CirculoContagem, {
        valor: 1,
        sigla: "F",
        tom: "falta",
        singular: "falta",
        plural: "faltas",
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="1 falta"');
    expect(html).toContain("1 F");
  });

  it("mostra faltas, justificadas e saídas no acumulado", () => {
    const html = renderizar(
      createElement(CirculosAcumulado, { faltas: 1, justificadas: 2, saidas: 3 }),
    );
    expect(html).toContain('aria-label="1 falta"');
    expect(html).toContain('aria-label="2 faltas justificadas"');
    expect(html).toContain('aria-label="3 saídas"');
  });

  it("aceita o tom sólido no círculo de valor", () => {
    const html = renderizar(
      createElement(CirculoValor, { texto: "27", rotulo: "27 faltas", tom: "falta" }),
    );
    expect(html).toContain('aria-label="27 faltas"');
    expect(html).toContain("27");
  });

  it("monta a frase do acumulado", () => {
    expect(fraseAcumulado(2, 1)).toBe("Acumulado: 2 faltas e 1 falta justificada.");
  });
});

describe("Cartao", () => {
  it("usa uma única superfície e as partes internas do MUI", () => {
    const html = renderizar(
      createElement(
        Cartao,
        null,
        createElement(
          CartaoCabecalho,
          null,
          createElement(CartaoTitulo, null, "Resumo"),
          createElement(CartaoAcoes, null, createElement(Botao, { variante: "texto" }, "Abrir")),
        ),
        createElement(CartaoConteudo, null, "Conteúdo"),
      ),
    );
    const limpo = semEstilos(html);
    expect(contarClasse(limpo, "MuiCard-root")).toBe(1);
    expect(limpo).toContain("MuiCardContent-root");
    expect(limpo).toContain("MuiCardActions-root");
    expect(limpo).toContain("<h2");
    expect(limpo).toContain("Resumo");
    expect(limpo).toContain("Conteúdo");
  });
});

describe("CaixasDeInfo", () => {
  it("remove valores vazios e agrupa os selos restantes", () => {
    const html = renderizar(
      createElement(CaixasDeInfo, {
        itens: ["Manhã", null, "", false, "7º ano"],
        rotulo: "Detalhes",
      }),
    );
    const limpo = semEstilos(html);
    expect(limpo).toContain('role="group"');
    expect(limpo).toContain('aria-label="Detalhes"');
    expect(limpo).toContain("Manhã");
    expect(limpo).toContain("7º ano");
    expect(contarClasse(limpo, "MuiChip-root")).toBe(2);
  });
});

describe("ItemLegendaGrafico", () => {
  it("mostra cor, nome, detalhe e valores", () => {
    const html = renderizar(
      createElement(
        ItemLegendaGrafico,
        { cor: "#c00", nome: "Faltas", detalhe: "3 alunos" },
        createElement("span", null, "30%"),
      ),
    );
    expect(html).toContain("<li");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Faltas");
    expect(html).toContain("3 alunos");
    expect(html).toContain("30%");
  });
});

describe("AtualizadoEm", () => {
  it("formata a data e a hora no fuso da escola", () => {
    const html = renderizar(
      createElement(AtualizadoEm, {
        instante: "2026-01-01T01:30:00.000Z",
        fuso: "America/Fortaleza",
      }),
    );
    expect(html).toContain("Atualizado em 31/12/2025 às 22:30");
  });

  it("mantém o estado sem leitura", () => {
    const html = renderizar(createElement(AtualizadoEm, { fuso: "America/Fortaleza" }));
    expect(html).toContain("Ainda não atualizado");
  });

  it("conecta a versão da visão ao provedor de atualização", () => {
    const fonte = readFileSync(
      path.resolve(process.cwd(), "src/components/ui/mui/atualizado-em.tsx"),
      "utf8",
    );
    expect(fonte).toContain("export function AtualizadoDaVisao");
    expect(fonte).toContain("useAtualizadoEm");
  });
});

describe("Logotipo", () => {
  it("entrega a marca com tamanho e texto alternativo", () => {
    const html = renderizar(createElement(Logotipo, { tamanho: 32 }));
    expect(html).toContain('src="/icon.svg"');
    expect(html).toContain('alt="FrequenciApp"');
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
  });
});

describe("TelaEstado", () => {
  it("cobre as dez variantes com código, referência e ações", () => {
    for (const variante of VARIANTES_ESTADO) {
      const titulo = TITULOS[variante];
      const html = renderizar(
        createElement(TelaEstado, {
          variante,
          incorporado: true,
          codigo: 404,
          referencia: "REF-1",
          acao: { rotulo: "Tentar de novo", onClick: () => {} },
          acaoSecundaria: { rotulo: "Voltar", href: "/" },
        }),
      );
      expect(html).toContain(titulo);
      expect(html).toContain("Erro 404");
      expect(html).toContain("Referência para suporte: REF-1");
      expect(html).toContain("Tentar de novo");
      expect(html).toContain('href="/"');
      expect(html).toContain("MuiAlert-root");
    }
  });

  it("usa alerta para erro e status para aviso", () => {
    const erro = renderizar(
      createElement(TelaEstado, { variante: "erro_interno", incorporado: true }),
    );
    expect(erro).toContain('role="alert"');

    const aviso = renderizar(createElement(TelaEstado, { variante: "offline", incorporado: true }));
    expect(aviso).toContain('role="status"');
  });

  it("ocupa a tela inteira quando não está incorporado", () => {
    const html = renderizar(createElement(TelaEstado, { variante: "nao_encontrado" }));
    expect(html).toContain("<main");
    expect(html).toContain("Página não encontrada");
  });

  it("mostra o aviso compacto em linha e com fechamento", () => {
    const html = renderizar(
      createElement(AlertaCompacto, {
        variante: "offline",
        tamanho: "linha",
        onFechar: () => {},
        acao: { rotulo: "Tentar de novo", onClick: () => {} },
      }),
    );
    expect(html).toContain("Sem conexão");
    expect(html).toContain("Tentar de novo");
    expect(html).toContain('aria-label="Fechar"');
    expect(html).toContain('role="status"');
  });
});

describe("restrições estáticas das primitivas", () => {
  const raiz = path.resolve(process.cwd(), "src/components/ui/mui");
  const arquivos = [
    "alerta.tsx",
    "atualizado-em.tsx",
    "barra-progresso.tsx",
    "botao.tsx",
    "caixas-de-info.tsx",
    "cartao.tsx",
    "circulo-contagem.tsx",
    "item-legenda-grafico.tsx",
    "logotipo.tsx",
    "rotulo.tsx",
    "selo.tsx",
    "tela-estado.tsx",
  ] as const;

  it("encontra os doze arquivos da subetapa", () => {
    const existentes = readdirSync(raiz).filter((arquivo) => arquivo.endsWith(".tsx"));
    expect(existentes).toEqual(expect.arrayContaining([...arquivos]));
  });

  it("mantém cabeçalho, imports diretos e nenhuma classe utilitária", () => {
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(path.join(raiz, arquivo), "utf8");
      const linhas = conteudo.split("\n");
      let inicio = linhas[0]?.startsWith('"use client"') ? 1 : 0;
      while (linhas[inicio]?.trim() === "") inicio += 1;
      expect(linhas[inicio]?.trim().startsWith("//"), `${arquivo} deve começar com cabeçalho`).toBe(
        true,
      );
      expect(conteudo, `${arquivo} não usa className`).not.toContain("className=");
      expect(conteudo, `${arquivo} não usa @ts-ignore`).not.toContain("@ts-ignore");
      expect(conteudo, `${arquivo} não usa any`).not.toMatch(/\bany\b/);
      expect(conteudo, `${arquivo} não importa o barril de ícones`).not.toContain(
        'from "@mui/icons-material"',
      );
      expect(conteudo, `${arquivo} não usa Tailwind`).not.toContain("tailwind");
      expect(conteudo, `${arquivo} não importa a UI antiga`).not.toContain("@/components/ui/");
    }
  });

  it("aplica os tokens de botão, cartão, diálogo e alvo de toque", () => {
    const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

    expect(ler("botao.tsx")).toContain("TOKENS_LAYOUT.botao");
    expect(ler("botao.tsx")).toContain("TOKENS_LAYOUT.alvoToque");
    expect(ler("cartao.tsx")).toContain("TOKENS_LAYOUT.cartao");
    expect(ler("tela-estado.tsx")).toContain("TOKENS_LAYOUT.dialogo");
  });

  it("usa as variáveis do tema nos componentes com cor própria", () => {
    const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), "utf8");

    for (const arquivo of [
      "atualizado-em.tsx",
      "barra-progresso.tsx",
      "botao.tsx",
      "cartao.tsx",
      "circulo-contagem.tsx",
      "item-legenda-grafico.tsx",
      "rotulo.tsx",
    ]) {
      expect(ler(arquivo), `${arquivo} deve usar theme.vars`).toContain("theme.vars");
    }
  });

  it("não depende de CSS global, CSS Modules ou PostCSS do stack antigo", () => {
    for (const arquivo of [
      "src/app/globals.css",
      "src/app/superficies.css",
      "postcss.config.mjs",
      "components.json",
      "src/lib/utils.ts",
    ]) {
      expect(() => readFileSync(arquivo, "utf8"), arquivo).toThrow();
    }
    expect(
      readdirSync("src", { recursive: true, encoding: "utf8" }).filter((nome) =>
        nome.endsWith(".css"),
      ),
    ).toEqual([]);
  });
});
