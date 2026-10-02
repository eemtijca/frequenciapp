// Exercita o envio após salvar pela Sheets API, com banco e OAuth sintéticos.
// Planejamento, seleção do provedor e gravação conservadora usam o código real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LinhaIntegracao } from "@/application/planilha-comum";
import { detectarEsquema } from "@/domain/planilha";
import type { Aluno, Frequencia, Turma } from "@/domain/frequencia";

const dubl = vi.hoisted(() => ({
  integracao: vi.fn(),
  atualizarIntegracao: vi.fn(),
  frequencia: vi.fn(),
  frequenciasBanco: vi.fn(),
  ultimoEnvio: vi.fn(),
  envios: vi.fn(),
  criarEnvio: vi.fn(),
  concluirEnvio: vi.fn(),
  alunos: vi.fn(),
  turmas: vi.fn(),
  frequencias: vi.fn(),
  acesso: vi.fn(),
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    integracaoPlanilha: {
      findUnique: dubl.integracao,
      update: dubl.atualizarIntegracao,
    },
    frequencia: { findFirst: dubl.frequencia, findMany: dubl.frequenciasBanco },
    sincronizacaoPlanilha: {
      findFirst: dubl.ultimoEnvio,
      findMany: dubl.envios,
      create: dubl.criarEnvio,
      update: dubl.concluirEnvio,
    },
  }),
}));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/infra/auth/limite", () => ({ limiteDeTentativas: async () => true }));
vi.mock("@/infra/google-oauth", () => ({ renovarAcesso: dubl.acesso }));
vi.mock("@/application/alunos", () => ({ listarTodosAlunos: dubl.alunos }));
vi.mock("@/application/turmas", () => ({ listarTodasTurmas: dubl.turmas }));
vi.mock("@/application/frequencias", () => ({ listarFrequenciasDoPeriodo: dubl.frequencias }));

import { enviarAposSalvar } from "@/application/planilha";

const turmaId = "00000000-0000-4000-8000-000000000101";
const alunoId = "00000000-0000-4000-8000-000000000102";
const dia = "2026-10-02";
const nomeAba = "QA Ano A";
const cabecalho = ["Aluno", "02/10/2026"];
const aluno: Aluno = {
  id: alunoId,
  nome: "QA Aluna Google",
  turmaId,
  turmaOriginalId: turmaId,
  ordem: 1,
  ativo: true,
};
const turma: Turma = {
  id: turmaId,
  serieId: "00000000-0000-4000-8000-000000000103",
  nome: "A",
  serieNome: "QA Ano",
  rotulo: nomeAba,
  horarios: [
    {
      id: "00000000-0000-4000-8000-000000000104",
      turmaId,
      ordem: 1,
      inicio: "00:00",
      fim: "23:59",
      diasSemana: [1, 2, 3, 4, 5, 6, 7],
      ativo: true,
    },
  ],
};
const frequencia: Frequencia = {
  turmaId,
  dia,
  revisao: 1,
  atualizadoEm: "2026-10-02T12:00:00Z",
  atualizadoPorNome: "QA Coordenação",
  faltas: [],
  alunos: [alunoId],
};

interface Registro {
  id: string;
  resultado: "PARCIAL" | "SUCESSO" | "FALHA";
  de: Date;
  ate: Date;
  criadoEm: Date;
  puladasOcupadas?: number;
  puladasFormula?: number;
  erro?: string | null;
}
interface Pedido {
  updateCells?: {
    range: { sheetId: number; startRowIndex: number; startColumnIndex: number };
    rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
  };
}

let linha: LinhaIntegracao;
let nomeNaPlanilha: string;
let vinculada: boolean;
let celula: string;
let formula: boolean;
let respostaPerdida: boolean;
let antesDaReleitura: (() => void) | null;
let registros: Registro[];
let lotes: Pedido[][];

function colunaDoIntervalo(letra: string): number {
  return [...letra].reduce((total, caractere) => total * 26 + caractere.charCodeAt(0) - 64, 0) - 1;
}

async function responderGoogle(entrada: URL | string, opcoes?: RequestInit): Promise<Response> {
  const url = new URL(String(entrada));
  expect(url.origin).toBe("https://sheets.googleapis.com");
  expect(new Headers(opcoes?.headers).get("Authorization")).toBe("Bearer acesso-sintetico");
  const valores = [cabecalho, [nomeNaPlanilha, celula]];
  if (url.pathname.endsWith("/developerMetadata:search"))
    return Response.json({ matchedDeveloperMetadata: [] });
  if (url.pathname.endsWith(":batchUpdate")) {
    const pedidos = (JSON.parse(String(opcoes?.body)) as { requests: Pedido[] }).requests;
    lotes.push(pedidos);
    expect(registros.at(-1)?.resultado).toBe("PARCIAL");
    for (const pedido of pedidos) {
      const escrita = pedido.updateCells;
      expect(escrita?.range).toMatchObject({ sheetId: 7, startRowIndex: 1, startColumnIndex: 1 });
      if (escrita) celula = escrita.rows[0]?.values[0]?.userEnteredValue.stringValue ?? "";
    }
    if (respostaPerdida) throw new TypeError("Resposta sintética perdida após gravar.");
    return Response.json({ replies: [] });
  }
  if (url.pathname.includes("/values/")) return Response.json({ values: valores });
  if (url.searchParams.get("includeGridData") === "true") {
    return Response.json({
      sheets: [
        {
          data: url.searchParams.getAll("ranges").map((intervalo) => {
            const trecho = /!([A-Z]+)1:([A-Z]+)(\d+)$/.exec(intervalo);
            if (!trecho?.[1] || !trecho[2] || !trecho[3])
              throw new Error("Intervalo sintético inesperado.");
            const inicio = colunaDoIntervalo(trecho[1]);
            const fim = colunaDoIntervalo(trecho[2]) + 1;
            return {
              startRow: 0,
              startColumn: inicio,
              rowData: valores.slice(0, Number(trecho[3])).map((fileira, indice) => ({
                values: fileira.slice(inicio, fim).map((formattedValue, coluna) => ({
                  formattedValue,
                  ...(formula && indice === 1 && inicio + coluna === 1
                    ? { userEnteredValue: { formulaValue: `="${formattedValue}"` } }
                    : {}),
                })),
              })),
            };
          }),
        },
      ],
    });
  }
  return Response.json({
    spreadsheetId: "planilha-google-sintetica",
    properties: { title: "QA Frequência", timeZone: "America/Fortaleza" },
    sheets: [
      {
        properties: {
          sheetId: 7,
          title: nomeAba,
          gridProperties: { rowCount: 100, columnCount: 26 },
        },
        developerMetadata: vinculada
          ? [
              {
                metadataId: 12,
                metadataKey: "frequenciapp.aluno",
                metadataValue: alunoId,
                location: { dimensionRange: { sheetId: 7, startRowIndex: 1, endRowIndex: 2 } },
              },
            ]
          : [],
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  nomeNaPlanilha = aluno.nome;
  vinculada = true;
  celula = "";
  formula = false;
  respostaPerdida = false;
  antesDaReleitura = null;
  registros = [];
  lotes = [];
  const esquema = detectarEsquema(
    { nome: nomeAba, valores: [cabecalho, [aluno.nome, ""]], formulas: [], linhas: 2, colunas: 2 },
    2026,
  );
  linha = {
    ativa: true,

    googleRefreshToken: "refresh-sintetico",
    googlePlanilhaId: "planilha-google-sintetica",
    googlePlanilhaNome: "QA Frequência",
    esquema: {
      abas: [esquema],
      mapa: [{ aba: nomeAba, turmaOriginalId: turmaId }],
    },
    assinaturaEsquema: esquema.assinatura,
    esquemaEm: new Date("2026-10-02T11:00:00Z"),
    modo: "CONSERVADOR",
    modoCompletoAte: null,
    envioAutomatico: true,
    atualizadoEm: new Date("2026-10-02T11:00:00Z"),
  };
  dubl.integracao.mockImplementation(async () => linha);
  dubl.acesso.mockResolvedValue("acesso-sintetico");
  dubl.frequencia.mockResolvedValue({ alunos: [{ aluno: { turmaOriginalId: turmaId } }] });
  dubl.frequenciasBanco.mockResolvedValue([]);
  dubl.alunos.mockResolvedValue([aluno]);
  dubl.turmas.mockResolvedValue([turma]);
  dubl.frequencias.mockResolvedValue([frequencia]);
  dubl.ultimoEnvio.mockImplementation(async () => registros.at(-1) ?? null);
  dubl.envios.mockImplementation(async () => registros);
  dubl.criarEnvio.mockImplementation(async ({ data }: { data: Omit<Registro, "id"> }) => {
    const registro = { ...data, id: `registro-${registros.length + 1}` };
    registros.push(registro);
    antesDaReleitura?.();
    return { id: registro.id };
  });
  dubl.concluirEnvio.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<Registro> }) => {
      const registro = registros.find((item) => item.id === where.id);
      if (!registro) throw new Error("Registro sintético não encontrado.");
      Object.assign(registro, data);
      return registro;
    },
  );
  vi.stubGlobal("fetch", vi.fn(responderGoogle));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("enviar ao salvar com a conta Google", () => {
  it("envia uma chamada sem Apps Script e não duplica a gravação ao salvar novamente", async () => {
    const situacoes = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(situacoes.get(turmaId)).toBe("enviado");
    expect(celula).toBe("P");
    expect(lotes).toHaveLength(1);
    expect(registros).toMatchObject([{ resultado: "SUCESSO", preenchidas: 1, erro: null }]);
    expect(dubl.acesso).toHaveBeenCalledWith("refresh-sintetico");
    const reenvio = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(reenvio.get(turmaId)).toBe("enviado");
    expect(lotes).toHaveLength(1);
    expect(registros).toHaveLength(2);
    expect(registros[1]).toMatchObject({ resultado: "SUCESSO", preenchidas: 0, erro: null });
  });

  it.each([
    { nome: "célula divergente", valor: "F", temFormula: false },
    { nome: "fórmula divergente", valor: "F", temFormula: true },
    { nome: "fórmula com resultado vazio", valor: "", temFormula: true },
  ])("deixa $nome para revisão manual sem escrever", async ({ valor, temFormula }) => {
    celula = valor;
    formula = temFormula;
    const situacoes = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(situacoes.get(turmaId)).toBe("pendente_manual");
    expect(celula).toBe(valor);
    expect(formula).toBe(temFormula);
    expect(lotes).toHaveLength(0);
    expect(registros).toHaveLength(0);
  });

  it.each([
    { nome: "marca divergente", valor: "F", temFormula: false },
    { nome: "fórmula", valor: "", temFormula: true },
  ])(
    "mantém $nome inserida na última releitura pendente sem sobrescrever",
    async ({ valor, temFormula }) => {
      antesDaReleitura = () => {
        celula = valor;
        formula = temFormula;
      };
      const situacoes = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
      expect(situacoes.get(turmaId)).toBe("pendente_manual");
      expect(celula).toBe(valor);
      expect(formula).toBe(temFormula);
      expect(lotes).toHaveLength(0);
      expect(registros).toMatchObject([
        {
          resultado: "SUCESSO",
          preenchidas: 0,
          puladasOcupadas: temFormula ? 0 : 1,
          puladasFormula: temFormula ? 1 : 0,
        },
      ]);
    },
  );

  it("mantém vínculo pulado por nome alterado na releitura como pendência registrada", async () => {
    vinculada = false;
    celula = "P";
    antesDaReleitura = () => {
      nomeNaPlanilha = "QA Nome alterado na escola";
    };
    const situacoes = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(situacoes.get(turmaId)).toBe("pendente_manual");
    expect(nomeNaPlanilha).toBe("QA Nome alterado na escola");
    expect(vinculada).toBe(false);
    expect(celula).toBe("P");
    expect(lotes).toHaveLength(0);
    expect(registros).toMatchObject([
      { resultado: "SUCESSO", preenchidas: 0, puladasOcupadas: 1, puladasFormula: 0 },
    ]);
  });

  it("mantém resposta perdida sem confirmação e não repete a escrita automaticamente", async () => {
    respostaPerdida = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const situacoes = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(situacoes.get(turmaId)).toBe("sem_confirmacao");
    expect(celula).toBe("P");
    expect(lotes).toHaveLength(1);
    expect(registros).toMatchObject([{ resultado: "PARCIAL", preenchidas: 0 }]);
    const reenvio = await enviarAposSalvar({ id: "coordenacao-sintetica" }, turmaId, dia);
    expect(reenvio.get(turmaId)).toBe("sem_confirmacao");
    expect(lotes).toHaveLength(1);
    expect(registros).toHaveLength(1);
  });
});
