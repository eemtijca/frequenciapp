// Cliente HTTP do Apps Script. Segue o redirecionamento do Content Service,
// limita o tempo, repete apenas falha de rede e nunca registra o token.
import { ErroHttp } from "@/infra/erros";

const TEMPO_LIMITE_MS = 60_000;
const TENTATIVAS = 3;

interface Envelope<T> {
  ok: boolean;
  erro?: string;
  /** Mensagem original da exceção no script, sem segredos; nunca vai à tela. */
  detalhe?: string;
  /** Exceção no meio de uma ação que altera a planilha: parte pode ter sido aplicada. */
  parcial?: boolean;
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
  /** Tempo máximo da chamada, abaixo do limite da função do servidor. */
  tempoLimiteMs?: number;
}

/** Falha de script (recusa) contra falha de rede (pode ter aplicado parte). */
export class ErroGas extends ErroHttp {
  recusado: boolean;
  /** Diagnóstico técnico do script, para registro e log; nunca vai à tela. */
  detalhe: string | null;

  constructor(mensagem: string, recusado: boolean, detalhe: string | null = null) {
    super(mensagem, 502);
    this.name = "ErroGas";
    this.recusado = recusado;
    this.detalhe = detalhe;
  }
}

/** Texto para o registro de sincronização: frase e detalhe, no limite da coluna. */
export function mensagemParaRegistro(erro: unknown, padrao: string): string {
  if (!(erro instanceof ErroHttp)) return padrao;
  const motivo = (erro as { detalhe?: unknown }).detalhe;
  const detalhe = typeof motivo === "string" && motivo ? ` Detalhe: ${motivo}` : "";
  return `${erro.message}${detalhe}`.slice(0, 300);
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
        signal: AbortSignal.timeout(opcoes.tempoLimiteMs ?? TEMPO_LIMITE_MS),
      });
      if (!resposta.ok) {
        throw new ErroGas("A planilha respondeu com erro. Confira a publicação do script.", false);
      }
      const texto = await resposta.text();
      let envelope: Envelope<T>;
      try {
        envelope = JSON.parse(texto) as Envelope<T>;
      } catch {
        throw new ErroGas("O script da planilha respondeu em formato inesperado.", true);
      }
      if (!envelope.ok || envelope.dados === undefined) {
        const detalhe = typeof envelope.detalhe === "string" ? envelope.detalhe : null;
        if (detalhe) console.error(`Apps Script (${String(corpo.acao)}): ${detalhe}`);
        throw new ErroGas(
          envelope.erro || "O script recusou a operação.",
          envelope.parcial !== true,
          detalhe,
        );
      }
      return envelope.dados;
    } catch (erro) {
      if (erro instanceof ErroHttp) throw erro;
      ultimaFalha = erro;
      if (tentativa < tentativas - 1) await esperar(300 * (tentativa + 1));
    }
  }
  throw new ErroGas(
    ultimaFalha instanceof Error && ultimaFalha.name === "TimeoutError"
      ? "A planilha demorou demais para responder. Tente de novo."
      : "Não foi possível falar com a planilha agora. Tente de novo.",
    false,
  );
}
