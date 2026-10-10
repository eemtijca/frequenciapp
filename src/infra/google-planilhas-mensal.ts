// Abas mensais identificadas por turma e mês, com preparação atômica e idempotente.
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { diaDaSemanaIso, diasDoMes, ehDiaValido, rotuloData } from "@/domain/frequencia";
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { ordenarAlunosDaPlanilha } from "@/domain/ordenacao-planilha";
import {
  diasDaPlanilhaMensal,
  mesValido,
  nomeAbaMensal,
  type AbaMensalPlanilha,
} from "@/domain/planilha-mensal";
import { ErroHttp } from "./erros";
import {
  lerDocumentoGoogle,
  lerBlocosGoogle,
  metadadosDaAba,
  mensalDaAbaGoogle,
  type AbaGoogle,
  type DocumentoGoogle,
} from "./google-planilhas-api";
import { pedidosDeApresentacao } from "./google-planilhas-apresentacao";
import { enviarLoteAtomicoGoogle, ErroGoogle } from "./google-planilhas-escrita";

export const esquemaPreparacaoMensalGoogle = z.object({
  turmaOriginalId: z.string().uuid(),
  rotulo: z.string().trim().min(1).max(200),
  mes: z.string().refine(mesValido, "Informe um mês válido."),
  // A aplicação calcula esta lista a partir das chamadas salvas, nunca do formulário.
  sabadosLetivos: z
    .array(
      z
        .string()
        .refine(ehDiaValido)
        .refine((dia) => diaDaSemanaIso(dia) === 6),
    )
    .max(5)
    .default([]),
  alunos: z
    .array(
      z.object({
        alunoId: z.string().uuid(),
        nome: z.string().trim().min(1).max(200),
        turmaAtual: z.string().trim().max(200),
      }),
    )
    .max(1000)
    .refine(
      (alunos) => new Set(alunos.map((aluno) => aluno.alunoId)).size === alunos.length,
      "A lista contém alunos repetidos.",
    ),
});

type PreparacaoMensal = z.infer<typeof esquemaPreparacaoMensalGoogle>;
type ResultadoPreparacao = AbaMensalPlanilha & { criada: boolean; atualizada: boolean };

function abasDoDocumento(doc: DocumentoGoogle): AbaMensalPlanilha[] {
  const abas = doc.sheets.flatMap((aba) => {
    const mensal = mensalDaAbaGoogle(doc, aba);
    return mensal ? [mensal] : [];
  });
  const destinos = new Set<string>();
  for (const aba of abas) {
    const identidade = `${aba.turmaOriginalId}:${aba.mes}`;
    if (destinos.has(identidade))
      throw new ErroHttp("Há mais de uma aba para a mesma turma e mês. Confira a planilha.", 409);
    destinos.add(identidade);
  }
  return abas;
}

/** Lê somente estrutura e metadados, sem percorrer as células das abas. */
export async function listarAbasMensaisGoogle(id: string, acesso: string) {
  return { abas: abasDoDocumento(await lerDocumentoGoogle(id, acesso)) };
}

function marcador(
  chave: string,
  valor: string,
  local: Record<string, unknown>,
): Record<string, unknown> {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: chave,
        metadataValue: valor,
        visibility: "DOCUMENT",
        location: local,
      },
    },
  };
}

function pedidosDePreparacao(
  sheetId: number,
  nome: string,
  geracao: string,
  entrada: PreparacaoMensal,
) {
  const cabecalho = [
    "Aluno",
    ...diasDaPlanilhaMensal(entrada.mes, entrada.sabadosLetivos).map(rotuloData),
  ];
  const linhas = Math.max(1000, entrada.alunos.length + 1);
  const alunos = ordenarAlunosDaPlanilha(entrada.alunos);
  const valores = [cabecalho, ...alunos.map((aluno) => [aluno.nome])];
  return [
    {
      addSheet: {
        properties: {
          sheetId,
          title: nome,
          gridProperties: {
            rowCount: linhas,
            columnCount: cabecalho.length,
            frozenRowCount: 1,
            frozenColumnCount: 1,
          },
        },
      },
    },
    marcador("frequenciapp.aba", "1", { sheetId }),
    marcador("frequenciapp.turma", entrada.turmaOriginalId, { sheetId }),
    marcador("frequenciapp.mes", entrada.mes, { sheetId }),
    marcador("frequenciapp.geracao", geracao, { sheetId }),
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: valores.length,
          startColumnIndex: 0,
          endColumnIndex: cabecalho.length,
        },
        rows: valores.map((linha) => ({
          values: linha.map((valor) => ({ userEnteredValue: { stringValue: valor } })),
        })),
        fields: "userEnteredValue",
      },
    },
    ...alunos.flatMap((aluno, indice) => {
      const local = {
        dimensionRange: {
          sheetId,
          dimension: "ROWS",
          startIndex: indice + 1,
          endIndex: indice + 2,
        },
      };
      return [
        marcador("frequenciapp.linha", "1", local),
        marcador("frequenciapp.aluno", aluno.alunoId, local),
      ];
    }),
    ...cabecalho.map((_, indice) =>
      marcador("frequenciapp.coluna", "1", {
        dimensionRange: { sheetId, dimension: "COLUMNS", startIndex: indice, endIndex: indice + 1 },
      }),
    ),
    ...pedidosDeApresentacao(sheetId, linhas, {
      aba: nome,
      cabecalhoLinha: 1,
      assinatura: "",
      colunas: colunasDeNovaAba(cabecalho),
    }),
  ];
}

function nomeDisponivel(doc: DocumentoGoogle, entrada: PreparacaoMensal, sheetId?: number): string {
  const nome = nomeAbaMensal(entrada.rotulo, entrada.mes);
  const ocupante = doc.sheets.find(
    (aba) => aba.properties.title === nome && aba.properties.sheetId !== sheetId,
  );
  if (!ocupante) return nome;
  const mensal = mensalDaAbaGoogle(doc, ocupante);
  if (
    mensal?.turmaOriginalId === entrada.turmaOriginalId &&
    mensal.mes.slice(5) === entrada.mes.slice(5) &&
    mensal.mes.slice(0, 4) !== entrada.mes.slice(0, 4)
  ) {
    const comAno = nomeAbaMensal(entrada.rotulo, entrada.mes, true);
    if (
      !doc.sheets.some(
        (aba) => aba.properties.title === comAno && aba.properties.sheetId !== sheetId,
      )
    )
      return comAno;
  }
  throw new ErroHttp(
    "Já existe uma aba que impede a preparação deste mês. Confira a planilha.",
    409,
  );
}

function estruturaMensalInesperada(): never {
  throw new ErroHttp(
    "Confira o cabeçalho e as colunas da aba mensal antes de preparar novamente.",
    409,
  );
}

/** Reconhece somente as colunas criadas pela integração, sem ler os dados dos alunos. */
async function colunasParaRemover(
  id: string,
  acesso: string,
  doc: DocumentoGoogle,
  aba: AbaGoogle,
  mes: string,
  sabadosLetivos: string[],
): Promise<number[]> {
  const marcadores = metadadosDaAba(doc, aba).filter(
    (item) => item.metadataKey === "frequenciapp.coluna",
  );
  const indices = marcadores.map((marcador) => {
    const local = marcador.location.dimensionRange;
    if (
      marcador.metadataValue !== "1" ||
      local?.startColumnIndex === undefined ||
      local.endColumnIndex !== local.startColumnIndex + 1 ||
      local.startColumnIndex < 0 ||
      local.startColumnIndex >= 400
    )
      return estruturaMensalInesperada();
    return local.startColumnIndex;
  });
  if (!indices.includes(0) || new Set(indices).size !== indices.length)
    return estruturaMensalInesperada();
  const [bloco] = await lerBlocosGoogle(id, acesso, aba.properties.title, 1, [
    { coluna: 1, colunas: Math.max(...indices) + 1 },
  ]);
  const cabecalho = bloco?.valores[0] ?? [];
  const formulas = bloco?.formula[0] ?? [];
  const calendario = new Map(diasDoMes(mes).map((dia) => [rotuloData(dia), dia]));
  const diasPermitidos = new Set(diasDaPlanilhaMensal(mes, sabadosLetivos));
  const encontrados = new Set<string>();
  const remover: number[] = [];
  for (const indice of indices) {
    const rotulo = cabecalho[indice] ?? "";
    if (formulas[indice] || encontrados.has(rotulo)) return estruturaMensalInesperada();
    encontrados.add(rotulo);
    if (indice === 0) {
      if (rotulo !== "Aluno") return estruturaMensalInesperada();
      continue;
    }
    if (rotulo === "Turma atual") {
      remover.push(indice);
      continue;
    }
    const dia = calendario.get(rotulo);
    if (!dia) return estruturaMensalInesperada();
    if (!diasPermitidos.has(dia)) remover.push(indice);
  }
  if (diasDaPlanilhaMensal(mes).some((dia) => !encontrados.has(rotuloData(dia))))
    return estruturaMensalInesperada();
  if (
    (aba.merges ?? []).some((mesclagem) =>
      remover.some(
        (indice) =>
          indice >= (mesclagem.startColumnIndex ?? 0) &&
          indice < (mesclagem.endColumnIndex ?? Number.POSITIVE_INFINITY),
      ),
    )
  )
    return estruturaMensalInesperada();
  return remover.sort((a, b) => b - a);
}

async function atualizarAbaExistente(
  id: string,
  acesso: string,
  doc: DocumentoGoogle,
  existente: AbaMensalPlanilha,
  entrada: PreparacaoMensal,
): Promise<ResultadoPreparacao> {
  const aba = doc.sheets.find((item) => item.properties.title === existente.aba);
  if (!aba) return estruturaMensalInesperada();
  const sheetId = aba.properties.sheetId;
  const nome = nomeDisponivel(doc, entrada, sheetId);
  const remover = await colunasParaRemover(
    id,
    acesso,
    doc,
    aba,
    entrada.mes,
    entrada.sabadosLetivos,
  );
  const pedidos: Record<string, unknown>[] = remover.map((indice) => ({
    deleteDimension: {
      range: { sheetId, dimension: "COLUMNS", startIndex: indice, endIndex: indice + 1 },
    },
  }));
  if (nome !== existente.aba)
    pedidos.push({
      updateSheetProperties: { properties: { sheetId, title: nome }, fields: "title" },
    });
  if (!pedidos.length) return { ...existente, criada: false, atualizada: false };
  try {
    await enviarLoteAtomicoGoogle(id, acesso, pedidos);
  } catch (erro) {
    if (!(erro instanceof ErroGoogle)) throw erro;
    // A existência da aba antiga não confirma uma atualização cuja resposta foi perdida.
    try {
      const conferido = await lerDocumentoGoogle(id, acesso);
      const identidade = abasDoDocumento(conferido).find(
        (item) =>
          item.destino === existente.destino &&
          item.mes === existente.mes &&
          item.turmaOriginalId === existente.turmaOriginalId &&
          item.aba === nome,
      );
      const abaConferida = conferido.sheets.find((item) => item.properties.sheetId === sheetId);
      if (
        identidade &&
        abaConferida &&
        !(
          await colunasParaRemover(
            id,
            acesso,
            conferido,
            abaConferida,
            entrada.mes,
            entrada.sabadosLetivos,
          )
        ).length
      )
        return { ...identidade, criada: false, atualizada: true };
    } catch {
      // Preserva o erro original e não repete uma escrita possivelmente concluída.
    }
    throw erro;
  }
  return { ...existente, aba: nome, criada: false, atualizada: true };
}

/** Cria o mês ou simplifica suas colunas sem reconstruir a lista e os registros existentes. */
export async function prepararAbaMensalGoogle(
  id: string,
  acesso: string,
  entrada: z.input<typeof esquemaPreparacaoMensalGoogle>,
): Promise<ResultadoPreparacao> {
  const dados = esquemaPreparacaoMensalGoogle.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira a turma, o mês e a lista de alunos.", 400);
  const { turmaOriginalId, mes } = dados.data;
  const doc = await lerDocumentoGoogle(id, acesso);
  const existente = abasDoDocumento(doc).find(
    (aba) => aba.turmaOriginalId === turmaOriginalId && aba.mes === mes,
  );
  if (existente) return atualizarAbaExistente(id, acesso, doc, existente, dados.data);
  const nome = nomeDisponivel(doc, dados.data);
  // O identificador independe do título: criações concorrentes disputam a mesma aba.
  const sheetId =
    createHash("sha256")
      .update(`frequenciapp.mensal:${turmaOriginalId}:${mes}`)
      .digest()
      .readUInt32BE(0) & 0x7fffffff || 1;
  if (doc.sheets.some((aba) => aba.properties.title === nome || aba.properties.sheetId === sheetId))
    throw new ErroHttp(
      "Já existe uma aba que impede a preparação deste mês. Confira a planilha.",
      409,
    );
  // Recriar a aba pode reutilizar o identificador; a geração distingue os novos registros.
  const geracao = randomUUID();
  const destino = `${doc.spreadsheetId}:${sheetId}:${geracao}`;
  try {
    await enviarLoteAtomicoGoogle(
      id,
      acesso,
      pedidosDePreparacao(sheetId, nome, geracao, dados.data),
    );
  } catch (erro) {
    if (!(erro instanceof ErroGoogle)) throw erro;
    // Após resposta perdida ou criação concorrente, somente a leitura pode confirmar o lote.
    try {
      const conferido = abasDoDocumento(await lerDocumentoGoogle(id, acesso)).find(
        (aba) =>
          aba.turmaOriginalId === turmaOriginalId &&
          aba.mes === mes &&
          aba.destino.startsWith(`${doc.spreadsheetId}:${sheetId}:`),
      );
      if (conferido) return { ...conferido, criada: false, atualizada: false };
    } catch {
      // Mantém o resultado incerto do envio, sem repetir a escrita.
    }
    throw erro;
  }
  return { aba: nome, mes, turmaOriginalId, destino, criada: true, atualizada: false };
}

/** Alterna a navegação entre meses sem apagar nem reescrever células. */
export async function mostrarMesGoogle(
  id: string,
  acesso: string,
  mes: string,
  legadas: { aba: string; turmaOriginalId: string }[],
) {
  if (!mesValido(mes)) throw new ErroHttp("Informe um mês válido.", 400);
  const doc = await lerDocumentoGoogle(id, acesso);
  const mensais = abasDoDocumento(doc);
  const selecionadas = mensais.filter((aba) => aba.mes === mes);
  if (!selecionadas.length)
    throw new ErroHttp("Prepare as abas deste mês antes de mostrá-lo na planilha.", 409);
  const turmas = new Set(selecionadas.map((aba) => aba.turmaOriginalId));
  const ocultar = new Set([
    ...mensais.filter((aba) => aba.mes !== mes).map((aba) => aba.aba),
    ...legadas.filter((aba) => turmas.has(aba.turmaOriginalId)).map((aba) => aba.aba),
  ]);
  const mostrar = new Set(selecionadas.map((aba) => aba.aba));
  const pedidos: Record<string, unknown>[] = [];
  const visiveis: string[] = [];
  const ocultadas: string[] = [];
  // Primeiro revela o mês solicitado: a planilha nunca fica sem aba visível.
  for (const [nomes, hidden] of [
    [mostrar, false],
    [ocultar, true],
  ] as const) {
    for (const aba of doc.sheets) {
      const propriedades = aba.properties;
      if (
        !nomes.has(propriedades.title) ||
        (hidden && mostrar.has(propriedades.title)) ||
        propriedades.title.startsWith("_frequenciapp_backup_") ||
        (propriedades.sheetType && propriedades.sheetType !== "GRID")
      )
        continue;
      if (!hidden) visiveis.push(propriedades.title);
      if (Boolean(propriedades.hidden) === hidden) continue;
      if (hidden) ocultadas.push(propriedades.title);
      pedidos.push({
        updateSheetProperties: {
          properties: { sheetId: propriedades.sheetId, hidden },
          fields: "hidden",
        },
      });
    }
  }
  if (pedidos.length) await enviarLoteAtomicoGoogle(id, acesso, pedidos);
  return { mes, visiveis, ocultadas };
}
