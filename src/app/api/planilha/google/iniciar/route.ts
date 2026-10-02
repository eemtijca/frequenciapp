// Inicia OAuth da planilha de frequência para um administrador autenticado.
import { cookies } from "next/headers";
import { z } from "zod";
import { ambiente } from "@/infra/ambiente";
import { iniciarAutorizacao } from "@/infra/google-oauth";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const entrada = z
      .object({ finalidade: z.enum(["FREQUENCIA", "SAIDAS", "PARCIAL"]).default("FREQUENCIA") })
      .safeParse(await corpoJson(requisicao));
    if (!entrada.success) return erroApi("Finalidade da planilha inválida.", 400);
    const pedido = iniciarAutorizacao(sessao.usuario.id, entrada.data.finalidade);
    (await cookies()).set("frequenciapp_google_estado", pedido.cookie, {
      httpOnly: true,
      secure: ambiente.cookiesSeguros,
      sameSite: "lax",
      path: "/api/planilha/google",
      maxAge: 600,
    });
    return json({ url: pedido.url });
  });
}
