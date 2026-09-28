// Leitura das relações de turma e plano de importação: formato com quebra de
// linha escrita como texto, rótulos de turma, casamento sem acento, mudanças,
// novos, desativados e bloqueios. Nomes fictícios.
import { describe, expect, it } from "vitest";
import {
  chaveDeTurma,
  lerRelacoes,
  planejarImportacao,
  type AlunoCadastrado,
} from "@/domain/importacao-alunos";

// Travessão das relações originais, sem o caractere no código-fonte.
const TRAVESSAO = String.fromCharCode(0x2014);
const turmas = [
  { id: "t-a", rotulo: "3º ano A" },
  { id: "t-b", rotulo: "3º ano B" },
  { id: "t-1a", rotulo: "1º ano A" },
];

function relacao(turma: string, linhas: string[], total = linhas.length): string {
  return [
    `RELAÇÃO ATUAL ${TRAVESSAO} ${turma}`,
    "Aplicativo de chamada | atualizado em 28/09/2026",
    `Total de estudantes: ${total}`,
    "",
    ...linhas,
  ].join("\n");
}

function cadastrado(parcial: Partial<AlunoCadastrado> & { id: string; nome: string }) {
  return {
    turmaId: "t-a",
    turmaOriginalId: "t-a",
    ordem: 1,
    ativo: true,
    ...parcial,
  };
}

describe("lerRelacoes", () => {
  it("aceita quebra de linha escrita como texto e separadores variados", () => {
    const texto = `RELAÇÃO ATUAL ${TRAVESSAO} 3º A\\nTotal de estudantes: 2\\n\\nANA TESTE ${TRAVESSAO} Turma original: 3º A\\nBRUNO EXEMPLO - Turma original: 3º B\\n`;
    const leitura = lerRelacoes(texto);
    expect(leitura.erros).toEqual([]);
    expect(leitura.relacoes).toEqual([
      {
        turma: "3º A",
        totalDeclarado: 2,
        alunos: [
          { nome: "ANA TESTE", origem: "3º A", posicao: 1, linha: 4 },
          { nome: "BRUNO EXEMPLO", origem: "3º B", posicao: 2, linha: 5 },
        ],
      },
    ]);
  });

  it("aponta a linha fora do formato e o texto sem cabeçalho", () => {
    expect(lerRelacoes("ANA TESTE").erros[0]).toContain("Nenhuma relação");
    const leitura = lerRelacoes(
      relacao("3º A", [`ANA TESTE ${TRAVESSAO} Turma original: 3º A`, "linha solta"]),
    );
    expect(leitura.erros).toEqual(['Linha 6: fora do formato "NOME, Turma original: turma".']);
  });
});

describe("chaveDeTurma", () => {
  it("iguala o rótulo curto ao cadastrado", () => {
    expect(chaveDeTurma("3º A")).toBe(chaveDeTurma("3º ano A"));
    expect(chaveDeTurma("3ª série B")).toBe(chaveDeTurma("3ª B"));
    expect(chaveDeTurma("3º A")).not.toBe(chaveDeTurma("3º B"));
  });
});

describe("planejarImportacao", () => {
  const texto = [
    relacao("3º A", [
      `ÁLVARO TESTE ${TRAVESSAO} Turma original: 3º B`,
      `BEATRIZ EXEMPLO ${TRAVESSAO} Turma original: 3º A`,
      `CAIO NOVO ${TRAVESSAO} Turma original: 3º A`,
    ]),
    relacao("3º B", [`DANIELA  REATIVADA ${TRAVESSAO} Turma original: 3º B`], 2),
  ].join("\n\n");
  const alunos = [
    cadastrado({ id: "a1", nome: "Alvaro Teste", turmaId: "t-b", turmaOriginalId: "t-b" }),
    cadastrado({ id: "a2", nome: "Beatriz Exemplo", ordem: 2 }),
    cadastrado({ id: "a3", nome: "Daniela Reativada", turmaId: "t-b", ordem: 1, ativo: false }),
    cadastrado({ id: "a4", nome: "Eduardo Saiu", ordem: 3 }),
    cadastrado({ id: "a5", nome: "Fora da Serie", turmaId: "t-1a", turmaOriginalId: "t-1a" }),
  ];
  const plano = planejarImportacao(lerRelacoes(texto), turmas, alunos);

  it("casa sem acento e mantém o id do aluno cadastrado", () => {
    expect(plano.bloqueios).toEqual([]);
    const alvaro = plano.itens.find((item) => item.alunoId === "a1");
    expect(alvaro).toMatchObject({ turmaId: "t-a", turmaOriginalId: "t-b", ordem: 1 });
    expect(alvaro?.mudancas).toEqual(["turma"]);
  });

  it("classifica ordem, origem, reativação e aluno novo", () => {
    expect(plano.itens.find((item) => item.alunoId === "a2")?.mudancas).toEqual([]);
    const daniela = plano.itens.find((item) => item.alunoId === "a3");
    expect(daniela?.mudancas).toEqual(["origem", "reativar"]);
    expect(plano.itens.find((item) => item.nome === "CAIO NOVO")).toMatchObject({
      alunoId: null,
      turmaId: "t-a",
      ordem: 3,
    });
  });

  it("desativa quem está nas turmas importadas e não aparece nas relações", () => {
    expect(plano.desativar).toEqual([{ alunoId: "a4", nome: "Eduardo Saiu", turmaId: "t-a" }]);
  });

  it("resume as turmas e avisa o total diferente do cabeçalho", () => {
    expect(plano.turmas.map((turma) => [turma.rotulo, turma.alunos])).toEqual([
      ["3º ano A", 3],
      ["3º ano B", 1],
    ]);
    expect(plano.avisos).toEqual(["3º ano B: o cabeçalho diz 2 e a lista tem 1."]);
  });

  it("bloqueia turma desconhecida, homônimo no cadastro e nome repetido", () => {
    const bloqueado = planejarImportacao(
      lerRelacoes(
        relacao("3º A", [
          `ANA DUPLA ${TRAVESSAO} Turma original: 3º Z`,
          `BIA IGUAL ${TRAVESSAO} Turma original: 3º A`,
          `CÉLIA REPETIDA ${TRAVESSAO} Turma original: 3º A`,
          `CELIA REPETIDA ${TRAVESSAO} Turma original: 3º A`,
        ]),
      ),
      turmas,
      [cadastrado({ id: "b1", nome: "Bia Igual" }), cadastrado({ id: "b2", nome: "BIA IGUAL" })],
    );
    expect(bloqueado.bloqueios).toEqual([
      'A turma "3º Z" não está cadastrada.',
      "BIA IGUAL corresponde a mais de um aluno cadastrado.",
      "CÉLIA REPETIDA aparece mais de uma vez nas relações.",
      "CELIA REPETIDA aparece mais de uma vez nas relações.",
    ]);
  });
});
