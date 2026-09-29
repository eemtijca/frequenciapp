// Conclui OAuth, guarda o token cifrado e devolve o navegador ao aplicativo.
import { cookies } from "next/headers";
import { Prisma } from "../../../../../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ambiente } from "@/infra/ambiente";
import { cifrarToken, conferirEstado, trocarCodigo } from "@/infra/google-oauth";
import { exigirAdmin } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  const destino = new URL("/?visao=gestao", ambiente.google.redirectUri ?? requisicao.url);
  const armazem = await cookies();
  const cookie = armazem.get("frequenciapp_google_estado")?.value;
  armazem.delete("frequenciapp_google_estado");
  try {
    const sessao = await exigirAdmin();
    if (!sessao.ok) {
      if (sessao.resposta.status === 403) return sessao.resposta;
      destino.searchParams.set("google", "sessao");
      return Response.redirect(destino);
    }
    const parametros = new URL(requisicao.url).searchParams;
    if (parametros.get("error")) {
      destino.searchParams.set("google", "cancelado");
      return Response.redirect(destino);
    }
    const codigo = parametros.get("code");
    const state = parametros.get("state");
    if (!codigo || !state) throw new Error("Resposta OAuth incompleta.");
    const { verifier, finalidade } = conferirEstado(cookie, state, sessao.usuario.id);
    const refreshToken = await trocarCodigo(codigo, verifier);
    const id = finalidade === "SAIDAS" ? "saidas" : "principal";
    const anterior = await banco().integracaoPlanilha.findUnique({
      where: { id },
      select: { provedor: true },
    });
    const tokenCifrado = cifrarToken(refreshToken);
    await comTransacao(async (tx) => {
      await tx.integracaoPlanilha.upsert({
        where: { id },
        update: {
          googleRefreshToken: tokenCifrado,
          atualizadoPorId: sessao.usuario.id,
          ...(anterior?.provedor === "GOOGLE"
            ? {
                ativa: false,
                googlePlanilhaId: null,
                googlePlanilhaNome: null,
                esquema: Prisma.DbNull,
                assinaturaEsquema: null,
                esquemaEm: null,
              }
            : {}),
        },
        create: {
          id,
          finalidade,
          googleRefreshToken: tokenCifrado,
          atualizadoPorId: sessao.usuario.id,
        },
      });
      await auditar(tx, sessao.usuario.id, "planilha.google.conectar", `integracao:${id}`);
    });
    destino.searchParams.set("google", "conectado");
    destino.searchParams.set("googleFinalidade", finalidade);
  } catch {
    destino.searchParams.set("google", "erro");
  }
  return Response.redirect(destino);
}
