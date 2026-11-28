// Cálculo da rota. Não grava a ordem nem a posição de quem acompanha o ônibus.
import { calcularRotaDaProva } from "@/application/rota-da-prova";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirIdentidade,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function POST(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirIdentidade();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    return json(await calcularRotaDaProva(sessao.usuario, id, await corpoJson(requisicao)));
  });
}
