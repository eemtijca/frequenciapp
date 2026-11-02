import { diaLocal } from "@/domain/frequencia";

function primeiroDiaDoMes(mes: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error(`Mês inválido: ${mes}.`);
  return new Date(`${mes}-01T00:00:00.000Z`);
}

// Dois meses atrás também protege quando o servidor externo usa outro fuso.
export function mesDaFixture(agora: Date, fuso: string): string {
  const data = primeiroDiaDoMes(diaLocal(agora, fuso).slice(0, 7));
  data.setUTCMonth(data.getUTCMonth() - 2);
  return data.toISOString().slice(0, 7);
}

// Dias de frequência escolar, não datas de captura de tela.
export function diasElegiveis(
  mes: string,
  feriados: readonly string[],
  quantidade: number,
): string[] {
  const primeiroDia = primeiroDiaDoMes(mes);
  if (!Number.isSafeInteger(quantidade) || quantidade < 0)
    throw new Error(`Quantidade inválida: ${quantidade}.`);
  if (quantidade === 0) return [];
  const excluidos = new Set(feriados);
  const dias: string[] = [];
  for (let dia = 1; dia <= 31; dia++) {
    const data = new Date(primeiroDia);
    data.setUTCDate(dia);
    const iso = data.toISOString().slice(0, 10);
    if (iso.slice(0, 7) !== mes) break;
    if (data.getUTCDay() !== 0 && !excluidos.has(iso)) dias.push(iso);
    if (dias.length === quantidade) return dias;
  }
  throw new Error(`Não há ${quantidade} dias escolares disponíveis em ${mes}.`);
}
