// Mantém um Google Docs por arquivo de frequência, com proteção contra criações duplicadas.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ErroHttp } from "@/infra/erros";
import { auditar } from "@/infra/auditoria";
import { comTransacao } from "@/infra/transacoes";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { comTravaPlanilhaFrequencia } from "@/infra/trava-planilha-frequencia";
import { montarIndiceChamadas } from "@/domain/indice-chamadas";
import type { AbaMensalPlanilha } from "@/domain/planilha-mensal";
import { acessoGoogle, esquecerAcessoGoogle } from "@/infra/google/oauth";
import {
  criarDocumentoIndice,
  atualizarDocumentoIndice,
  ErroCriacaoDocumento,
} from "@/infra/google/documentos-indice";
import { chamarIntegracao, lerLinha, type LinhaIntegracao } from "./planilha-comum";
import { listarTodasTurmas } from "./turmas";

const urlDoDocumento = (id: string) => `https://docs.google.com/document/d/${id}/edit`;

export async function consultarIndiceChamadas() {
  const linha = await lerLinha("FREQUENCIA");
  const indice = linha.googlePlanilhaId
    ? await banco().indiceChamada.findUnique({ where: { planilhaId: linha.googlePlanilhaId } })
    : null;
  return {
    url: indice?.documentoId ? urlDoDocumento(indice.documentoId) : null,
    pendente: Boolean(indice && !indice.documentoId),
  };
}

async function atualizar(linha: LinhaIntegracao, recuperarId?: string, criar = false) {
  if (!linha.ativa || !linha.googleRefreshToken || !linha.googlePlanilhaId)
    throw new ErroHttp("Conecte a conta Google e escolha a planilha na Gestão.", 400);
  const planilhaId = linha.googlePlanilhaId;
  let registro = await banco().indiceChamada.findUnique({ where: { planilhaId } });
  if (recuperarId && !registro)
    throw new ErroHttp("Não há criação pendente para recuperar neste arquivo.", 409);
  if (!registro && !criar) return null;
  const [catalogo, turmas] = await Promise.all([
    chamarIntegracao<{ abas: AbaMensalPlanilha[] }>(linha, { acao: "abasMensais" }),
    listarTodasTurmas(),
  ]);
  if (!catalogo.abas.length)
    throw new ErroHttp("Prepare ao menos um mês antes de criar o índice.", 409);
  const planilhaUrl = `https://docs.google.com/spreadsheets/d/${planilhaId}/edit`;
  const indice = montarIndiceChamadas(
    planilhaUrl,
    catalogo.abas.map((aba) => ({
      ...aba,
      aba: turmas.find((turma) => turma.id === aba.turmaOriginalId)?.rotulo ?? aba.aba,
      url: `${planilhaUrl}#gid=${aba.destino.split(":")[1]}`,
    })),
  );
  const token = linha.googleRefreshToken;
  const { acesso } = await acessoGoogle(token);
  try {
    if (!registro) {
      // A reserva fica persistida antes de criar no Google, inclusive se a resposta se perder.
      registro = await banco().indiceChamada.create({ data: { planilhaId } });
      try {
        const documentoId = await criarDocumentoIndice(
          acesso,
          `Índice das chamadas · ${linha.googlePlanilhaNome ?? "Frequência"}`,
        );
        registro = await banco().indiceChamada.update({
          where: { id: registro.id },
          data: { documentoId },
        });
      } catch (erro) {
        if (erro instanceof ErroCriacaoDocumento && erro.recusado)
          await banco().indiceChamada.delete({ where: { id: registro.id } });
        throw erro;
      }
    }
    if (!registro.documentoId && !recuperarId)
      throw new ErroHttp(
        "A criação anterior não foi confirmada. Localize o índice no Google Drive e informe o link do documento.",
        409,
      );
    if (registro.documentoId && recuperarId && registro.documentoId !== recuperarId)
      throw new ErroHttp("Este arquivo já tem um índice vinculado.", 409);
    const documentoId = registro.documentoId ?? recuperarId;
    if (!documentoId) throw new ErroHttp("Informe o documento do índice.", 400);
    let assinatura: string;
    try {
      assinatura = await atualizarDocumentoIndice(acesso, documentoId, indice, registro.assinatura);
    } catch (erro) {
      if (erro instanceof ErroHttp && erro.codigo === "INDICE_AUSENTE")
        await banco().indiceChamada.updateMany({
          where: { id: registro.id, documentoId },
          data: { documentoId: null, assinatura: null },
        });
      throw erro;
    }
    await banco().indiceChamada.update({
      where: { id: registro.id },
      data: { documentoId, assinatura },
    });
    return { url: urlDoDocumento(documentoId), pendente: false };
  } catch (erro) {
    esquecerAcessoGoogle(token);
    throw erro;
  }
}

export async function prepararIndiceChamadas(admin: { id: string }, entrada: unknown) {
  const dados = z
    .object({
      documentoUrl: z
        .string()
        .max(500, "Informe um link válido do Google Docs.")
        .regex(
          /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{1,200})(?:\/edit)?\/?(?:\?[^#]*)?(?:#.*)?$/,
        )
        .optional(),
      recriar: z.literal(true).optional(),
    })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe um link válido do Google Docs.", 400);
  if (dados.data.recriar && dados.data.documentoUrl)
    throw new ErroHttp("Escolha recuperar o documento ou iniciar uma nova criação.", 400);
  if (!(await limiteDeTentativas(`planilha:indice:${admin.id}`, 20)))
    throw new ErroHttp("Muitas atualizações em sequência. Aguarde alguns minutos.", 429);
  return comTravaPlanilhaFrequencia(async () => {
    const linha = await lerLinha("FREQUENCIA");
    if (dados.data.recriar && linha.googlePlanilhaId) {
      const reserva = await banco().indiceChamada.findUnique({
        where: { planilhaId: linha.googlePlanilhaId },
      });
      if (!reserva || reserva.documentoId)
        throw new ErroHttp("Somente uma criação pendente pode ser reiniciada.", 409);
      await banco().indiceChamada.delete({ where: { id: reserva.id } });
    }
    const recuperarId = dados.data.documentoUrl?.split("/d/")[1]?.split(/[/?#]/)[0];
    const resultado = await atualizar(linha, recuperarId, true);
    await comTransacao((tx) => auditar(tx, admin.id, "planilha.indice", "frequencia"));
    return resultado;
  });
}

/** O preparo das chamadas continua válido mesmo se o documento exigir conferência. */
export async function atualizarIndiceExistente(
  linha: LinhaIntegracao,
): Promise<string | undefined> {
  try {
    await atualizar(linha);
  } catch (erro) {
    return erro instanceof ErroHttp
      ? erro.message
      : "As chamadas foram preparadas, mas o índice não pôde ser atualizado.";
  }
}
