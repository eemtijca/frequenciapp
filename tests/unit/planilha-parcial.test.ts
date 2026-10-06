// Planejamento da chamada parcial com conflitos e células preservadas.
import { describe, expect, it } from "vitest";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import type { FrequenciaDaChamada, RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import { assinarAba, type LeituraAba } from "@/domain/planilha";
import { ABA_PARCIAL, CABECALHO_PARCIAL, planejarParciais } from "@/domain/planilha-parcial";

const frequencia: FrequenciaParcial = {
  id: "00000000-0000-4000-8000-000000000001",
  alunoId: "00000000-0000-4000-8000-000000000002",
  turmaId: "00000000-0000-4000-8000-000000000003",
  alunoNome: "QA Aluno",
  turmaNome: "QA Ano A",
  dia: "2026-10-02",
  tipo: "TURNO",
  turno: "MANHA",
  aulas: [],
  observacao: null,
  registradoSeduc: false,
  registradoSeducEm: null,
  registradoSeducPorNome: null,
  revisao: 1,
  criadoEm: "2026-10-02T12:00:00.000Z",
  atualizadoEm: "2026-10-02T12:00:00.000Z",
};

function leitura(valores: string[][] = [CABECALHO_PARCIAL], formula: boolean[][] = []): LeituraAba {
  return {
    nome: ABA_PARCIAL,
    valores,
    formula,
    linhaInicial: 1,
    colunaInicial: 1,
  };
}

function codigo(registro: RegistroPersonalizado = frequencia): string {
  return `chamada:${registro.alunoId}:${registro.dia}`;
}

function valoresExportados(registro: RegistroPersonalizado = frequencia): string[] {
  return (
    planejarParciais([registro], leitura(), []).criar[0]?.celulas.map((item) => item.valor) ?? []
  );
}

function chamada(alteracoes: Partial<FrequenciaDaChamada> = {}): FrequenciaDaChamada {
  return {
    id: codigo(),
    tipo: "CHAMADA",
    alunoId: frequencia.alunoId,
    dia: frequencia.dia,
    turmaId: frequencia.turmaId,
    alunoNome: frequencia.alunoNome,
    turmaNome: frequencia.turmaNome,
    marca: "P",
    descricao: "Dia inteiro",
    registradoSeduc: false,
    registradoSeducEm: null,
    registradoSeducPorNome: null,
    revisao: 3,
    revisaoSeduc: 1,
    criadoEm: frequencia.criadoEm,
    atualizadoEm: frequencia.atualizadoEm,
    ...alteracoes,
  };
}

describe("planilha da chamada parcial", () => {
  it("propõe registro completo com data brasileira e código estável por aluno e dia", () => {
    const plano = planejarParciais([frequencia], leitura(), []);
    expect(plano.bloqueado).toBe(false);
    expect(plano.aba).toBe("Chamada Parcial");
    expect(plano.criar).toEqual([
      {
        linha: 2,
        nome: "QA Aluno",
        celulas: ["02/10/2026", "QA Aluno", "QA Ano A", "Manhã", "Não", "", "", codigo(), "1"].map(
          (valor, indice) => ({ coluna: indice + 1, valor }),
        ),
      },
    ]);
    expect(plano.existentes).toBe(0);
    expect(plano.divergentes).toBe(0);
    expect(plano.pendentesManuais).toBe(0);
    expect(plano.atualizar).toEqual([]);
  });

  it("exporta tarde, observação e confirmação Seduc sem conversão de fuso", () => {
    expect(
      valoresExportados({
        ...frequencia,
        turno: "TARDE",
        observacao: "Presença apenas no segundo turno",
        registradoSeduc: true,
        registradoSeducEm: "2026-10-02T18:30:00.000Z",
        revisao: 2,
      }).slice(3),
    ).toEqual([
      "Tarde",
      "Sim",
      "2026-10-02T18:30:00.000Z",
      "Presença apenas no segundo turno",
      codigo(),
      "2",
    ]);
  });

  it("lista as aulas selecionadas em ordem e preserva o registro de origem", () => {
    const registro = { ...frequencia, tipo: "AULAS" as const, turno: null, aulas: [5, 3, 4] };
    expect(valoresExportados(registro)[3]).toBe("Aulas 3, 4, 5");
    expect(registro.aulas).toEqual([5, 3, 4]);
  });

  it("exporta dia inteiro sem presumir aulas e reconhece o reenvio idêntico", () => {
    const registro = { ...frequencia, tipo: "DIA_INTEIRO" as const, turno: null, aulas: [] };
    const valores = valoresExportados(registro);
    expect(valores[3]).toBe("Dia inteiro");
    const plano = planejarParciais([registro], leitura([CABECALHO_PARCIAL, valores]), []);
    expect(plano.bloqueado).toBe(false);
    expect(plano.existentes).toBe(1);
    expect(plano.divergentes).toBe(0);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([]);
  });

  it("não confunde alunos homônimos com identificadores diferentes", () => {
    const segundo = {
      ...frequencia,
      id: "00000000-0000-4000-8000-000000000004",
      alunoId: "00000000-0000-4000-8000-000000000004",
    };
    const terceiro = {
      ...frequencia,
      id: "00000000-0000-4000-8000-000000000005",
      alunoId: "00000000-0000-4000-8000-000000000006",
    };
    const plano = planejarParciais([terceiro, segundo, frequencia], leitura(), []);
    expect(plano.criar).toHaveLength(3);
    expect(plano.criar.map((linha) => linha.celulas[7]?.valor)).toEqual([
      codigo(),
      codigo(segundo),
      codigo(terceiro),
    ]);
  });

  it("reserva anotações além dos campos do registro", () => {
    const valores = [CABECALHO_PARCIAL, [], [...Array<string>(9).fill(""), "Nota manual"]];
    const anterior = structuredClone(valores);
    const plano = planejarParciais([frequencia], leitura(valores), []);
    expect(plano.criar[0]?.linha).toBe(4);
    expect(plano.assinatura).toBe(assinarAba(ABA_PARCIAL, [...CABECALHO_PARCIAL, ""], []));
    expect(valores).toEqual(anterior);
  });

  it("reserva fórmula com resultado vazio mesmo além das linhas de valores", () => {
    const plano = planejarParciais(
      [frequencia],
      leitura(undefined, [[], [], [], [false, false, true]]),
      [],
    );
    expect(plano.criar[0]?.linha).toBe(5);
    expect(
      planejarParciais([frequencia], { ...leitura(), ultimaLinhaAba: 12 }, []).criar[0]?.linha,
    ).toBe(13);
  });

  it("reconhece reenvio idêntico sem acrescentar outra linha", () => {
    const plano = planejarParciais(
      [frequencia],
      leitura([CABECALHO_PARCIAL, valoresExportados()]),
      [],
    );
    expect(plano.criar).toEqual([]);
    expect(plano.existentes).toBe(1);
    expect(plano.divergentes).toBe(0);
    expect(plano.bloqueado).toBe(false);
    expect(plano.avisos).toEqual([]);
    expect(plano.atualizar).toEqual([]);
  });

  it("exporta presença e faltas da Chamada com a revisão da origem e da confirmação", () => {
    for (const registro of [
      chamada(),
      chamada({ marca: "F", descricao: "Falta na Chamada" }),
      chamada({ marca: "FJ", descricao: "Falta justificada na Chamada" }),
      chamada({ marca: "S", descricao: "Falta na 4ª aula da Chamada" }),
    ]) {
      const valores = valoresExportados(registro);
      expect(valores[3]).toBe(registro.descricao);
      expect(valores[7]).toBe(codigo());
      expect(valores[8]).toBe("chamada:3:seduc:1");
      expect(planejarParciais([registro], leitura([CABECALHO_PARCIAL, valores]), [])).toMatchObject(
        { bloqueado: false, existentes: 1, criar: [], atualizar: [] },
      );
    }
  });

  it("substitui a base pela personalização e volta à base na mesma linha", () => {
    const dados = {
      ...leitura([CABECALHO_PARCIAL, valoresExportados(chamada())]),
      linhasCriadas: [2],
    };
    expect(planejarParciais([frequencia], dados, []).bloqueado).toBe(true);
    const personalizada = planejarParciais([frequencia], dados, [], true);
    expect(personalizada).toMatchObject({ bloqueado: false, existentes: 1, criar: [] });
    expect(personalizada.atualizar).toHaveLength(1);
    expect(personalizada.atualizar[0]?.codigo).toBe(codigo());
    expect(personalizada.atualizar[0]?.celulas).toContainEqual({ coluna: 4, valor: "Manhã" });
    const restaurada = planejarParciais(
      [chamada()],
      { ...dados, valores: [CABECALHO_PARCIAL, valoresExportados()] },
      [],
      true,
    );
    expect(restaurada).toMatchObject({ bloqueado: false, existentes: 1, criar: [] });
    expect(restaurada.atualizar[0]?.celulas).toContainEqual({ coluna: 4, valor: "Dia inteiro" });
  });

  it("reconhece UUID legado e preserva seu código ao atualizar a personalização", () => {
    const legado = valoresExportados();
    legado[7] = frequencia.id;
    const dados = { ...leitura([CABECALHO_PARCIAL, legado]), linhasCriadas: [2] };
    expect(planejarParciais([frequencia], dados, [])).toMatchObject({
      bloqueado: false,
      existentes: 1,
      criar: [],
      atualizar: [],
    });
    const plano = planejarParciais(
      [{ ...frequencia, registradoSeduc: true, revisao: 2 }],
      dados,
      [],
      true,
    );
    expect(plano.atualizar[0]?.codigo).toBe(frequencia.id);
    expect(plano.atualizar[0]?.celulas.some((celula) => celula.coluna === 8)).toBe(false);
    expect(plano.criar).toEqual([]);
  });

  it("bloqueia duplicata entre código canônico e UUID legado", () => {
    const legado = valoresExportados();
    legado[7] = frequencia.id;
    const plano = planejarParciais(
      [frequencia],
      { ...leitura([CABECALHO_PARCIAL, valoresExportados(), legado]), linhasCriadas: [2, 3] },
      [],
      true,
    );
    expect(plano).toMatchObject({ bloqueado: true, divergentes: 1, criar: [], atualizar: [] });
  });

  it("preserva o UUID de ajuste excluído sem duplicar a base pelo nome e data", () => {
    const legado = valoresExportados();
    legado[7] = frequencia.id;
    const dados = { ...leitura([CABECALHO_PARCIAL, legado]), linhasCriadas: [2] };
    const anterior = structuredClone(dados);
    expect(planejarParciais([chamada()], dados, [], true)).toMatchObject({
      bloqueado: false,
      pendentesManuais: 1,
      criar: [],
      atualizar: [],
    });
    expect(dados).toEqual(anterior);
  });

  it("não duplica ajuste legado excluído quando o nome do aluno mudou", () => {
    const legado = valoresExportados();
    legado[7] = frequencia.id;
    const dados = { ...leitura([CABECALHO_PARCIAL, legado]), linhasCriadas: [2] };
    const anterior = structuredClone(dados);
    const plano = planejarParciais([chamada({ alunoNome: "QA Nome atualizado" })], dados, [], true);
    expect(plano).toMatchObject({
      bloqueado: false,
      pendentesManuais: 1,
      criar: [],
      atualizar: [],
    });
    expect(plano.avisos[0]).toContain("registro antigo sem correspondência");
    expect(dados).toEqual(anterior);
  });

  it("reserva apenas turma e dia do UUID órfão e mantém atualizações reconhecidas", () => {
    const legado = valoresExportados();
    legado[7] = frequencia.id;
    const outro = {
      ...frequencia,
      id: "00000000-0000-4000-8000-000000000004",
      alunoId: "00000000-0000-4000-8000-000000000005",
      alunoNome: "QA Outro aluno",
    };
    const dados = {
      ...leitura([CABECALHO_PARCIAL, legado, valoresExportados(outro)]),
      linhasCriadas: [2, 3],
    };
    const outraTurma = chamada({
      id: "chamada:00000000-0000-4000-8000-000000000006:2026-10-02",
      alunoId: "00000000-0000-4000-8000-000000000006",
      alunoNome: "QA Outro aluno de outra turma",
      turmaNome: "QA Ano B",
    });
    const outroDia = chamada({
      id: "chamada:00000000-0000-4000-8000-000000000002:2026-10-03",
      dia: "2026-10-03",
      alunoNome: "QA Nome atualizado",
    });
    const plano = planejarParciais(
      [
        chamada({ alunoNome: "QA Nome atualizado" }),
        { ...outro, registradoSeduc: true, revisao: 2 },
        outraTurma,
        outroDia,
      ],
      dados,
      [],
      true,
    );
    expect(plano).toMatchObject({ bloqueado: false, pendentesManuais: 1, existentes: 1 });
    expect(plano.criar).toHaveLength(2);
    expect(plano.criar.map((linha) => linha.celulas[7]?.valor)).toEqual([
      codigo(outraTurma),
      codigo(outroDia),
    ]);
    expect(plano.atualizar).toHaveLength(1);
    expect(plano.atualizar[0]?.linha).toBe(3);
    expect(plano.atualizar[0]?.celulas).toContainEqual({ coluna: 5, valor: "Sim" });
  });

  it("invalida a prévia e exige confirmação quando somente a revisão Seduc da base muda", () => {
    const registro = chamada();
    const alterado = chamada({ revisaoSeduc: 2 });
    const dados = {
      ...leitura([CABECALHO_PARCIAL, valoresExportados(registro)]),
      linhasCriadas: [2],
    };
    expect(planejarParciais([registro], dados, []).planoHash).not.toBe(
      planejarParciais([alterado], dados, []).planoHash,
    );
    expect(planejarParciais([alterado], dados, []).bloqueado).toBe(true);
    expect(planejarParciais([alterado], dados, [], true).atualizar[0]?.celulas).toEqual([
      { coluna: 9, valor: "chamada:3:seduc:2" },
    ]);
  });

  it("bloqueia base e personalização repetidas para o mesmo aluno e dia", () => {
    expect(planejarParciais([chamada(), frequencia], leitura(), [])).toMatchObject({
      bloqueado: true,
      divergentes: 2,
      criar: [],
      atualizar: [],
    });
  });

  it("bloqueia todo envio quando confirmação ou revisão diverge, preservando a linha", () => {
    const valores = [CABECALHO_PARCIAL, valoresExportados()];
    const anterior = structuredClone(valores);
    const alterada = {
      ...frequencia,
      registradoSeduc: true,
      registradoSeducEm: "2026-10-02T18:30:00.000Z",
      revisao: 2,
    };
    const plano = planejarParciais(
      [
        alterada,
        {
          ...frequencia,
          id: "00000000-0000-4000-8000-000000000004",
          alunoId: "00000000-0000-4000-8000-000000000004",
        },
      ],
      leitura(valores),
      [],
    );
    expect(plano.bloqueado).toBe(true);
    expect(plano.existentes).toBe(1);
    expect(plano.divergentes).toBe(1);
    expect(plano.criar).toEqual([]);
    expect(plano.avisos[0]).toContain("preservado");
    expect(valores).toEqual(anterior);
    expect(plano.atualizar).toEqual([]);
  });

  it("exige confirmação explícita para atualizar registro criado pela integração", () => {
    const alterada = { ...frequencia, registradoSeduc: true, revisao: 2 };
    const dados = { ...leitura([CABECALHO_PARCIAL, valoresExportados()]), linhasCriadas: [2] };
    const plano = planejarParciais([alterada], dados, []);
    expect(plano.bloqueado).toBe(true);
    expect(plano.divergentes).toBe(1);
    expect(plano.atualizar).toEqual([]);
    expect(plano.avisos[0]).toContain("Confirme a atualização");
  });

  it("atualiza somente campos alterados de linha marcada, conservando os valores anteriores", () => {
    const valores = [CABECALHO_PARCIAL, [...valoresExportados(), "Nota manual extra"]];
    const dados = { ...leitura(valores), linhasCriadas: [2] };
    const anterior = structuredClone(dados);
    const alterada = {
      ...frequencia,
      registradoSeduc: true,
      registradoSeducEm: "2026-10-02T18:30:00.000Z",
      revisao: 2,
    };
    const plano = planejarParciais([alterada], dados, [], true);
    expect(plano.bloqueado).toBe(false);
    expect(plano.divergentes).toBe(1);
    expect(plano.existentes).toBe(1);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([
      {
        linha: 2,
        nome: frequencia.alunoNome,
        codigo: codigo(),
        anteriores: valoresExportados(),
        celulas: [
          { coluna: 5, valor: "Sim" },
          { coluna: 6, valor: "2026-10-02T18:30:00.000Z" },
          { coluna: 9, valor: "2" },
        ],
      },
    ]);
    expect(dados).toEqual(anterior);
  });

  it("impede confirmação de atualização em linha sem marca ou com código duplicado", () => {
    const alterada = { ...frequencia, registradoSeduc: true, revisao: 2 };
    const semMarca = planejarParciais(
      [alterada],
      leitura([CABECALHO_PARCIAL, valoresExportados()]),
      [],
      true,
    );
    expect(semMarca.bloqueado).toBe(true);
    expect(semMarca.atualizar).toEqual([]);
    expect(semMarca.avisos[0]).toContain("sem marca");
    const repetido = planejarParciais(
      [alterada],
      {
        ...leitura([CABECALHO_PARCIAL, valoresExportados(), valoresExportados()]),
        linhasCriadas: [2, 3],
      },
      [],
      true,
    );
    expect(repetido.bloqueado).toBe(true);
    expect(repetido.atualizar).toEqual([]);
  });

  it("recusa código alterado mesmo com marca de criação e atualização confirmada", () => {
    const linha = valoresExportados();
    linha[7] = ` ${frequencia.id} `;
    const plano = planejarParciais(
      [{ ...frequencia, registradoSeduc: true, revisao: 2 }],
      { ...leitura([CABECALHO_PARCIAL, linha]), linhasCriadas: [2] },
      [],
      true,
    );
    expect(plano.bloqueado).toBe(true);
    expect(plano.atualizar).toEqual([]);
    expect(plano.avisos[0]).toContain("código alterado");
  });

  it("descarta atualizações autorizadas se outro registro tem conflito inseguro", () => {
    const segundo = {
      ...frequencia,
      id: "00000000-0000-4000-8000-000000000004",
      alunoId: "00000000-0000-4000-8000-000000000004",
    };
    const dados = {
      ...leitura([CABECALHO_PARCIAL, valoresExportados(), valoresExportados(segundo)]),
      linhasCriadas: [2],
    };
    const plano = planejarParciais(
      [
        { ...frequencia, registradoSeduc: true, revisao: 2 },
        { ...segundo, registradoSeduc: true, revisao: 2 },
        {
          ...frequencia,
          id: "00000000-0000-4000-8000-000000000005",
          alunoId: "00000000-0000-4000-8000-000000000005",
        },
      ],
      dados,
      [],
      true,
    );
    expect(plano.bloqueado).toBe(true);
    expect(plano.divergentes).toBe(2);
    expect(plano.atualizar).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  it("bloqueia código repetido na planilha sem escolher uma das linhas", () => {
    const valores = [CABECALHO_PARCIAL, valoresExportados(), valoresExportados()];
    const plano = planejarParciais([frequencia], leitura(valores), []);
    expect(plano.bloqueado).toBe(true);
    expect(plano.divergentes).toBe(1);
    expect(plano.existentes).toBe(1);
    expect(plano.criar).toEqual([]);
  });

  it("bloqueia fórmula em registro existente mesmo quando o resultado coincide", () => {
    const plano = planejarParciais(
      [frequencia],
      leitura([CABECALHO_PARCIAL, valoresExportados()], [[], [false, true]]),
      [],
    );
    expect(plano.bloqueado).toBe(true);
    expect(plano.divergentes).toBe(1);
    expect(plano.criar).toEqual([]);
    const alterada = { ...frequencia, registradoSeduc: true, revisao: 2 };
    const comPermissao = planejarParciais(
      [alterada],
      {
        ...leitura([CABECALHO_PARCIAL, valoresExportados()], [[], [false, true]]),
        linhasCriadas: [2],
      },
      [],
      true,
    );
    expect(comPermissao.bloqueado).toBe(true);
    expect(comPermissao.atualizar).toEqual([]);
  });

  it("preserva fórmula extra de registro existente sem impedir outras linhas", () => {
    const plano = planejarParciais(
      [
        frequencia,
        {
          ...frequencia,
          id: "00000000-0000-4000-8000-000000000004",
          alunoId: "00000000-0000-4000-8000-000000000004",
        },
      ],
      leitura(
        [CABECALHO_PARCIAL, valoresExportados()],
        [[], [...Array<boolean>(9).fill(false), true]],
      ),
      [],
    );
    expect(plano.bloqueado).toBe(false);
    expect(plano.existentes).toBe(1);
    expect(plano.divergentes).toBe(0);
    expect(plano.criar[0]?.linha).toBe(3);
  });

  it.each(["02/10/2026", "2/10/26", "2026-10-02"])(
    "preserva registro manual com data %s sem impedir outro aluno",
    (data) => {
      const plano = planejarParciais(
        [
          frequencia,
          {
            ...frequencia,
            id: "00000000-0000-4000-8000-000000000004",
            alunoId: "00000000-0000-4000-8000-000000000004",
            alunoNome: "QA Outro aluno",
          },
        ],
        leitura([CABECALHO_PARCIAL, [data, "qa aluno"]]),
        [],
      );
      expect(plano.bloqueado).toBe(false);
      expect(plano.pendentesManuais).toBe(1);
      expect(plano.existentes).toBe(0);
      expect(plano.criar).toHaveLength(1);
      expect(plano.criar[0]?.nome).toBe("QA Outro aluno");
      expect(plano.avisos[0]).toContain("manual");
    },
  );

  it("bloqueia códigos repetidos na origem antes de criar linhas duplicadas", () => {
    const plano = planejarParciais([frequencia, { ...frequencia }], leitura(), []);
    expect(plano.bloqueado).toBe(true);
    expect(plano.criar).toEqual([]);
    expect(plano.divergentes).toBe(2);
    expect(plano.avisos).toHaveLength(1);
  });

  it.each([
    { ...leitura(), nome: "Outra aba" },
    { ...leitura(), linhaInicial: 2 },
    { ...leitura(), colunaInicial: 2 },
    leitura([["Data", "Aluno", "Turma", "Horário"]]),
    leitura(undefined, [[true]]),
  ])("bloqueia estrutura incompatível sem propor escrita", (dados) => {
    const plano = planejarParciais([frequencia], dados, []);
    expect(plano.bloqueado).toBe(true);
    expect(plano.criar).toEqual([]);
    expect(plano.avisos[0]).toContain("cabeçalho padrão");
  });

  it("bloqueia mesclagens e aceita cabeçalho equivalente normalizado", () => {
    expect(planejarParciais([frequencia], leitura(), ["A1:B1"]).bloqueado).toBe(true);
    const cabecalho = CABECALHO_PARCIAL.map((rotulo) => normalizarSemAcento(rotulo));
    expect(planejarParciais([frequencia], leitura([cabecalho]), []).bloqueado).toBe(false);
  });

  it("invalida a prévia ao mudar a chave Seduc, a revisão ou fórmulas da planilha", () => {
    const primeiro = planejarParciais([frequencia], leitura(), []).planoHash;
    for (const alterada of [
      { ...frequencia, registradoSeduc: true },
      { ...frequencia, registradoSeducEm: "2026-10-02T18:30:00.000Z" },
      { ...frequencia, revisao: 2 },
      { ...frequencia, tipo: "AULAS" as const, turno: null, aulas: [3, 4] },
    ])
      expect(planejarParciais([alterada], leitura(), []).planoHash).not.toBe(primeiro);
    expect(
      planejarParciais([frequencia], leitura(undefined, [[], [], [true]]), []).planoHash,
    ).not.toBe(primeiro);
    expect(
      planejarParciais([frequencia], leitura([CABECALHO_PARCIAL, ["Nota manual"]]), []).planoHash,
    ).not.toBe(primeiro);
    expect(planejarParciais([frequencia], leitura(), [], true).planoHash).not.toBe(primeiro);
  });
});

function normalizarSemAcento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
