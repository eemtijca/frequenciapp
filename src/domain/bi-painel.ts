// Composição do painel curado, independente dos componentes e das fontes externas.
import { esquemaGraficoBi, type GraficoBi } from "./bi-analise";
export function graficoBi(
  recurso: GraficoBi["recurso"],
  dimensao: GraficoBi["dimensao"],
  medida: GraficoBi["medida"],
  tipo: GraficoBi["tipo"],
  titulo: string,
  segundaDimensao: GraficoBi["segundaDimensao"] = "tipo",
): GraficoBi {
  return esquemaGraficoBi.parse({
    id: `${recurso}-${dimensao}-${medida}-${tipo}`,
    recurso,
    dimensao,
    medida,
    tipo,
    titulo,
    segundaDimensao,
  });
}
export function painelCuradoBi(aba: string): GraficoBi[] {
  if (aba === "faltas")
    return [
      graficoBi("faltas", "justificativa", "registros", "rosca", "Justificativas"),
      graficoBi("faltas", "aula", "registros", "barras", "Faltas por aula"),
      graficoBi("faltas", "disciplina", "registros", "horizontal", "Disciplinas"),
      graficoBi("faltas", "mes", "registros", "linha", "Faltas por mês"),
      graficoBi("faltas", "diaSemana", "registros", "barras", "Dias da semana"),
      graficoBi("faltas", "dia", "registros", "calor", "Mapa por turma", "turma"),
      graficoBi("faltas", "aluno", "registros", "tabela", "Faltas por aluno"),
    ];
  if (aba === "movimentos")
    return [
      graficoBi("saidas", "dia", "registros", "linha", "Evolução das saídas"),
      graficoBi("entradas", "dia", "registros", "linha", "Evolução das entradas"),
      graficoBi("saidas", "faixaHoraria", "registros", "barras", "Horários das saídas"),
      graficoBi("entradas", "faixaHoraria", "registros", "barras", "Horários das entradas"),
      graficoBi("saidas", "momento", "registros", "rosca", "Momentos das saídas"),
      graficoBi("entradas", "momento", "registros", "rosca", "Momentos das entradas"),
      graficoBi("saidas", "diaSemana", "registros", "barras", "Saídas por dia da semana"),
      graficoBi("entradas", "diaSemana", "registros", "barras", "Entradas por dia da semana"),
    ];
  if (aba === "parciais")
    return [
      graficoBi("parciais", "tipo", "registros", "rosca", "Tipos de registro"),
      graficoBi("parciais", "turno", "registros", "barras", "Turnos"),
      graficoBi("parciais", "turma", "confirmacoes", "barras", "Confirmados na Seduc"),
      graficoBi("parciais", "turma", "pendentes", "horizontal", "Pendentes na Seduc"),
      graficoBi("parciais", "aula", "registros", "barras", "Aulas frequentadas"),
      graficoBi("lista", "turma", "pendentes", "barras", "Pendências da chamada na Seduc"),
    ];
  return [
    graficoBi("chamadas", "mes", "infrequencia", "linha", "Evolução mensal"),
    graficoBi("chamadas", "serie", "infrequencia", "barras", "Comparação por série"),
    graficoBi("chamadas", "turma", "infrequencia", "horizontal", "Comparação por turma"),
    graficoBi("chamadas", "dia", "ausencias", "area", "Ausências por dia"),
  ];
}
