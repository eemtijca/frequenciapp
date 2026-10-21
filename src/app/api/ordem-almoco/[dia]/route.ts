// Definição da ordem do almoço de um dia da semana inteiro, pela administração.
import { definirOrdemAlmoco } from "@/application/ordem-almoco";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ dia: string }>;
}

export async function PUT(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { dia } = await contexto.params;
    if (!/^[1-6]$/.test(dia)) return erroApi("Informe um dia da semana de segunda a sábado.", 400);
    const ordem = await definirOrdemAlmoco(
      sessao.usuario,
      Number(dia),
      await corpoJson(requisicao),
    );
    return json({ ordem });
  });
}
