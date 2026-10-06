// Consulta saídas e entradas por período, mantendo a turma histórica das entradas.
import { z } from "zod";
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { ErroHttp } from "@/infra/erros";
import { diaLocal, diaSeguinte, ehDiaValido, partesJustificativaSaida } from "@/domain/frequencia";
import {
  LIMITE_DIAS_RELATORIO_MOVIMENTACOES,
  type MovimentacaoRelatorio,
  type RelatorioMovimentacoes,
  type TurmaRelatorioMovimentacoes,
} from "@/domain/relatorio-movimentacoes";

const esquemaFiltro = z.object({
  de: z.string("Informe a data inicial.").refine(ehDiaValido, "Data inicial inválida."),
  ate: z.string("Informe a data final.").refine(ehDiaValido, "Data final inválida."),
  turmaId: z.uuid("Turma inválida.").optional(),
});

export async function consultarRelatorioMovimentacoes(
  entrada: unknown,
): Promise<RelatorioMovimentacoes> {
  const dados = esquemaFiltro.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Período inválido.", 400);
  const { de, ate, turmaId } = dados.data;
  if (ate < de) throw new ErroHttp("A data final deve ser igual ou posterior à inicial.", 400);
  if (ate > diaLocal(new Date(), ambiente.fuso))
    throw new ErroHttp("O período não pode incluir dias futuros.", 400);
  if (ate > diaSeguinte(de, LIMITE_DIAS_RELATORIO_MOVIMENTACOES - 1))
    throw new ErroHttp(
      `Escolha um período de até ${LIMITE_DIAS_RELATORIO_MOVIMENTACOES} dias.`,
      400,
    );

  const dia = { gte: new Date(`${de}T12:00:00Z`), lte: new Date(`${ate}T12:00:00Z`) };
  const [saidas, entradas, justificativas, liberadores] = await Promise.all([
    banco().saidaAntecipada.findMany({
      where: { dia, ...(turmaId ? { aluno: { turmaId } } : {}) },
      select: {
        id: true,
        alunoId: true,
        dia: true,
        horario: true,
        momento: true,
        justificativa: true,
        observacao: true,
        texto: true,
        liberadoPorCodigo: true,
        liberadoPor: { select: { nome: true } },
        aluno: {
          select: {
            nome: true,
            turmaId: true,
            turma: { select: { nome: true, serie: { select: { nome: true } } } },
          },
        },
      },
    }),
    banco().entradaAtrasada.findMany({
      where: { dia, ...(turmaId ? { turmaId } : {}) },
      select: {
        id: true,
        alunoId: true,
        turmaId: true,
        turmaRotulo: true,
        dia: true,
        horario: true,
        momento: true,
        motivo: true,
        responsavelRegistroNome: true,
        registradoPorNome: true,
        aluno: { select: { nome: true } },
      },
    }),
    banco().justificativa.findMany({ select: { codigo: true, rotulo: true } }),
    banco().liberador.findMany({ select: { codigo: true, rotulo: true } }),
  ]);
  const grupos = new Map<string, TurmaRelatorioMovimentacoes>();
  function adicionar(idTurma: string, turmaRotulo: string, movimentacao: MovimentacaoRelatorio) {
    // O rótulo também compõe a chave para preservar nomes históricos após renomeações.
    const chave = JSON.stringify([idTurma, turmaRotulo]);
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = {
        turmaId: idTurma,
        turmaRotulo,
        saidas: 0,
        entradas: 0,
        total: 0,
        movimentacoes: [],
      };
      grupos.set(chave, grupo);
    }
    grupo.movimentacoes.push(movimentacao);
    grupo.total += 1;
    if (movimentacao.tipo === "SAIDA") grupo.saidas += 1;
    else grupo.entradas += 1;
  }

  const rotulosLiberadores = new Map(liberadores.map((item) => [item.codigo, item.rotulo]));
  for (const saida of saidas) {
    const justificativa = partesJustificativaSaida(saida, justificativas);
    // Saídas não têm retrato da turma no banco; a consulta acompanha a turma atual.
    adicionar(saida.aluno.turmaId, `${saida.aluno.turma.serie.nome} ${saida.aluno.turma.nome}`, {
      id: saida.id,
      tipo: "SAIDA",
      alunoId: saida.alunoId,
      alunoNome: saida.aluno.nome,
      dia: saida.dia.toISOString().slice(0, 10),
      horario: saida.horario,
      momento: saida.momento,
      motivo: [justificativa.motivo, justificativa.complemento].filter(Boolean).join(" · "),
      responsavel:
        (saida.liberadoPorCodigo ? rotulosLiberadores.get(saida.liberadoPorCodigo) : null) ??
        saida.liberadoPor?.nome ??
        null,
    });
  }
  for (const entrada of entradas) {
    adicionar(entrada.turmaId, entrada.turmaRotulo, {
      id: entrada.id,
      tipo: "ENTRADA",
      alunoId: entrada.alunoId,
      alunoNome: entrada.aluno.nome,
      dia: entrada.dia.toISOString().slice(0, 10),
      horario: entrada.horario,
      momento: entrada.momento,
      motivo: entrada.motivo,
      responsavel: entrada.responsavelRegistroNome ?? entrada.registradoPorNome,
    });
  }
  const compararTexto = (a: string, b: string) =>
    a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
  const turmas = [...grupos.values()].sort(
    (a, b) => compararTexto(a.turmaRotulo, b.turmaRotulo) || a.turmaId.localeCompare(b.turmaId),
  );
  for (const turma of turmas) {
    turma.movimentacoes.sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99") ||
        compararTexto(a.alunoNome, b.alunoNome) ||
        a.tipo.localeCompare(b.tipo) ||
        a.id.localeCompare(b.id),
    );
  }
  return {
    de,
    ate,
    totais: {
      saidas: saidas.length,
      entradas: entradas.length,
      total: saidas.length + entradas.length,
    },
    turmas,
  };
}
