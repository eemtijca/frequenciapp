// Regras puras das notificações: provedores aceitos, chaves da assinatura
// e mensagens sem dados individuais de estudantes.
import { partesNoFuso, ehHoraValida } from "@/domain/frequencia";
import { temCapacidade, type Papel } from "@/domain/usuarios";

export const TIPOS_NOTIFICACAO = ["resumoDiario", "novasChamadas", "chamadasPendentes"] as const;
export type TipoDeAviso = (typeof TIPOS_NOTIFICACAO)[number];
export type PreferenciasNotificacoes = Record<TipoDeAviso, boolean>;
export interface ConfiguracaoNotificacoes extends PreferenciasNotificacoes {
  horarioResumo: string;
  horarioPendencias: string;
}
export const NOTIFICACOES_PADRAO: ConfiguracaoNotificacoes = {
  resumoDiario: true,
  novasChamadas: true,
  chamadasPendentes: false,
  horarioResumo: "17:00",
  horarioPendencias: "17:00",
};
export const ROTULOS_NOTIFICACAO: Record<TipoDeAviso, string> = {
  resumoDiario: "Resumo diário",
  novasChamadas: "Novas chamadas",
  chamadasPendentes: "Chamadas pendentes",
};
export const DESCRICOES_NOTIFICACAO: Record<TipoDeAviso, string> = {
  resumoDiario: "Um resumo do dia quando há chamada nas turmas acompanhadas.",
  novasChamadas: "Um aviso quando uma nova chamada das turmas acompanhadas é salva.",
  chamadasPendentes:
    "Um aviso diário se ainda há chamadas sem salvar após o horário definido pela Gestão.",
};

export function tiposParaPapel(papel: Papel): readonly TipoDeAviso[] {
  if (!temCapacidade(papel, "receberNotificacoes")) return [];
  return temCapacidade(papel, "verEstatisticasDasTurmas")
    ? ["resumoDiario", "novasChamadas"]
    : ["chamadasPendentes"];
}

export function preferenciasParaPapel(
  papel: Papel,
  salvas?: Partial<PreferenciasNotificacoes> | null,
): PreferenciasNotificacoes {
  const tipos = tiposParaPapel(papel);
  return {
    resumoDiario: tipos.includes("resumoDiario") && (salvas?.resumoDiario ?? true),
    novasChamadas: tipos.includes("novasChamadas") && (salvas?.novasChamadas ?? false),
    chamadasPendentes: tipos.includes("chamadasPendentes") && (salvas?.chamadasPendentes ?? true),
  };
}

/** O horário é um limite inicial; execuções posteriores ainda podem enviar. */
export function horarioDeEnvioAtingido(agora: Date, fuso: string, horario: string): boolean {
  if (!ehHoraValida(horario)) return false;
  const [hora = 0, minuto = 0] = horario.split(":").map(Number);
  return partesNoFuso(agora, fuso).minutos >= hora * 60 + minuto;
}
export function endpointPushValido(valor: string): boolean {
  if (valor.length > 2048 || /[^\x21-\x7e]/.test(valor)) return false;
  try {
    const url = new URL(valor);
    const host = url.hostname;
    const provedor =
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".notify.windows.com");
    return (
      provedor &&
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export interface AssinaturaDeDispositivo {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface MensagemPush {
  titulo: string;
  corpo: string;
  etiqueta: string;
}

export function mensagemDoResumo(dia: string): MensagemPush {
  return {
    titulo: "FrequenciApp",
    corpo: "O acompanhamento de frequência do dia está disponível em Minhas turmas.",
    etiqueta: `resumo-frequencia-${dia}`,
  };
}

export function mensagemDeNovaChamada(dia: string, chamadaId: string): MensagemPush {
  return {
    titulo: "FrequenciApp",
    corpo: "Uma nova chamada das turmas acompanhadas está disponível em Minhas turmas.",
    etiqueta: `nova-chamada-${dia}-${chamadaId}`,
  };
}

export function mensagemDePendencias(dia: string): MensagemPush {
  return {
    titulo: "FrequenciApp",
    corpo: "Ainda existem chamadas pendentes hoje. Confira a Chamada no aplicativo.",
    etiqueta: `chamadas-pendentes-${dia}`,
  };
}

export const MENSAGEM_TESTE: MensagemPush = {
  titulo: "FrequenciApp",
  corpo: "Notificações ativadas neste dispositivo.",
  etiqueta: "teste-notificacoes",
};
