// Cliente da base de feriados. O token fica no servidor e não entra em log nem em URL.
import { z } from "zod";
import {
  reunirFeriadosExternos,
  type AbrangenciaFeriados,
  type FeriadoExterno,
} from "@/domain/feriados-externos";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";

const LIMITE = 100;
const MAXIMO_PAGINAS = 50;
const TEMPO_MS = 10_000;

const esquemaPagina = z.object({
  feriados: z.array(
    z.object({
      data: z.string(),
      nome: z.string(),
    }),
  ),
  meta: z
    .object({
      total: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

/** O município inclui estaduais e nacionais; a UF inclui os nacionais. */
export function abrangenciaFeriados(): AbrangenciaFeriados {
  if (ambiente.feriados.ibge) return "municipais";
  if (ambiente.feriados.uf) return "estaduais";
  return "nacionais";
}

/** Sem token a sincronização fica desligada, sem impedir o restante do aplicativo. */
export function consultaFeriadosConfigurada(): boolean {
  return Boolean(ambiente.feriados.token);
}

function configuracao(): { url: string; token: string; uf?: string; ibge?: string } {
  const { url, token, uf, ibge } = ambiente.feriados;
  if (!token) {
    throw new ErroHttp(
      "A consulta de feriados não está configurada.",
      503,
      "FERIADOS_CONFIGURACAO",
    );
  }
  return { url, token, uf, ibge };
}

function endereco(base: string, ano: number, pagina: number, uf?: string, ibge?: string): URL {
  const caminho = ibge
    ? `/api/v1/feriados/cidade/${encodeURIComponent(ibge)}`
    : uf
      ? `/api/v1/feriados/estado/${encodeURIComponent(uf)}`
      : "/api/v1/feriados/nacionais";
  const url = new URL(caminho, base);
  url.searchParams.set("ano", String(ano));
  url.searchParams.set("page", String(pagina));
  url.searchParams.set("limit", String(LIMITE));
  url.searchParams.set("facultativos", "false");
  return url;
}

function erroTemporario(): ErroHttp {
  return new ErroHttp(
    "Não foi possível consultar os feriados agora. Tente novamente.",
    503,
    "FERIADOS_TEMPORARIO",
  );
}

function erroDeChave(): ErroHttp {
  return new ErroHttp(
    "A chave da base de feriados foi recusada. Confira o token da integração.",
    503,
    "FERIADOS_CHAVE",
  );
}

function erroDeRecusa(): ErroHttp {
  return new ErroHttp(
    "A base de feriados recusou a consulta. Confira o plano da integração.",
    503,
    "FERIADOS_PLANO",
  );
}

const LIMITE_MOTIVO = 200;

/** Motivo curto devolvido pela base, com o token redigido, para o log do servidor. */
function motivoDaResposta(corpo: unknown, token: string): string {
  if (typeof corpo !== "object" || corpo === null) return "";
  const dados = corpo as Record<string, unknown>;
  const partes = [dados.error, dados.message].filter(
    (valor): valor is string => typeof valor === "string" && valor.trim().length > 0,
  );
  if (partes.length === 0) return "";
  const texto = partes.join(" - ").replace(/\s+/g, " ").trim();
  const redigido = token ? texto.split(token).join("***") : texto;
  return redigido.slice(0, LIMITE_MOTIVO);
}

async function pedirPagina(url: URL, token: string): Promise<z.infer<typeof esquemaPagina>> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch {
    console.error("[feriados-api] sem resposta");
    throw erroTemporario();
  }
  if (resposta.status === 0 || (resposta.status >= 300 && resposta.status < 400)) {
    console.error(`[feriados-api] HTTP ${resposta.status}`);
    throw erroTemporario();
  }
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const motivo = motivoDaResposta(corpo, token);
    console.error(`[feriados-api] HTTP ${resposta.status}${motivo ? `: ${motivo}` : ""}`);
    if (resposta.status === 401) throw erroDeChave();
    if (resposta.status === 403) throw erroDeRecusa();
    throw erroTemporario();
  }
  const dados = esquemaPagina.safeParse(corpo);
  if (!dados.success) {
    console.error("[feriados-api] resposta inesperada");
    throw erroTemporario();
  }
  return dados.data;
}

/** Lê todas as páginas do ano. Não grava e não devolve o token. */
export async function buscarFeriadosDoAno(ano: number): Promise<FeriadoExterno[]> {
  const origem = configuracao();
  const bruto: { data: string; nome: string }[] = [];
  let total: number | undefined;
  for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina += 1) {
    const url = endereco(origem.url, ano, pagina, origem.uf, origem.ibge);
    const dados = await pedirPagina(url, origem.token);
    if (total === undefined && dados.meta?.total !== undefined) total = dados.meta.total;
    bruto.push(...dados.feriados);
    const paginaCurta = dados.feriados.length < LIMITE;
    const totalAtingido = total !== undefined && bruto.length >= total;
    if (dados.feriados.length === 0 || paginaCurta || totalAtingido) break;
    if (pagina === MAXIMO_PAGINAS) {
      console.error("[feriados-api] paginação incompleta");
      throw erroTemporario();
    }
  }
  if (total !== undefined && bruto.length < total) {
    console.error("[feriados-api] paginação incompleta");
    throw erroTemporario();
  }
  const reunidos = reunirFeriadosExternos(bruto, ano);
  if (reunidos.ignorados > 0) {
    console.error(`[feriados-api] itens ignorados: ${reunidos.ignorados}`);
  }
  return reunidos.feriados;
}
