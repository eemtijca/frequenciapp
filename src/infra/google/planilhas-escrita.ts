// Gravação da frequência pela Sheets API: reconfere a aba antes do lote,
// preserva fórmulas e células ocupadas e marca linhas e colunas criadas.
import { z } from "zod";
import { MARCADOR_SAIDAS_TURMA, planejarAbasSaidasTurmas } from "./planilhas-saidas-turmas";
import { colunasDeApresentacao } from "@/domain/planilha-apresentacao";
import { assinarAba, dataDoRotulo } from "@/domain/planilha";
import {
  compararSaidasDaPlanilha,
  planejarOrdenacaoLinhasPlanilha,
} from "@/domain/ordenacao-planilha";
import type { AbaMensalPlanilha } from "@/domain/planilha-mensal";
import { controleTravaPlanilhaFrequencia } from "../trava-planilha-frequencia";
import { controleTravaPlanilhaMovimentacoes } from "../trava-planilha-movimentacoes";
import { ErroHttp } from "@/infra/erros";
import type { ControleTravaParcial } from "../trava-planilha-parcial";
import {
  ErroLeituraGoogle,
  exigirAbaGoogle,
  lerDocumentoGoogle,
  lerGoogle,
  marcadoresDaAba,
  mesclagensDaAssinatura,
  metadadosDaAba,
  invalidarDocumentoGoogle,
  motivoDoGoogle,
  type DocumentoGoogle,
} from "@/infra/google/planilhas-api";

const numero = z.number().int().positive();
const celula = z.object({ linha: numero, coluna: numero, valor: z.string() });
const operacao = z.discriminatedUnion("tipo", [
  celula.extend({ tipo: z.literal("preencher"), dia: z.string().max(10).optional() }),
  celula.extend({ tipo: z.literal("substituir"), anterior: z.string().optional() }),
  celula.extend({
    tipo: z.literal("sinalizar"),
    anterior: z.string(),
    alunoId: z.string().uuid(),
    nomeOriginal: z.string().min(1),
  }),
  z.object({
    tipo: z.literal("limpar"),
    linha: numero,
    coluna: numero,
    anterior: z.string().optional(),
  }),
  z.object({
    tipo: z.literal("inserirColunas"),
    antesDe: numero.nullable(),
    cabecalhoLinha: numero,
    rotulos: z.array(z.string()).max(100),
  }),
  z.object({
    tipo: z.literal("criarLinhas"),
    itens: z.array(
      z.object({
        linha: numero,
        alunoId: z.string().uuid().optional(),
        celulas: z.array(celula.pick({ coluna: true, valor: true })),
      }),
    ),
  }),
  z.object({
    tipo: z.literal("vincularLinhas"),
    itens: z.array(
      z.object({ linha: numero, coluna: numero, nome: z.string(), alunoId: z.string().uuid() }),
    ),
  }),
  z.object({ tipo: z.literal("removerColunas"), colunas: z.array(numero) }),
  z.object({ tipo: z.literal("removerLinhas"), linhas: z.array(numero) }),
  z.object({ tipo: z.literal("ordenarAlunos"), coluna: numero }),
  z.object({
    tipo: z.literal("ordenarSaidas"),
    colunaAluno: numero,
    colunaTurma: numero,
    colunaData: numero,
    anoReferencia: z.number().int().min(1900).max(9999),
    turmas: z.array(z.string().min(1).max(200)).max(200).optional(),
  }),
]);

type PedidoGoogle = Record<string, unknown>;

/** Recusa antes da escrita ou resultado incerto depois do envio ao Google. */
export class ErroGoogle extends ErroHttp {
  /** Motivo técnico para o registro e o log; nunca vai à tela. */
  readonly detalhe: string | null;

  constructor(
    mensagem: string,
    public readonly recusado: boolean,
    detalhe: string | null = null,
  ) {
    super(mensagem, recusado ? 409 : 502);
    this.name = "ErroGoogle";
    this.detalhe = detalhe;
  }
}

function texto(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function celulaAtual(matriz: string[][], linha: number, coluna: number): string {
  return matriz[linha - 1]?.[coluna - 1] ?? "";
}

function temFormula(matriz: boolean[][], linha: number, coluna: number): boolean {
  return matriz[linha - 1]?.[coluna - 1] ?? false;
}

function atribuir(matriz: string[][], linha: number, coluna: number, valor: string): void {
  while (matriz.length < linha) matriz.push([]);
  const fileira = matriz[linha - 1];
  if (!fileira) return;
  while (fileira.length < coluna) fileira.push("");
  fileira[coluna - 1] = valor;
}

function metadadoLinha(sheetId: number, linha: number, chave: string, valor: string): PedidoGoogle {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: chave,
        metadataValue: valor,
        visibility: "DOCUMENT",
        location: {
          dimensionRange: { sheetId, dimension: "ROWS", startIndex: linha - 1, endIndex: linha },
        },
      },
    },
  };
}

function metadadoColuna(sheetId: number, coluna: number): PedidoGoogle {
  return {
    createDeveloperMetadata: {
      developerMetadata: {
        metadataKey: "frequenciapp.coluna",
        metadataValue: "1",
        visibility: "DOCUMENT",
        location: {
          dimensionRange: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: coluna - 1,
            endIndex: coluna,
          },
        },
      },
    },
  };
}

function escrever(
  sheetId: number,
  linha: number,
  coluna: number,
  valor: string | null,
): PedidoGoogle {
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: linha - 1,
        endRowIndex: linha,
        startColumnIndex: coluna - 1,
        endColumnIndex: coluna,
      },
      rows: [
        { values: [{ ...(valor === null ? {} : { userEnteredValue: { stringValue: valor } }) }] },
      ],
      fields: "userEnteredValue",
    },
  };
}

function removerMetadado(metadataId: number): PedidoGoogle {
  return {
    deleteDeveloperMetadata: { dataFilter: { developerMetadataLookup: { metadataId } } },
  };
}

export interface PlanoDeEscritaGoogle {
  requests: PedidoGoogle[];
  contagens: Record<string, number>;
  diasBloqueados: string[];
  destrutiva: boolean;
  atomico?: boolean;
}

const escritaUnica = z.object({
  updateCells: z.object({
    range: z.object({
      sheetId: z.number(),
      startRowIndex: z.number(),
      endRowIndex: z.number(),
      startColumnIndex: z.number(),
      endColumnIndex: z.number(),
    }),
    rows: z.array(z.object({ values: z.array(z.unknown()) })),
    fields: z.literal("userEnteredValue"),
  }),
});

/** Agrupa células contíguas da mesma coluna em uma requisição por trecho. */
export function compactarAtualizacoesGoogle(requests: PedidoGoogle[]): PedidoGoogle[] {
  const resultado: PedidoGoogle[] = [];
  let indice = 0;
  while (indice < requests.length) {
    const grupo: { sheetId: number; linha: number; coluna: number; valor: unknown }[] = [];
    const inicio = indice;
    while (indice < requests.length) {
      const pedido = escritaUnica.safeParse(requests[indice]);
      if (!pedido.success) break;
      const { range, rows } = pedido.data.updateCells;
      if (
        range.endRowIndex !== range.startRowIndex + 1 ||
        range.endColumnIndex !== range.startColumnIndex + 1 ||
        rows.length !== 1 ||
        rows[0]?.values.length !== 1
      )
        break;
      grupo.push({
        sheetId: range.sheetId,
        linha: range.startRowIndex,
        coluna: range.startColumnIndex,
        valor: rows[0].values[0],
      });
      indice += 1;
    }
    if (grupo.length === 0) {
      const pedido = requests[indice];
      if (pedido) resultado.push(pedido);
      indice += 1;
      continue;
    }
    const chaves = grupo.map((item) => `${item.sheetId}:${item.linha}:${item.coluna}`);
    if (new Set(chaves).size !== chaves.length) {
      resultado.push(...requests.slice(inicio, indice));
      continue;
    }
    const colunas = new Map<string, typeof grupo>();
    for (const item of grupo) {
      const chave = `${item.sheetId}:${item.coluna}`;
      const lista = colunas.get(chave) ?? [];
      lista.push(item);
      colunas.set(chave, lista);
    }
    for (const lista of colunas.values()) {
      lista.sort((a, b) => a.linha - b.linha);
      let trecho: typeof grupo = [];
      const gravar = () => {
        if (trecho.length === 0) return;
        const primeiro = trecho[0];
        const ultimo = trecho.at(-1);
        if (!primeiro || !ultimo) return;
        resultado.push({
          updateCells: {
            range: {
              sheetId: primeiro.sheetId,
              startRowIndex: primeiro.linha,
              endRowIndex: ultimo.linha + 1,
              startColumnIndex: primeiro.coluna,
              endColumnIndex: primeiro.coluna + 1,
            },
            rows: trecho.map((item) => ({ values: [item.valor] })),
            fields: "userEnteredValue",
          },
        });
        trecho = [];
      };
      for (const item of lista) {
        if (trecho.length > 0 && item.linha !== (trecho.at(-1)?.linha ?? -1) + 1) gravar();
        trecho.push(item);
      }
      gravar();
    }
  }
  return resultado;
}

/** Planeja o lote a partir da última leitura, sem modificar a planilha. */
export function planejarEscritaGoogle(
  doc: DocumentoGoogle,
  nome: string,
  valoresOriginais: string[][],
  formulasOriginais: boolean[][],
  cabecalhoLinha: number,
  assinatura: string,
  entrada: unknown,
  modoCompleto: boolean,
): PlanoDeEscritaGoogle {
  const lidas = z.array(operacao).max(10_000).safeParse(entrada);
  if (!lidas.success) throw new ErroHttp("Operações da planilha inválidas.", 400);
  if (
    lidas.data.some(
      (item, indice) =>
        (item.tipo === "ordenarAlunos" || item.tipo === "ordenarSaidas") &&
        indice !== lidas.data.length - 1,
    )
  ) {
    throw new ErroHttp("A ordenação deve concluir o envio da planilha.", 400);
  }
  const aba = exigirAbaGoogle(doc, nome);
  if (metadadosDaAba(doc, aba).some((meta) => meta.metadataKey === MARCADOR_SAIDAS_TURMA))
    throw new ErroHttp(
      "Esta aba é uma consulta por turma. Selecione a aba original de saídas.",
      409,
    );
  const sheetId = aba.properties.sheetId;
  const valores = valoresOriginais.map((linha) => [...linha]);
  const formulas = formulasOriginais.map((linha) => [...linha]);
  const largura = Math.max(1, ...valores.map((linha) => linha.length));
  const cabecalho = Array.from({ length: largura }, (_, coluna) =>
    celulaAtual(valores, cabecalhoLinha, coluna + 1),
  );
  if (assinarAba(nome, cabecalho, mesclagensDaAssinatura(aba)) !== assinatura) {
    throw new ErroHttp("A estrutura da planilha mudou. Confira de novo antes de enviar.", 409);
  }
  const exigeCompleto = lidas.data.some((item) =>
    ["substituir", "limpar", "removerLinhas", "removerColunas"].includes(item.tipo),
  );
  const destrutiva = exigeCompleto || lidas.data.some((item) => item.tipo === "sinalizar");
  if (exigeCompleto && !modoCompleto) throw new ErroHttp("O modo completo não está ativo.", 400);

  const requests: PedidoGoogle[] = [];
  const contagens: Record<string, number> = {
    preenchidas: 0,
    substituidas: 0,
    limpas: 0,
    removidasLinhas: 0,
    removidasColunas: 0,
    colunasCriadas: 0,
    linhasCriadas: 0,
    puladasOcupadas: 0,
    puladasFormula: 0,
    vinculadas: 0,
    puladasVinculo: 0,
    sinalizadas: 0,
    jaPresentes: 0,
  };
  const diasBloqueados = new Set<string>();
  const metadados = metadadosDaAba(doc, aba);
  let linhasCriadas = new Set(marcadoresDaAba(doc, aba, "frequenciapp.linha", "ROWS"));
  const colunasCriadas = new Set(marcadoresDaAba(doc, aba, "frequenciapp.coluna", "COLUMNS"));
  const vinculos = metadados.filter((item) => item.metadataKey === "frequenciapp.aluno");
  let linhasOrdenaveis = new Set([
    ...linhasCriadas,
    ...vinculos.flatMap((item) => {
      const indice = item.location.dimensionRange?.startRowIndex;
      return indice === undefined ? [] : [indice + 1];
    }),
  ]);
  const posicoesColunas: (number | null)[] = Array.from(
    { length: largura },
    (_, indice) => indice + 1,
  );
  const novosVinculos = new Set<string>();
  let capacidadeLinhas = aba.properties.gridProperties?.rowCount ?? 1000;
  let capacidadeColunas = aba.properties.gridProperties?.columnCount ?? 26;

  const contar = (chave: string) => {
    contagens[chave] = (contagens[chave] ?? 0) + 1;
  };
  const assegurarLinha = (linha: number) => {
    if (linha <= capacidadeLinhas) return;
    requests.push({
      appendDimension: { sheetId, dimension: "ROWS", length: linha - capacidadeLinhas },
    });
    capacidadeLinhas = linha;
  };
  const assegurarColuna = (coluna: number) => {
    if (coluna <= capacidadeColunas) return;
    requests.push({
      appendDimension: { sheetId, dimension: "COLUMNS", length: coluna - capacidadeColunas },
    });
    capacidadeColunas = coluna;
  };
  const vincular = (linha: number, alunoId: string) => {
    linhasOrdenaveis.add(linha);
    for (const item of vinculos) {
      if (
        item.location.dimensionRange?.startRowIndex === linha - 1 ||
        item.metadataValue === alunoId
      ) {
        requests.push(removerMetadado(item.metadataId));
      }
    }
    requests.push(metadadoLinha(sheetId, linha, "frequenciapp.aluno", alunoId));
    novosVinculos.add(`${linha}:${alunoId}`);
  };

  for (const item of lidas.data) {
    if (item.tipo === "vincularLinhas") {
      for (const vinculo of item.itens) {
        if (texto(celulaAtual(valores, vinculo.linha, vinculo.coluna)) !== texto(vinculo.nome)) {
          contar("puladasVinculo");
          continue;
        }
        vincular(vinculo.linha, vinculo.alunoId);
        contar("vinculadas");
      }
    } else if (item.tipo === "inserirColunas") {
      const antes = item.antesDe ?? Math.max(1, ...valores.map((linha) => linha.length)) + 1;
      if (item.rotulos.length === 0) continue;
      if (antes > capacidadeColunas) assegurarColuna(antes - 1);
      requests.push({
        insertDimension: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: antes - 1,
            endIndex: antes - 1 + item.rotulos.length,
          },
          inheritFromBefore: antes > 1,
        },
      });
      for (const estilo of colunasDeApresentacao(item.rotulos)) {
        const indice = antes - 1 + estilo.indice - 1;
        requests.push({
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: indice, endIndex: indice + 1 },
            properties: { pixelSize: estilo.largura },
            fields: "pixelSize",
          },
        });
        requests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: item.cabecalhoLinha - 1,
              startColumnIndex: indice,
              endColumnIndex: indice + 1,
            },
            cell: {
              userEnteredFormat: { horizontalAlignment: estilo.alinhamento, wrapStrategy: "WRAP" },
            },
            fields: "userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy",
          },
        });
      }
      capacidadeColunas += item.rotulos.length;
      for (const fileira of valores) fileira.splice(antes - 1, 0, ...item.rotulos.map(() => ""));
      for (const fileira of formulas)
        fileira.splice(antes - 1, 0, ...item.rotulos.map(() => false));
      posicoesColunas.splice(antes - 1, 0, ...item.rotulos.map(() => null));
      for (const marcada of [...colunasCriadas]) {
        if (marcada >= antes) {
          colunasCriadas.delete(marcada);
          colunasCriadas.add(marcada + item.rotulos.length);
        }
      }
      item.rotulos.forEach((rotulo, indice) => {
        const coluna = antes + indice;
        requests.push(metadadoColuna(sheetId, coluna));
        requests.push(escrever(sheetId, item.cabecalhoLinha, coluna, rotulo));
        atribuir(valores, item.cabecalhoLinha, coluna, rotulo);
        colunasCriadas.add(coluna);
        contar("colunasCriadas");
      });
    } else if (item.tipo === "criarLinhas") {
      for (const nova of item.itens) {
        assegurarLinha(nova.linha);
        const larguraLinha = Math.max(largura, ...nova.celulas.map((celula) => celula.coluna));
        assegurarColuna(larguraLinha);
        const ocupada = Array.from({ length: larguraLinha }, (_, indice) => indice + 1).some(
          (coluna) =>
            temFormula(formulas, nova.linha, coluna) ||
            texto(celulaAtual(valores, nova.linha, coluna)) !== "",
        );
        if (ocupada) {
          contar("puladasOcupadas");
          continue;
        }
        requests.push(metadadoLinha(sheetId, nova.linha, "frequenciapp.linha", "1"));
        if (nova.alunoId) vincular(nova.linha, nova.alunoId);
        linhasCriadas.add(nova.linha);
        linhasOrdenaveis.add(nova.linha);
        nova.celulas.forEach((celula) => {
          requests.push(escrever(sheetId, nova.linha, celula.coluna, celula.valor));
          atribuir(valores, nova.linha, celula.coluna, celula.valor);
        });
        contar("linhasCriadas");
      }
    } else if (item.tipo === "sinalizar") {
      const vinculado =
        vinculos.some(
          (vinculo) =>
            vinculo.metadataValue === item.alunoId &&
            vinculo.location.dimensionRange?.startRowIndex === item.linha - 1,
        ) || novosVinculos.has(`${item.linha}:${item.alunoId}`);
      const anterior = celulaAtual(valores, item.linha, item.coluna);
      const transicaoValida =
        item.nomeOriginal !== "DESISTENTE" &&
        ((item.valor === "DESISTENTE" && item.anterior === item.nomeOriginal) ||
          (item.anterior === "DESISTENTE" && item.valor === item.nomeOriginal));
      if (
        !vinculado ||
        temFormula(formulas, item.linha, item.coluna) ||
        anterior !== item.anterior ||
        !transicaoValida
      ) {
        throw new ErroHttp("A situação do aluno mudou na planilha. Confira a prévia de novo.", 409);
      }
      requests.push(escrever(sheetId, item.linha, item.coluna, item.valor));
      atribuir(valores, item.linha, item.coluna, item.valor);
      contar("sinalizadas");
    } else if (item.tipo === "preencher" || item.tipo === "substituir" || item.tipo === "limpar") {
      assegurarLinha(item.linha);
      assegurarColuna(item.coluna);
      if (temFormula(formulas, item.linha, item.coluna)) {
        contar("puladasFormula");
        if ("dia" in item && item.dia) diasBloqueados.add(item.dia);
        continue;
      }
      const anterior = celulaAtual(valores, item.linha, item.coluna);
      if (item.tipo === "preencher" && texto(anterior) !== "") {
        if (texto(anterior).toUpperCase() === texto(item.valor).toUpperCase()) {
          contar("jaPresentes");
          continue;
        }
        contar("puladasOcupadas");
        if (item.dia) diasBloqueados.add(item.dia);
        continue;
      }
      if (
        item.tipo !== "preencher" &&
        item.anterior !== undefined &&
        texto(anterior) !== texto(item.anterior)
      ) {
        contar("puladasOcupadas");
        continue;
      }
      if (item.tipo === "limpar") {
        requests.push(escrever(sheetId, item.linha, item.coluna, null));
        atribuir(valores, item.linha, item.coluna, "");
        contar("limpas");
      } else {
        requests.push(escrever(sheetId, item.linha, item.coluna, item.valor));
        atribuir(valores, item.linha, item.coluna, item.valor);
        contar(
          item.tipo === "substituir" && texto(anterior) !== "" ? "substituidas" : "preenchidas",
        );
      }
    } else if (item.tipo === "removerColunas") {
      for (const coluna of [...item.colunas].sort((a, b) => b - a)) {
        if (!colunasCriadas.has(coluna)) {
          throw new ErroHttp(`A coluna ${coluna} não foi criada pela integração.`, 409);
        }
        requests.push({
          deleteDimension: {
            range: { sheetId, dimension: "COLUMNS", startIndex: coluna - 1, endIndex: coluna },
          },
        });
        for (const fileira of valores) fileira.splice(coluna - 1, 1);
        for (const fileira of formulas) fileira.splice(coluna - 1, 1);
        posicoesColunas.splice(coluna - 1, 1);
        colunasCriadas.delete(coluna);
        capacidadeColunas -= 1;
        contar("removidasColunas");
      }
    } else if (item.tipo === "removerLinhas") {
      for (const linha of [...item.linhas].sort((a, b) => b - a)) {
        if (!linhasCriadas.has(linha)) {
          throw new ErroHttp(`A linha ${linha} não foi criada pela integração.`, 409);
        }
        requests.push({
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: linha - 1, endIndex: linha },
          },
        });
        valores.splice(linha - 1, 1);
        formulas.splice(linha - 1, 1);
        linhasCriadas = new Set(
          [...linhasCriadas]
            .filter((atual) => atual !== linha)
            .map((atual) => (atual > linha ? atual - 1 : atual)),
        );
        linhasOrdenaveis = new Set(
          [...linhasOrdenaveis]
            .filter((atual) => atual !== linha)
            .map((atual) => (atual > linha ? atual - 1 : atual)),
        );
        capacidadeLinhas -= 1;
        contar("removidasLinhas");
      }
    } else if (item.tipo === "ordenarAlunos" || item.tipo === "ordenarSaidas") {
      const coluna =
        posicoesColunas.indexOf(item.tipo === "ordenarAlunos" ? item.coluna : item.colunaAluno) + 1;
      if (coluna === 0) continue;
      const alunos = [...linhasOrdenaveis]
        .filter((linha) => linha > cabecalhoLinha && !temFormula(formulas, linha, coluna))
        .map((linha) => ({ linha, nome: texto(celulaAtual(valores, linha, coluna)) }))
        .filter((linha) => linha.nome !== "");
      let movimentos;
      if (item.tipo === "ordenarSaidas") {
        const colunaTurma = posicoesColunas.indexOf(item.colunaTurma) + 1;
        const colunaData = posicoesColunas.indexOf(item.colunaData) + 1;
        if (colunaTurma === 0 || colunaData === 0) continue;
        const saidas = alunos
          .filter((aluno) => linhasCriadas.has(aluno.linha))
          .flatMap((aluno) => {
            const turma = texto(celulaAtual(valores, aluno.linha, colunaTurma));
            const dia = dataDoRotulo(
              texto(celulaAtual(valores, aluno.linha, colunaData)),
              item.anoReferencia,
            );
            if (
              !turma ||
              !dia ||
              temFormula(formulas, aluno.linha, colunaTurma) ||
              temFormula(formulas, aluno.linha, colunaData)
            )
              return [];
            return [{ ...aluno, turma, dia }];
          });
        movimentos = planejarOrdenacaoLinhasPlanilha(saidas, compararSaidasDaPlanilha);
      } else {
        movimentos = planejarOrdenacaoLinhasPlanilha(alunos);
      }
      if (
        movimentos.length > 0 &&
        aba.merges?.some((faixa) => {
          const inicio = faixa.startRowIndex ?? 0;
          const fim = faixa.endRowIndex ?? capacidadeLinhas;
          return fim - inicio > 1 && fim > cabecalhoLinha;
        })
      ) {
        throw new ErroHttp(
          item.tipo === "ordenarSaidas"
            ? "Confira as células mescladas na tabela antes de ordenar as saídas."
            : "Confira as células mescladas na tabela antes de ordenar os alunos.",
          409,
        );
      }
      for (const movimento of movimentos) {
        requests.push({
          moveDimension: {
            source: {
              sheetId,
              dimension: "ROWS",
              startIndex: movimento.origem - 1,
              endIndex: movimento.origem,
            },
            destinationIndex:
              movimento.destino < movimento.origem ? movimento.destino - 1 : movimento.destino,
          },
        });
      }
      if (item.tipo === "ordenarSaidas" && item.turmas) {
        assegurarLinha(cabecalhoLinha + 1);
        requests.push(
          ...planejarAbasSaidasTurmas(
            doc,
            aba,
            valores,
            cabecalhoLinha,
            posicoesColunas.indexOf(item.colunaTurma) + 1,
            coluna,
            item.turmas,
            capacidadeLinhas,
          ),
        );
      }
    }
  }
  return {
    requests,
    contagens,
    diasBloqueados: [...diasBloqueados].sort(),
    destrutiva,
    ...(lidas.data.some((item) => item.tipo === "ordenarSaidas" && item.turmas)
      ? { atomico: true }
      : {}),
  };
}

/** Envia lotes sem repetição automática; falha depois do primeiro lote é parcial. */
export async function enviarLotesGoogle(
  id: string,
  acesso: string,
  requests: PedidoGoogle[],
  controle?: ControleTravaParcial,
): Promise<void> {
  return enviarPedidosGoogle(id, acesso, requests, 500, controle);
}

/** Uma preparação estrutural precisa criar a aba inteira ou não alterar nada. */
export async function enviarLoteAtomicoGoogle(
  id: string,
  acesso: string,
  requests: PedidoGoogle[],
): Promise<void> {
  return enviarPedidosGoogle(id, acesso, requests, Number.MAX_SAFE_INTEGER);
}

async function enviarPedidosGoogle(
  id: string,
  acesso: string,
  requests: PedidoGoogle[],
  tamanhoDoLote: number,
  controle?: ControleTravaParcial,
): Promise<void> {
  controle ??= controleTravaPlanilhaFrequencia() ?? controleTravaPlanilhaMovimentacoes();
  const compactadas = compactarAtualizacoesGoogle(requests);
  const lotes: PedidoGoogle[][] = [];
  for (let inicio = 0; inicio < compactadas.length;) {
    let fim = Math.min(inicio + tamanhoDoLote, compactadas.length);
    // Uma ordenação troca linhas com lacunas em vários movimentos. O Google
    // precisa aplicar a sequência inteira para manter as linhas manuais no lugar.
    while (compactadas[fim - 1]?.moveDimension && compactadas[fim]?.moveDimension) fim += 1;
    lotes.push(compactadas.slice(inicio, fim));
    inicio = fim;
  }
  for (const [indice, parte] of lotes.entries()) {
    controle?.conferir();
    const posicao = `lote ${indice + 1} de ${lotes.length}`;
    let resposta: Response;
    try {
      resposta = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}:batchUpdate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "application/json" },
          body: JSON.stringify({ requests: parte }),
          cache: "no-store",
          signal: controle
            ? AbortSignal.any([controle.signal, AbortSignal.timeout(45_000)])
            : AbortSignal.timeout(45_000),
        },
      );
    } catch (erro) {
      const detalhe = `${posicao}: sem resposta do Google (${erro instanceof Error ? erro.name : "erro"})`;
      console.error(`Sheets API batchUpdate: ${detalhe}`);
      throw new ErroGoogle("Não foi possível confirmar o resultado na planilha.", false, detalhe);
    }
    if (!resposta.ok) {
      const detalhe = `${posicao}: ${await motivoDoGoogle(resposta)}`;
      console.error(`Sheets API batchUpdate: ${detalhe}`);
      const limite = resposta.status === 429;
      throw new ErroGoogle(
        limite
          ? indice === 0
            ? "O Google limitou o envio da planilha. Nada foi alterado. Tente de novo em instantes."
            : "O Google limitou o envio da planilha. Confira a aba antes de reenviar; o reenvio não sobrescreve o que já foi gravado."
          : resposta.status === 403
            ? "A conta Google não pode alterar a planilha escolhida."
            : "O Google recusou a alteração da planilha.",
        indice === 0,
        detalhe,
      );
    }
    invalidarDocumentoGoogle(id);
    controle?.conferir();
  }
}

export async function aplicarGoogle(
  id: string,
  acesso: string,
  nome: string,
  cabecalhoLinha: number,
  assinatura: string,
  operacoes: unknown,
  modoCompleto: boolean,
  mensal?: Omit<AbaMensalPlanilha, "aba">,
  abaId?: number,
) {
  let doc: DocumentoGoogle;
  let leitura: Awaited<ReturnType<typeof lerGoogle>>;
  try {
    doc = await lerDocumentoGoogle(id, acesso);
    leitura = await lerGoogle(id, acesso, nome, undefined, undefined, doc);
    if (abaId !== undefined && leitura.abaId !== abaId) {
      throw new ErroHttp("A aba foi substituída. Confira a estrutura antes de enviar.", 409);
    }
    if (
      mensal &&
      (leitura.mensal?.mes !== mensal.mes ||
        leitura.mensal.turmaOriginalId !== mensal.turmaOriginalId ||
        leitura.mensal.destino !== mensal.destino)
    )
      throw new ErroHttp("O destino mensal mudou. Confira a estrutura antes de enviar.", 409);
  } catch (erro) {
    if (erro instanceof ErroLeituraGoogle) {
      throw new ErroGoogle(erro.message, true, erro.detalhe);
    }
    if (erro instanceof ErroHttp) throw new ErroGoogle(erro.message, true);
    throw erro;
  }
  let plano: PlanoDeEscritaGoogle;
  try {
    plano = planejarEscritaGoogle(
      doc,
      nome,
      leitura.valores,
      leitura.formula,
      cabecalhoLinha,
      assinatura,
      operacoes,
      modoCompleto,
    );
  } catch (erro) {
    if (erro instanceof ErroHttp) throw new ErroGoogle(erro.message, true);
    throw erro;
  }
  try {
    if (plano.atomico) await enviarLoteAtomicoGoogle(id, acesso, plano.requests);
    else await enviarLotesGoogle(id, acesso, plano.requests);
  } catch (erro) {
    if (erro instanceof ErroGoogle) throw erro;
    if (erro instanceof ErroHttp) throw new ErroGoogle(erro.message, false);
    throw erro;
  }
  return Object.assign({}, plano.contagens, { diasBloqueados: plano.diasBloqueados });
}
