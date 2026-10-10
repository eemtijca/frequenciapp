// Painel externo administrativo: retratos agregados, destino privado e recuperação sem duplicatas.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { renovarAcesso } from "@/infra/google-oauth";
import {
  conferirPlanilhaIndicadores,
  criarPlanilhaIndicadores,
  substituirIndicadores,
} from "@/infra/google-indicadores";
import { comTravaPlanilha, type ControleTravaPlanilha } from "@/infra/trava-planilha";
import { diaLocal } from "@/domain/frequencia";
import { disciplinasDoHorario } from "@/domain/horarios-semanais";
import {
  enderecoPainelPermitido,
  montarIndicadores,
  type EstadoIndicadores,
} from "@/domain/indicadores";

const chave = { namespace: 0x494e4449, recurso: 1 };
function comTrava<T>(tarefa: (controle: ControleTravaPlanilha) => Promise<T>) {
  return comTravaPlanilha(
    chave,
    "Os indicadores já estão em atualização. Aguarde e tente novamente.",
    tarefa,
  );
}
const linha = () =>
  banco().painelIndicadores.upsert({ where: { id: "principal" }, create: {}, update: {} });
const anoAtual = () => Number(diaLocal(new Date(), ambiente.fuso).slice(0, 4));
const civil = (dia: Date) => dia.toISOString().slice(0, 10);
const selecaoTurma = { nome: true, serie: { select: { nome: true } } } as const;

export async function lerIndicadores(): Promise<EstadoIndicadores> {
  const [painel, google] = await Promise.all([
    linha(),
    banco().integracaoPlanilha.findUnique({
      where: { id: "principal" },
      select: { googleRefreshToken: true },
    }),
  ]);
  return {
    ativa: painel.ativa,
    ano: painel.ano,
    anoEfetivo: painel.ano ?? anoAtual(),
    conectada: Boolean(google?.googleRefreshToken),
    planilhaUrl: painel.googlePlanilhaId
      ? `https://docs.google.com/spreadsheets/d/${painel.googlePlanilhaId}/edit`
      : null,
    urlRelatorio: painel.urlRelatorio,
    ultimoEnvioEm: painel.ultimoEnvioEm?.toISOString() ?? null,
    linhas: painel.linhas,
    erro: painel.erro,
    criacaoPendente: Boolean(painel.criacaoIniciadaEm && !painel.googlePlanilhaId),
    agendaDisponivel: Boolean(ambiente.push.cronSecret),
  };
}

const esquemaPreferencias = z
  .object({
    ativa: z.boolean().optional(),
    ano: z.number().int().min(2000).max(2100).nullable().optional(),
    urlRelatorio: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export async function configurarIndicadores(entrada: unknown, usuarioId: string) {
  const dados = esquemaPreferencias.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira as opções do painel de indicadores.", 400);
  if (dados.data.urlRelatorio && !enderecoPainelPermitido(dados.data.urlRelatorio))
    throw new ErroHttp("Informe o link HTTPS do painel no Zoho Analytics ou Looker Studio.", 400);
  return comTrava(async () => {
    const painel = await linha();
    if (dados.data.ativa && !painel.googlePlanilhaId)
      throw new ErroHttp("Prepare a planilha de indicadores primeiro.", 409);
    await banco().painelIndicadores.update({
      where: { id: painel.id },
      data: {
        ...dados.data,
        ...(dados.data.urlRelatorio === "" ? { urlRelatorio: null } : {}),
        atualizadoPorId: usuarioId,
      },
    });
    return lerIndicadores();
  });
}

async function acessoGoogle() {
  const google = await banco().integracaoPlanilha.findUnique({ where: { id: "principal" } });
  if (!google?.googleRefreshToken)
    throw new ErroHttp("Conecte a conta Google da frequência em Gestão > Planilhas.", 409);
  return renovarAcesso(google.googleRefreshToken);
}
async function conferirDestino(id: string) {
  if (await banco().integracaoPlanilha.findFirst({ where: { googlePlanilhaId: id } }))
    throw new ErroHttp(
      "Os indicadores precisam de uma planilha separada das planilhas de registro.",
      409,
    );
}

/** Consulta consistente e mínima, sem selecionar nomes de alunos ou justificativas livres. */
async function retrato(ano: number) {
  const dia = {
    gte: new Date(`${ano}-01-01T00:00:00Z`),
    lt: new Date(`${ano + 1}-01-01T00:00:00Z`),
  };
  return banco().$transaction(
    async (tx) => {
      const chamadas = await tx.frequencia.findMany({
        where: { dia },
        orderBy: [{ dia: "asc" }, { turmaId: "asc" }],
        select: {
          dia: true,
          turmaId: true,
          turma: { select: { ...selecaoTurma, horarios: true } },
          alunos: { select: { alunoId: true, aluno: { select: { desistenteEm: true } } } },
          faltas: { select: { alunoId: true, horarioId: true, justificativa: true } },
        },
      });
      const saidas = await tx.saidaAntecipada.findMany({
        where: { dia },
        select: {
          dia: true,
          horario: true,
          aluno: { select: { turma: { select: selecaoTurma } } },
        },
      });
      const entradas = await tx.entradaAtrasada.findMany({
        where: { dia },
        select: { dia: true, horario: true, turma: { select: selecaoTurma } },
      });
      const parciais = await tx.frequenciaParcial.findMany({
        where: { dia },
        select: {
          dia: true,
          turma: { select: selecaoTurma },
          tipo: true,
          turno: true,
          aulas: true,
          registradoSeduc: true,
        },
      });
      return montarIndicadores(
        chamadas.map((c) => ({
          ...c,
          dia: civil(c.dia),
          horarios: c.turma.horarios.map((horario) => ({
            ...horario,
            disciplinas: disciplinasDoHorario(horario.disciplinas),
          })),
          alunos: c.alunos.map((a) => ({
            alunoId: a.alunoId,
            desistenteEm: a.aluno.desistenteEm ? civil(a.aluno.desistenteEm) : null,
          })),
        })),
        [
          ...saidas.map((s) => ({
            dia: civil(s.dia),
            horario: s.horario,
            turma: s.aluno.turma,
            tipo: "Saída" as const,
          })),
          ...entradas.map((e) => ({ ...e, dia: civil(e.dia), tipo: "Entrada" as const })),
        ],
        parciais.map((p) => ({ ...p, dia: civil(p.dia) })),
      );
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

export async function atualizarIndicadores(
  opcoes: { preparar?: boolean; agenda?: boolean; usuarioId?: string } = {},
) {
  return comTrava(async (controle) => {
    const painel = await linha();
    if (
      opcoes.agenda &&
      (!painel.ativa ||
        (painel.ultimoEnvioEm && Date.now() - painel.ultimoEnvioEm.getTime() < 240_000))
    )
      return { atualizado: false };
    try {
      if (!painel.googlePlanilhaId && !opcoes.preparar)
        throw new ErroHttp("Prepare a planilha de indicadores primeiro.", 409);
      if (!painel.googlePlanilhaId && painel.criacaoIniciadaEm)
        throw new ErroHttp(
          "A criação anterior precisa de conferência. Recupere a planilha pelo endereço, sem criar outra.",
          409,
        );
      const acesso = await acessoGoogle();
      let id = painel.googlePlanilhaId;
      if (!id) {
        controle.conferir();
        await banco().painelIndicadores.update({
          where: { id: painel.id },
          data: { criacaoIniciadaEm: new Date() },
        });
        id = await criarPlanilhaIndicadores(painel.geracao, acesso, controle);
        controle.conferir();
        await banco().painelIndicadores.update({
          where: { id: painel.id },
          data: { googlePlanilhaId: id },
        });
      }
      await conferirDestino(id);
      const fontes = await retrato(painel.ano ?? anoAtual());
      controle.conferir();
      await substituirIndicadores(id, painel.geracao, acesso, fontes, controle);
      controle.conferir();
      await banco().painelIndicadores.update({
        where: { id: painel.id },
        data: {
          ultimoEnvioEm: new Date(),
          linhas: fontes.reduce((total, fonte) => total + fonte.linhas.length, 0),
          erro: null,
          ...(opcoes.usuarioId ? { atualizadoPorId: opcoes.usuarioId } : {}),
        },
      });
      return { atualizado: true, estado: await lerIndicadores() };
    } catch (erro) {
      await banco().painelIndicadores.update({
        where: { id: painel.id },
        data: {
          ...(erro instanceof ErroHttp &&
          erro.codigo === "CRIACAO_RECUSADA" &&
          !painel.googlePlanilhaId
            ? { criacaoIniciadaEm: null }
            : {}),
          erro:
            erro instanceof ErroHttp
              ? erro.message.slice(0, 300)
              : "Não foi possível atualizar os indicadores. Tente novamente.",
        },
      });
      throw erro;
    }
  });
}

export async function recuperarIndicadores(entrada: unknown, usuarioId: string) {
  const dados = z
    .object({ endereco: z.string().trim().max(500) })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe o endereço da planilha de indicadores.", 400);
  let id: string | undefined;
  try {
    const url = new URL(dados.data.endereco);
    if (
      url.protocol === "https:" &&
      url.hostname === "docs.google.com" &&
      !url.port &&
      !url.username &&
      !url.password
    )
      id = /^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1];
  } catch {
    /* O endereço inválido recebe a mensagem abaixo. */
  }
  if (!id) throw new ErroHttp("Informe um endereço válido do Google Planilhas.", 400);
  const destino = id;
  return comTrava(async (controle) => {
    const painel = await linha();
    if (painel.googlePlanilhaId || !painel.criacaoIniciadaEm)
      throw new ErroHttp("Não há criação pendente para recuperar.", 409);
    await conferirDestino(destino);
    await conferirPlanilhaIndicadores(destino, painel.geracao, await acessoGoogle(), controle);
    controle.conferir();
    await banco().painelIndicadores.update({
      where: { id: painel.id },
      data: { googlePlanilhaId: destino, erro: null, atualizadoPorId: usuarioId },
    });
    return lerIndicadores();
  });
}
