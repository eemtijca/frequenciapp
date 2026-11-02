import {
  diaDaSemanaIso,
  diaSeguinte,
  rotuloData,
  rotuloDataCurta,
  rotuloDiaSemana,
} from "@/domain/frequencia";

export function primeiraNavegacao(hoje: string) {
  const aposSair = diaDaSemanaIso(hoje) === 7 ? diaSeguinte(hoje, -1) : hoje;
  return { inicial: hoje, aposSair, anterior: diaSeguinte(aposSair, -1) };
}

export function nomeDoDialogoDaChamada(dia: string) {
  return diaDaSemanaIso(dia) === 7 ? "Resumo da semana" : "Data da chamada";
}

export function expectativaDoSeletor(dia: string, hoje: string) {
  if (diaDaSemanaIso(dia) === 7) {
    const rotulo = `${rotuloDataCurta(diaSeguinte(dia, -6))} a ${rotuloDataCurta(diaSeguinte(dia, -1))}`;
    return { aria: `Resumo da semana: ${rotulo}`, detalhe: "semana", sigla: null, rotulo };
  }
  const nome = rotuloDiaSemana(dia);
  const siglas = ["", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
  const rotulo = rotuloData(dia);
  return {
    aria: `Data da chamada: ${rotulo}, ${nome}${dia === hoje ? ", Hoje" : ""}`,
    detalhe: nome.replace("-feira", ""),
    sigla: siglas[diaDaSemanaIso(dia)] ?? null,
    rotulo,
  };
}
