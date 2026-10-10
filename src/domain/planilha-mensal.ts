// Identificação dos meses e nomes das abas mensais da frequência.
import { diaDaSemanaIso, diasDoMes } from "./frequencia";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface AbaMensalPlanilha {
  aba: string;
  mes: string;
  turmaOriginalId: string;
  destino: string;
}

/** Mês civil aceito pelo calendário da frequência, incluindo o ano. */
export function mesValido(mes: string): boolean {
  return /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(mes);
}

/** Mantém o mês visível e respeita os caracteres e o limite do Google. */
export function nomeAbaMensal(rotulo: string, mes: string, incluirAno = false): string {
  if (!mesValido(mes)) throw new Error("Informe um mês válido.");
  const sufixo = ` · ${MESES[Number(mes.slice(5, 7)) - 1]}${incluirAno ? ` ${mes.slice(0, 4)}` : ""}`;
  const turma = rotulo
    .normalize("NFC")
    .replace(/[\\/:*?[\]]/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "");
  return `${(turma || "Turma").slice(0, 100 - sufixo.length).trim()}${sufixo}`;
}

/** Datas úteis e sábados com chamada salva, sem incluir domingos ou outro mês. */
export function diasDaPlanilhaMensal(mes: string, sabadosLetivos: string[] = []): string[] {
  if (!mesValido(mes)) throw new Error("Informe um mês válido.");
  const sabados = new Set(sabadosLetivos);
  return diasDoMes(mes).filter(
    (dia) => diaDaSemanaIso(dia) <= 5 || (diaDaSemanaIso(dia) === 6 && sabados.has(dia)),
  );
}
