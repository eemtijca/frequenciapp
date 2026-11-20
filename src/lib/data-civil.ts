// Dia civil no formato AAAA-MM-DD: conversão por componentes locais e retorno
// ao meio-dia local, sem passar por UTC nem deslocar a data em fusos negativos.

const FORMATO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_MES = /^(\d{4})-(\d{2})$/;

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}

/** Converte uma data local para o dia civil AAAA-MM-DD; inválida devolve nulo. */
export function paraDiaCivil(data: Date | null): string | null {
  if (!data || Number.isNaN(data.getTime())) return null;
  const ano = data.getFullYear();
  const mes = data.getMonth() + 1;
  const dia = data.getDate();
  return `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/**
 * Converte AAAA-MM-DD em uma data local ao meio-dia. O meio-dia evita que o
 * horário de verão empurre a data para o dia anterior ou seguinte.
 */
export function deDiaCivil(dia: string): Date | null {
  const partes = FORMATO_DIA.exec(dia);
  if (!partes) return null;

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const numero = Number(partes[3]);
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(numero)) return null;

  const data = new Date(2000, 0, 1, 12, 0, 0, 0);
  data.setFullYear(ano, mes - 1, numero);
  data.setHours(12, 0, 0, 0);

  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== numero) {
    return null;
  }
  return data;
}

/** Formata um dia civil como DD/MM/AAAA; inválido devolve string vazia. */
export function formatarDiaCivil(dia: string): string {
  const data = deDiaCivil(dia);
  if (!data) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

/** Formata um mês civil AAAA-MM como MM/AAAA; inválido devolve string vazia. */
export function formatarMesCivil(mes: string): string {
  const partes = FORMATO_MES.exec(mes);
  if (!partes) return "";
  const [, ano = "", numero = ""] = partes;
  const mesNumero = Number(numero);
  if (mesNumero < 1 || mesNumero > 12) return "";
  return `${doisDigitos(mesNumero)}/${ano}`;
}
