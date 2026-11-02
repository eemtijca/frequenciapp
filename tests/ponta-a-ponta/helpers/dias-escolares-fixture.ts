// Consulta somente as datas, sem ler nomes ou alterar o calendário compartilhado.
import { comBanco } from "./banco";
import { diasElegiveis, mesDaFixture } from "./fixture-fluidez";

export async function diasEscolaresDaFixture(quantidade: number): Promise<string[]> {
  const mes = mesDaFixture(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
  const feriados = await comBanco(async (banco) => {
    const resultado = await banco.query<{ dia: string }>(
      "select to_char(dia, 'YYYY-MM-DD') as dia from feriados where dia >= $1::date and dia < $1::date + interval '1 month'",
      [`${mes}-01`],
    );
    return resultado.rows.map((linha) => linha.dia);
  });
  return diasElegiveis(mes, feriados, quantidade);
}
