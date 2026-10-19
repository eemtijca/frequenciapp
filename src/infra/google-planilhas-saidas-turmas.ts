// Prepara consultas de saídas por turma, preservando a aba original e abas manuais.
import { hashTexto, letraColuna } from "@/domain/planilha";
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { ErroHttp } from "./erros";
import { metadadosDaAba, type AbaGoogle, type DocumentoGoogle } from "./google-planilhas-api";
import { pedidosDeApresentacao } from "./google-planilhas-apresentacao";

export const MARCADOR_SAIDAS_TURMA = "frequenciapp.saidas.turma";
export const MARCADOR_SAIDAS_ESQUEMA = "frequenciapp.saidas.esquema";

function marcador(sheetId: number, chave: string, valor: string) {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: chave,
        metadataValue: valor,
        visibility: "DOCUMENT",
        location: { sheetId },
      },
    },
  };
}

function nomeDisponivel(base: string, identidade: string, nomes: Set<string>): string {
  let nome = Array.from(base).slice(0, 100).join("");
  let sufixo = 0;
  while (nomes.has(nome.toLocaleLowerCase("pt-BR"))) {
    sufixo += 1;
    nome = `${Array.from(base).slice(0, 80).join("")} · ${hashTexto(identidade).slice(0, 8)}-${sufixo}`;
  }
  nomes.add(nome.toLocaleLowerCase("pt-BR"));
  return nome;
}

/** FILTER mantém o vínculo com a origem; nomes e rótulos são literais escapados. */
export function formulaSaidasTurma(
  origem: string,
  cabecalho: number,
  largura: number,
  colunaTurma: number,
  colunaAluno: number,
  turma: string,
): string {
  const aba = `'${origem.replaceAll("'", "''")}'`;
  const ultima = letraColuna(largura);
  const titulos = `${aba}!A${cabecalho}:${ultima}${cabecalho}`;
  const dados = `${aba}!A${cabecalho + 1}:${ultima}`;
  const filtro = `${aba}!${letraColuna(colunaTurma)}${cabecalho + 1}:${letraColuna(colunaTurma)}`;
  const literal = `"${turma.replaceAll('"', '""')}"`;
  return `=VSTACK(${titulos},IFNA(SORT(FILTER(${dados},TRIM(${filtro})=${literal}),${colunaAluno},TRUE),IF(SEQUENCE(1,${largura}),"","")))`;
}

/** Não altera abas existentes: a identidade vem do marcador, nunca só do título. */
export function planejarAbasSaidasTurmas(
  doc: DocumentoGoogle,
  origem: AbaGoogle,
  valores: string[][],
  cabecalho: number,
  colunaTurma: number,
  colunaAluno: number,
  turmas: string[],
  linhasOrigem: number,
): Record<string, unknown>[] {
  const rotulos = new Map<string, string>();
  for (const rotulo of [
    ...turmas,
    ...valores.slice(cabecalho).map((linha) => linha[colunaTurma - 1] ?? ""),
  ]) {
    const limpo = rotulo.trim();
    if (limpo) rotulos.set(limpo.toLocaleLowerCase("pt-BR"), limpo);
  }
  if (rotulos.size > 200)
    throw new ErroHttp("Confira a quantidade de turmas antes de preparar as abas.", 409);
  const titulos = valores[cabecalho - 1] ?? [];
  const largura = Math.max(colunaAluno, colunaTurma, titulos.length);
  const esquema = hashTexto(
    JSON.stringify([origem.properties.sheetId, cabecalho, largura, colunaTurma, colunaAluno]),
  );
  const nomes = new Set(doc.sheets.map((aba) => aba.properties.title.toLocaleLowerCase("pt-BR")));
  const ids = new Set(doc.sheets.map((aba) => aba.properties.sheetId));
  const pedidos: Record<string, unknown>[] = [];
  let proximoId = 0;
  for (const rotulo of [...rotulos.values()].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  )) {
    const identidade = JSON.stringify([
      origem.properties.sheetId,
      rotulo.toLocaleLowerCase("pt-BR"),
    ]);
    const existentes = doc.sheets.filter((aba) =>
      metadadosDaAba(doc, aba).some(
        (meta) => meta.metadataKey === MARCADOR_SAIDAS_TURMA && meta.metadataValue === identidade,
      ),
    );
    if (existentes.length > 1)
      throw new ErroHttp("Há consultas repetidas para uma turma. Confira as abas de saídas.", 409);
    const existente = existentes[0];
    const linhas = Math.max(1000, linhasOrigem - cabecalho + 1);
    const base = rotulo.replace(/[\\/?*:[\]]/g, " ").trim() || "Turma";
    if (existente) {
      if (
        !metadadosDaAba(doc, existente).some(
          (meta) => meta.metadataKey === MARCADOR_SAIDAS_ESQUEMA && meta.metadataValue === esquema,
        )
      ) {
        throw new ErroHttp(
          "A estrutura da consulta por turma mudou. Confira as abas antes de enviar.",
          409,
        );
      }
      const atuais = existente.properties.gridProperties?.rowCount ?? 0;
      if (existente.properties.title.startsWith(`${origem.properties.title} · `)) {
        nomes.delete(existente.properties.title.toLocaleLowerCase("pt-BR"));
        pedidos.push({
          updateSheetProperties: {
            properties: {
              sheetId: existente.properties.sheetId,
              title: nomeDisponivel(base, identidade, nomes),
            },
            fields: "title",
          },
        });
      }
      if (atuais < linhas)
        pedidos.push({
          appendDimension: {
            sheetId: existente.properties.sheetId,
            dimension: "ROWS",
            length: linhas - atuais,
          },
        });
      continue;
    }
    while (ids.has(proximoId)) proximoId += 1;
    const sheetId = proximoId;
    ids.add(sheetId);
    const nome = nomeDisponivel(base, identidade, nomes);
    pedidos.push(
      {
        addSheet: {
          properties: {
            sheetId,
            title: nome,
            gridProperties: { rowCount: linhas, columnCount: largura, frozenRowCount: 1 },
          },
        },
      },
      marcador(sheetId, MARCADOR_SAIDAS_TURMA, identidade),
      marcador(sheetId, MARCADOR_SAIDAS_ESQUEMA, esquema),
      {
        updateCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: {
                    formulaValue: formulaSaidasTurma(
                      origem.properties.title,
                      cabecalho,
                      largura,
                      colunaTurma,
                      colunaAluno,
                      rotulo,
                    ),
                  },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      },
      ...pedidosDeApresentacao(
        sheetId,
        linhas,
        {
          aba: nome,
          cabecalhoLinha: 1,
          assinatura: "",
          colunas: colunasDeNovaAba(Array.from({ length: largura }, (_, i) => titulos[i] ?? "")),
        },
        1,
      ),
    );
  }
  return pedidos;
}
