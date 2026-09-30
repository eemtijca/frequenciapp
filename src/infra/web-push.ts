// Envio Web Push com VAPID, tempo máximo de conexão e tratamento
// de assinaturas expiradas sem registrar endpoints nem chaves em logs.
import { createECDH, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { ambiente } from "@/infra/ambiente";
import {
  endpointPushValido,
  type AssinaturaDeDispositivo,
  type MensagemPush,
} from "@/domain/notificacoes";

export function pushConfigurado(): boolean {
  return Boolean(ambiente.push.publicKey && ambiente.push.privateKey && ambiente.push.subject);
}

export function segredoDaAgendaConfere(cabecalho: string | null): boolean {
  const segredo = ambiente.push.cronSecret;
  if (!segredo || !cabecalho) return false;
  const recebido = Buffer.from(cabecalho);
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** A chave pública precisa corresponder à privada antes de qualquer envio. */
export function conferirParVapid(): void {
  const { publicKey, privateKey } = ambiente.push;
  if (!publicKey || !privateKey) throw new Error("Notificações não configuradas.");
  const par = createECDH("prime256v1");
  par.setPrivateKey(Buffer.from(privateKey, "base64url"));
  if (par.getPublicKey().toString("base64url") !== publicKey) {
    throw new Error("As chaves VAPID precisam pertencer ao mesmo par.");
  }
}

export async function enviarPush(
  assinatura: AssinaturaDeDispositivo,
  mensagem: MensagemPush,
): Promise<"enviada" | "expirada" | "falha"> {
  const { publicKey, privateKey, subject } = ambiente.push;
  if (!publicKey || !privateKey || !subject || !endpointPushValido(assinatura.endpoint))
    return "falha";
  try {
    conferirParVapid();
    await webpush.sendNotification(assinatura, JSON.stringify(mensagem), {
      vapidDetails: { publicKey, privateKey, subject },
      TTL: 3600,
      urgency: "normal",
      timeout: 8000,
    });
    return "enviada";
  } catch (erro) {
    if (
      erro instanceof webpush.WebPushError &&
      (erro.statusCode === 404 || erro.statusCode === 410)
    ) {
      return "expirada";
    }
    return "falha";
  }
}
