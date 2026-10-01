// Padrão visual das colunas reconhecidas, sem mudar valores ou rótulos.
import { normalizar } from "./frequencia";
import { blocosDeColunas } from "./planilha";

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
      largura = 68;
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
