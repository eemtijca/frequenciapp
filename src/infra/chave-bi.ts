// Segredos de leitura de 256 bits, sem ambiente nem dependência de sessão.
import { createHash, randomBytes } from "node:crypto";
export const hashChaveBi = (segredo: string) => createHash("sha256").update(segredo).digest("hex");
export function novaChaveBi() {
  const segredo = `fbi_${randomBytes(32).toString("base64url")}`;
  return { segredo, segredoHash: hashChaveBi(segredo) };
}
