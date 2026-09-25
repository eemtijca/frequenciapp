// Cliente HTTP do navegador: erros em português, sem cache e com
// sinalização de sessão expirada para o fluxo de reentrada.

export class ErroApi extends Error {
  status: number;
  conflito: boolean;
  corpo?: unknown;

  constructor(mensagem: string, status: number, conflito = false, corpo?: unknown) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    this.conflito = conflito;
    this.corpo = corpo;
  }
}

export async function pedir<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(caminho, { ...opcoes, cache: "no-store" });
  let dados: Record<string, unknown> = {};
  try {
    dados = (await resposta.json()) as Record<string, unknown>;
  } catch {
    dados = {};
  }
  if (!resposta.ok) {
    if (resposta.status === 401 && typeof window !== "undefined") {
      // O shell escuta e devolve a pessoa para a tela de entrada.
      window.dispatchEvent(new CustomEvent("sessao-expirada"));
    }
    const mensagem =
      typeof dados.error === "string" ? dados.error : "Não foi possível concluir a operação.";
    const conflito = dados.conflito === true;
    throw new ErroApi(mensagem, resposta.status, conflito, dados);
  }
  return dados as T;
}

export function corpoJson(dados: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  };
}

export function corpoAlteracao(metodo: "PATCH" | "DELETE", dados?: unknown): RequestInit {
  if (metodo === "DELETE") return { method: "DELETE" };
  return {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  };
}
