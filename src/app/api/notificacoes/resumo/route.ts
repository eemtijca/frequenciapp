// Envio diário autenticado pelo segredo da agenda, sem acesso por cookie
// e sem permitir que o chamador escolha contas, turmas ou datas.
import { enviarResumosDiarios } from "@/application/notificacoes";
import { erroApi, executarRota, json } from "@/infra/http";
import { segredoDaAgendaConfere } from "@/infra/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!segredoDaAgendaConfere(requisicao.headers.get("authorization"))) {
      return erroApi("Acesso não permitido.", 403);
    }
    const resultado = await enviarResumosDiarios();
    return json(resultado, resultado.falhas > 0 ? 503 : 200);
  });
}
