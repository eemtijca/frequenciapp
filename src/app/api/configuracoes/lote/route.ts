// Gravação atômica do rascunho de configurações, com revisão otimista por seção.
import { salvarConfiguracoesCompletas } from "@/application/configuracoes-completo";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const resultado = await salvarConfiguracoesCompletas(
      sessao.usuario,
      await corpoJson(requisicao),
    );
    return json(resultado);
  });
}
