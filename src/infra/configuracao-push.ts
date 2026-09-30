// Configuração VAPID estável por instalação, com derivação separada do
// segredo de autenticação e preferência por chaves explícitas existentes.
import { createECDH, hkdfSync } from "node:crypto";

interface Entrada {
  segredo: string;
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}

function parVapidDoSegredo(segredo: string): { publicKey: string; privateKey: string } {
  const par = createECDH("prime256v1");
  for (let tentativa = 0; tentativa < 256; tentativa += 1) {
    const privada = Buffer.from(
      hkdfSync("sha256", segredo, "frequenciapp:notificacoes:vapid:v1", String(tentativa), 32),
    );
    try {
      par.setPrivateKey(privada);
    } catch {
      // Uma saída fora do intervalo da curva exige outra derivação determinística.
      continue;
    }
    return {
      publicKey: par.getPublicKey().toString("base64url"),
      privateKey: privada.toString("base64url"),
    };
  }
  throw new Error("Não foi possível preparar as chaves das notificações.");
}

export function configuracaoPushDe({ segredo, publicKey, privateKey, subject }: Entrada) {
  const chaves = publicKey && privateKey ? { publicKey, privateKey } : parVapidDoSegredo(segredo);
  return {
    ...chaves,
    subject: subject ?? "https://github.com/eemtijca/frequenciapp",
  };
}
