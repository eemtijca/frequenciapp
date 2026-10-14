// Migra marcas de uma aba antiga vinculada, conferindo o conteúdo antes de retirá-la.
import { createHash } from "node:crypto";
import { ehDiaValido } from "@/domain/frequencia";
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
  };
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
      bloco?.notas && bloco.ocupado,
      "Não foi possível conferir o conteúdo completo da aba.",
    );
    for (let linha = 0; linha < linhas; linha++) {
      resultado.valores[linha]?.push(...(bloco.valores[linha] ?? []));
      resultado.formula[linha]?.push(...(bloco.formula[linha] ?? []));
      resultado.notas?.[linha]?.push(...(bloco.notas[linha] ?? []));
      resultado.ocupado?.[linha]?.push(...(bloco.ocupado[linha] ?? []));
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
    const nome = linha[0].normalize("NFC").trim();
    nomes.set(nome, [...(nomes.get(nome) ?? []), indice]);
  });
  return { ids, nomes };
}

export async function organizarAbaAntigaGoogle(
  id: string,
  acesso: string,
  entrada: { aba: string; turmaOriginalId: string; impressao?: string },
  aplicar: boolean,
) {
  const doc = await lerDocumentoGoogle(id, acesso);
  const antiga = doc.sheets.find((aba) => aba.properties.title === entrada.aba);
  conferir(antiga && !mensalDaAbaGoogle(doc, antiga), "Escolha uma aba antiga vinculada à turma.");
  // A aplicação exige o vínculo salvo e assina a confirmação. Abas anteriores
  // ao OAuth podem não ter autoria; o título sozinho nunca autoriza a retirada.
  conferir(!antiga.charts?.length, "Há gráficos na aba antiga. Confira antes de retirá-la.");
  const fonte = await lerInteira(id, acesso, antiga);
  conferir(
    fonte.valores[0]?.[0] === "Aluno",
    "Corrija o cabeçalho da aba antiga antes de retirá-la.",
  );
  conferir(
    !fonte.formula.some((linha) => linha.some(Boolean)) &&
      !fonte.notas?.some((linha) => linha.some(Boolean)),
    "Há fórmulas ou notas na aba antiga. Confira esses dados antes de retirá-la.",
  );
  conferir(
    !fonte.ocupado?.some((linha, l) =>
      linha.some((ocupada, c) => ocupada && !fonte.valores[l]?.[c]),
    ),
    "Há conteúdo não visível na aba antiga. Confira antes de retirá-la.",
  );
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
  const datas = new Set<string>();
  for (let coluna = 1; coluna < fonte.colunas; coluna++) {
    const rotulo: string = fonte.valores[0]?.[coluna] ?? "";
    if (rotulo === "Turma atual") continue;
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
      const nome = fonte.valores[linha]?.[0]?.normalize("NFC").trim() ?? "";
      conferir(nome, "Há frequência sem nome na aba antiga.");
      const alunoId = origem.ids.get(linha);
      const linhas: number[] = alunoId
        ? [...destino.alunos.ids].filter(([, aluno]) => aluno === alunoId).map(([indice]) => indice)
        : origem.nomes.get(nome)?.length === 1
          ? (destino.alunos.nomes.get(nome) ?? [])
          : [];
      conferir(
        linhas.length === 1,
        "Confira os alunos e os nomes repetidos nas duas abas antes de continuar.",
      );
      const alvoLinha = linhas[0];
      const alvoColuna = colunas[0];
      conferir(
        alvoLinha !== undefined && alvoColuna !== undefined,
        "Não foi possível conferir a célula de destino.",
      );
      conferir(
        destino.grade.valores[alvoLinha]?.[0]?.normalize("NFC").trim() === nome,
        "Os nomes dos alunos mudaram. Confira as duas abas antes de continuar.",
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
      conferir(
        !atual || atual === valor,
        "Há frequências divergentes nas duas abas. Confira antes de continuar.",
      );
      if (atual) {
        conferidas++;
        continue;
      }
      preenchidas++;
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
  // A relação de nomes também precisa estar preservada, mesmo nas linhas sem marcas.
  for (const [nome] of origem.nomes) {
    conferir(
      [...destinos.values()].some((destino) => destino.alunos.nomes.has(nome)),
      "Há alunos ausentes das abas mensais. Confira a lista antes de retirar a aba antiga.",
    );
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
        antiga,
        fonte,
        [...destinos].map(([mes, destino]) => [mes, destino.aba, destino.grade]),
        pedidos,
      ]),
    )
    .digest("hex");
  if (aplicar) {
    conferir(
      entrada.impressao === impressao,
      "A planilha mudou. Confira uma nova prévia antes de continuar.",
    );
    await enviarLoteAtomicoGoogle(id, acesso, pedidos);
  }
  return {
    aba: entrada.aba,
    impressao,
    preenchidas,
    conferidas,
    destinos: [...destinos].map(([mes, { aba }]) => ({ mes, aba: aba.properties.title })),
    removida: aplicar,
  };
}
