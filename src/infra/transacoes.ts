// Transações ACID com repetição automática. Toda escrita que toca mais
// de uma linha passa por aqui: o PostgreSQL garante atomicidade e
// isolamento, e conflitos de serialização (P2034) são refeitos com
// pequena pausa em vez de falhar na cara do usuário.
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ehConflitoDeSerializacao } from "@/infra/erros";

export type Transacao<T> = (tx: Prisma.TransactionClient) => Promise<T>;

const MAXIMO_TENTATIVAS = 3;
const PAUSA_BASE_MS = 40;

function pausar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Executa a função dentro de uma transação interativa com nível de
 * isolamento Serializable. Em caso de conflito de serialização, tenta
 * de novo (até três vezes) antes de devolver o erro.
 */
export async function comTransacao<T>(operacao: Transacao<T>): Promise<T> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= MAXIMO_TENTATIVAS; tentativa += 1) {
    try {
      return await banco().$transaction(operacao, { isolationLevel: "Serializable" });
    } catch (erro) {
      ultimoErro = erro;
      if (!ehConflitoDeSerializacao(erro)) throw erro;
      if (tentativa < MAXIMO_TENTATIVAS) {
        await pausar(PAUSA_BASE_MS * tentativa);
      }
    }
  }
  throw ultimoErro;
}

/** Transação de leitura consistente para consultas compostas. */
export async function comLeitura<T>(consulta: Transacao<T>): Promise<T> {
  return banco().$transaction(consulta, { isolationLevel: "Serializable" });
}
