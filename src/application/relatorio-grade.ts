// Retrato consistente da Grade: leitura única em RepeatableRead, modelo
// pronto para o PDF e hash do conteúdo, sem gravar nada.
import { createHash } from "node:crypto";
import { z } from "zod";
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { ErroHttp } from "@/infra/erros";
import {
  diaLocal,
  diasDoMes,
  diasEntre,
  ehDiaValido,
  LIMITE_DIAS_PERIODO,
  montarGrade,
  rotuloDeTurma,
  type Aluno,
  type Frequencia,
  type Horario,
  type Turma,
} from "@/domain/frequencia";
import {
  type RelatorioGrade,
  type RetratoGrade,
  montarRelatorioGrade,
} from "@/domain/relatorio-grade";
import { agruparFaltas, resumoAcumuladoDosAlunos, type FaltaCrua } from "@/application/frequencias";

export const OPCOES_TRANSACAO_RETRATO = {
  isolationLevel: "RepeatableRead",
  timeout: 30_000,
} as const;

interface HorarioBanco {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
}

interface TurmaBanco {
  id: string;
  serieId: string;
  nome: string;
  serie: { nome: string };
  horarios: HorarioBanco[];
}

interface AlunoBanco {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
  desistenteEm: Date | null;
}

interface FrequenciaBanco {
  dia: Date;
  turmaId: string;
  revisao: number;
  atualizadoEm: Date;
  faltas: FaltaCrua[];
  alunos: { alunoId: string }[];
  aulas: { horarioId: string }[];
}

const esquemaEntrada = z
  .object({
    turmaOriginalId: z.string().uuid("Turma inválida."),
    de: z.string().refine(ehDiaValido, "Data inicial inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida."),
  })
  .superRefine((dados, contexto) => {
    if (dados.ate < dados.de) {
      contexto.addIssue({
        code: "custom",
        path: ["ate"],
        message: "A data final deve ser igual ou posterior à inicial.",
      });
      return;
    }
    const totalDias =
      Math.round(
        (Date.parse(`${dados.ate}T12:00:00Z`) - Date.parse(`${dados.de}T12:00:00Z`)) / 86_400_000,
      ) + 1;
    if (totalDias > LIMITE_DIAS_PERIODO) {
      contexto.addIssue({
        code: "custom",
        path: ["ate"],
        message: "O período é grande demais. Escolha até 366 dias.",
      });
    }
    const hoje = diaLocal(new Date(), ambiente.fuso);
    const diasDoMesCorrente = diasDoMes(hoje.slice(0, 7));
    const ultimoDiaDoMesCorrente = diasDoMesCorrente[diasDoMesCorrente.length - 1] ?? hoje;
    if (dados.ate > ultimoDiaDoMesCorrente) {
      contexto.addIssue({
        code: "custom",
        path: ["ate"],
        message: "A data final não pode passar do mês corrente.",
      });
    }
  });

function horarioDoBanco(horario: HorarioBanco): Horario {
  return {
    id: horario.id,
    turmaId: horario.turmaId,
    ordem: horario.ordem,
    inicio: horario.inicio,
    fim: horario.fim,
    diasSemana: horario.diasSemana,
    ativo: horario.ativo,
  };
}

function turmaDoBanco(turma: TurmaBanco): Turma {
  return {
    id: turma.id,
    serieId: turma.serieId,
    nome: turma.nome,
    rotulo: rotuloDeTurma(turma.serie.nome, turma.nome),
    serieNome: turma.serie.nome,
    horarios: turma.horarios.map(horarioDoBanco),
  };
}

function alunoDoBanco(aluno: AlunoBanco): Aluno {
  return {
    id: aluno.id,
    nome: aluno.nome,
    turmaId: aluno.turmaId,
    turmaOriginalId: aluno.turmaOriginalId,
    ordem: aluno.ordem,
    ativo: aluno.ativo,
    desistenteEm: aluno.desistenteEm?.toISOString().slice(0, 10) ?? null,
  };
}

function frequenciaDoBanco(frequencia: FrequenciaBanco): Frequencia {
  return {
    dia: frequencia.dia.toISOString().slice(0, 10),
    turmaId: frequencia.turmaId,
    revisao: frequencia.revisao,
    atualizadoEm: frequencia.atualizadoEm.toISOString(),
    atualizadoPorNome: null,
    alunos: frequencia.alunos.map((item) => item.alunoId),
    aulas: frequencia.aulas.map((item) => item.horarioId),
    faltas: agruparFaltas(frequencia.faltas),
  };
}

function mapaDeJustificativas(
  frequencias: readonly FrequenciaBanco[],
): ReadonlyMap<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const frequencia of frequencias) {
    const dia = frequencia.dia.toISOString().slice(0, 10);
    for (const falta of frequencia.faltas) {
      if (!falta.justificativa) continue;
      const chave = `${falta.alunoId}:${dia}`;
      const codigos = mapa.get(chave) ?? [];
      if (!codigos.includes(falta.justificativa)) codigos.push(falta.justificativa);
      mapa.set(chave, codigos);
    }
  }
  return mapa;
}

function hashDoRelatorio(relatorio: RelatorioGrade): string {
  return createHash("sha256")
    .update(`frequenciapp-relatorio-grade-v1\n${JSON.stringify(relatorio)}`)
    .digest("hex");
}

/**
 * Lê todo o relatório em uma única transação de leitura. Um commit
 * concorrente aparece inteiro antes ou depois do retrato, nunca pela metade.
 */
export async function obterRetratoGrade(entrada: {
  turmaOriginalId: string;
  de: string;
  ate: string;
}): Promise<RetratoGrade> {
  const dados = esquemaEntrada.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const { turmaOriginalId, de, ate } = dados.data;
  const hoje = diaLocal(new Date(), ambiente.fuso);
  const deDate = new Date(`${de}T12:00:00Z`);
  const ateDate = new Date(`${ate}T12:00:00Z`);
  const dias = diasEntre(de, ate);

  return banco().$transaction(async (tx) => {
    const instante = await tx.$queryRaw<{ agora: Date }[]>`SELECT now() AS agora`;
    const agora = instante[0]?.agora ?? new Date();

    const turma = await tx.turma.findUnique({
      where: { id: turmaOriginalId },
      select: {
        id: true,
        serieId: true,
        nome: true,
        serie: { select: { nome: true } },
        horarios: { orderBy: { ordem: "asc" } },
      },
    });
    if (!turma) throw new ErroHttp("Turma não encontrada.", 404);

    const turmas = await tx.turma.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        serieId: true,
        nome: true,
        serie: { select: { nome: true } },
        horarios: { orderBy: { ordem: "asc" } },
      },
    });

    const alunos = await tx.aluno.findMany({
      where: { ativo: true, turmaOriginalId },
      select: {
        id: true,
        nome: true,
        turmaId: true,
        turmaOriginalId: true,
        ordem: true,
        ativo: true,
        desistenteEm: true,
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });

    const frequencias = await tx.frequencia.findMany({
      where: { dia: { gte: deDate, lte: ateDate } },
      select: {
        dia: true,
        turmaId: true,
        revisao: true,
        atualizadoEm: true,
        faltas: {
          select: {
            alunoId: true,
            horarioId: true,
            justificativa: true,
            observacao: true,
          },
        },
        alunos: { select: { alunoId: true } },
        aulas: { select: { horarioId: true } },
      },
      orderBy: [{ dia: "asc" }, { turmaId: "asc" }],
    });

    const justificativas = await tx.justificativa.findMany({
      select: { codigo: true, rotulo: true },
      orderBy: { rotulo: "asc" },
    });

    const resumo = await resumoAcumuladoDosAlunos(
      tx,
      alunos.map((aluno) => aluno.id),
      hoje,
    );
    const alunosDoDominio = alunos.map(alunoDoBanco);
    const turmasDoDominio = turmas.map(turmaDoBanco);
    const frequenciasDoDominio = frequencias.map(frequenciaDoBanco);
    const grade = montarGrade(
      alunosDoDominio,
      frequenciasDoDominio,
      dias,
      turmasDoDominio.flatMap((item) => item.horarios),
    );
    const relatorio = montarRelatorioGrade({
      turmaOriginalId,
      turmaOriginal: rotuloDeTurma(turma.serie.nome, turma.nome),
      turmas: turmasDoDominio,
      dias,
      linhas: grade.linhas,
      frequencias: frequenciasDoDominio,
      horarios: turmasDoDominio.flatMap((item) => item.horarios),
      resumo,
      justificativas,
      justificativasPorAlunoDia: mapaDeJustificativas(frequencias),
    });
    const emTexto = new Intl.DateTimeFormat("pt-BR", {
      timeZone: ambiente.fuso,
      dateStyle: "short",
      timeStyle: "medium",
    }).format(agora);
    return {
      versao: 1,
      retrato: {
        em: agora.toISOString(),
        emTexto,
        fuso: ambiente.fuso,
        hash: hashDoRelatorio(relatorio),
      },
      relatorio,
    } satisfies RetratoGrade;
  }, OPCOES_TRANSACAO_RETRATO);
}
