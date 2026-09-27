// Estatísticas da turma de origem para o diretor de turma: só leitura, com o
// escopo do vínculo decidido no servidor.
import { estatisticasDoDiretor } from "@/application/diretor-visao";
import { executarRota, exigirCapacidade, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirCapacidade("verEstatisticasDasTurmas");
    if (!sessao.ok) return sessao.resposta;
    const busca = new URL(requisicao.url).searchParams;
    const resultado = await estatisticasDoDiretor(sessao.usuario, {
      turmaId: busca.get("turmaId") ?? "",
      de: busca.get("de") ?? "",
      ate: busca.get("ate") ?? "",
    });
    return json(resultado);
  });
}
