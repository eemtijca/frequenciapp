// Grava intenção no commit escolar e a despacha em outra transação, sem transporte externo.
import type { Prisma } from "../../generated/prisma/client";
import type { TipoItemFila } from "@/domain/fila-planilha";
import { comTransacao } from "@/infra/transacoes";
import { idDaIntegracao } from "@/application/planilha-comum";

const DIAS_GUARDAR_INTENCOES = 7;
const POLITICA_AUTOMATICA = "AUTOMATICO_CONSERVADOR_V1";

export interface EventoEscolar {
  tipo: TipoItemFila;
  eventoId: string;
  revisaoEvento: number;
  dia: Date;
  turmaId?: string | null;
  autorId: string;
}

/**
 * A intenção entra no mesmo commit do registro escolar. Se o envio automático
 * estiver desligado ou o modo completo estiver aberto, nada é gravado.
 */
export async function registrarIntencaoEscolar(
  tx: Prisma.TransactionClient,
  evento: EventoEscolar,
): Promise<void> {
  const linha = await tx.integracaoPlanilha.findUnique({
    where: { id: idDaIntegracao(evento.tipo === "FREQUENCIA" ? "FREQUENCIA" : "SAIDAS") },
    select: { ativa: true, envioAutomatico: true, modo: true, modoCompletoAte: true },
  });
  const completoAtivo =
    linha?.modo === "COMPLETO" &&
    linha.modoCompletoAte !== null &&
    linha.modoCompletoAte.getTime() > Date.now();
  if (!linha?.ativa || !linha.envioAutomatico || completoAtivo) return;
  await tx.intencaoEnvioEscolar.create({
    data: {
      tipo: evento.tipo,
      eventoId: evento.eventoId,
      revisaoEvento: evento.revisaoEvento,
      dia: evento.dia,
      turmaId: evento.turmaId ?? null,
      autorId: evento.autorId,
      politica: POLITICA_AUTOMATICA,
    },
  });
}

export async function enfileirarNaTransacao(
  tx: Prisma.TransactionClient,
  tipo: TipoItemFila,
  dados: { dia: Date; turmaId: string | null; autorId: string | null },
): Promise<void> {
  const igual = await tx.filaPlanilha.findFirst({
    where: { tipo, turmaId: dados.turmaId, dia: dados.dia, estado: "AGUARDANDO" },
    select: { id: true },
  });
  if (!igual)
    await tx.filaPlanilha.create({
      data: {
        tipo,
        dia: dados.dia,
        turmaId: dados.turmaId,
        autorId: dados.autorId,
        estado: "AGUARDANDO",
        tentativas: 0,
      },
    });
}

/** O commit da fila e o recibo da intenção são atômicos e seguem a sequência original. */
export async function despacharIntencoesEscolares(limite = 50): Promise<number> {
  let despachadas = 0;
  while (despachadas < limite) {
    const feita = await comTransacao(async (tx) => {
      const intencao = await tx.intencaoEnvioEscolar.findFirst({
        where: { despachadoEm: null },
        orderBy: { sequencia: "asc" },
      });
      if (!intencao) return false;
      await enfileirarNaTransacao(tx, intencao.tipo, intencao);
      await tx.intencaoEnvioEscolar.update({
        where: { id: intencao.id, despachadoEm: null },
        data: { despachadoEm: new Date() },
      });
      return true;
    });
    if (!feita) break;
    despachadas += 1;
  }
  try {
    await comTransacao(async (tx) => {
      await tx.intencaoEnvioEscolar.deleteMany({
        where: {
          despachadoEm: { lt: new Date(Date.now() - DIAS_GUARDAR_INTENCOES * 86_400_000) },
        },
      });
    });
  } catch {
    // A limpeza é oportunista; a intenção pendente continua preservada.
  }
  return despachadas;
}
