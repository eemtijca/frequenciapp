// Hash de senha compartilhado pelos scripts administrativos, no mesmo
// formato versionado do aplicativo: scrypt$N$r$p$sal_hex$chave_hex.
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

const scryptAssincrono = promisify(scrypt);
const CUSTO = 16384;
const BLOCO = 8;
const PARALELISMO = 1;
const TAMANHO = 64;

export async function hashear(senha) {
  const sal = randomBytes(16);
  const chave = await scryptAssincrono(senha, sal, TAMANHO, {
    N: CUSTO,
    r: BLOCO,
    p: PARALELISMO,
  });
  return `scrypt$${CUSTO}$${BLOCO}$${PARALELISMO}$${sal.toString("hex")}$${chave.toString("hex")}`;
}

/** Mesma política do aplicativo: 8 caracteres, uma letra e um número. */
export function senhaValida(senha) {
  return senha.length >= 8 && /[a-zA-ZÀ-ÿ]/.test(senha) && /[0-9]/.test(senha);
}
