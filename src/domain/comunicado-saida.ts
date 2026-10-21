// Comunicado formal de saída com os dados do registro, sem justificativas pessoais.
import { rotuloData } from "./frequencia";

export interface DadosComunicadoSaida {
  nome: string;
  turma: string;
  dia: string;
  horario: string | null;
}

export function gerarComunicadoSaida(dados: DadosComunicadoSaida): string {
  const horario = dados.horario ? `, às ${dados.horario}` : "";
  return [
    "Prezados responsáveis,",
    "",
    `Informamos que a Coordenação Escolar autorizou a saída antecipada de ${dados.nome.trim()}, da turma ${dados.turma.trim()}, em ${rotuloData(dados.dia)}${horario}.`,
    "",
    "Atenciosamente,",
    "Coordenação Escolar",
  ].join("\n");
}
