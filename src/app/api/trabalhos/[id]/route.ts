// Detalhe administrativo de um trabalho, com eventos e sem dado de aluno.
import { lerTrabalho } from "@/application/fila-trabalhos";
import { ehUuid, erroApi, executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function GET(_requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Trabalho inválido.", 400);
    const trabalho = await lerTrabalho(id);
    if (!trabalho) return erroApi("Trabalho não encontrado.", 404);
    return json({ trabalho });
  });
}
