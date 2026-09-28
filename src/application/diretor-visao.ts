// Visão do diretor de turma: contexto da sessão (troca obrigatória, turmas
// vigentes e o que pode ver) e estatísticas da turma de origem. O escopo sai
// sempre do banco; nenhum identificador vindo do navegador o amplia (ADR-021).
import { z } from "zod";
import { banco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ambiente } from "@/infra/ambiente";
import { diaLocal, diasEntre, ehDiaValido, montarGrade, rotuloDeTurma } from "@/domain/frequencia";
import { categoriasValidas, recortarAoVinculo, vinculoVigente } from "@/domain/diretores";
import {
  estatisticasDaGrade,
  type ContextoDiretor,
  type EstatisticasDoDiretor,
  type TurmaDoDiretor,
} from "@/domain/estatisticas-diretor";
import { lerParametrosAcesso } from "@/application/parametros-acesso";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarFrequenciasDoPeriodo } from "@/application/frequencias";
import type { Identidade } from "@/domain/usuarios";

/** Período máximo de uma consulta, para a leitura continuar leve. */
const DIAS_MAXIMOS_DA_CONSULTA = 366;

export const esquemaConsulta = z
  .object({
    turmaId: z.string().uuid("Turma inválida."),
    de: z.string().refine(ehDiaValido, "Data inicial inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida."),
  })
  .refine((dados) => dados.de <= dados.ate, "A data inicial vem depois da final.")
  .refine(
    (dados) => diasEntre(dados.de, dados.ate).length <= DIAS_MAXIMOS_DA_CONSULTA,
    "Consulte no máximo um ano por vez.",
  );

function diaDe(data: Date): string {
  return data.toISOString().slice(0, 10);
}

async function vinculosDoDiretor(usuarioId: string): Promise<TurmaDoDiretor[]> {
  const linhas = await banco().vinculoDiretor.findMany({
    where: { usuarioId },
    select: {
      turmaId: true,
      inicio: true,
      fim: true,
      turma: { select: { nome: true, serie: { select: { nome: true, ordem: true } } } },
    },
    orderBy: [{ turma: { serie: { ordem: "asc" } } }, { turma: { nome: "asc" } }],
  });
  return linhas.map((linha) => ({
    turmaId: linha.turmaId,
    turma: rotuloDeTurma(linha.turma.serie.nome, linha.turma.nome),
    inicio: diaDe(linha.inicio),
    fim: linha.fim ? diaDe(linha.fim) : null,
  }));
}

async function exigirPalavraTrocada(usuarioId: string): Promise<boolean> {
  const credencial = await banco().credencialDiretor.findUnique({
    where: { usuarioId },
    select: { trocaObrigatoria: true },
  });
  return credencial?.trocaObrigatoria ?? true;
}

/** Contexto que a página do diretor precisa para abrir. */
export async function contextoDoDiretor(usuarioId: string): Promise<ContextoDiretor> {
  const diaCorrente = diaLocal(new Date(), ambiente.fuso);
  const [trocaObrigatoria, vinculos, parametros] = await Promise.all([
    exigirPalavraTrocada(usuarioId),
    vinculosDoDiretor(usuarioId),
    lerParametrosAcesso(),
  ]);
  return {
    trocaObrigatoria,
    turmas: vinculos.filter((vinculo) => vinculoVigente(vinculo, diaCorrente)),
    categorias: parametros.categoriasDiretor,
    limiteRiscoPercentual: parametros.limiteRiscoPercentual,
    diaCorrente,
  };
}

/**
 * Estatísticas de uma turma do diretor. Exige palavra-chave já trocada e
 * vínculo vigente hoje com a turma; o período é recortado ao vínculo e ao
 * dia corrente. A consulta fica na trilha de auditoria.
 */
export async function estatisticasDoDiretor(
  usuario: Identidade,
  entrada: unknown,
): Promise<EstatisticasDoDiretor> {
  const dados = esquemaConsulta.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Consulta inválida.", 400);
  }
  if (await exigirPalavraTrocada(usuario.id)) {
    throw new ErroHttp("Troque a palavra-chave para ver as estatísticas.", 403);
  }
  const diaCorrente = diaLocal(new Date(), ambiente.fuso);
  const vinculo = (await vinculosDoDiretor(usuario.id)).find(
    (item) => item.turmaId === dados.data.turmaId && vinculoVigente(item, diaCorrente),
  );
  if (!vinculo) throw new ErroHttp("Esta turma não está entre as suas.", 403);

  const fim = vinculo.fim && vinculo.fim < diaCorrente ? vinculo.fim : diaCorrente;
  const limite = { inicio: vinculo.inicio, fim };
  const periodo = recortarAoVinculo(limite, dados.data.de, dados.data.ate);
  const base = {
    turmaId: vinculo.turmaId,
    turma: vinculo.turma,
    vinculo: { inicio: vinculo.inicio, fim: vinculo.fim },
  };
  if (!periodo) return { ...base, periodo: null, estatisticas: null };

  const [parametros, alunos, turmas, frequencias] = await Promise.all([
    lerParametrosAcesso(),
    listarTodosAlunos(),
    listarTodasTurmas(),
    listarFrequenciasDoPeriodo(periodo.de, periodo.ate),
  ]);
  // Mesmo recorte da Grade: alunos ativos da turma de origem, com a marca
  // tirada da chamada da turma atual de cada um.
  const daOrigem = alunos.filter(
    (aluno) => aluno.ativo && aluno.turmaOriginalId === vinculo.turmaId,
  );
  const turmasAtuais = new Set(daOrigem.map((aluno) => aluno.turmaId));
  const grade = montarGrade(
    daOrigem,
    frequencias.filter((frequencia) => turmasAtuais.has(frequencia.turmaId)),
    diasEntre(periodo.de, periodo.ate),
    turmas.filter((turma) => turmasAtuais.has(turma.id)).flatMap((turma) => turma.horarios),
  );

  let saidasPorAluno: Map<string, number> | undefined;
  if (parametros.categoriasDiretor.includes("saidas") && daOrigem.length > 0) {
    const grupos = await banco().saidaAntecipada.groupBy({
      by: ["alunoId"],
      where: {
        alunoId: { in: daOrigem.map((aluno) => aluno.id) },
        dia: {
          gte: new Date(`${periodo.de}T12:00:00Z`),
          lte: new Date(`${periodo.ate}T12:00:00Z`),
        },
      },
      _count: { _all: true },
    });
    saidasPorAluno = new Map(grupos.map((grupo) => [grupo.alunoId, grupo._count._all]));
  }

  await auditar(
    banco(),
    usuario.id,
    "diretor.consultar",
    `turma:${vinculo.turmaId} ${periodo.de} a ${periodo.ate}`,
  );
  return {
    ...base,
    periodo,
    estatisticas: estatisticasDaGrade(grade, {
      limiteRiscoPercentual: parametros.limiteRiscoPercentual,
      categorias: categoriasValidas(parametros.categoriasDiretor),
      ...(saidasPorAluno ? { saidasPorAluno } : {}),
    }),
  };
}
