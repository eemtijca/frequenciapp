// Renderiza os consumidores reais com carga sintética e seções abertas, sem rede ou navegador.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import type { RelatorioMovimentacoes } from "@/domain/relatorio-movimentacoes";

const dubl = vi.hoisted(() => ({
  dados: { saidas: [] as SaidaAntecipada[], entradas: [] as EntradaAtrasada[] },
  carga: null as {
    chave: string;
    dados: RelatorioMovimentacoes;
    erro: string;
    variante: "indisponivel";
  } | null,
  cargaInjetada: false,
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState<T>(inicial: T | (() => T)) {
      const [valor, atualizar] = react.useState(inicial);
      // SSR não executa efeitos: injeta uma única carga na fronteira do relatório.
      if (inicial === null && dubl.carga && !dubl.cargaInjetada) {
        dubl.cargaInjetada = true;
        return [dubl.carga, atualizar];
      }
      // A fixture só abre as seções; a agregação e a árvore visual continuam reais.
      return [
        valor && typeof valor === "object" && "visao" in valor
          ? { ...valor, turmas: true, alunos: true }
          : valor,
        atualizar,
      ];
    },
  };
});
vi.mock("@/components/resumo-semanal/use-resumo-semanal", () => ({
  useResumoSemanal: () => ({
    dados: dubl.dados,
    atualizadoEm: null,
    anuncio: "",
    erro: "",
    carregando: false,
    tentarNovamente: () => {},
  }),
}));

import { VistaResumoMovimentacoes } from "@/components/movimentacoes/resumo-semana-movimentacoes";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";

const dias = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
const alunos: Aluno[] = [
  { id: "ana", nome: "Ana", turmaId: "atual", turmaOriginalId: "atual", ordem: 1, ativo: true },
];
const turmas: Turma[] = [
  {
    id: "atual",
    serieId: "serie",
    nome: "Atual",
    rotulo: "Cadastro atual",
    serieNome: "Ano",
    horarios: [],
  },
];
function saida(
  id: string,
  dia: string,
  turmaHistoricaId?: string,
  turmaHistoricaNome?: string,
): SaidaAntecipada {
  return {
    id,
    alunoId: "ana",
    dia,
    turmaHistoricaId,
    turmaHistoricaNome,
    momento: "aula_1",
    horario: "07:30",
    justificativa: null,
    observacao: null,
    texto: null,
    liberadoPorId: null,
    liberadoPorCodigo: null,
    liberadoPorNome: null,
    criadoEm: `${dia}T12:00:00Z`,
  };
}
function texto(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function blocos(html: string, tag: string): string[] {
  const conteudo = tag === "span" ? "([^<>]*)" : "([\\s\\S]*?)";
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>${conteudo}</${tag}>`, "g"))].map((item) =>
    texto(item[1] ?? ""),
  );
}
function renderizarResumo(tipo: "saida" | "entrada" = "saida"): string {
  return renderToStaticMarkup(
    createElement(VistaResumoMovimentacoes, {
      tipo,
      turmas,
      alunos,
      dias,
      ativo: true,
      fuso: "America/Fortaleza",
      onAbrirDia: () => {},
    }),
  );
}

beforeEach(() => {
  dubl.dados = { saidas: [], entradas: [] };
  dubl.carga = null;
  dubl.cargaInjetada = false;
});

describe("rótulos renderizados das movimentações", () => {
  it("explica no rodapé a turma gravada e a referência desconhecida das saídas", () => {
    dubl.carga = {
      chave: "de=2026-10-19&ate=2026-10-19|0|0",
      dados: {
        de: "2026-10-19",
        ate: "2026-10-19",
        totais: { saidas: 0, entradas: 0, total: 0 },
        turmas: [],
      },
      erro: "",
      variante: "indisponivel",
    };
    const html = renderToStaticMarkup(
      createElement(VistaMovimentacoes, {
        hoje: "2026-10-19",
        turmas,
        alunos,
        ativa: true,
      }),
    );
    expect(dubl.cargaInjetada).toBe(true);
    expect(blocos(html, "p")).toContain(
      "Entradas e saídas agrupadas pela turma gravada no registro; saídas sem referência ficam como turma histórica desconhecida.",
    );
    expect(texto(html)).not.toContain("saídas pela turma atual do aluno");
  });

  it("mostra rótulos históricos por turma e todas as referências do aluno", () => {
    dubl.dados.saidas = [
      saida("s1", "2026-10-19", "a", "1º ano A"),
      saida("s2", "2026-10-20", "b", "1º ano B"),
      saida("s3", "2026-10-21", "a", "1º ano A renomeada"),
      saida("s4", "2026-10-22"),
    ];
    const html = renderizarResumo();
    expect(blocos(html, "span")).toContain("Somente leitura");
    expect
      .soft(blocos(html, "li"))
      .toEqual(
        expect.arrayContaining([
          "1º ano A 1",
          "1º ano B 1",
          "1º ano A renomeada 1",
          "Turma histórica desconhecida 1",
        ]),
      );
    expect(blocos(html, "tr")).toContain(
      "Ana 1º ano A · 1º ano B · 1º ano A renomeada · Turma histórica desconhecida 4",
    );
    expect(blocos(html, "dl")).toContain("Saídas 4 Alunos 1 Turmas conhecidas 2");
    expect(blocos(html, "span").filter((item) => item === "2 turmas conhecidas")).toHaveLength(2);
    expect(texto(html)).toContain("Total por referência histórica; turma desconhecida separada.");
    expect(texto(html)).not.toContain("Cadastro atual");
  });

  it("não conta o balde desconhecido como turma conhecida nos totais e selos", () => {
    dubl.dados.saidas = [saida("s1", "2026-10-19")];
    const html = renderizarResumo();
    expect(blocos(html, "li")).toContain("Turma histórica desconhecida 1");
    expect(blocos(html, "tr")).toContain("Ana Turma histórica desconhecida 1");
    expect(blocos(html, "dl")).toContain("Saídas 1 Alunos 1 Turmas conhecidas 0");
    expect(blocos(html, "span").filter((item) => item === "0 turmas conhecidas")).toHaveLength(2);
    expect(texto(html)).not.toContain("1 turmas");
  });

  it("preserva os textos e rótulos das entradas", () => {
    dubl.dados.entradas = [
      {
        id: "e1",
        alunoId: "ana",
        nome: "Ana",
        turmaId: "b",
        turmaRotulo: "1º ano B",
        dia: "2026-10-19",
        horario: "08:10",
        motivo: "Atraso",
        registradoPorNome: "Equipe",
        criadoEm: "2026-10-19T12:00:00Z",
      },
    ];
    const html = renderizarResumo("entrada");
    expect(blocos(html, "li")).toContain("1º ano B 1");
    expect(blocos(html, "tr")).toContain("Ana 1º ano B 1");
    expect(blocos(html, "dl")).toContain("Entradas 1 Alunos 1 Turmas 1");
    expect(texto(html)).toContain("Total por turma na semana.");
    expect(texto(html)).not.toContain("turmas conhecidas");
  });
});
