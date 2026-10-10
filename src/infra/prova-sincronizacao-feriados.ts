// Prova curta para repetir a sincronização de feriados depois da senha do administrador.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";

const VALIDADE_MS = 10 * 60 * 1000;
const USO = "sincronizar-feriados";
const MENSAGEM = "A liberação expirou. Informe a senha do administrador novamente.";

const esquemaProva = z.object({
  uso: z.literal(USO),
  usuarioId: z.uuid(),
  ano: z.number().int(),
  expiraEm: z.number(),
});

function chave(): Buffer {
  return createHash("sha256").update(`sincronizar-feriados:${ambiente.authSecret}`).digest();
}

function assinar(valor: string): string {
  return createHmac("sha256", chave()).update(valor).digest("base64url");
}

function recusar(): never {
  throw new ErroHttp(MENSAGEM, 400);
}

/** Vincula a liberação ao administrador, ao ano e a dez minutos. */
export function emitirProvaSincronizacao(
  usuarioId: string,
  ano: number,
  agora = Date.now(),
): string {
  const dados = Buffer.from(
    JSON.stringify({ uso: USO, usuarioId, ano, expiraEm: agora + VALIDADE_MS }),
  ).toString("base64url");
  return `${dados}.${assinar(dados)}`;
}

/** Confere assinatura, dono, ano e prazo. Não aceita prova de outro administrador. */
export function conferirProvaSincronizacao(
  prova: string,
  usuarioId: string,
  ano: number,
  agora = Date.now(),
): void {
  const ponto = prova.lastIndexOf(".");
  const dados = ponto > 0 ? prova.slice(0, ponto) : "";
  const assinatura = ponto > 0 ? prova.slice(ponto + 1) : "";
  if (!dados || !assinatura) recusar();
  const recebida = Buffer.from(assinatura);
  const esperada = Buffer.from(assinar(dados));
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) recusar();
  let bruto: unknown;
  try {
    bruto = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as unknown;
  } catch {
    recusar();
  }
  const conteudo = esquemaProva.safeParse(bruto);
  if (
    !conteudo.success ||
    conteudo.data.usuarioId !== usuarioId ||
    conteudo.data.ano !== ano ||
    conteudo.data.expiraEm <= agora
  ) {
    recusar();
  }
}
