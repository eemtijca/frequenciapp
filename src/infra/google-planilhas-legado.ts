// Migra marcas de uma aba antiga vinculada, conferindo o conteúdo antes de retirá-la.
import { createHash } from "node:crypto";
import { ehDiaValido, normalizar } from "@/domain/frequencia";
import { planejarOrdenacaoLinhasPlanilha } from "@/domain/ordenacao-planilha";
import {
  chaveResolucaoAntiga,
  type ComplementosAntigos,
  type PendenciaAntiga,
  type PreviaAntiga,
  type ResolucaoAntiga,
} from "@/domain/planilha-legado";
import { ErroHttp } from "./erros";
import {
  lerDocumentoGoogle,
  lerBlocosGoogle,
  mensalDaAbaGoogle,
  metadadosDaAba,
  type AbaGoogle,
  type DocumentoGoogle,
  type BlocoGoogle,
} from "./google-planilhas-api";
import { enviarLoteAtomicoGoogle } from "./google-planilhas-escrita";

function conferir(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new ErroHttp(mensagem, 409);
}

/** Percorre também células vazias com notas; o tamanho usado não basta para exclusões. */
async function lerInteira(id: string, acesso: string, aba: AbaGoogle) {
  const linhas = aba.properties.gridProperties?.rowCount;
  const colunas = aba.properties.gridProperties?.columnCount;
  conferir(
    linhas && colunas && linhas <= 2000 && colunas <= 400,
    "A aba é grande demais para retirada automática. Confira a planilha.",
  );
  conferir(!aba.merges?.length, "Há células mescladas. Confira a aba antes de retirá-la.");
  const resultado: BlocoGoogle = {
    coluna: 1,
    colunas,
    valores: Array.from({ length: linhas }, () => []),
    formula: Array.from({ length: linhas }, () => []),
    notas: Array.from({ length: linhas }, () => []),
    ocupado: Array.from({ length: linhas }, () => []),
    valorInformado: Array.from({ length: linhas }, () => []),
  };
  const assinaturas: string[] = [];
  const largura = Math.max(1, Math.floor(20_000 / linhas));
  for (let inicio = 1; inicio <= colunas; inicio += largura) {
    const [bloco] = await lerBlocosGoogle(
      id,
      acesso,
      aba.properties.title,
      linhas,
      [{ coluna: inicio, colunas: Math.min(largura, colunas - inicio + 1) }],
      { conferirNotas: true, conferirConteudo: true },
    );
    conferir(
      bloco?.notas && bloco.ocupado && bloco.valorInformado && bloco.conteudoHash,
      "Não foi possível conferir o conteúdo completo da aba.",
    );
    assinaturas.push(bloco.conteudoHash);
    for (let linha = 0; linha < linhas; linha++) {
      resultado.valores[linha]?.push(...(bloco.valores[linha] ?? []));
      resultado.formula[linha]?.push(...(bloco.formula[linha] ?? []));
      resultado.notas?.[linha]?.push(...(bloco.notas[linha] ?? []));
      resultado.ocupado?.[linha]?.push(...(bloco.ocupado[linha] ?? []));
      resultado.valorInformado?.[linha]?.push(...(bloco.valorInformado[linha] ?? []));
    }
  }
  resultado.conteudoHash = createHash("sha256").update(JSON.stringify(assinaturas)).digest("hex");
  return resultado;
}

function referencia(linha: number, coluna: number): string {
  let numero = coluna + 1;
  let letra = "";
  while (numero > 0) {
    numero--;
    letra = String.fromCharCode(65 + (numero % 26)) + letra;
    numero = Math.floor(numero / 26);
  }
  return `${letra}${linha + 1}`;
}

function ehResumo(rotulo: string): boolean {
  const nome = normalizar(rotulo)
    .replace(/[().:]/g, "")
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, " ")
    .trim();
  return new Set([
    "total",
    "faltas",
    "total de faltas",
    "faltas totais",
    "justificadas",
    "faltas justificadas",
    "faltas nao justificadas",
    "total f+fj",
    "total f",
    "total fj",
    "presentes",
    "presencas",
  ]).has(nome);
}

export type { ComplementosAntigos } from "@/domain/planilha-legado";

/** A lista identifica o descarte sem devolver o texto de notas ou fórmulas ao navegador. */
function conferirComplementos(fonte: BlocoGoogle): ComplementosAntigos {
  const resultado: ComplementosAntigos = { formulas: 0, notas: 0, totais: 0, amostras: [] };
  function registrar(linha: number, coluna: number, tipo: "fórmula" | "nota" | "total") {
    if (tipo === "fórmula") resultado.formulas++;
    if (tipo === "nota") resultado.notas++;
    if (tipo === "total") resultado.totais++;
    if (resultado.amostras.length < 18)
      resultado.amostras.push({ celula: referencia(linha, coluna), tipo });
  }
  for (let linha = 0; linha < fonte.valores.length; linha++) {
    for (let coluna = 0; coluna < fonte.colunas; coluna++) {
      const resumo = coluna > 0 && ehResumo(fonte.valores[0]?.[coluna] ?? "");
      if (fonte.formula[linha]?.[coluna]) {
        conferir(
          linha > 0 && resumo,
          `Há fórmula fora dos totais em ${referencia(linha, coluna)}. Confira essa célula antes de retirar a aba.`,
        );
        registrar(linha, coluna, "fórmula");
      } else if (linha > 0 && resumo && fonte.valores[linha]?.[coluna]) {
        conferir(
          /^\d+(?:[.,]\d+)?$/.test(fonte.valores[linha]?.[coluna] ?? ""),
          `Há conteúdo diferente de um total em ${referencia(linha, coluna)}. Confira a célula.`,
        );
        registrar(linha, coluna, "total");
      }
      if (fonte.notas?.[linha]?.[coluna]) registrar(linha, coluna, "nota");
      conferir(
        !fonte.valorInformado?.[linha]?.[coluna] ||
          fonte.valores[linha]?.[coluna] ||
          (fonte.formula[linha]?.[coluna] && resumo),
        `Há conteúdo não visível em ${referencia(linha, coluna)}. Confira antes de retirar a aba.`,
      );
    }
  }
  return resultado;
}

function diaDoCabecalho(valor: string): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(20\d{2}|2100)$/.exec(valor);
  if (!partes) return null;
  const dia = `${partes[3]}-${partes[2]}-${partes[1]}`;
  return ehDiaValido(dia) ? dia : null;
}

function linhasPorAluno(doc: DocumentoGoogle, aba: AbaGoogle, grade: BlocoGoogle) {
  const ids = new Map<number, string>();
  const vistos = new Set<string>();
  for (const marcador of metadadosDaAba(doc, aba)) {
    if (marcador.metadataKey !== "frequenciapp.aluno") continue;
    const local = marcador.location.dimensionRange;
    const linha = local?.startRowIndex;
    const aluno = marcador.metadataValue;
    conferir(
      linha !== undefined &&
        linha > 0 &&
        linha < grade.valores.length &&
        Boolean(grade.valores[linha]?.[0]?.trim()) &&
        local?.endRowIndex === linha + 1 &&
        aluno &&
        !ids.has(linha) &&
        !vistos.has(aluno),
      "Confira os vínculos dos alunos antes de retirar a aba.",
    );
    ids.set(linha, aluno);
    vistos.add(aluno);
  }
  const nomes = new Map<string, number[]>();
  grade.valores.forEach((linha, indice) => {
    if (indice === 0 || !linha[0]) return;
    const nome = normalizarNome(linha[0]);
    nomes.set(nome, [...(nomes.get(nome) ?? []), indice]);
  });
  return { ids, nomes };
}

function normalizarNome(nome: string) {
  return nome.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export async function organizarAbaAntigaGoogle(
  id: string,
  acesso: string,
  entrada: {
    aba: string;
    turmaOriginalId: string;
    impressao?: string;
    descartarComplementos?: boolean;
    resolucoes?: ResolucaoAntiga[];
  },
  aplicar: boolean,
): Promise<PreviaAntiga> {
  const doc = await lerDocumentoGoogle(id, acesso);
  const antiga = doc.sheets.find((aba) => aba.properties.title === entrada.aba);
  conferir(antiga && !mensalDaAbaGoogle(doc, antiga), "Escolha uma aba antiga vinculada à turma.");
  const abaAntiga = antiga;
  // A aplicação exige o vínculo salvo e assina a confirmação. Abas anteriores
  // ao OAuth podem não ter autoria; o título sozinho nunca autoriza a retirada.
  conferir(!antiga.charts?.length, "Há gráficos na aba antiga. Confira antes de retirá-la.");
  const fonte = await lerInteira(id, acesso, antiga);
  conferir(
    fonte.valores[0]?.[0] === "Aluno",
    "Corrija o cabeçalho da aba antiga antes de retirá-la.",
  );
  const complementos = conferirComplementos(fonte);
  const origem = linhasPorAluno(doc, antiga, fonte);
  const destinos = new Map<
    string,
    {
      aba: AbaGoogle;
      grade: BlocoGoogle;
      alunos: ReturnType<typeof linhasPorAluno>;
    }
  >();
  const pedidos: Record<string, unknown>[] = [];
  let preenchidas = 0;
  let conferidas = 0;
  let substituidas = 0;
  let mantidas = 0;
  let alunosIncluidos = 0;
  const resolucoes = new Map(
    (entrada.resolucoes ?? []).map((item) => [chaveResolucaoAntiga(item), item]),
  );
  const usadas = new Set<string>();
  const pendencias: PendenciaAntiga[] = [];
  const identificadoresPendentes = new Set<string>();
  const linhasConferidas = new Set<number>();
  const mapeamentos = new Map<string, number | null>();
  const ocupacoes = new Map<string, number>();
  const linhasIncluidas = new Map<string, Set<number>>();
  function registrarPendencia(pendencia: PendenciaAntiga) {
    if (identificadoresPendentes.has(pendencia.id)) return;
    identificadoresPendentes.add(pendencia.id);
    if (pendencias.length < 200) pendencias.push(pendencia);
  }
  function local(aba: AbaGoogle, celula: string) {
    return {
      aba: aba.properties.title,
      celula,
      url: `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit#gid=${aba.properties.sheetId}&range=${celula}`,
    };
  }
  function resolverAluno(
    linha: number,
    mes: string,
    destino: NonNullable<ReturnType<typeof destinos.get>>,
  ) {
    const id = `aluno:${mes}:${linha + 1}`;
    if (mapeamentos.has(id)) return mapeamentos.get(id) ?? null;
    const nome = fonte.valores[linha]?.[0] ?? "";
    conferir(nome.trim(), `Há frequência sem nome em A${linha + 1} na aba antiga.`);
    const nomeNormalizado = normalizarNome(nome);
    const alunoId = origem.ids.get(linha);
    const porCodigo = alunoId
      ? [...destino.alunos.ids].filter(([, aluno]) => aluno === alunoId).map(([indice]) => indice)
      : [];
    const candidatas = porCodigo.length
      ? porCodigo
      : (destino.alunos.nomes.get(nomeNormalizado) ?? []).filter((indice) => {
          const codigoDestino = destino.alunos.ids.get(indice);
          return !alunoId || !codigoDestino || codigoDestino === alunoId;
        });
    conferir(
      candidatas.length <= 20,
      `Há muitos nomes iguais a ${nome}. Confira as linhas das duas abas.`,
    );
    const escolha = resolucoes.get(id);
    const nomeConfere =
      candidatas.length === 1 &&
      normalizarNome(destino.grade.valores[candidatas[0] ?? -1]?.[0] ?? "") === nomeNormalizado;
    let alvo: number | undefined;
    if (escolha?.tipo === "adicionar-aluno") {
      conferir(
        !candidatas.length,
        "Este aluno já possui uma linha compatível. Confira o destino antes de incluir outra linha.",
      );
      alvo = destino.grade.valores.findIndex(
        (linha, indice) =>
          indice > 0 &&
          !linha.some(Boolean) &&
          !destino.grade.ocupado?.[indice]?.some(Boolean) &&
          !destino.grade.formula[indice]?.some(Boolean) &&
          !destino.grade.notas?.[indice]?.some(Boolean),
      );
      if (alvo < 0) {
        alvo = destino.grade.valores.length;
        conferir(
          alvo < 2000,
          "A aba mensal está cheia. Libere uma linha vazia antes de incluir este aluno.",
        );
        pedidos.push({
          appendDimension: {
            sheetId: destino.aba.properties.sheetId,
            dimension: "ROWS",
            length: 1,
          },
        });
      }
      destino.grade.valores[alvo] = [nome];
      destino.alunos.nomes.set(nomeNormalizado, [
        ...(destino.alunos.nomes.get(nomeNormalizado) ?? []),
        alvo,
      ]);
      pedidos.push({
        updateCells: {
          range: {
            sheetId: destino.aba.properties.sheetId,
            startRowIndex: alvo,
            endRowIndex: alvo + 1,
            startColumnIndex: 0,
            endColumnIndex: 1,
          },
          rows: [{ values: [{ userEnteredValue: { stringValue: nome } }] }],
          fields: "userEnteredValue",
        },
      });
      for (const [chave, valor] of [
        ["frequenciapp.linha", "1"],
        ...(alunoId ? [["frequenciapp.aluno", alunoId]] : []),
      ])
        pedidos.push({
          createDeveloperMetadata: {
            developerMetadata: {
              metadataKey: chave,
              metadataValue: valor,
              visibility: "DOCUMENT",
              location: {
                dimensionRange: {
                  sheetId: destino.aba.properties.sheetId,
                  dimension: "ROWS",
                  startIndex: alvo,
                  endIndex: alvo + 1,
                },
              },
            },
          },
        });
      if (alunoId) destino.alunos.ids.set(alvo, alunoId);
      const novas = linhasIncluidas.get(mes) ?? new Set<number>();
      novas.add(alvo);
      linhasIncluidas.set(mes, novas);
      usadas.add(id);
      alunosIncluidos++;
    } else if (escolha?.tipo === "aluno") {
      conferir(
        candidatas.includes(escolha.linhaMensal - 1),
        "A linha escolhida não corresponde a este aluno. Confira novamente.",
      );
      alvo = escolha.linhaMensal - 1;
      usadas.add(id);
    } else if (
      nomeConfere &&
      (porCodigo.length === 1 || origem.nomes.get(nomeNormalizado)?.length === 1)
    ) {
      alvo = candidatas[0];
    }
    if (alvo !== undefined) {
      const chave = `${mes}:${alvo}`;
      conferir(
        !ocupacoes.has(chave) || ocupacoes.get(chave) === linha,
        "Duas linhas antigas apontam para o mesmo aluno. Escolha destinos diferentes antes de continuar.",
      );
      ocupacoes.set(chave, linha);
      mapeamentos.set(id, alvo);
      linhasConferidas.add(linha);
      return alvo;
    }
    mapeamentos.set(id, null);
    registrarPendencia({
      id,
      tipo: "aluno",
      mes,
      aluno: nome,
      linhaAntiga: linha + 1,
      mensagem: candidatas.length
        ? porCodigo.length === 1 && !nomeConfere
          ? "O código coincide, mas o nome mudou. Confira as duas linhas."
          : "Confira a linha do aluno na aba mensal."
        : "O aluno não foi encontrado com segurança na aba mensal. Confira os nomes e os códigos nas duas abas.",
      origem: local(abaAntiga, `A${linha + 1}`),
      destino: local(destino.aba, "A:A"),
      opcoes: candidatas.map((indice) => ({
        linha: indice + 1,
        nome: destino.grade.valores[indice]?.[0] ?? "",
        url: local(destino.aba, `A${indice + 1}`).url,
      })),
    });
    return null;
  }
  const datas = new Set<string>();
  for (let coluna = 1; coluna < fonte.colunas; coluna++) {
    const rotulo: string = fonte.valores[0]?.[coluna] ?? "";
    if (rotulo === "Turma atual" || ehResumo(rotulo)) continue;
    const dia = diaDoCabecalho(rotulo);
    if (!dia) {
      conferir(
        !rotulo && fonte.valores.every((linha) => !linha[coluna]),
        "Há colunas não reconhecidas na aba antiga. Confira os dados antes de retirá-la.",
      );
      continue;
    }
    conferir(!datas.has(dia), "Há datas repetidas na aba antiga. Confira o cabeçalho.");
    datas.add(dia);
    for (let linha = 1; linha < fonte.valores.length; linha++) {
      const valor = fonte.valores[linha]?.[coluna] ?? "";
      if (!valor) continue;
      conferir(
        ["P", "F", "FJ", "S"].includes(valor),
        "Há valores diferentes de P, F, FJ ou S. Confira a aba antiga.",
      );
      const mes: string = dia.slice(0, 7);
      let destino = destinos.get(mes);
      if (!destino) {
        const candidatas: AbaGoogle[] = doc.sheets.filter((aba) => {
          const mensal = mensalDaAbaGoogle(doc, aba);
          return mensal && mensal.mes === mes && mensal.turmaOriginalId === entrada.turmaOriginalId;
        });
        conferir(
          candidatas.length === 1,
          `Prepare o mês ${mes} desta turma antes de retirar a aba antiga.`,
        );
        const aba = candidatas[0];
        conferir(aba, "A aba mensal não foi encontrada.");
        const grade = await lerInteira(id, acesso, aba);
        conferir(grade.valores[0]?.[0] === "Aluno", "Confira o cabeçalho da aba mensal.");
        destino = { aba, grade, alunos: linhasPorAluno(doc, aba, grade) };
        destinos.set(mes, destino);
      }
      const cabecalho = destino.grade.valores[0] ?? [];
      const colunas: number[] = cabecalho.flatMap((item, indice) =>
        item === rotulo ? [indice] : [],
      );
      conferir(colunas.length === 1, `Confira a data ${rotulo} na aba mensal antes de continuar.`);
      const alvoLinha = resolverAluno(linha, mes, destino);
      if (alvoLinha === null) continue;
      const alvoColuna = colunas[0];
      conferir(
        alvoLinha !== undefined && alvoColuna !== undefined,
        "Não foi possível conferir a célula de destino.",
      );
      conferir(
        !destino.grade.formula[alvoLinha]?.[alvoColuna] &&
          !destino.grade.notas?.[alvoLinha]?.[alvoColuna],
        "Há fórmula ou nota no destino de uma frequência. Confira a aba mensal.",
      );
      const atual = destino.grade.valores[alvoLinha]?.[alvoColuna] ?? "";
      conferir(
        atual || !destino.grade.ocupado?.[alvoLinha]?.[alvoColuna],
        "Há conteúdo não visível no destino. Confira a célula antes de continuar.",
      );
      if (atual && atual !== valor) {
        conferir(
          ["P", "F", "FJ", "S"].includes(atual),
          "Há conteúdo diferente de uma frequência no destino. Confira a aba mensal.",
        );
        const celulaAntiga = referencia(linha, coluna);
        const id = `frequencia:${mes}:${celulaAntiga}`;
        const escolha = resolucoes.get(id);
        if (escolha?.tipo !== "frequencia") {
          registrarPendencia({
            id,
            tipo: "frequencia",
            mes,
            aluno: fonte.valores[linha]?.[0] ?? "",
            dia,
            antiga: valor,
            mensal: atual,
            mensagem: "Escolha qual marca deve ficar na aba mensal.",
            origem: local(antiga, celulaAntiga),
            destino: local(destino.aba, referencia(alvoLinha, alvoColuna)),
          });
          continue;
        }
        usadas.add(id);
        if (escolha.manter === "mensal") {
          mantidas++;
          continue;
        }
        substituidas++;
      } else if (atual) {
        conferidas++;
        continue;
      } else preenchidas++;
      pedidos.push({
        updateCells: {
          range: {
            sheetId: destino.aba.properties.sheetId,
            startRowIndex: alvoLinha,
            endRowIndex: alvoLinha + 1,
            startColumnIndex: alvoColuna,
            endColumnIndex: alvoColuna + 1,
          },
          rows: [{ values: [{ userEnteredValue: { stringValue: valor } }] }],
          fields: "userEnteredValue",
        },
      });
    }
  }
  if (!destinos.size) {
    const aba = doc.sheets.find((aba) => {
      const mensal = mensalDaAbaGoogle(doc, aba);
      return (
        mensal?.turmaOriginalId === entrada.turmaOriginalId &&
        (!datas.size || [...datas].some((dia) => dia.startsWith(mensal.mes)))
      );
    });
    conferir(aba, "Prepare os meses desta turma antes de retirar a aba antiga.");
    const mensal = mensalDaAbaGoogle(doc, aba);
    conferir(mensal, "A aba mensal não foi encontrada.");
    const grade = await lerInteira(id, acesso, aba);
    destinos.set(mensal.mes, { aba, grade, alunos: linhasPorAluno(doc, aba, grade) });
  }
  // Confere também linhas sem marcas, sem aceitar um homônimo como preservação do nome.
  for (const linhas of origem.nomes.values()) {
    for (const linha of linhas) {
      if (
        linhasConferidas.has(linha) ||
        [...mapeamentos.keys()].some((id) => id.endsWith(`:${linha + 1}`))
      )
        continue;
      const candidato =
        [...destinos].find(
          ([, destino]) =>
            destino.alunos.nomes.has(normalizarNome(fonte.valores[linha]?.[0] ?? "")) ||
            [...destino.alunos.ids.values()].includes(origem.ids.get(linha) ?? ""),
        ) ?? [...destinos][0];
      if (candidato) resolverAluno(linha, candidato[0], candidato[1]);
    }
  }
  for (const [mes, destino] of destinos) {
    const novas = linhasIncluidas.get(mes);
    if (!novas?.size) continue;
    const linhas = [...new Set([...destino.alunos.ids.keys(), ...novas])]
      .filter((linha) => !destino.grade.formula[linha]?.[0])
      .map((linha) => ({ linha: linha + 1, nome: destino.grade.valores[linha]?.[0] ?? "" }))
      .filter((linha) => linha.nome.trim());
    for (const movimento of planejarOrdenacaoLinhasPlanilha(linhas))
      pedidos.push({
        moveDimension: {
          source: {
            sheetId: destino.aba.properties.sheetId,
            dimension: "ROWS",
            startIndex: movimento.origem - 1,
            endIndex: movimento.origem,
          },
          destinationIndex:
            movimento.destino < movimento.origem ? movimento.destino - 1 : movimento.destino,
        },
      });
  }
  for (const { aba } of destinos.values())
    pedidos.push({
      updateSheetProperties: {
        properties: { sheetId: aba.properties.sheetId, hidden: false },
        fields: "hidden",
      },
    });
  pedidos.push({ deleteSheet: { sheetId: antiga.properties.sheetId } });
  const impressao = createHash("sha256")
    .update(
      JSON.stringify([
        id,
        entrada.aba,
        entrada.turmaOriginalId,
        entrada.resolucoes ?? [],
        antiga,
        fonte,
        [...destinos].map(([mes, destino]) => [mes, destino.aba, destino.grade]),
        pedidos,
      ]),
    )
    .digest("hex");
  if (aplicar) {
    conferir(
      !identificadoresPendentes.size,
      "Resolva as pendências e confira uma nova prévia antes de retirar a aba.",
    );
    conferir(
      entrada.impressao === impressao,
      "A planilha mudou. Confira uma nova prévia antes de continuar.",
    );
    conferir(
      !(complementos.formulas + complementos.notas + complementos.totais) ||
        entrada.descartarComplementos,
      "Confirme o descarte dos totais e notas antigos antes de retirar a aba.",
    );
    await enviarLoteAtomicoGoogle(id, acesso, pedidos);
  }
  return {
    aba: entrada.aba,
    impressao,
    preenchidas,
    conferidas,
    substituidas,
    mantidas,
    resolucoesAplicadas: usadas.size,
    alunosIncluidos,
    pendencias,
    totalPendencias: identificadoresPendentes.size,
    complementos,
    urlAntiga: `https://docs.google.com/spreadsheets/d/${doc.spreadsheetId}/edit#gid=${antiga.properties.sheetId}`,
    destinos: [...destinos].map(([mes, { aba }]) => ({ mes, aba: aba.properties.title })),
    removida: aplicar,
  };
}
