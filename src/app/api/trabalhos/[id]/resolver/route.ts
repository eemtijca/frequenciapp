// Encerra uma conferência de trabalho por decisão explícita da administração.
import { z } from "zod";
import { resolverTrabalho } from "@/application/fila-trabalhos";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

const entrada = z.object({ decisao: z.enum(["concluido", "falhou"]) }).strict();

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function POST(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Trabalho inválido.", 400);
    const dados = entrada.safeParse(await corpoJson(requisicao));
    if (!dados.success) return erroApi("Informe a decisão da conferência.", 400);
    await resolverTrabalho(id, sessao.usuario.id, dados.data.decisao);
    return json({ ok: true });
  });
}
