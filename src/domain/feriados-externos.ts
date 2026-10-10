// Datas e nomes vindos da base externa de feriados, no calendário civil da escola.

import { ehAnoLetivoValido } from "@/domain/calendario-letivo";
import { ehDiaValido } from "@/domain/frequencia";

/** Recorte geográfico pedido à base. O município já inclui estado e país. */
export type AbrangenciaFeriados = "nacionais" | "estaduais" | "municipais";

export interface FeriadoExterno {
  dia: string;
  nome: string;
}

/** Situação do botão de sincronização, sem o token da base. */
export interface EstadoSincronizacaoFeriados {
  sincronizado: boolean;
  configurado: boolean;
  abrangencia: AbrangenciaFeriados;
}

/** Contagem da gravação. `sincronizado` reflete se ficou algum feriado importado. */
export interface ResumoSincronizacaoFeriados {
  gravados: number;
  atualizados: number;
  mantidos: number;
  ignorados: number;
  sincronizado: boolean;
}

const DATA_API = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const LIMITE_NOME = 120;

/** Converte `DD/MM/AAAA` para o dia civil do ano pedido. Fora do ano, devolve nulo. */
export function diaDaDataApi(data: string, ano: number): string | null {
  const partes = DATA_API.exec(data.trim());
  if (!partes) return null;
  const dia = partes[1];
  const mes = partes[2];
  const anoTexto = partes[3];
  if (!dia || !mes || !anoTexto || Number(anoTexto) !== ano) return null;
  const iso = `${anoTexto}-${mes}-${dia}`;
  if (!ehDiaValido(iso) || !ehAnoLetivoValido(ano)) return null;
  return iso;
}

/** Apara o nome e limita a 120 caracteres, o tamanho da coluna do calendário. */
export function nomeDeFeriadoExterno(nome: string): string | null {
  const texto = nome.trim().replace(/\s+/g, " ");
  if (!texto) return null;
  return texto.length > LIMITE_NOME ? texto.slice(0, LIMITE_NOME) : texto;
}

/**
 * Reúne as páginas em datas únicas do ano. A primeira ocorrência do dia prevalece.
 * Itens sem data ou nome válidos entram na contagem de ignorados.
 */
export function reunirFeriadosExternos(
  itens: readonly { data: string; nome: string }[],
  ano: number,
): { feriados: FeriadoExterno[]; ignorados: number } {
  const porDia = new Map<string, string>();
  let ignorados = 0;
  for (const item of itens) {
    const dia = diaDaDataApi(item.data, ano);
    const nome = nomeDeFeriadoExterno(item.nome);
    if (!dia || !nome) {
      ignorados += 1;
      continue;
    }
    if (!porDia.has(dia)) porDia.set(dia, nome);
  }
  const feriados = [...porDia.entries()]
    .map(([dia, nome]) => ({ dia, nome }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
  return { feriados, ignorados };
}
