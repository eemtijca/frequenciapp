// Preparação mensal com Google simulado, sem sobrescrever abas ou dividir a criação.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { diasDoMes, rotuloData } from "@/domain/frequencia";
import { diasDaPlanilhaMensal, mesValido, nomeAbaMensal } from "@/domain/planilha-mensal";
import { assinarAba } from "@/domain/planilha";
import {
  catalogoFrequenciaGoogle,
  executarAcaoGoogle,
  type DocumentoGoogle,
} from "@/infra/google-planilhas-api";
import {
  listarAbasMensaisGoogle,
  mostrarMesGoogle,
  prepararAbaMensalGoogle,
} from "@/infra/google-planilhas-mensal";
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
function simularGoogle(
  modo?: "recusar" | "resposta_perdida" | "resposta_perdida_antes" | "concorrente",
) {
  const documento: DocumentoGoogle = {
    spreadsheetId: "arquivo",
    properties: { title: "QA Frequência", timeZone: "America/Fortaleza" },
    developerMetadata: [],
    sheets: [{ properties: { sheetId: 1, title: "1º A" } }],
  };
  const lotes: Pedido[][] = [];
  const requisicoes: string[] = [];
  const celulas = new Map<number, string[][]>();
  const controle = { modo };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, opcoes?: RequestInit) => {
      requisicoes.push(String(url));
      if (String(url).includes("developerMetadata:search"))
        return Response.json({ matchedDeveloperMetadata: [] });
      if (String(url).endsWith(":batchUpdate")) {
        const corpo = JSON.parse(String(opcoes?.body)) as { requests: Pedido[] };
        lotes.push(corpo.requests);
        if (controle.modo === "resposta_perdida_antes") throw new TypeError("Resposta perdida");
        if (controle.modo === "recusar")
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
          if (pedido.updateCells) {
            const atualizacao = pedido.updateCells as {
              range: { sheetId: number };
              rows: { values: { userEnteredValue: { stringValue: string } }[] }[];
            };
            celulas.set(
              atualizacao.range.sheetId,
              atualizacao.rows.map((linha) =>
                linha.values.map((celula) => celula.userEnteredValue.stringValue),
              ),
            );
          }
          if (pedido.updateSheetProperties) {
            const atualizacao = pedido.updateSheetProperties as {
              properties: { sheetId: number; title?: string; hidden?: boolean };
            };
            const aba = documento.sheets.find(
              (item) => item.properties.sheetId === atualizacao.properties.sheetId,
            );
            if (aba && atualizacao.properties.title)
              aba.properties.title = atualizacao.properties.title;
            if (aba && atualizacao.properties.hidden !== undefined)
              aba.properties.hidden = atualizacao.properties.hidden;
          }
          if (pedido.deleteDimension) {
            const exclusao = pedido.deleteDimension as {
              range: { sheetId: number; startIndex: number; endIndex: number };
            };
            const { sheetId, startIndex, endIndex } = exclusao.range;
            for (const linha of celulas.get(sheetId) ?? [])
              linha.splice(startIndex, endIndex - startIndex);
            documento.developerMetadata = documento.developerMetadata?.filter((item) => {
              const local = item.location.dimensionRange as
                | {
                    sheetId?: number;
                    dimension?: string;
                    startIndex?: number;
                    endIndex?: number;
                    startColumnIndex?: number;
                    endColumnIndex?: number;
                  }
                | undefined;
              if (!local || local.sheetId !== sheetId) return true;
              const indice =
                local.dimension === "COLUMNS" ? local.startIndex : local.startColumnIndex;
              if (indice === undefined) return true;
              if (indice >= startIndex && indice < endIndex) return false;
              if (indice >= endIndex) {
                if (local.dimension === "COLUMNS") {
                  local.startIndex = indice - (endIndex - startIndex);
                  local.endIndex = local.startIndex + 1;
                } else {
                  local.startColumnIndex = indice - (endIndex - startIndex);
                  local.endColumnIndex = local.startColumnIndex + 1;
                }
              }
              return true;
            });
          }
        }
        if (controle.modo === "resposta_perdida") throw new TypeError("Resposta perdida");
        if (controle.modo === "concorrente")
          return Response.json({ error: { message: "Aba existente" } }, { status: 400 });
        return Response.json({ replies: [] });
      }
      const endereco = new URL(String(url));
      if (endereco.searchParams.get("includeGridData") === "true") {
        const faixa = endereco.searchParams.get("ranges") ?? "";
        const nome = /^'((?:[^']|'')*)'!/.exec(faixa)?.[1]?.replaceAll("''", "'");
        const aba = documento.sheets.find((item) => item.properties.title === nome);
        const valores = aba ? (celulas.get(aba.properties.sheetId) ?? []) : [];
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
      }
      if (String(url).includes("/values/")) throw new Error("O catálogo não deve ler células.");
      return Response.json(documento);
    }),
  );
  return { documento, lotes, requisicoes, celulas, controle };
}

function inserirLegada(documento: DocumentoGoogle, celulas: Map<number, string[][]>) {
  const sheetId = 2;
  marcarMensal(documento, sheetId);
  const aba = documento.sheets.find((item) => item.properties.sheetId === sheetId);
  if (!aba) throw new Error("Aba de teste ausente.");
  aba.properties.title = "1º A · 10-2026";
  const cabecalho = ["Aluno", "Turma atual", ...diasDoMes(entrada.mes).map(rotuloData)];
  celulas.set(sheetId, [
    cabecalho,
    [
      "QA Nome preservado",
      "QA Turma anterior",
      ...diasDoMes(entrada.mes).map((_, indice) => (indice % 2 ? "F" : "P")),
    ],
  ]);
  for (const indice of cabecalho.keys())
    documento.developerMetadata?.push({
      metadataId: (documento.developerMetadata?.length ?? 0) + 1,
      metadataKey: "frequenciapp.coluna",
      metadataValue: "1",
      location: {
        dimensionRange: { sheetId, startColumnIndex: indice, endColumnIndex: indice + 1 },
      },
    });
  documento.developerMetadata?.push({
    metadataId: (documento.developerMetadata?.length ?? 0) + 1,
    metadataKey: "frequenciapp.aluno",
    metadataValue: ALUNO,
    location: { dimensionRange: { sheetId, startRowIndex: 1, endRowIndex: 2 } },
  });
  return sheetId;
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
  it("usa o mês por extenso em nomes longos e remove caracteres proibidos", () => {
    const nome = nomeAbaMensal("'QA [A]/B:C?D*E\\F\n".repeat(20), "2026-10");
    expect(nome.length).toBeLessThanOrEqual(100);
    expect(nome).toMatch(/ · Outubro$/);
    expect(nome).not.toMatch(/[\\/:*?[\]]/);
    expect(nome.startsWith("'")).toBe(false);
    expect(nomeAbaMensal("1º A", "2026-10")).toBe("1º A · Outubro");
    expect(nomeAbaMensal("1º A", "2027-10", true)).toBe("1º A · Outubro 2027");
    expect(() => nomeAbaMensal("QA", "2026-13")).toThrow("mês válido");
  });

  it("seleciona somente datas úteis nos limites e no ano bissexto", () => {
    const outubro = diasDaPlanilhaMensal("2026-10");
    expect(outubro).toHaveLength(22);
    expect(outubro[0]).toBe("2026-10-01");
    expect(outubro.at(-1)).toBe("2026-10-30");
    expect(outubro).not.toContain("2026-10-03");
    expect(outubro).not.toContain("2026-10-04");
    expect(diasDaPlanilhaMensal("2024-02")).toContain("2024-02-29");
    expect(() => diasDaPlanilhaMensal("2026-13")).toThrow("mês válido");
  });
});

describe("preparação das abas mensais", () => {
  it("cria dias úteis, lista e vínculos em um lote, preservando a aba antiga", async () => {
    const { documento, lotes } = simularGoogle();
    const anterior = structuredClone(documento.sheets[0]);
    const resultado = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    expect(resultado).toMatchObject({
      aba: "1º A · Outubro",
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
                { userEnteredValue: { stringValue: "30/10/2026" } },
              ]),
            },
            {
              values: [{ userEnteredValue: { stringValue: "QA Aluno" } }],
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
    ).toHaveLength(23);
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
    ["2024-02", 22],
    ["2026-02", 21],
    ["2100-02", 21],
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

  it("atualiza somente o título depois de renomear a turma ou a aba", async () => {
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
    expect(nova).toEqual({
      ...criado,
      aba: "QA Turma renomeada · Outubro",
      criada: false,
      atualizada: true,
    });
    expect(lotes).toHaveLength(2);
    expect(lotes[1]).toEqual([
      {
        updateSheetProperties: {
          properties: { sheetId: mensal.properties.sheetId, title: nova.aba },
          fields: "title",
        },
      },
    ]);
  });

  it("simplifica a aba antiga sem reconstruir alunos, frequências úteis ou o destino", async () => {
    const { documento, celulas, lotes } = simularGoogle();
    const sheetId = inserirLegada(documento, celulas);
    const linhas = celulas.get(sheetId);
    if (!linhas?.[0] || !linhas[1]) throw new Error("Células de teste ausentes.");
    linhas[0].push("Observação manual");
    linhas[1].push("=SUM(C2:D2)");
    const antes = structuredClone(linhas);
    const marcadorAluno = structuredClone(
      documento.developerMetadata?.find((item) => item.metadataKey === "frequenciapp.aluno"),
    );
    const resultado = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    expect(resultado).toEqual({
      aba: "1º A · Outubro",
      mes: entrada.mes,
      turmaOriginalId: TURMA,
      destino: `arquivo:${sheetId}:${GERACAO}`,
      criada: false,
      atualizada: true,
    });
    const dias = diasDaPlanilhaMensal(entrada.mes).map(rotuloData);
    expect(celulas.get(sheetId)?.[0]).toEqual(["Aluno", ...dias, "Observação manual"]);
    expect(celulas.get(sheetId)?.[1]).toEqual([
      "QA Nome preservado",
      ...dias.map((dia) => antes[1]?.[antes[0]?.indexOf(dia) ?? -1]),
      "=SUM(C2:D2)",
    ]);
    expect(
      documento.developerMetadata?.find((item) => item.metadataKey === "frequenciapp.aluno"),
    ).toEqual(marcadorAluno);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toHaveLength(11);
    expect(
      lotes[0]?.every((pedido) => pedido.deleteDimension || pedido.updateSheetProperties),
    ).toBe(true);
    await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).resolves.toEqual({
      ...resultado,
      atualizada: false,
    });
    expect(lotes).toHaveLength(1);
  });

  it("mantém intacta uma coluna manual com o mesmo título de fim de semana", async () => {
    const { documento, celulas } = simularGoogle();
    const sheetId = inserirLegada(documento, celulas);
    documento.developerMetadata = documento.developerMetadata?.filter(
      (item) => item.location.dimensionRange?.startColumnIndex !== 4,
    );
    await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    expect(celulas.get(sheetId)?.[0]).toContain("03/10/2026");
  });

  it("confirma atualização após resposta perdida apenas quando título e colunas já mudaram", async () => {
    const { documento, celulas, lotes } = simularGoogle("resposta_perdida");
    inserirLegada(documento, celulas);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).resolves.toMatchObject({
      aba: "1º A · Outubro",
      criada: false,
      atualizada: true,
    });
    expect(lotes).toHaveLength(1);
  });

  it.each(["recusar", "resposta_perdida_antes"] as const)(
    "não confunde a aba antiga com uma atualização concluída após %s",
    async (modo) => {
      const { documento, celulas, lotes } = simularGoogle(modo);
      const sheetId = inserirLegada(documento, celulas);
      const antes = structuredClone(celulas.get(sheetId));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow();
      expect(celulas.get(sheetId)).toEqual(antes);
      expect(
        documento.sheets.find((item) => item.properties.sheetId === sheetId)?.properties.title,
      ).toBe("1º A · 10-2026");
      expect(lotes).toHaveLength(1);
    },
  );

  it.each(["cabeçalho", "metadado", "mês", "dia útil", "mesclagem"])(
    "recusa exclusão se houver mudança inesperada de %s",
    async (alteracao) => {
      const { documento, celulas, lotes } = simularGoogle();
      const sheetId = inserirLegada(documento, celulas);
      const cabecalho = celulas.get(sheetId)?.[0];
      if (!cabecalho) throw new Error("Cabeçalho de teste ausente.");
      if (alteracao === "cabeçalho") cabecalho[1] = "Notas manuais";
      if (alteracao === "mês") cabecalho[4] = "03/11/2026";
      if (alteracao === "dia útil") cabecalho[2] = "";
      if (alteracao === "metadado")
        documento.developerMetadata = documento.developerMetadata?.filter(
          (item) => item.location.dimensionRange?.startColumnIndex !== 0,
        );
      if (alteracao === "mesclagem") {
        const aba = documento.sheets.find((item) => item.properties.sheetId === sheetId);
        if (aba)
          aba.merges = [
            { startColumnIndex: 1, endColumnIndex: 3, startRowIndex: 1, endRowIndex: 2 },
          ];
      }
      await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow(
        "Confira o cabeçalho",
      );
      expect(lotes).toHaveLength(0);
    },
  );

  it("acrescenta o ano somente para distinguir o mesmo mês da mesma turma em outro ano", async () => {
    const { documento } = simularGoogle();
    await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    const segundoAno = await prepararAbaMensalGoogle("arquivo", "acesso", {
      ...entrada,
      mes: "2027-10",
    });
    expect(segundoAno.aba).toBe("1º A · Outubro 2027");
    expect(documento.sheets.some((aba) => aba.properties.title === "1º A · Outubro")).toBe(true);
    expect(
      (await prepararAbaMensalGoogle("arquivo", "acesso", { ...entrada, mes: "2027-10" }))
        .atualizada,
    ).toBe(false);
  });

  it("recusa título sem ano ocupado por outra turma e mantém a aba mensal anterior", async () => {
    const { documento, celulas, lotes } = simularGoogle();
    inserirLegada(documento, celulas);
    marcarMensal(documento, 3, "2027-10");
    const ocupante = documento.sheets.find((aba) => aba.properties.sheetId === 3);
    if (ocupante) ocupante.properties.title = "1º A · Outubro";
    const turma = documento.developerMetadata?.find(
      (item) => item.location.sheetId === 3 && item.metadataKey === "frequenciapp.turma",
    );
    if (turma) turma.metadataValue = ALUNO;
    await expect(prepararAbaMensalGoogle("arquivo", "acesso", entrada)).rejects.toThrow(
      "impede a preparação",
    );
    expect(lotes).toHaveLength(0);
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

describe("visibilidade mensal", () => {
  it("revela o mês antes de ocultar outros destinos e preserva abas sem vínculo", async () => {
    const google = simularGoogle();
    const outubro = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    const setembro = await prepararAbaMensalGoogle("arquivo", "acesso", {
      ...entrada,
      mes: "2026-09",
    });
    google.documento.sheets.push({ properties: { sheetId: 42, title: "Notas manuais" } });
    const resultado = await mostrarMesGoogle("arquivo", "acesso", "2026-09", [
      { aba: "1º A", turmaOriginalId: TURMA },
    ]);
    expect(resultado).toMatchObject({ visiveis: [setembro.aba], ocultadas: ["1º A", outubro.aba] });
    expect(
      google.documento.sheets
        .filter((aba) => !aba.properties.hidden)
        .map((aba) => aba.properties.title),
    ).toEqual([setembro.aba, "Notas manuais"]);
    const lotesAntes = google.lotes.length;
    await mostrarMesGoogle("arquivo", "acesso", "2026-09", [
      { aba: "1º A", turmaOriginalId: TURMA },
    ]);
    expect(google.lotes).toHaveLength(lotesAntes);
    await mostrarMesGoogle("arquivo", "acesso", "2026-10", [
      { aba: "1º A", turmaOriginalId: TURMA },
    ]);
    expect(google.lotes.at(-1)).toEqual([
      {
        updateSheetProperties: {
          properties: { sheetId: Number(outubro.destino.split(":")[1]), hidden: false },
          fields: "hidden",
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId: Number(setembro.destino.split(":")[1]), hidden: true },
          fields: "hidden",
        },
      },
    ]);
    expect(await listarAbasMensaisGoogle("arquivo", "acesso")).toMatchObject({
      abas: [outubro, setembro].map((aba) => ({
        aba: aba.aba,
        mes: aba.mes,
        turmaOriginalId: aba.turmaOriginalId,
        destino: aba.destino,
      })),
    });
  });

  it("distingue anos e preserva o legado de uma turma sem o mês escolhido", async () => {
    const google = simularGoogle();
    const outubro = await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    const outroAno = await prepararAbaMensalGoogle("arquivo", "acesso", {
      ...entrada,
      mes: "2027-10",
    });
    google.documento.sheets.push({ properties: { sheetId: 51, title: "2º A" } });
    const copia = { properties: { sheetId: 52, title: "_frequenciapp_backup_1º A", hidden: true } };
    google.documento.sheets.push(copia);
    await mostrarMesGoogle("arquivo", "acesso", "2026-10", [
      { aba: "1º A", turmaOriginalId: TURMA },
      { aba: "2º A", turmaOriginalId: ALUNO },
    ]);
    expect(
      google.documento.sheets
        .filter((aba) => !aba.properties.hidden)
        .map((aba) => aba.properties.title),
    ).toEqual([outubro.aba, "2º A"]);
    expect(
      google.documento.sheets.find((aba) => aba.properties.title === outroAno.aba)?.properties
        .hidden,
    ).toBe(true);
    expect(copia.properties.hidden).toBe(true);
  });

  it("não oculta nenhuma aba quando o mês está ausente ou inválido", async () => {
    const google = simularGoogle();
    await expect(mostrarMesGoogle("arquivo", "acesso", "2026-10", [])).rejects.toMatchObject({
      status: 409,
    });
    await expect(mostrarMesGoogle("arquivo", "acesso", "2026-13", [])).rejects.toMatchObject({
      status: 400,
    });
    expect(google.lotes).toHaveLength(0);
  });

  it("propaga uma resposta perdida sem repetir o lote de visibilidade", async () => {
    const google = simularGoogle();
    await prepararAbaMensalGoogle("arquivo", "acesso", entrada);
    google.controle.modo = "resposta_perdida";
    const antes = google.lotes.length;
    await expect(
      mostrarMesGoogle("arquivo", "acesso", "2026-10", [{ aba: "1º A", turmaOriginalId: TURMA }]),
    ).rejects.toThrow();
    expect(google.lotes).toHaveLength(antes + 1);
  });
});
