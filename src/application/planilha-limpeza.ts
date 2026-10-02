// Prévia e limpeza administrativa das antigas abas de backup da integração.
import { createHmac } from "node:crypto";
import { z } from "zod";
import { lerLinha, chamarIntegracao, type FinalidadeIntegracao } from "./planilha-comum";
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { conferirSenhaDoAdmin } from "./confirmacao-admin";
import { FRASE_MODO_COMPLETO } from "@/domain/planilha";
import { comPausasDeLeituraGoogle } from "@/infra/google-planilhas-limites";

export async function limparCopiasDaPlanilha(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
) {
  return comPausasDeLeituraGoogle(async () => {
    const dados = z
      .object({
        planoHash: z.string().length(64).optional(),
        senha: z.string().min(1).optional(),
        frase: z.string().optional(),
      })
      .safeParse(entrada);
    if (!dados.success) throw new ErroHttp("Confira as cópias antes de remover.", 400);
    if (dados.data.planoHash) {
      if (!dados.data.senha || dados.data.frase?.trim().toUpperCase() !== FRASE_MODO_COMPLETO)
        throw new ErroHttp("Informe a senha e a frase de confirmação.", 400);
      await conferirSenhaDoAdmin(
        admin.id,
        dados.data.senha,
        `planilha:limpar-copias:${finalidade}`,
      );
    }
    const linha = await lerLinha(finalidade);
    if (linha.provedor !== "GOOGLE" && Number(linha.versaoScript ?? 0) < 7)
      throw new ErroHttp(
        "Atualize o Apps Script para a versão 7 e teste a conexão antes de remover as cópias.",
        400,
      );
    const lista = z
      .object({ copias: z.array(z.string().min(1)).max(1000) })
      .safeParse(await chamarIntegracao(linha, { acao: "listarAbasBackup" }));
    if (!lista.success) throw new ErroHttp("Não foi possível conferir as cópias da planilha.", 502);
    const copias = [...new Set(lista.data.copias)].sort();
    const planoHash = createHmac("sha256", ambiente.authSecret)
      .update(
        JSON.stringify([
          finalidade,
          linha.provedor,
          linha.googlePlanilhaId,
          linha.endpoint,
          linha.token,
          linha.googleRefreshToken,
          linha.versaoScript,
          copias,
        ]),
      )
      .digest("hex");
    if (!dados.data.planoHash) return { previa: { copias, planoHash } };
    if (dados.data.planoHash !== planoHash)
      throw new ErroHttp(
        "As cópias ou a conexão mudaram. Confira uma nova prévia antes de remover.",
        409,
      );
    const resultado = await chamarIntegracao<{ removidas: number }>(
      linha,
      { acao: "removerAbasBackup", copias },
      { retentavel: false },
    );
    await auditar(
      banco(),
      admin.id,
      "planilha.removerCopias",
      `finalidade:${finalidade};quantidade:${resultado.removidas}`,
    );
    return { removidas: resultado.removidas };
  });
}
