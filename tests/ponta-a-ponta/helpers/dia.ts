// Dia de referência dos testes de ponta a ponta. Aos domingos a abertura mostra
// o resumo da semana; quem segue até a chamada usa o sábado anterior.
import { diaLocal, ehDomingo, ultimoDiaDeChamada } from "@/domain/frequencia";

/** Dia civil corrente no fuso da escola. */
export function diaCorrente(): string {
  return diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
}

/** Último dia com chamada. No domingo é o sábado, depois de sair do resumo. */
export function diaDeChamada(): string {
  return ultimoDiaDeChamada(diaCorrente());
}

/** Verdadeiro quando a execução cai no domingo, dia sem chamada. */
export function hojeEDomingo(): boolean {
  return ehDomingo(diaCorrente());
}

/** Título do resumo do dia na chamada, conforme o dia em foco seja hoje ou não. */
export function tituloResumoDoDia(): string {
  return diaDeChamada() === diaCorrente() ? "Resumo de hoje" : "Resumo do dia";
}
