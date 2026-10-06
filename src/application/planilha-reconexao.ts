// Renova a autorização da planilha existente sem apagar vínculos ou preferências.
// O estado assinado identifica a conexão para recusar retornos de uma configuração antiga.
import { createHash } from "node:crypto";
import { ErroHttp } from "@/infra/erros";
import { renovarAcesso } from "@/infra/google-oauth";
import { lerPlanilhaEscolhida } from "@/infra/google-planilhas";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import {
  idDaIntegracao,
  lerLinha,
  type FinalidadeIntegracao,
  type LinhaIntegracao,
} from "./planilha-comum";

type Conexao = Pick<LinhaIntegracao, "googlePlanilhaId" | "googleRefreshToken">;

function identificar(finalidade: FinalidadeIntegracao, linha: Conexao): string {
  return createHash("sha256")
    .update(JSON.stringify([finalidade, linha.googlePlanilhaId, linha.googleRefreshToken]))
    .digest("hex");
}

export async function iniciarReconexaoGoogle(finalidade: FinalidadeIntegracao) {
  const linha = await lerLinha(finalidade);
  if (!linha.googlePlanilhaId || !linha.googleRefreshToken) {
    throw new ErroHttp("Conecte a conta Google e escolha a planilha primeiro.", 400);
  }
  return { vinculo: identificar(finalidade, linha) };
}

function conferirVinculo(finalidade: FinalidadeIntegracao, linha: Conexao | null, vinculo: string) {
  if (!linha?.googlePlanilhaId || identificar(finalidade, linha) !== vinculo) {
    throw new ErroHttp("A conexão da planilha mudou. Inicie a reconexão novamente.", 409);
  }
  return linha.googlePlanilhaId;
}

export async function concluirReconexaoGoogle(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  vinculo: string,
  tokenCifrado: string,
): Promise<void> {
  const linha = await lerLinha(finalidade);
  const planilhaId = conferirVinculo(finalidade, linha, vinculo);
  const planilha = await lerPlanilhaEscolhida(planilhaId, await renovarAcesso(tokenCifrado));
  if (planilha.spreadsheetId !== planilhaId) {
    throw new ErroHttp("Não foi possível confirmar o acesso à planilha existente.", 409);
  }

  // A leitura externa não se repete dentro da transação. Qualquer troca de
  // arquivo, conta ou desconexão durante o OAuth invalida esta confirmação.
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    const atual = await tx.integracaoPlanilha.findUnique({ where: { id } });
    conferirVinculo(finalidade, atual, vinculo);
    await tx.integracaoPlanilha.update({
      where: { id },
      data: { googleRefreshToken: tokenCifrado, atualizadoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.google.reconectar", `integracao:${id}`);
  });
}
