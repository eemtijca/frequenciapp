// Agenda dos avisos: horários da escola, escopo atualizado no envio e
// confirmações independentes por tipo, chamada e dispositivo.
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import type { Prisma, TipoNotificacao } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { conferirParVapid, enviarPush, pushConfigurado } from "@/infra/web-push";
import { diaLocal, diaSeguinte, diaDaSemanaIso } from "@/domain/frequencia";
import {
  horarioDeEnvioAtingido,
  mensagemDoResumo,
  mensagemDeNovaChamada,
  mensagemDePendencias,
  type TipoDeAviso,
  type MensagemPush,
} from "@/domain/notificacoes";
import { lerConfiguracaoNotificacoes } from "@/application/notificacoes-configuracao";

function totaisVazios() {
  return { enviadas: 0, expiradas: 0, falhas: 0, ignoradas: 0 };
}
type Totais = ReturnType<typeof totaisVazios>;
type Filtro = () => Promise<Prisma.AssinaturaPushWhereInput | null>;

async function permitidoAgora(tipo: TipoDeAviso, dia: string): Promise<boolean> {
  const agora = new Date();
  if (diaLocal(agora, ambiente.fuso) !== dia) return false;
  const configuracao = await lerConfiguracaoNotificacoes();
  if (!configuracao[tipo]) return false;
  if (tipo === "novasChamadas") return true;
  const horario =
    tipo === "resumoDiario" ? configuracao.horarioResumo : configuracao.horarioPendencias;
  return horarioDeEnvioAtingido(agora, ambiente.fuso, horario);
}

async function filtroDiretor(
  dia: string,
  tipo: "resumoDiario" | "novasChamadas",
  chamada?: { id: string; criadoEm: Date },
): Promise<Prisma.AssinaturaPushWhereInput | null> {
  if (!(await permitidoAgora(tipo, dia))) return null;
  const data = new Date(`${dia}T12:00:00Z`);
  const chamados = await banco().alunoDaChamada.findMany({
    where: {
      frequencia: { dia: data, ...(chamada ? { id: chamada.id } : {}) },
      aluno: { ativo: true, OR: [{ desistenteEm: null }, { desistenteEm: { gt: data } }] },
    },
    select: { aluno: { select: { turmaOriginalId: true } } },
  });
  const origens = [...new Set(chamados.map((item) => item.aluno.turmaOriginalId))];
  if (!origens.length) return null;
  return {
    chaveVapid: ambiente.push.publicKey,
    ...(chamada ? { criadoEm: { lte: chamada.criadoEm } } : {}),
    usuario: {
      ativo: true,
      papel: "DIRETOR_TURMA",
      credencialDiretor: {
        trocaObrigatoria: false,
        revogadaEm: null,
        expiraEm: { gt: new Date() },
      },
      vinculosDiretor: {
        some: {
          turmaId: { in: origens },
          inicio: { lte: data },
          OR: [{ fim: null }, { fim: { gte: data } }],
        },
      },
      ...(chamada
        ? {
            preferenciaNotificacoes: {
              is: { novasChamadas: true, novasChamadasDesde: { lte: chamada.criadoEm } },
            },
          }
        : {
            OR: [
              { preferenciaNotificacoes: { is: null } },
              { preferenciaNotificacoes: { is: { resumoDiario: true } } },
            ],
          }),
    },
  };
}

/** Só turmas com alunos participantes e aula ativa prevista precisam de chamada. */
export async function contarChamadasPendentes(dia: string): Promise<number> {
  const data = new Date(`${dia}T12:00:00Z`);
  return banco().turma.count({
    where: {
      alunos: {
        some: { ativo: true, OR: [{ desistenteEm: null }, { desistenteEm: { gt: data } }] },
      },
      horarios: { some: { ativo: true, diasSemana: { has: diaDaSemanaIso(dia) } } },
      frequencias: { none: { dia: data } },
    },
  });
}

async function filtroPendencias(dia: string): Promise<Prisma.AssinaturaPushWhereInput | null> {
  if (!(await permitidoAgora("chamadasPendentes", dia)) || !(await contarChamadasPendentes(dia)))
    return null;
  return {
    chaveVapid: ambiente.push.publicKey,
    usuario: {
      ativo: true,
      papel: { in: ["ADMIN", "COORDENACAO"] },
      OR: [
        { preferenciaNotificacoes: { is: null } },
        { preferenciaNotificacoes: { is: { chamadasPendentes: true } } },
      ],
    },
  };
}

async function enviarGrupo(
  dia: string,
  tipo: TipoNotificacao,
  referencia: string,
  mensagem: MensagemPush,
  filtro: Filtro,
): Promise<Totais> {
  const totais = totaisVazios();
  const criterio = await filtro();
  if (!criterio) return totais;
  const data = new Date(`${dia}T12:00:00Z`);
  const assinaturas = await banco().assinaturaPush.findMany({
    where: criterio,
    select: { id: true },
  });
  for (let inicio = 0; inicio < assinaturas.length; inicio += 10) {
    await Promise.all(
      assinaturas.slice(inicio, inicio + 10).map(async ({ id }) => {
        try {
          await banco().entregaPush.createMany({
            data: [{ assinaturaId: id, dia: data, tipo, referencia }],
            skipDuplicates: true,
          });
        } catch (erro) {
          if (!(erro instanceof PrismaClientKnownRequestError) || erro.code !== "P2003") throw erro;
          totais.ignoradas += 1;
          return;
        }
        const entrega = await banco().entregaPush.findUnique({
          where: {
            assinaturaId_dia_tipo_referencia: { assinaturaId: id, dia: data, tipo, referencia },
          },
        });
        if (!entrega) {
          totais.ignoradas += 1;
          return;
        }
        const reservadaEm = new Date();
        const reserva = await banco().entregaPush.updateMany({
          where: {
            id: entrega.id,
            enviadaEm: null,
            OR: [
              { reservadaEm: null },
              { reservadaEm: { lt: new Date(reservadaEm.getTime() - 120_000) } },
            ],
          },
          data: { reservadaEm },
        });
        if (!reserva.count) {
          totais.ignoradas += 1;
          return;
        }
        // Reconsulta preferências, regras da escola, conta, vínculo e pendências.
        const atualizado = await filtro();
        const assinatura = atualizado
          ? await banco().assinaturaPush.findFirst({ where: { id, ...atualizado } })
          : null;
        if (!assinatura) {
          await banco().entregaPush.updateMany({
            where: { id: entrega.id, reservadaEm },
            data: { reservadaEm: null },
          });
          totais.ignoradas += 1;
          return;
        }
        const resultado = await enviarPush(
          {
            endpoint: assinatura.endpoint,
            keys: { p256dh: assinatura.p256dh, auth: assinatura.auth },
          },
          mensagem,
        );
        if (resultado === "expirada") {
          await banco().assinaturaPush.deleteMany({ where: { id } });
          totais.expiradas += 1;
        } else {
          await banco().entregaPush.updateMany({
            where: { id: entrega.id, reservadaEm },
            data:
              resultado === "enviada"
                ? { enviadaEm: new Date(), reservadaEm: null }
                : { reservadaEm: null },
          });
          if (resultado === "enviada") totais.enviadas += 1;
          else totais.falhas += 1;
        }
      }),
    );
  }
  return totais;
}

function somar(destino: Totais, origem: Totais) {
  destino.enviadas += origem.enviadas;
  destino.expiradas += origem.expiradas;
  destino.falhas += origem.falhas;
  destino.ignoradas += origem.ignoradas;
}

async function executarAgenda(completa: boolean) {
  const totais = totaisVazios();
  if (!pushConfigurado()) return { configurada: false, ...totais };
  conferirParVapid();
  const dia = diaLocal(new Date(), ambiente.fuso);
  somar(
    totais,
    await enviarGrupo(dia, "RESUMO_DIARIO", "", mensagemDoResumo(dia), () =>
      filtroDiretor(dia, "resumoDiario"),
    ),
  );
  if (completa) {
    somar(
      totais,
      await enviarGrupo(dia, "CHAMADAS_PENDENTES", "", mensagemDePendencias(dia), () =>
        filtroPendencias(dia),
      ),
    );
    if (await permitidoAgora("novasChamadas", dia)) {
      const chamadas = await banco().frequencia.findMany({
        where: { dia: new Date(`${dia}T12:00:00Z`) },
        select: { id: true, criadoEm: true },
        orderBy: { criadoEm: "asc" },
      });
      for (const chamada of chamadas) {
        somar(
          totais,
          await enviarGrupo(
            dia,
            "NOVA_CHAMADA",
            chamada.id,
            mensagemDeNovaChamada(dia, chamada.id),
            () => filtroDiretor(dia, "novasChamadas", chamada),
          ),
        );
      }
    }
  }
  await banco().entregaPush.deleteMany({
    where: { dia: { lt: new Date(`${diaSeguinte(dia, -30)}T12:00:00Z`) } },
  });
  return { configurada: true, ...totais };
}

export function enviarResumosDiarios() {
  return executarAgenda(false);
}
export function enviarAvisosDaAgenda() {
  return executarAgenda(true);
}
