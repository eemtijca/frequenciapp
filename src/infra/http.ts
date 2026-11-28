// Auxiliares das rotas: resposta JSON sem cache, guardas por capacidade,
// defesa CSRF, leitura limitada do corpo e tradução de qualquer exceção.
import { headers } from "next/headers";
import { ambiente } from "@/infra/ambiente";
import { identidadeAtual } from "@/application/sessao";
import { ErroHttp, traduzirErro } from "@/infra/erros";
import { observarRequisicao, requisicaoFinalizada, requisicaoIniciada } from "@/infra/metricas";
import { metodoDeMetrica, rotaDeMetrica } from "@/infra/metricas-rota";
import { temCapacidade, type Capacidade, type Identidade } from "@/domain/usuarios";

const LIMITE_DE_CORPO = 200_000;
const ROTA_DESCONHECIDA = "desconhecida";
const ROTA_DE_METRICAS = "/api/metricas";

interface ContextoDeRequisicao {
  method: string;
  route: string;
}

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
  const contexto = await contextoDaRequisicao();
  const instrumentar = contexto.route !== ROTA_DE_METRICAS;
  const inicio = performance.now();
  let status = 500;
  if (instrumentar) comFalhaSilenciosa(requisicaoIniciada);
  try {
    const resposta = await manipulador();
    status = resposta.status;
    return resposta;
  } catch (erro) {
    const traduzido = traduzirErro(erro);
    status = traduzido.status;
    const extra = erro instanceof ErroHttp && erro.codigo ? { codigo: erro.codigo } : undefined;
    return erroApi(traduzido.mensagem, status, extra);
  } finally {
    if (instrumentar) {
      const duracaoSegundos = (performance.now() - inicio) / 1000;
      comFalhaSilenciosa(requisicaoFinalizada);
      comFalhaSilenciosa(() => observarRequisicao(contexto, status, duracaoSegundos));
    }
  }
}

/**
 * O proxy grava os cabeçalhos, mas o valor passa outra vez pelo registro antes
 * de virar label: nem um cabeçalho forjado leva caminho livre para a métrica.
 * Fora de um contexto de requisição, a leitura falha e devolve o rótulo neutro.
 */
async function contextoDaRequisicao(): Promise<ContextoDeRequisicao> {
  try {
    const cabecalhos = await headers();
    const rota = cabecalhos.get("x-frequenciapp-rota");
    return {
      method: metodoDeMetrica(cabecalhos.get("x-frequenciapp-metodo")),
      route: rota ? rotaDeMetrica(rota) : ROTA_DESCONHECIDA,
    };
  } catch {
    return { method: metodoDeMetrica(undefined), route: ROTA_DESCONHECIDA };
  }
}

/** A métrica é acessória: qualquer falha é ignorada para preservar a resposta. */
function comFalhaSilenciosa(acao: () => void): void {
  try {
    acao();
  } catch {
    // Métrica nunca derruba a rota.
  }
}

type Guarda = { ok: true; usuario: Identidade } | { ok: false; resposta: Response };

/** Recusa por capacidade: a mensagem diz o que falta, sem expor o papel. */
const RECUSA_POR_CAPACIDADE: Record<Capacidade, string> = {
  operar: "Seu acesso não permite esta operação.",
  consultar: "Seu acesso não permite consultar estes dados.",
  administrar: "Apenas o administrador pode fazer esta operação.",
  alterarPropriaSenha: "Seu acesso não permite trocar a senha por aqui.",
  verEstatisticasDasTurmas: "Seu acesso não permite ver estas estatísticas.",
  receberNotificacoes: "O acesso não permite configurar notificações.",
};

/**
 * Exige sessão ativa com a capacidade pedida. É a única porta das rotas:
 * papel sem a capacidade recebe 403, mesmo com sessão válida.
 */
export async function exigirCapacidade(capacidade: Capacidade): Promise<Guarda> {
  const usuario = await identidadeAtual(ambiente.authSecret);
  if (!usuario) {
    return { ok: false, resposta: erroApi("Sua sessão expirou. Entre novamente.", 401) };
  }
  if (!temCapacidade(usuario.papel, capacidade)) {
    return { ok: false, resposta: erroApi(RECUSA_POR_CAPACIDADE[capacidade], 403) };
  }
  return { ok: true, usuario };
}

/**
 * Exige sessão da operação escolar: chamada, saídas, relatórios e envio à
 * planilha. Um papel novo só passa aqui se receber a capacidade "operar".
 */
export async function exigirSessao(): Promise<Guarda> {
  return exigirCapacidade("operar");
}

/** Exige sessão ativa, sem decidir a capacidade. A rota escolhe o acesso em seguida. */
export async function exigirIdentidade(): Promise<Guarda> {
  const usuario = await identidadeAtual(ambiente.authSecret);
  if (!usuario) {
    return { ok: false, resposta: erroApi("Sua sessão expirou. Entre novamente.", 401) };
  }
  return { ok: true, usuario };
}

/** Exige sessão ativa de administrador (acesso root de configuração). */
export async function exigirAdmin(): Promise<Guarda> {
  return exigirCapacidade("administrar");
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
export function corpoJson(requisicao: Request): Promise<unknown> {
  return corpoJsonComLimite(requisicao, LIMITE_DE_CORPO);
}

/** Corpo JSON com limite próprio, para rotas de importação de cópia. */
export async function corpoJsonComLimite(requisicao: Request, limite: number): Promise<unknown> {
  if (!requisicao.body) return null;
  const leitor = requisicao.body.getReader();
  const decodificador = new TextDecoder();
  const partes: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limite) {
        // A falha de cancelamento não pode esconder a recusa por tamanho.
        await leitor.cancel().catch(() => undefined);
        throw new ErroHttp("O conteúdo enviado é grande demais para processar.", 413);
      }
      partes.push(decodificador.decode(value, { stream: true }));
    }
    partes.push(decodificador.decode());
  } finally {
    leitor.releaseLock();
  }
  const texto = partes.join("");
  if (!texto) return null;
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

/**
 * IP do cliente para limitadores. Usa o último item de x-forwarded-for, o
 * único escrito pelo proxy diante do aplicativo: os anteriores vêm do
 * cliente, que os inventaria para zerar o limite. Sem o cabeçalho, usa
 * x-real-ip ou devolve "local" para não misturar origens desconhecidas.
 */
export function ipDoPedido(requisicao: Request): string {
  const encaminhado = requisicao.headers.get("x-forwarded-for");
  const ultimo = encaminhado?.split(",").at(-1)?.trim();
  if (ultimo) return ultimo;
  return requisicao.headers.get("x-real-ip")?.trim() || "local";
}
