// O período salvo acompanha a data inserida, independentemente do relógio do navegador.
import { personalizacaoVaziaBi } from "@/domain/bi-personalizacao";

export function fixtureBi(dia: string) {
  const personalizacao = personalizacaoVaziaBi();
  personalizacao.preferencias.filtros.inicio = dia;
  personalizacao.preferencias.filtros.fim = dia;
  return { dia, personalizacao };
}
