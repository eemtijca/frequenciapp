// Entradas na Sheets API: aba própria, prévia obrigatória e escrita conservadora.
import { z } from "zod";
import { lerLinha, chamarIntegracao, type LinhaIntegracao } from "./planilha-comum";
import { listarEntradas, esquemaFiltroEntradas } from "./entradas";
import { ABA_ENTRADAS, CABECALHO_ENTRADAS, planejarEntradas } from "@/domain/planilha-entradas";
import { hashTexto, type AbaBruta, type LeituraAba } from "@/domain/planilha";
import { ErroHttp } from "@/infra/erros";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";

const esquemaEnvio = esquemaFiltroEntradas.and(
  z.object({ planoHash: z.string().max(64).optional() }),
);

async function conexao(): Promise<LinhaIntegracao> {
  const linha = await lerLinha("SAIDAS");
  if (
    !linha.ativa ||
    linha.provedor !== "GOOGLE" ||
    !linha.googleRefreshToken ||
    !linha.googlePlanilhaId
  )
    throw new ErroHttp(
      "Ative a conexão Google da planilha de saídas na Gestão para enviar as entradas.",
      400,
    );
  const esquema = linha.esquema as { aba?: unknown } | null;
  if (esquema?.aba === ABA_ENTRADAS)
    throw new ErroHttp(
      "Escolha outra aba para as saídas. A aba Entradas é reservada às chegadas atrasadas.",
      409,
    );
  return linha;
}

export async function estadoPlanilhaEntradas() {
  const linha = await lerLinha("SAIDAS");
  return {
    podeEnviar: Boolean(
      linha.ativa &&
      linha.provedor === "GOOGLE" &&
      linha.googleRefreshToken &&
      linha.googlePlanilhaId,
    ),
    planilhaNome: linha.googlePlanilhaNome,
  };
}

export async function prepararAbaEntradas(admin: { id: string }) {
  const linha = await conexao();
  const estrutura = await chamarIntegracao<{ abas: AbaBruta[] }>(linha, { acao: "estrutura" });
  if (estrutura.abas.some((aba) => aba.nome === ABA_ENTRADAS)) return { criada: false };
  await chamarIntegracao(
    linha,
    { acao: "criarAba", nome: ABA_ENTRADAS, cabecalho: CABECALHO_ENTRADAS },
    { retentavel: false },
  );
  await auditar(banco(), admin.id, "planilha.entradas.criarAba", "aba:Entradas");
  return { criada: true };
}

async function montarPlano(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Período inválido.", 400);
  if ((Date.parse(dados.data.ate) - Date.parse(dados.data.de)) / 86400000 + 1 > 92)
    throw new ErroHttp("Envie períodos de até três meses por vez.", 400);
  if (!(await limiteDeTentativas(`planilha-entradas:${usuario.id}`, 60)))
    throw new ErroHttp("Muitos envios em sequência. Aguarde alguns minutos.", 429);
  const linha = await conexao();
  const estrutura = await chamarIntegracao<{ abas: AbaBruta[] }>(linha, {
    acao: "estrutura",
    aba: ABA_ENTRADAS,
  });
  const aba = estrutura.abas.find((aba) => aba.nome === ABA_ENTRADAS);
  if (!aba)
    throw new ErroHttp("A administração precisa preparar a aba Entradas antes do envio.", 400);
  const leitura = await chamarIntegracao<LeituraAba>(linha, {
    acao: "ler",
    aba: ABA_ENTRADAS,
    cabecalhoLinha: 1,
  });
  const entradas = await listarEntradas(dados.data);
  const plano = planejarEntradas(
    entradas,
    { ...leitura, nome: ABA_ENTRADAS },
    aba.mesclagens ?? [],
  );
  // Uma troca de arquivo entre prévia e envio também invalida o plano.
  plano.planoHash = hashTexto(`${linha.googlePlanilhaId}|${plano.planoHash}`);
  return { linha, plano, dados: dados.data };
}

export async function simularEntradas(usuario: { id: string }, entrada: unknown) {
  const { plano } = await montarPlano(usuario, entrada);
  return { ...plano, criar: plano.criar.slice(0, 20), novas: plano.criar.length };
}

export async function enviarEntradas(usuario: { id: string }, entrada: unknown) {
  const { linha, plano, dados } = await montarPlano(usuario, entrada);
  if (!dados.planoHash) throw new ErroHttp("Faça a prévia antes de enviar.", 400);
  if (plano.bloqueado) throw new ErroHttp(plano.avisos[0] ?? "Confira a aba Entradas.", 409);
  if (plano.planoHash !== dados.planoHash)
    throw new ErroHttp("Os dados mudaram desde a prévia. Revise o envio de novo.", 409);
  if (plano.criar.length === 0) return { resultado: "sucesso", linhasCriadas: 0 };
  await auditar(banco(), usuario.id, "planilha.entradas.iniciar", `plano:${plano.planoHash}`);
  try {
    const contagens = await chamarIntegracao<{ linhasCriadas?: number }>(
      linha,
      {
        acao: "aplicar",
        aba: ABA_ENTRADAS,
        cabecalhoLinha: 1,
        assinatura: plano.assinatura,
        modoCompleto: false,
        operacoes: [
          {
            tipo: "criarLinhas",
            itens: plano.criar.map(({ linha, celulas }) => ({ linha, celulas })),
          },
        ],
      },
      { retentavel: false },
    );
    if (contagens.linhasCriadas !== plano.criar.length)
      throw new ErroHttp("Parte das linhas não foi confirmada.", 502);
    await auditar(banco(), usuario.id, "planilha.entradas.sucesso", `plano:${plano.planoHash}`);
    return { resultado: "sucesso", linhasCriadas: contagens.linhasCriadas ?? 0 };
  } catch (erro) {
    if (
      (erro instanceof ErroGoogle && erro.recusado) ||
      (erro instanceof ErroHttp && erro.status < 500)
    ) {
      await auditar(banco(), usuario.id, "planilha.entradas.falha", `plano:${plano.planoHash}`);
      throw erro;
    }
    await auditar(banco(), usuario.id, "planilha.entradas.parcial", `plano:${plano.planoHash}`);
    throw new ErroHttp(
      "Não foi possível confirmar o envio. Confira a aba Entradas e faça outra prévia antes de repetir.",
      502,
    );
  }
}
