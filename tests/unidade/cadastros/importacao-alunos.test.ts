// Relação de alunos em CSV: schema, validação por linha, exportação com ida e
// volta e plano de importação (casamento sem acento, mudanças, novos,
// desativados e bloqueios). Nomes fictícios.
import { describe, expect, it } from "vitest";
import {
  CABECALHO_RELACAO,
  chaveDeTurma,
  lerRelacaoCsv,
  planejarImportacao,
  relacaoParaCsv,
  type AlunoCadastrado,
} from "@/domain/importacao-alunos";

const turmas = [
  { id: "t-a", rotulo: "3º ano A" },
  { id: "t-b", rotulo: "3º ano B" },
  { id: "t-1a", rotulo: "1º ano A" },
];

function csv(linhas: string[], cabecalho = CABECALHO_RELACAO): string {
  return [cabecalho, ...linhas].join("\n");
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

describe("lerRelacaoCsv", () => {
  it("lê BOM, CRLF, aspas e agrupa por turma na ordem informada", () => {
    const texto = `﻿${CABECALHO_RELACAO}\r\n3º A;2;"SILVA; ANA";3º B\r\n3º ano A;1;BRUNO TESTE;3º A\r\n3º B;1;CAIO  EXEMPLO;3º A\r\n`;
    const leitura = lerRelacaoCsv(texto);
    expect(leitura.erros).toEqual([]);
    expect(leitura.relacoes).toEqual([
      {
        turma: "3º A",
        alunos: [
          { nome: "BRUNO TESTE", origem: "3º A", linha: 3, posicao: 1 },
          { nome: "SILVA; ANA", origem: "3º B", linha: 2, posicao: 2 },
        ],
      },
      { turma: "3º B", alunos: [{ nome: "CAIO EXEMPLO", origem: "3º A", linha: 4, posicao: 1 }] },
    ]);
  });

  it("aceita vírgula como separador", () => {
    const leitura = lerRelacaoCsv("turma_atual,ordem,nome,turma_original\n3º A,1,ANA,3º A");
    expect(leitura.erros).toEqual([]);
    expect(leitura.relacoes[0]?.alunos[0]?.nome).toBe("ANA");
  });

  it("recusa arquivo vazio, sem alunos ou com cabeçalho fora do padrão", () => {
    expect(lerRelacaoCsv("").erros).toEqual(["O arquivo está vazio."]);
    expect(lerRelacaoCsv(CABECALHO_RELACAO).erros).toEqual(["O arquivo não tem nenhum aluno."]);
    expect(lerRelacaoCsv("nome;turma\nANA;3º A").erros[0]).toContain(
      "o cabeçalho precisa ser exatamente turma_atual;ordem;nome;turma_original",
    );
  });

  it("aponta cada linha fora do padrão com o número e o problema", () => {
    const leitura = lerRelacaoCsv(
      csv([
        "3º A;1;ANA TESTE;3º A",
        "3º A;2;BRUNO",
        ";x;B;",
        "3º A;1;CARLA TESTE;3º B",
        "",
        "3º A;3;DIEGO TESTE;3º A",
      ]),
    );
    expect(leitura.erros).toEqual([
      "Linha 3: esperadas 4 colunas, encontradas 3.",
      "Linha 4: turma_atual vazia; ordem precisa ser um número inteiro de 1 a 9999; nome precisa ter de 2 a 100 caracteres; turma_original vazia.",
      "Linha 5: a ordem 1 já foi usada na turma 3º A.",
    ]);
    expect(leitura.relacoes[0]?.alunos.map((aluno) => aluno.nome)).toEqual([
      "ANA TESTE",
      "DIEGO TESTE",
    ]);
  });
});

describe("relacaoParaCsv", () => {
  it("exporta no mesmo schema e volta idêntico na leitura", () => {
    const texto = relacaoParaCsv([
      { turmaAtual: "3º ano A", ordem: 4, nome: "ANA; TESTE", turmaOriginal: "3º ano B" },
      { turmaAtual: "3º ano A", ordem: 9, nome: "=HIPERLINK(1)", turmaOriginal: "3º ano A" },
      { turmaAtual: "3º ano B", ordem: 2, nome: 'BRUNO "BIBI"', turmaOriginal: "3º ano B" },
    ]);
    expect(texto.startsWith(`﻿${CABECALHO_RELACAO}\r\n`)).toBe(true);
    expect(texto).toContain('3º ano A;1;"ANA; TESTE";3º ano B\r\n');
    expect(texto).toContain("3º ano A;2;'=HIPERLINK(1);3º ano A\r\n");
    const leitura = lerRelacaoCsv(texto);
    expect(leitura.erros).toEqual([]);
    expect(
      leitura.relacoes.map((relacao) => [
        relacao.turma,
        relacao.alunos.map((aluno) => [aluno.posicao, aluno.nome, aluno.origem]),
      ]),
    ).toEqual([
      [
        "3º ano A",
        [
          [1, "ANA; TESTE", "3º ano B"],
          [2, "=HIPERLINK(1)", "3º ano A"],
        ],
      ],
      ["3º ano B", [[1, 'BRUNO "BIBI"', "3º ano B"]]],
    ]);
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
  const texto = csv([
    "3º A;1;ÁLVARO TESTE;3º B",
    "3º A;2;BEATRIZ EXEMPLO;3º A",
    "3º A;3;CAIO NOVO;3º A",
    "3º B;1;DANIELA  REATIVADA;3º B",
  ]);
  const alunos = [
    cadastrado({ id: "a1", nome: "Alvaro Teste", turmaId: "t-b", turmaOriginalId: "t-b" }),
    cadastrado({ id: "a2", nome: "Beatriz Exemplo", ordem: 2 }),
    cadastrado({ id: "a3", nome: "Daniela Reativada", turmaId: "t-b", ordem: 1, ativo: false }),
    cadastrado({ id: "a4", nome: "Eduardo Saiu", ordem: 3 }),
    cadastrado({ id: "a5", nome: "Fora da Serie", turmaId: "t-1a", turmaOriginalId: "t-1a" }),
  ];
  const plano = planejarImportacao(lerRelacaoCsv(texto), turmas, alunos);

  it("casa sem acento e mantém o id do aluno cadastrado", () => {
    expect(plano.bloqueios).toEqual([]);
    const alvaro = plano.itens.find((item) => item.alunoId === "a1");
    expect(alvaro).toMatchObject({ turmaId: "t-a", turmaOriginalId: "t-b", ordem: 1 });
    expect(alvaro?.mudancas).toEqual(["turma"]);
  });

  it("classifica ordem, origem, reativação e aluno novo", () => {
    expect(plano.itens.find((item) => item.alunoId === "a2")?.mudancas).toEqual([]);
    expect(plano.itens.find((item) => item.alunoId === "a3")?.mudancas).toEqual([
      "origem",
      "reativar",
    ]);
    expect(plano.itens.find((item) => item.nome === "CAIO NOVO")).toMatchObject({
      alunoId: null,
      turmaId: "t-a",
      ordem: 3,
    });
  });

  it("desativa quem está nas turmas importadas e não aparece na relação", () => {
    expect(plano.desativar).toEqual([{ alunoId: "a4", nome: "Eduardo Saiu", turmaId: "t-a" }]);
    expect(plano.turmas.map((turma) => [turma.rotulo, turma.alunos])).toEqual([
      ["3º ano A", 3],
      ["3º ano B", 1],
    ]);
  });

  it("não desativa desistente que ficou fora da relação importada", () => {
    const comDesistente = alunos.map((aluno) =>
      aluno.id === "a4" ? { ...aluno, desistenteEm: new Date("2026-09-29T12:00:00Z") } : aluno,
    );
    const resultado = planejarImportacao(lerRelacaoCsv(texto), turmas, comDesistente);
    expect(resultado.desativar).toEqual([]);
  });

  it("bloqueia erro de schema, turma desconhecida, homônimo e nome repetido", () => {
    const bloqueado = planejarImportacao(
      lerRelacaoCsv(
        csv([
          "3º A;1;ANA DUPLA;3º Z",
          "3º A;2;BIA IGUAL;3º A",
          "3º A;3;CÉLIA REPETIDA;3º A",
          "3º A;4;CELIA REPETIDA;3º A",
          "3º A;x;DIEGO;3º A",
        ]),
      ),
      turmas,
      [cadastrado({ id: "b1", nome: "Bia Igual" }), cadastrado({ id: "b2", nome: "BIA IGUAL" })],
    );
    expect(bloqueado.bloqueios).toEqual([
      "Linha 6: ordem precisa ser um número inteiro de 1 a 9999.",
      'A turma "3º Z" não está cadastrada.',
      "BIA IGUAL corresponde a mais de um aluno cadastrado.",
      "CÉLIA REPETIDA aparece mais de uma vez no arquivo.",
      "CELIA REPETIDA aparece mais de uma vez no arquivo.",
    ]);
  });
});
