// Auxiliares comuns das rotas de API: resposta JSON sem cache, guarda
// de sessão e de papel, verificação de origem contra CSRF, leitura
// limitada do corpo e executor que traduz qualquer exceção.
import { ambiente } from "@/infra/ambiente";
import { identidadeAtual } from "@/application/sessao";
import { ErroHttp, traduzirErro } from "@/infra/erros";
import type { Identidade, Papel } from "@/domain/usuarios";

const LIMITE_DE_CORPO = 200_000;

export function json(dados: unknown, status = 200): Response {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export function erroApi(
  mensagem: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return json({ error: mensagem, ...extra }, status);
}

/**
 * Envolve o corpo de uma rota: exceções conhecidas viram respostas
 * claras em português; desconhecidas viram mensagem genérica com
 * detalhes registrados apenas no log do servidor.
 */
export async function executarRota(manipulador: () => Promise<Response>): Promise<Response> {
  try {
    return await manipulador();
  } catch (erro) {
    const { mensagem, status } = traduzirErro(erro);
    return erroApi(mensagem, status);
  }
}

/** Exige sessão ativa; devolve a identidade ou resposta de erro. */
export async function exigirSessao(): Promise<
  { ok: true; usuario: Identidade } | { ok: false; resposta: Response }
> {
  const usuario = await identidadeAtual(ambiente.authSecret);
  if (!usuario) {
    return { ok: false, resposta: erroApi("Sua sessão expirou. Entre novamente.", 401) };
  }
  return { ok: true, usuario };
}

/** Exige sessão ativa de administrador (acesso root de configuração). */
export async function exigirAdmin(): Promise<
  { ok: true; usuario: Identidade } | { ok: false; resposta: Response }
> {
  const sessao = await exigirSessao();
  if (!sessao.ok) return sessao;
  if (sessao.usuario.papel !== "ADMIN") {
    return {
      ok: false,
      resposta: erroApi("Apenas o administrador pode fazer esta operação.", 403),
    };
  }
  return sessao;
}

/** Papel exigido por uma rota, para guardas mais declarativas. */
export async function exigirPapel(
  papel: Papel,
): Promise<{ ok: true; usuario: Identidade } | { ok: false; resposta: Response }> {
  return papel === "ADMIN" ? exigirAdmin() : exigirSessao();
}

/**
 * Verifica a origem de mutações: quando o navegador envia Origin,
 * o host precisa coincidir com o destino. Combinada com cookies
 * SameSite=Lax, bloqueia envios de outros sites.
 */
export function origemPermitida(requisicao: Request): boolean {
  const cabecalhoOrigem = requisicao.headers.get("origin");
  if (!cabecalhoOrigem) return true;
  try {
    const destino = new URL(requisicao.url);
    const origem = new URL(cabecalhoOrigem);
    const hostPublico =
      requisicao.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
      requisicao.headers.get("host")?.trim() ??
      destino.host;
    return hostPublico.toLowerCase() === origem.host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Corpo JSON da requisição. Corpo vazio devolve null; JSON inválido ou
 * grande demais devolve erro claro em vez de falha silenciosa.
 */
export async function corpoJson(requisicao: Request): Promise<unknown> {
  const texto = await requisicao.text();
  if (!texto) return null;
  if (texto.length > LIMITE_DE_CORPO) {
    throw new ErroHttp("O conteúdo enviado é grande demais para processar.", 413);
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new ErroHttp("Não foi possível ler os dados enviados. Verifique o formulário.", 400);
  }
}

/** Identificador UUID válido (parâmetros de rota). */
export function ehUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}
