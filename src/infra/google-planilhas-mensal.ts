// Abas mensais identificadas por turma e mês, com preparação atômica e idempotente.
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { diasDoMes, rotuloData } from "@/domain/frequencia";
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { mesValido, nomeAbaMensal, type AbaMensalPlanilha } from "@/domain/planilha-mensal";
import { ErroHttp } from "./erros";
import {
  lerDocumentoGoogle,
  mensalDaAbaGoogle,
  type DocumentoGoogle,
} from "./google-planilhas-api";
import { pedidosDeApresentacao } from "./google-planilhas-apresentacao";
import { enviarLoteAtomicoGoogle, ErroGoogle } from "./google-planilhas-escrita";

export const esquemaPreparacaoMensalGoogle = z.object({
  turmaOriginalId: z.string().uuid(),
  rotulo: z.string().trim().min(1).max(200),
  mes: z.string().refine(mesValido, "Informe um mês válido."),
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
type ResultadoPreparacao = AbaMensalPlanilha & { criada: boolean };

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
  const cabecalho = ["Aluno", "Turma atual", ...diasDoMes(entrada.mes).map(rotuloData)];
  const linhas = Math.max(1000, entrada.alunos.length + 1);
  const valores = [cabecalho, ...entrada.alunos.map((aluno) => [aluno.nome, aluno.turmaAtual])];
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
    ...entrada.alunos.flatMap((aluno, indice) => {
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

/** Cria a lista e o calendário juntos; uma nova tentativa preserva o conteúdo existente. */
export async function prepararAbaMensalGoogle(
  id: string,
  acesso: string,
  entrada: PreparacaoMensal,
): Promise<ResultadoPreparacao> {
  const dados = esquemaPreparacaoMensalGoogle.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira a turma, o mês e a lista de alunos.", 400);
  const { turmaOriginalId, mes } = dados.data;
  const doc = await lerDocumentoGoogle(id, acesso);
  const existente = abasDoDocumento(doc).find(
    (aba) => aba.turmaOriginalId === turmaOriginalId && aba.mes === mes,
  );
  if (existente) return { ...existente, criada: false };
  const nome = nomeAbaMensal(dados.data.rotulo, mes);
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
      if (conferido) return { ...conferido, criada: false };
    } catch {
      // Mantém o resultado incerto do envio, sem repetir a escrita.
    }
    throw erro;
  }
  return { aba: nome, mes, turmaOriginalId, destino, criada: true };
}
