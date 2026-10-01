// Apresentação das colunas e correção conservadora da introdução e das datas.
import { normalizar, rotuloData } from "./frequencia";
import { blocosDeColunas, dataDoRotulo, hashTexto } from "./planilha";

export interface ColunaApresentacao {
  indice: number;
  rotulo: string;
  largura: number;
  alinhamento: "LEFT" | "CENTER";
}
export interface ApresentacaoAba {
  aba: string;
  cabecalhoLinha: number;
  assinatura: string;
  colunas: ColunaApresentacao[];
  ajusteCabecalho?: AjusteCabecalho;
}

export const CORES_PLANILHA = {
  cabecalho: "#166534",
  textoCabecalho: "#ffffff",
  primeiraLinha: "#ffffff",
  segundaLinha: "#f0f4f1",
};

/** Colunas auxiliares da escola ficam fora do padrão visual. */
export function colunasDeApresentacao(cabecalho: string[]): ColunaApresentacao[] {
  return cabecalho.flatMap((rotulo, posicao) => {
    const nome = normalizar(rotulo);
    let largura = 0;
    let alinhamento: ColunaApresentacao["alinhamento"] = "LEFT";
    if (["aluno", "aluna", "nome", "estudante", "nome do aluno"].includes(nome)) largura = 260;
    else if (["turma", "turma atual", "classe"].includes(nome)) {
      largura = 140;
      alinhamento = "CENTER";
    } else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(nome)) {
      largura = nome.split("/").length === 3 ? 110 : 68;
      alinhamento = "CENTER";
    } else if (["data", "dia", "horario", "aula", "momento", "momento da saida"].includes(nome)) {
      largura = nome === "data" || nome === "dia" ? 110 : 160;
      alinhamento = "CENTER";
    } else if (["total", "faltas", "justificadas", "total (f + fj)"].includes(nome)) {
      largura = 110;
      alinhamento = "CENTER";
    } else if (
      [
        "justificativa",
        "motivo",
        "justificativa da saida",
        "observacao",
        "texto",
        "detalhe",
        "comentario",
        "descricao",
        "liberado por",
        "responsavel",
        "liberado",
        "responsavel pela liberacao",
        "registrado por",
        "codigo",
      ].includes(nome)
    )
      largura = 240;
    return largura ? [{ indice: posicao + 1, rotulo, largura, alinhamento }] : [];
  });
}

export function faixasDeApresentacao(colunas: ColunaApresentacao[]) {
  return blocosDeColunas(colunas.map((coluna) => coluna.indice));
}

/** Abas novas não têm estilos manuais: todos os títulos recebem apresentação. */
export function colunasDeNovaAba(cabecalho: string[]): ColunaApresentacao[] {
  const reconhecidas = new Map(
    colunasDeApresentacao(cabecalho).map((coluna) => [coluna.indice, coluna]),
  );
  return cabecalho.map(
    (rotulo, posicao) =>
      reconhecidas.get(posicao + 1) ?? {
        indice: posicao + 1,
        rotulo,
        largura: 240,
        alinhamento: "LEFT",
      },
  );
}

export interface AjusteCabecalho {
  linhasRemover: number;
  assinaturaIntroducao: string;
  datas: { indice: number; anterior: string; rotulo: string }[];
}

/** Remove apenas o título e a legenda reconhecidos, incluindo linhas vazias. */
export function assinaturaIntroducao(linhas: string[][]): string {
  return hashTexto(
    JSON.stringify(
      linhas.map((linha) => {
        const valores = linha.map((valor) => valor.trim());
        while (valores.at(-1) === "") valores.pop();
        return valores;
      }),
    ),
  );
}

export function introducaoReconhecida(linhas: string[][]): boolean {
  return linhas.every((linha) => {
    const textos = linha.map(normalizar).filter(Boolean);
    return (
      textos.length === 0 ||
      (textos.length === 1 &&
        (/^frequencia(?:\s|[.:·-]|$)/.test(textos[0] ?? "") ||
          /^p\s*=\s*presente\b.*\bf\s*=/.test(textos[0] ?? "") ||
          textos[0] === "atualize as marcacoes no aplicativo."))
    );
  });
}

/** Datas sem ano usam o ano explícito mais próximo; o ano informado atende abas sem ano explícito. */
export function planejarAjusteCabecalho(
  amostra: string[][],
  cabecalhoLinha: number,
  anoReferencia: number,
): AjusteCabecalho {
  const introducao = amostra.slice(0, cabecalhoLinha - 1);
  if (!introducaoReconhecida(introducao))
    throw new Error("Há conteúdo acima da tabela que não pode ser removido automaticamente.");
  const cabecalho = amostra[cabecalhoLinha - 1] ?? [];
  const explicitas = cabecalho.flatMap((rotulo, indice) => {
    const dia = dataDoRotulo(rotulo, anoReferencia);
    return dia && (/^\d{4}-/.test(rotulo.trim()) || rotulo.trim().split(/[/.-]/).length === 3)
      ? [{ indice, dia }]
      : [];
  });
  const datas = cabecalho.flatMap((anterior, indice) => {
    let dia = dataDoRotulo(anterior, 2000);
    if (!dia) return [];
    const explicita = explicitas.some((item) => item.indice === indice);
    if (!explicita) {
      let ano = anoReferencia;
      const ancora = [...explicitas].sort(
        (a, b) => Math.abs(a.indice - indice) - Math.abs(b.indice - indice),
      )[0];
      if (ancora) {
        ano = Number(ancora.dia.slice(0, 4));
        const mes = Number(dia.slice(5, 7));
        const mesAncora = Number(ancora.dia.slice(5, 7));
        if (indice > ancora.indice && mes === 1 && mesAncora === 12) ano += 1;
        if (indice < ancora.indice && mes === 12 && mesAncora === 1) ano -= 1;
      }
      dia = dataDoRotulo(anterior, ano);
    }
    if (!dia) throw new Error("Confira o ano das datas antes de corrigir o cabeçalho.");
    const rotulo = rotuloData(dia);
    return rotulo === anterior ? [] : [{ indice: indice + 1, anterior, rotulo }];
  });
  return {
    linhasRemover: introducao.length,
    assinaturaIntroducao: assinaturaIntroducao(introducao),
    datas,
  };
}
