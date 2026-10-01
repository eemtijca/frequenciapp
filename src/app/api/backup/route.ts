// Cópia de segurança: exportar e importar JSON, restrito à administração.
import { importarCopia } from "@/application/backup";
import {
  corpoJsonComLimite,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

const LIMITE_IMPORTACAO = 25 * 1024 * 1024;

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const resposta = erroApi("Confirme a senha para baixar a cópia de segurança.", 405);
    resposta.headers.set("Allow", "POST");
    return resposta;
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const resultado = await importarCopia(
      sessao.usuario,
      await corpoJsonComLimite(requisicao, LIMITE_IMPORTACAO),
    );
    return json(resultado);
  });
}
