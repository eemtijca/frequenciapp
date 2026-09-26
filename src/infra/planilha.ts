// Cliente HTTP do Apps Script. Segue o redirecionamento do Content Service,
// limita o tempo, repete apenas falha de rede e nunca registra o token.
import { ErroHttp } from "@/infra/erros";

const TEMPO_LIMITE_MS = 60_000;
const TENTATIVAS = 3;

interface Envelope<T> {
  ok: boolean;
  erro?: string;
  versao?: number;
  dados?: T;
}

/** Espera curta entre tentativas. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

export interface OpcoesGas {
  /** Operações destrutivas não são repetidas automaticamente. */
  retentavel?: boolean;
}

/**
 * Chama uma ação do Web App. Erros devolvidos pelo script não são repetidos;
 * falhas de rede tentam de novo com espera crescente.
 */
export async function chamarGas<T>(
  endpoint: string,
  token: string,
  corpo: Record<string, unknown>,
  opcoes: OpcoesGas = {},
): Promise<T> {
  const tentativas = opcoes.retentavel === false ? 1 : TENTATIVAS;
  let ultimaFalha: unknown = null;
  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    try {
      const resposta = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token, versao: 1, ...corpo }),
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (!resposta.ok) {
        throw new ErroHttp("A planilha respondeu com erro. Confira a publicação do script.", 502);
      }
      const texto = await resposta.text();
      let envelope: Envelope<T>;
      try {
        envelope = JSON.parse(texto) as Envelope<T>;
      } catch {
        throw new ErroHttp("O script da planilha respondeu em formato inesperado.", 502);
      }
      if (!envelope.ok || envelope.dados === undefined) {
        throw new ErroHttp(envelope.erro || "O script recusou a operação.", 502);
      }
      return envelope.dados;
    } catch (erro) {
      if (erro instanceof ErroHttp) throw erro;
      ultimaFalha = erro;
      if (tentativa < tentativas - 1) await esperar(300 * (tentativa + 1));
    }
  }
  throw new ErroHttp(
    ultimaFalha instanceof Error && ultimaFalha.name === "TimeoutError"
      ? "A planilha demorou demais para responder. Tente de novo."
      : "Não foi possível falar com a planilha agora. Tente de novo.",
    502,
  );
}
