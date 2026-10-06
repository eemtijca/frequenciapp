// Conclui OAuth, guarda o token cifrado e devolve o navegador ao aplicativo.
import { cookies } from "next/headers";
import { Prisma } from "../../../../../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ambiente } from "@/infra/ambiente";
import { cifrarToken, conferirEstado, trocarCodigo } from "@/infra/google-oauth";
import { exigirAdmin } from "@/infra/http";
import { idDaIntegracao } from "@/application/planilha-comum";
import { concluirReconexaoGoogle } from "@/application/planilha-reconexao";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  const destino = new URL("/?visao=gestao", ambiente.google.redirectUri ?? requisicao.url);
  const armazem = await cookies();
  const cookie = armazem.get("frequenciapp_google_estado")?.value;
  armazem.delete("frequenciapp_google_estado");
  let reconectando = false;
  try {
    const sessao = await exigirAdmin();
    if (!sessao.ok) {
      if (sessao.resposta.status === 403) return sessao.resposta;
      destino.searchParams.set("google", "sessao");
      return Response.redirect(destino);
    }
    const parametros = new URL(requisicao.url).searchParams;
    const state = parametros.get("state");
    if (!state) throw new Error("Resposta OAuth incompleta.");
    const { verifier, finalidade, reconexao } = conferirEstado(cookie, state, sessao.usuario.id);
    reconectando = Boolean(reconexao);
    destino.searchParams.set("googleFinalidade", finalidade);
    if (reconexao?.mes) destino.searchParams.set("googleMes", reconexao.mes);
    if (parametros.get("error")) {
      destino.searchParams.set("google", "cancelado");
      return Response.redirect(destino);
    }
    const codigo = parametros.get("code");
    if (!codigo) throw new Error("Resposta OAuth incompleta.");
    const refreshToken = await trocarCodigo(codigo, verifier);
    const tokenCifrado = cifrarToken(refreshToken);
    if (reconexao) {
      await concluirReconexaoGoogle(sessao.usuario, finalidade, reconexao.vinculo, tokenCifrado);
      destino.searchParams.set("google", "reconectado");
      return Response.redirect(destino);
    }
    const id = idDaIntegracao(finalidade);
    const anterior = await banco().integracaoPlanilha.findUnique({
      where: { id },
      select: { googlePlanilhaId: true },
    });
    await comTransacao(async (tx) => {
      await tx.integracaoPlanilha.upsert({
        where: { id },
        update: {
          googleRefreshToken: tokenCifrado,
          atualizadoPorId: sessao.usuario.id,
          ...(anterior?.googlePlanilhaId
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
  } catch {
    destino.searchParams.set("google", reconectando ? "erro_reconexao" : "erro");
  }
  return Response.redirect(destino);
}
