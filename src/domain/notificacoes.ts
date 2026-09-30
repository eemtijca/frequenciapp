// Regras puras das notificações: provedores aceitos, chaves da assinatura
// e mensagens sem dados individuais de estudantes.
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

export const MENSAGEM_TESTE: MensagemPush = {
  titulo: "FrequenciApp",
  corpo: "Notificações ativadas neste dispositivo.",
  etiqueta: "teste-notificacoes",
};
