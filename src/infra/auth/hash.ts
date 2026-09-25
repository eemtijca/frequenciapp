// Hash de senha com scrypt (nativo do Node, sem dependência externa).
// Formato armazenado: scrypt$N$r$p$sal_em_hex$hash_em_hex.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const CUSTO = 16384;
const BLOCO = 8;
const PARALELISMO = 1;
const TAMANHO_CHAVE = 64;

const PARAMETROS: ScryptOptions = { N: CUSTO, r: BLOCO, p: PARALELISMO };

function scryptAssincrono(
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha, sal, tamanho, opcoes, (erro, chave) => {
      if (erro) rejeitar(erro);
      else resolver(chave);
    });
  });
}

export async function hashearSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scryptAssincrono(senha, sal, TAMANHO_CHAVE, PARAMETROS);
  return `scrypt$${CUSTO}$${BLOCO}$${PARALELISMO}$${sal.toString("hex")}$${chave.toString("hex")}`;
}

/** Compara senha candidata com hash armazenado em tempo constante. */
export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  const partes = hash.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const custo = Number(partes[1]);
  const bloco = Number(partes[2]);
  const paralelismo = Number(partes[3]);
  const salHex = partes[4];
  const hashHex = partes[5];
  if (
    !Number.isInteger(custo) ||
    !Number.isInteger(bloco) ||
    !Number.isInteger(paralelismo) ||
    custo < 1024 ||
    custo > 1048576 ||
    bloco < 1 ||
    bloco > 32 ||
    paralelismo < 1 ||
    paralelismo > 16 ||
    salHex === undefined ||
    hashHex === undefined
  ) {
    return false;
  }
  const sal = Buffer.from(salHex, "hex");
  const esperado = Buffer.from(hashHex, "hex");
  if (sal.length < 8 || esperado.length < 32 || esperado.length > 128) return false;
  try {
    const chave = await scryptAssincrono(senha, sal, esperado.length, {
      N: custo,
      r: bloco,
      p: paralelismo,
    });
    return chave.length === esperado.length && timingSafeEqual(chave, esperado);
  } catch {
    return false;
  }
}
