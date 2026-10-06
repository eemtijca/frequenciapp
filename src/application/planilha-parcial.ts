// Terceira planilha Google: prévia e acréscimo conservador das chamadas parciais.
import { z } from "zod";
import { listarFrequenciasPersonalizadas } from "./frequencia-personalizada";
import {
  chamarIntegracao,
  desconectar,
  emSequencia,
  lerLinha,
  salvarConfiguracao,
  type LinhaIntegracao,
} from "./planilha-comum";
import { ABA_PARCIAL, CABECALHO_PARCIAL, planejarParciais } from "@/domain/planilha-parcial";
import { ehDiaValido } from "@/domain/frequencia";
import { hashTexto, type AbaBruta, type LeituraAba } from "@/domain/planilha";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";
import { aplicarParciaisGoogle } from "@/infra/google-planilhas-parcial";
import { renovarAcesso } from "@/infra/google-oauth";
import { comTravaPlanilhaParcial } from "@/infra/trava-planilha-parcial";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { comTransacao } from "@/infra/transacoes";

const esquemaEnvio = z
  .object({
    de: z.string().refine(ehDiaValido, "Data inicial inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida."),
    turmaId: z.uuid("Turma inválida.").optional(),
    atualizarExistentes: z.boolean().default(false),
    planoHash: z
      .string()
      .regex(/^[a-f0-9]{16}$/, "Faça outra prévia antes de enviar.")
      .optional(),
  })
  .strict()
  .refine((dados) => dados.ate >= dados.de, "Confira o período do envio.");

function abaPreparada(linha: LinhaIntegracao): boolean {
  return (
    linha.esquema !== null &&
    typeof linha.esquema === "object" &&
    "aba" in linha.esquema &&
    linha.esquema.aba === ABA_PARCIAL
  );
}

async function conexao(exigirAtiva = true): Promise<LinhaIntegracao> {
  const linha = await lerLinha("PARCIAL");
  if (!linha.googleRefreshToken || !linha.googlePlanilhaId || (exigirAtiva && !linha.ativa))
    throw new ErroHttp("Configure a planilha de chamada parcial na Gestão antes de enviar.", 400);
  const conflito = await banco().integracaoPlanilha.findFirst({
    where: { id: { not: "parcial" }, googlePlanilhaId: linha.googlePlanilhaId },
    select: { id: true },
  });
  if (conflito) throw new ErroHttp("Escolha um terceiro arquivo para a chamada parcial.", 409);
  return linha;
}

export async function estadoPlanilhaParcial() {
  const linha = await lerLinha("PARCIAL");
  return {
    podeEnviar: Boolean(
      linha.ativa && linha.googleRefreshToken && linha.googlePlanilhaId && abaPreparada(linha),
    ),
    planilhaNome: linha.googlePlanilhaNome,
    aba: ABA_PARCIAL,
  };
}

export async function lerIntegracaoParcialAdmin() {
  const linha = await lerLinha("PARCIAL");
  const principal = await banco().integracaoPlanilha.findUnique({
    where: { id: "principal" },
    select: { googleRefreshToken: true },
  });
  return {
    ativa: linha.ativa,
    contaGoogle: Boolean(linha.googleRefreshToken ?? principal?.googleRefreshToken),
    googlePlanilha: linha.googlePlanilhaId
      ? { id: linha.googlePlanilhaId, nome: linha.googlePlanilhaNome }
      : null,
    aba: ABA_PARCIAL,
    preparada: abaPreparada(linha),
    podeEnviar: (await estadoPlanilhaParcial()).podeEnviar,
  };
}

export async function salvarIntegracaoParcial(admin: { id: string }, entrada: unknown) {
  const dados = z.object({ ativa: z.boolean() }).strict().safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Configuração inválida.", 400);
  if (dados.data.ativa) {
    const linha = await conexao(false);
    if (!abaPreparada(linha))
      throw new ErroHttp("Prepare a aba Chamada Parcial antes de ativar a integração.", 400);
  }
  await salvarConfiguracao(admin, "PARCIAL", dados.data);
  return lerIntegracaoParcialAdmin();
}

export async function desconectarPlanilhaParcial(admin: { id: string }) {
  await lerLinha("PARCIAL");
  await desconectar(admin, "PARCIAL");
  return lerIntegracaoParcialAdmin();
}

/** A confirmação autoriza somente a criação da aba; nenhum conteúdo existente é alterado. */
export async function prepararAbaParcial(admin: { id: string }, entrada: unknown) {
  const dados = z
    .object({ confirmacao: z.literal(true) })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confirme a preparação da aba Chamada Parcial.", 400);
  const configuracao = await conexao(false);
  // A escolha do arquivo antecede a ativação; esta leitura usa a autorização já conferida.
  const linha = { ...configuracao, ativa: true };
  const estrutura = await chamarIntegracao<{ abas: AbaBruta[] }>(linha, { acao: "estrutura" });
  const existente = estrutura.abas.find((aba) => aba.nome === ABA_PARCIAL);
  if (existente) {
    const leitura = await chamarIntegracao<LeituraAba>(linha, {
      acao: "ler",
      aba: ABA_PARCIAL,
      cabecalhoLinha: 1,
    });
    const plano = planejarParciais(
      [],
      { ...leitura, nome: ABA_PARCIAL },
      existente.mesclagens ?? [],
    );
    if (plano.bloqueado)
      throw new ErroHttp(
        "A aba Chamada Parcial já existe. Confira o cabeçalho antes de preparar.",
        409,
      );
  } else {
    await chamarIntegracao(linha, {
      acao: "criarAba",
      nome: ABA_PARCIAL,
      cabecalho: CABECALHO_PARCIAL,
    });
  }
  await comTransacao(async (tx) => {
    const atual = await tx.integracaoPlanilha.findUnique({
      where: { id: "parcial" },
      select: { googlePlanilhaId: true },
    });
    if (atual?.googlePlanilhaId !== configuracao.googlePlanilhaId)
      throw new ErroHttp("A planilha escolhida mudou. Confira a conexão antes de continuar.", 409);
    await tx.integracaoPlanilha.update({
      where: { id: "parcial" },
      data: { esquema: { aba: ABA_PARCIAL }, esquemaEm: new Date(), atualizadoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.parcial.preparar", "aba:Chamada Parcial");
  });
  return { criada: !existente, integracao: await lerIntegracaoParcialAdmin() };
}

async function montarPlano(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Período inválido.", 400);
  if ((Date.parse(dados.data.ate) - Date.parse(dados.data.de)) / 86_400_000 + 1 > 92)
    throw new ErroHttp("Envie períodos de até três meses por vez.", 400);
  if (!(await limiteDeTentativas(`planilha-parcial:${usuario.id}`, 60)))
    throw new ErroHttp("Muitos envios em sequência. Aguarde alguns minutos.", 429);
  const linha = await conexao();
  if (!abaPreparada(linha))
    throw new ErroHttp("Prepare a aba Chamada Parcial na Gestão antes do envio.", 400);
  const estrutura = await chamarIntegracao<{ abas: AbaBruta[] }>(linha, { acao: "estrutura" });
  const aba = estrutura.abas.find((item) => item.nome === ABA_PARCIAL);
  if (!aba) throw new ErroHttp("A aba Chamada Parcial não foi encontrada. Confira a Gestão.", 409);
  const leitura = await chamarIntegracao<LeituraAba>(linha, {
    acao: "ler",
    aba: ABA_PARCIAL,
    cabecalhoLinha: 1,
  });
  const registros = await listarFrequenciasPersonalizadas({
    de: dados.data.de,
    ate: dados.data.ate,
    turmaId: dados.data.turmaId,
  });
  const plano = planejarParciais(
    registros,
    { ...leitura, nome: ABA_PARCIAL },
    aba.mesclagens ?? [],
    dados.data.atualizarExistentes,
  );
  plano.planoHash = hashTexto(`${linha.googlePlanilhaId}|${plano.planoHash}`);
  return { linha, plano, leituraHash: hashTexto(JSON.stringify(leitura)), dados: dados.data };
}

export async function simularParciais(usuario: { id: string }, entrada: unknown) {
  const { plano } = await montarPlano(usuario, entrada);
  return {
    ...plano,
    criar: plano.criar.slice(0, 20),
    atualizar: plano.atualizar.slice(0, 20),
    novas: plano.criar.length,
    atualizacoes: plano.atualizar.length,
  };
}

/** Releitura obrigatória e tentativa única de escrita, inclusive em resposta perdida. */
export function enviarParciais(usuario: { id: string }, entrada: unknown) {
  return emSequencia(() =>
    comTravaPlanilhaParcial(async (controle) => {
      const { linha, plano, leituraHash, dados } = await montarPlano(usuario, entrada);
      if (!dados.planoHash) throw new ErroHttp("Faça a prévia antes de enviar.", 400);
      if (plano.bloqueado)
        throw new ErroHttp(plano.avisos[0] ?? "Confira a aba Chamada Parcial.", 409);
      if (plano.planoHash !== dados.planoHash)
        throw new ErroHttp("Os dados mudaram desde a prévia. Revise o envio de novo.", 409);
      if (!plano.criar.length && !plano.atualizar.length)
        return { resultado: "sucesso", linhasCriadas: 0, linhasAtualizadas: 0 };
      await auditar(banco(), usuario.id, "planilha.parcial.iniciar", `plano:${plano.planoHash}`);
      try {
        if (!linha.googlePlanilhaId || !linha.googleRefreshToken)
          throw new ErroHttp("Confira a conexão Google na Gestão.", 400);
        const contagens = await aplicarParciaisGoogle(
          linha.googlePlanilhaId,
          await renovarAcesso(linha.googleRefreshToken),
          plano.assinatura,
          leituraHash,
          { criar: plano.criar, atualizar: plano.atualizar },
          controle,
        );
        if (
          contagens.linhasCriadas !== plano.criar.length ||
          contagens.linhasAtualizadas !== plano.atualizar.length
        )
          throw new ErroHttp("Parte das linhas não foi confirmada.", 502);
        await auditar(banco(), usuario.id, "planilha.parcial.sucesso", `plano:${plano.planoHash}`);
        return { resultado: "sucesso", ...contagens };
      } catch (erro) {
        if (
          (erro instanceof ErroGoogle && erro.recusado) ||
          (erro instanceof ErroHttp && erro.status < 500)
        ) {
          await auditar(banco(), usuario.id, "planilha.parcial.falha", `plano:${plano.planoHash}`);
          throw erro;
        }
        await auditar(banco(), usuario.id, "planilha.parcial.parcial", `plano:${plano.planoHash}`);
        throw new ErroHttp(
          "Não foi possível confirmar o envio. Confira a aba Chamada Parcial e faça outra prévia antes de repetir.",
          502,
        );
      }
    }),
  );
}
