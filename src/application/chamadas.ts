// Casos de uso da chamada diária: carregar, listar o mês e salvar
// com proteção de duplicata e conflito por revisão. O salvamento roda
// em transação Serializable: ou a chamada inteira (revisão e faltas)
// é gravada, ou nada é; salvamentos concorrentes de outros aparelhos
// são recusados sem sobrescrita e com repetição automática curta.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp, ehConflitoDeSerializacao, ehDuplicidade } from "@/infra/erros";
import { podeChamarTurma } from "@/application/turmas";
import {
  ehDiaValido,
  ehMesValido,
  rotuloDeTurma,
  type Chamada,
  type ResultadoSalvamento,
} from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

export const esquemaSalvarChamada = z.object({
  dia: z.string().refine(ehDiaValido, "Data inválida."),
  turmaId: z.string().uuid("Turma inválida."),
  faltas: z.array(z.string().uuid()).max(500, "Lista de faltas grande demais."),
  revisao: z.number().int().min(0, "Revisão inválida.").max(999999),
});

interface LinhaChamada {
  dia: Date;
  turmaId: string;
  revisao: number;
  atualizadoEm: Date;
  faltas: { alunoId: string }[];
}

function paraChamada(linha: LinhaChamada): Chamada {
  return {
    dia: linha.dia.toISOString().slice(0, 10),
    turmaId: linha.turmaId,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    faltas: linha.faltas.map((falta) => falta.alunoId),
  };
}

const COMPLEMENTO = { include: { faltas: { select: { alunoId: true } } } } as const;

/** Chamada de um dia e turma, ou null quando inexistente. */
export async function carregarChamada(
  professorId: string,
  dia: string,
  turmaId: string,
): Promise<Chamada | null> {
  const linha = await banco().chamada.findUnique({
    where: { professorId_turmaId_dia: { professorId, turmaId, dia: new Date(`${dia}T12:00:00Z`) } },
    ...COMPLEMENTO,
  });
  return linha ? paraChamada(linha) : null;
}

/** Todas as chamadas de um mês do professor. */
export async function listarChamadasDoMes(professorId: string, mes: string): Promise<Chamada[]> {
  const [anoTexto = "0", numeroTexto = "0"] = mes.split("-");
  const inicio = new Date(Date.UTC(Number(anoTexto), Number(numeroTexto) - 1, 1));
  const fim = new Date(Date.UTC(Number(anoTexto), Number(numeroTexto), 1));
  const linhas = await banco().chamada.findMany({
    where: { professorId, dia: { gte: inicio, lt: fim } },
    orderBy: [{ dia: "asc" }, { turma: { nome: "asc" } }],
    ...COMPLEMENTO,
  });
  return linhas.map(paraChamada);
}

/**
 * Salva a chamada de um dia e turma.
 * revisao 0 cria a primeira versão; duplicata devolve conflito.
 * revisao N atualiza apenas se a versão vigente for N: salvamentos
 * de outro aparelho no intervalo são recusados sem sobrescrita.
 * Faltas de alunos que não pertencem à turma são rejeitadas, com a
 * checagem dentro da própria transação.
 */
export async function salvarChamada(
  identidade: Identidade,
  entrada: unknown,
): Promise<ResultadoSalvamento> {
  const dados = esquemaSalvarChamada.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const { dia, turmaId, faltas, revisao } = dados.data;

  const turma = await banco().turma.findUnique({
    where: { id: turmaId },
    include: { serie: { select: { nome: true } } },
  });
  if (!turma) throw new ErroHttp("Turma não encontrada.", 404);
  if (!(await podeChamarTurma(identidade, turmaId))) {
    throw new ErroHttp("Você não tem esta turma atribuída. Procure o administrador.", 403);
  }

  const diaUtc = new Date(`${dia}T12:00:00Z`);
  const ausentes = [...new Set(faltas)];
  const filtroChamada = { professorId: identidade.id, dia: diaUtc, turmaId } as const;
  const alvo = `turma ${rotuloDeTurma(turma.serie.nome, turma.nome)} em ${dia}`;

  try {
    return await comTransacao(async (tx) => {
      // Validação dentro da transação: a lista de alunos não pode ter
      // mudado entre a leitura da tela e o salvamento.
      const alunosDaTurma = await tx.aluno.findMany({
        where: { turmaId, ativo: true },
        select: { id: true },
      });
      const idsValidos = new Set(alunosDaTurma.map((aluno) => aluno.id));
      const invalidos = ausentes.filter((id) => !idsValidos.has(id));
      if (invalidos.length > 0) {
        throw new ErroHttp(
          "A lista de alunos mudou enquanto você marcava. Recarregue a chamada e confira.",
          400,
        );
      }

      if (revisao === 0) {
        const existente = await tx.chamada.findUnique({
          where: { professorId_turmaId_dia: filtroChamada },
          ...COMPLEMENTO,
        });
        if (existente) {
          return { situacao: "conflito" as const, chamada: paraChamada(existente) };
        }
        const criada = await tx.chamada.create({
          data: {
            professorId: identidade.id,
            dia: diaUtc,
            turmaId,
            revisao: 1,
            faltas: { create: ausentes.map((alunoId) => ({ alunoId })) },
          },
          ...COMPLEMENTO,
        });
        await auditar(tx, identidade.id, "chamada.salvar", `${alvo} (nova)`);
        return { situacao: "salvo" as const, chamada: paraChamada(criada) };
      }

      const atualizada = await tx.chamada.updateMany({
        where: { ...filtroChamada, revisao },
        data: { revisao: { increment: 1 } },
      });
      if (atualizada.count === 0) {
        const vigente = await tx.chamada.findUnique({
          where: { professorId_turmaId_dia: filtroChamada },
          ...COMPLEMENTO,
        });
        if (!vigente) throw new ErroHttp("Chamada não encontrada para atualizar.", 404);
        return { situacao: "conflito" as const, chamada: paraChamada(vigente) };
      }
      const linha = await tx.chamada.findUnique({
        where: { professorId_turmaId_dia: filtroChamada },
        ...COMPLEMENTO,
      });
      if (!linha) throw new ErroHttp("Chamada não encontrada para atualizar.", 404);
      await tx.falta.deleteMany({ where: { chamadaId: linha.id } });
      if (ausentes.length > 0) {
        await tx.falta.createMany({
          data: ausentes.map((alunoId) => ({ chamadaId: linha.id, alunoId })),
        });
      }
      await auditar(tx, identidade.id, "chamada.salvar", `${alvo} (revisão ${linha.revisao})`);
      return {
        situacao: "salvo" as const,
        chamada: { ...paraChamada(linha), faltas: ausentes },
      };
    });
  } catch (erro) {
    if (ehConflitoDeSerializacao(erro) || ehDuplicidade(erro)) {
      const vigente = await banco().chamada.findUnique({
        where: { professorId_turmaId_dia: filtroChamada },
        ...COMPLEMENTO,
      });
      if (vigente) return { situacao: "conflito", chamada: paraChamada(vigente) };
    }
    throw erro;
  }
}

/** Valida parâmetros de mês e devolve o valor ou null. */
export function mesValidoOuParametro(valor: string | null): string | null {
  if (valor === null) return null;
  return ehMesValido(valor) ? valor : null;
}

/** Valida parâmetros de dia e devolve o valor ou null. */
export function diaValidoOuParametro(valor: string | null): string | null {
  if (valor === null) return null;
  return ehDiaValido(valor) ? valor : null;
}
