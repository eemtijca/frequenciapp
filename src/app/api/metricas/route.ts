// Métricas Prometheus do processo, restritas ao coletor interno.
import { timingSafeEqual } from "node:crypto";
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { erroApi } from "@/infra/http";
import { metricas } from "@/infra/metricas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Compara o Bearer recebido com o token configurado em tempo constante. */
function tokenConfere(cabecalho: string | null, esperado: string): boolean {
  if (!cabecalho?.startsWith("Bearer ")) return false;
  const recebido = Buffer.from(cabecalho.slice(7));
  const alvo = Buffer.from(esperado);
  return recebido.length === alvo.length && timingSafeEqual(recebido, alvo);
}

export async function GET(requisicao: Request): Promise<Response> {
  // O bloqueio público fica no proxy; o token autentica a coleta interna.
  const esperado = ambiente.metricasToken;
  if (!esperado) return erroApi("Recurso não encontrado.", 404);
  if (!tokenConfere(requisicao.headers.get("authorization"), esperado)) {
    return erroApi("Acesso não permitido.", 401);
  }

  try {
    // Registra os coletores de banco e fila antes de serializar o registro.
    banco();
    const { registro } = metricas();
    return new Response(await registro.metrics(), {
      status: 200,
      headers: {
        "Content-Type": registro.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return erroApi("As métricas não puderam ser coletadas.", 503);
  }
}
