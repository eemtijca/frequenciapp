// Preparação mensal com Google simulado, sem sobrescrever abas ou dividir a criação.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mesValido, nomeAbaMensal } from "@/domain/planilha-mensal";
import { assinarAba } from "@/domain/planilha";
import {
  catalogoFrequenciaGoogle,
  executarAcaoGoogle,
  type DocumentoGoogle,
} from "@/infra/google-planilhas-api";
import { listarAbasMensaisGoogle, prepararAbaMensalGoogle } from "@/infra/google-planilhas-mensal";
import { enviarLotesGoogle } from "@/infra/google-planilhas-escrita";

const TURMA = "10000000-0000-4000-8000-000000000001";
const ALUNO = "20000000-0000-4000-8000-000000000001";
const GERACAO = "30000000-0000-4000-8000-000000000001";
const entrada = {
  turmaOriginalId: TURMA,
  rotulo: "1º A",
  mes: "2026-10",
  alunos: [{ alunoId: ALUNO, nome: "QA Aluno", turmaAtual: "1º B" }],
};

type Pedido = Record<string, unknown>;
function simularGoogle(modo?: "recusar" | "resposta_perdida" | "concorrente") {
  const documento: DocumentoGoogle = {
    spreadsheetId: "arquivo",
    properties: { title: "QA Frequência", timeZone: "America/Fortaleza" },
    developerMetadata: [],
    sheets: [{ properties: { sheetId: 1, title: "1º A" } }],
  };
  const lotes: Pedido[][] = [];
  const requisicoes: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, opcoes?: RequestInit) => {
      requisicoes.push(String(url));
      if (String(url).includes("developerMetadata:search"))
        return Response.json({ matchedDeveloperMetadata: [] });
      if (String(url).endsWith(":batchUpdate")) {
        const corpo = JSON.parse(String(opcoes?.body)) as { requests: Pedido[] };
        lotes.push(corpo.requests);
        if (modo === "recusar")
          return Response.json({ error: { message: "Recusado" } }, { status: 400 });
        for (const pedido of corpo.requests) {
          if (!pedido.addSheet) continue;
          const criada = pedido.addSheet as { properties: { sheetId: number; title: string } };
          if (
            documento.sheets.some(
              (aba) =>
                aba.properties.sheetId === criada.properties.sheetId ||
                aba.properties.title === criada.properties.title,
            )
          )
            return Response.json({ error: { message: "Aba existente" } }, { status: 400 });
        }
        for (const pedido of corpo.requests) {
          if (pedido.addSheet) {
            const criado = pedido.addSheet as { properties: { sheetId: number; title: string } };
            documento.sheets.push({ properties: criado.properties });
          }
          if (pedido.createDeveloperMetadata) {
            const criado = pedido.createDeveloperMetadata as {
              developerMetadata: Omit<
                NonNullable<DocumentoGoogle["developerMetadata"]>[number],
                "metadataId"
              >;
            };
            documento.developerMetadata?.push({
              ...criado.developerMetadata,
              metadataId: (documento.developerMetadata?.length ?? 0) + 1,
            });
          }
        }
        if (modo === "resposta_perdida") throw new TypeError("Resposta perdida");
        if (modo === "concorrente")
          return Response.json({ error: { message: "Aba existente" } }, { status: 400 });
        return Response.json({ replies: [] });
      }
      if (String(url).includes("/values/")) throw new Error("O catálogo não deve ler células.");
      return Response.json(documento);
    }),
  );
  return { documento, lotes, requisicoes };
}

function marcarMensal(documento: DocumentoGoogle, id: number, mes = entrada.mes) {
  documento.sheets.push({ properties: { sheetId: id, title: `QA ${id}` } });
  for (const [metadataKey, metadataValue] of [
    ["frequenciapp.aba", "1"],
    ["frequenciapp.turma", TURMA],
    ["frequenciapp.mes", mes],
    ["frequenciapp.geracao", GERACAO],
  ])
    if (metadataKey && metadataValue)
      documento.developerMetadata?.push({
        metadataId: (documento.developerMetadata?.length ?? 0) + 1,
        metadataKey,
        metadataValue,
        location: { sheetId: id },
      });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("identificação do mês da planilha", () => {
  it.each(["2026-01", "2026-12", "2000-02", "2100-02"])("aceita mês civil completo %s", (mes) => {
    expect(mesValido(mes)).toBe(true);
  });
  it.each(["2026-00", "2026-13", "2026-1", "10-2026", "1999-12", "2101-01", "2026-01-01"])(
    "recusa mês inválido %s",
    (mes) => expect(mesValido(mes)).toBe(false),
  );
  it("preserva mês e ano em nomes longos e remove caracteres proibidos", () => {
    const nome = nomeAbaMensal("'QA [A]/B:C?D*E\\F\n".repeat(20), "2026-10");
    expect(nome.length).toBeLessThanOrEqual(100);
    expect(nome).toMatch(/ · 10-2026$/);
    expect(nome).not.toMatch(/[\\/:*?[\]]/);
    expect(nome.startsWith("'")).toBe(false);
    expect(nomeAbaMensal("1º A", "2026-10")).toBe("1º A · 10-2026");
    expect(() => nomeAbaMensal("QA", "2026-13")).toThrow("mês válido");
  });
});

describe("preparação das abas mensais", () => {
  it("cria calendário completo, lista e vínculos em um lote, preservando a aba antiga", async () => {
    const { documento, lotes } = simularGoogle();
    const anterior = structuredClone(documento.sheets[0]);
    const resultado = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    expect(resultado).toMatchObject({
      aba: "1º A · 10-2026",
      criada: true,
      mes: "2026-10",
      turmaOriginalId: TURMA,
    });
    expect(documento.sheets[0]).toEqual(anterior);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toContainEqual(
      expect.objectContaining({
        updateCells: expect.objectContaining({
          rows: [
            {
              values: expect.arrayContaining([
                { userEnteredValue: { stringValue: "Aluno" } },
                { userEnteredValue: { stringValue: "01/10/2026" } },
                { userEnteredValue: { stringValue: "31/10/2026" } },
              ]),
            },
            {
              values: [
                { userEnteredValue: { stringValue: "QA Aluno" } },
                { userEnteredValue: { stringValue: "1º B" } },
              ],
            },
          ],
        }),
      }),
    );
    expect(documento.developerMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metadataKey: "frequenciapp.aluno", metadataValue: ALUNO }),
        expect.objectContaining({ metadataKey: "frequenciapp.mes", metadataValue: "2026-10" }),
        expect.objectContaining({ metadataKey: "frequenciapp.turma", metadataValue: TURMA }),
      ]),
    );
    expect(
      documento.developerMetadata?.filter((item) => item.metadataKey === "frequenciapp.coluna"),
    ).toHaveLength(33);
    expect(await listarAbasMensaisGoogle("arquivo", "acesso")).toEqual({
      abas: [
        {
          aba: resultado.aba,
          mes: entrada.mes,
          turmaOriginalId: TURMA,
          destino: resultado.destino,
        },
      ],
    });
  });

  it.each([
    ["2024-02", 31],
    ["2026-02", 30],
    ["2100-02", 30],
  ])("prepara fevereiro de %s com o número correto de colunas", async (mes, total) => {
    const { documento } = simularGoogle();
    await prepararAbaMensalGoogle("arquivo", "acesso", { ...entrada, mes });
    expect(
      documento.developerMetadata?.filter((item) => item.metadataKey === "frequenciapp.coluna"),
    ).toHaveLength(total);
  });

  it("mantém a criação inteira no mesmo lote mesmo com mais de 500 operações", async () => {
    const { lotes } = simularGoogle();
    await prepararAbaMensalGoogle("arquivo", "acesso", {
      ...entrada,
      alunos: Array.from({ length: 200 }, (_, indice) => ({
        alunoId: `20000000-0000-4000-8000-${String(indice).padStart(12, "0")}`,
        nome: `QA ${indice}`,
        turmaAtual: "QA",
      })),
    });
    expect(lotes).toHaveLength(1);
    expect(lotes[0]?.length).toBeGreaterThan(500);
  });

  it("reprepara sem reescrever, mesmo depois de renomear a turma ou a aba", async () => {
    const { documento, lotes } = simularGoogle();
    const criado = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    const mensal = documento.sheets.find((aba) => aba.properties.title === criado.aba);
    if (!mensal) throw new Error("Aba mensal ausente no teste.");
    mensal.properties.title = "QA Outubro renomeado";
    const nova = await prepararAbaMensalGoogle("arquivo", "acesso", {
      ...entrada,
      rotulo: "QA Turma renomeada",
      alunos: [{ alunoId: ALUNO, nome: "QA Nome atualizado", turmaAtual: "QA C" }],
    });
    expect(nova).toEqual({ ...criado, aba: "QA Outubro renomeado", criada: false });
    expect(lotes).toHaveLength(1);
  });

  it("atribui outra geração ao recriar uma aba apagada, mesmo com o identificador igual", async () => {
    const { documento } = simularGoogle();
    const anterior = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    const sheetId = Number(anterior.destino.split(":")[1]);
    documento.sheets = documento.sheets.filter((aba) => aba.properties.sheetId !== sheetId);
    documento.developerMetadata = [];
    const recriada = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    expect(recriada.criada).toBe(true);
    expect(recriada.aba).toBe(anterior.aba);
    expect(recriada.destino.split(":").slice(0, 2)).toEqual(
      anterior.destino.split(":").slice(0, 2),
    );
    expect(recriada.destino).not.toBe(anterior.destino);
    expect((await listarAbasMensaisGoogle("arquivo", "acesso")).abas[0]?.destino).toBe(
      recriada.destino,
    );
  });

  it("preserva o limite de 500 operações nos envios comuns", async () => {
    const { lotes } = simularGoogle();
    await enviarLotesGoogle(
      "arquivo",
      "acesso",
      Array.from({ length: 1001 }, () => ({ repeatCell: {} })),
    );
    expect(lotes.map((lote) => lote.length)).toEqual([500, 500, 1]);
  });

  it("criações concorrentes com títulos diferentes disputam o mesmo destino", async () => {
    const { documento, lotes } = simularGoogle();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resultados = await Promise.all([
      prepararAbaMensalGoogle("arquivo", "acesso", entrada),
      prepararAbaMensalGoogle("arquivo", "acesso", { ...entrada, rotulo: "QA Turma renomeada" }),
    ]);
    expect(new Set(resultados.map((item) => item.destino)).size).toBe(1);
    expect(resultados.filter((item) => item.criada)).toHaveLength(1);
    expect(documento.sheets).toHaveLength(2);
    expect(lotes).toHaveLength(2);
  });

  it.each(["resposta_perdida", "concorrente"] as const)(
    "confirma a criação por leitura após %s sem repetir a escrita",
    async (modo) => {
      const { lotes } = simularGoogle(modo);
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).resolves.toMatchObject({
        criada: false,
        mes: entrada.mes,
      });
      expect(lotes).toHaveLength(1);
    },
  );

  it("preserva a recusa quando não há destino confirmado e não tenta gravar novamente", async () => {
    const { documento, lotes } = simularGoogle("recusar");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow(
      "Google recusou",
    );
    expect(lotes).toHaveLength(1);
    expect(documento.sheets).toHaveLength(1);
  });

  it.each(["titulo", "identificador"])(
    "recusa colisão de %s com aba sem vínculo mensal",
    async (tipo) => {
      const { documento, lotes } = simularGoogle();
      const sheetId =
        createHash("sha256")
          .update(`frequenciapp.mensal:${TURMA}:${entrada.mes}`)
          .digest()
          .readUInt32BE(0) & 0x7fffffff || 1;
      documento.sheets.push({
        properties: {
          sheetId: tipo === "identificador" ? sheetId : 2,
          title: tipo === "titulo" ? nomeAbaMensal(entrada.rotulo, entrada.mes) : "QA Manual",
        },
      });
      await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow(
        "impede a preparação",
      );
      expect(lotes).toEqual([]);
    },
  );

  it("recusa duas abas identificadas para a mesma turma e mês", async () => {
    const { documento, lotes } = simularGoogle();
    marcarMensal(documento, 2);
    marcarMensal(documento, 3);
    await expect(listarAbasMensaisGoogle("arquivo", "acesso")).rejects.toThrow("mais de uma aba");
    await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow(
      "mais de uma aba",
    );
    expect(lotes).toEqual([]);
  });

  it.each(["2026-13", ""])("recusa identidade mensal incompleta ou inválida %s", async (mes) => {
    const { documento } = simularGoogle();
    marcarMensal(documento, 2, mes);
    await expect(listarAbasMensaisGoogle("arquivo", "acesso")).rejects.toThrow("identificação");
  });

  it("valida o contrato de criação antes de ler ou escrever no Google", async () => {
    const { requisicoes } = simularGoogle();
    await expect(
      executarAcaoGoogle("arquivo", "acesso", { acao: "prepararMes", ...entrada, mes: "2026-13" }),
    ).rejects.toThrow("Confira a turma");
    await expect(
      prepararAbaMensalGoogle("arquivo", "acesso", {
        ...entrada,
        alunos: [...entrada.alunos, ...entrada.alunos],
      }),
    ).rejects.toThrow("Confira a turma");
    expect(requisicoes).toEqual([]);
  });

  it("consulta catálogo e metadados sem ler células e mantém as abas legadas", async () => {
    const { documento, lotes, requisicoes } = simularGoogle();
    marcarMensal(documento, 2);
    const catalogo = await catalogoFrequenciaGoogle("arquivo", "acesso");
    expect(catalogo).toMatchObject({
      planilha: { nome: "QA Frequência", fuso: "America/Fortaleza" },
      abas: [
        { nome: "1º A", criada: false },
        {
          nome: "QA 2",
          criada: true,
          mensal: { mes: entrada.mes, turmaOriginalId: TURMA, destino: `arquivo:2:${GERACAO}` },
        },
      ],
    });
    expect(catalogo.abas[0]).not.toHaveProperty("mensal");
    expect(lotes).toEqual([]);
    expect(requisicoes).toHaveLength(2);
    expect(requisicoes.some((url) => url.includes("/values/"))).toBe(false);
  });
});

describe("conferência mensal antes da escrita", () => {
  it.each(["destino", "geracao", "mes", "turma", "sem_marcador", "igual"])(
    "confere a identidade %s mesmo quando o título e o cabeçalho permanecem iguais",
    async (alteracao) => {
      const documento: DocumentoGoogle = {
        spreadsheetId: "arquivo",
        properties: { title: "QA Frequência" },
        developerMetadata: [],
        sheets: [],
      };
      marcarMensal(documento, 2);
      if (alteracao === "sem_marcador") documento.developerMetadata = [];
      const valores = [
        ["Aluno", "01/10/2026"],
        ["QA Aluno", ""],
      ];
      const lotes: Pedido[][] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (entrada: URL | string, opcoes?: RequestInit) => {
          const url = new URL(String(entrada));
          if (url.pathname.endsWith("/developerMetadata:search"))
            return Response.json({ matchedDeveloperMetadata: [] });
          if (url.pathname.endsWith(":batchUpdate")) {
            lotes.push((JSON.parse(String(opcoes?.body)) as { requests: Pedido[] }).requests);
            return Response.json({ replies: [] });
          }
          if (url.pathname.includes("/values/")) return Response.json({ values: valores });
          if (url.searchParams.get("includeGridData") === "true")
            return Response.json({
              sheets: [
                {
                  data: [
                    {
                      rowData: valores.map((linha) => ({
                        values: linha.map((formattedValue) => ({ formattedValue })),
                      })),
                    },
                  ],
                },
              ],
            });
          return Response.json(documento);
        }),
      );
      const envio = executarAcaoGoogle("arquivo", "acesso", {
        acao: "aplicar",
        aba: "QA 2",
        cabecalhoLinha: 1,
        assinatura: assinarAba("QA 2", valores[0] ?? [], []),
        operacoes: [{ tipo: "preencher", linha: 2, coluna: 2, valor: "F" }],
        modoCompleto: false,
        mensal: {
          mes: alteracao === "mes" ? "2026-11" : "2026-10",
          turmaOriginalId: alteracao === "turma" ? ALUNO : TURMA,
          destino: `arquivo:${alteracao === "destino" ? 3 : 2}:${alteracao === "geracao" ? ALUNO : GERACAO}`,
        },
      });
      if (alteracao === "igual") {
        await expect(envio).resolves.toMatchObject({ preenchidas: 1 });
        expect(lotes).toHaveLength(1);
      } else {
        await expect(envio).rejects.toMatchObject({ status: 409, recusado: true });
        expect(lotes).toEqual([]);
      }
    },
  );
});
