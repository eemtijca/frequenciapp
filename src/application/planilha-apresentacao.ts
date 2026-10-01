// Prévia administrativa do padrão visual, vinculada ao arquivo e ao cabeçalho.
import { createHmac } from "node:crypto";
import { z } from "zod";
import { lerLinha, chamarIntegracao, type FinalidadeIntegracao } from "./planilha-comum";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { detectarEsquema, assinarAba, colunasDoIntervalo } from "@/domain/planilha";
import { detectarEsquemaSaida } from "@/domain/planilha-saidas";
import { ABA_ENTRADAS, CABECALHO_ENTRADAS } from "@/domain/planilha-entradas";
import {
  colunasDeApresentacao,
  planejarAjusteCabecalho,
  type ApresentacaoAba,
  type AjusteCabecalho,
} from "@/domain/planilha-apresentacao";

export type TipoApresentacao = "FREQUENCIA" | "SAIDAS" | "ENTRADAS";
const estrutura = z.object({
  abas: z.array(
    z.object({
      nome: z.string(),
      oculta: z.boolean().optional(),
      colunas: z.number().optional(),
      amostra: z.array(z.array(z.string())),
      mesclagens: z.array(z.string()).optional(),
    }),
  ),
});

export async function organizarPlanilha(
  admin: { id: string },
  tipo: TipoApresentacao,
  entrada: unknown,
) {
  const dados = z
    .object({
      aba: z.string().trim().min(1).max(200),
      planoHash: z.string().length(64).optional(),
      ajustarCabecalho: z.boolean().default(false),
      anoReferencia: z.number().int().min(2000).max(2100).optional(),
    })
    .safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp("Informe a aba e confira a prévia antes de organizar.", 400);
  if (tipo === "ENTRADAS" && dados.data.aba !== ABA_ENTRADAS)
    throw new ErroHttp("Escolha a aba Entradas.", 400);
  if (dados.data.ajustarCabecalho && tipo !== "FREQUENCIA")
    throw new ErroHttp("A correção do cabeçalho está disponível para a frequência.", 400);
  const versaoMinima = dados.data.ajustarCabecalho ? 6 : 5;
  const finalidade: FinalidadeIntegracao = tipo === "FREQUENCIA" ? "FREQUENCIA" : "SAIDAS";
  const linha = await lerLinha(finalidade);
  if (
    tipo === "ENTRADAS" &&
    (linha.provedor !== "GOOGLE" ||
      (linha.esquema as { aba?: unknown } | null)?.aba === ABA_ENTRADAS)
  )
    throw new ErroHttp("Confira a conexão Google e a aba de saídas na Gestão.", 400);
  if (linha.provedor !== "GOOGLE" && Number(linha.versaoScript ?? 0) < versaoMinima)
    throw new ErroHttp(
      `Atualize o Apps Script para a versão ${versaoMinima} e teste a conexão antes de organizar.`,
      400,
    );
  const resposta = estrutura.safeParse(
    await chamarIntegracao(linha, { acao: "estrutura", aba: dados.data.aba, apresentacao: true }),
  );
  if (!resposta.success)
    throw new ErroHttp("Não foi possível conferir a estrutura da planilha.", 502);
  const aba = resposta.data.abas.find((item) => item.nome === dados.data.aba);
  if (!aba) throw new ErroHttp("A aba não foi encontrada. Confira a estrutura na Gestão.", 409);
  if (aba.oculta || (aba.colunas ?? 0) > 400)
    throw new ErroHttp(
      "Organize apenas abas visíveis, sem células mescladas e com até 400 colunas.",
      409,
    );
  const bruta = {
    ...aba,
    valores: aba.amostra,
    mesclagens: dados.data.ajustarCabecalho ? [] : aba.mesclagens,
  };
  const esquema =
    tipo === "FREQUENCIA"
      ? detectarEsquema(bruta, new Date().getUTCFullYear())
      : detectarEsquemaSaida(bruta);
  const cabecalhoLinha = tipo === "ENTRADAS" ? 1 : esquema.cabecalho;
  const cabecalho = aba.amostra[cabecalhoLinha - 1] ?? [];
  if (
    tipo === "ENTRADAS" &&
    CABECALHO_ENTRADAS.some((rotulo, indice) => cabecalho[indice] !== rotulo)
  )
    throw new ErroHttp("Confira o cabeçalho padrão da aba Entradas antes de organizar.", 409);
  let ajusteCabecalho: AjusteCabecalho | undefined;
  if (dados.data.ajustarCabecalho) {
    try {
      ajusteCabecalho = planejarAjusteCabecalho(
        aba.amostra,
        cabecalhoLinha,
        dados.data.anoReferencia ?? new Date().getUTCFullYear(),
      );
    } catch (erro) {
      throw new ErroHttp(
        erro instanceof Error ? erro.message : "Confira o cabeçalho antes de corrigir.",
        409,
      );
    }
  }
  if (
    aba.mesclagens?.some((intervalo) => {
      const fim = Number(intervalo.match(/:(?:[A-Z]+)(\d+)$/)?.[1] ?? Number.POSITIVE_INFINITY);
      return !ajusteCabecalho || fim > ajusteCabecalho.linhasRemover;
    })
  )
    throw new ErroHttp("Organize apenas abas visíveis e sem células mescladas na tabela.", 409);
  const corrigido = cabecalho.map(
    (rotulo, indice) =>
      ajusteCabecalho?.datas.find((data) => data.indice === indice + 1)?.rotulo ?? rotulo,
  );
  const colunas = colunasDeApresentacao(corrigido);
  if (esquema.bloqueio || !colunas.some((coluna) => coluna.largura === 260))
    throw new ErroHttp("Confira o cabeçalho e a coluna Aluno antes de organizar.", 409);
  const plano: ApresentacaoAba = {
    aba: aba.nome,
    cabecalhoLinha,
    assinatura: assinarAba(
      aba.nome,
      cabecalho,
      (aba.mesclagens ?? []).filter((intervalo) => colunasDoIntervalo(intervalo).length > 1),
    ),
    colunas,
    ...(ajusteCabecalho ? { ajusteCabecalho } : {}),
  };
  const planoHash = createHmac("sha256", ambiente.authSecret)
    .update(
      JSON.stringify([
        tipo,
        linha.provedor,
        linha.googlePlanilhaId,
        linha.endpoint,
        linha.atualizadoEm,
        plano,
      ]),
    )
    .digest("hex");
  if (!dados.data.planoHash) return { previa: { ...plano, planoHash } };
  if (dados.data.planoHash !== planoHash)
    throw new ErroHttp("A planilha mudou. Confira uma nova prévia antes de organizar.", 409);
  await chamarIntegracao(linha, { acao: "organizarAba", ...plano }, { retentavel: false });
  if (ajusteCabecalho && (ajusteCabecalho.linhasRemover || ajusteCabecalho.datas.length)) {
    const { atualizarEsquemaDaAba } = await import("./planilha");
    await atualizarEsquemaDaAba(linha, aba.nome);
  }
  await auditar(banco(), admin.id, "planilha.organizar", `finalidade:${tipo};aba:${aba.nome}`);
  return { organizada: true, aba: aba.nome };
}
