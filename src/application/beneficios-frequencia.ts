// Regras de frequência mínima dos benefícios: gestão pela administração, com auditoria, e o cálculo
// dos alertas do mês que a Chamada mostra. Nenhum percentual ou nome de benefício vive no código.
import { z } from "zod";
import { listarTodosAlunos } from "@/application/alunos";
import { listarFeriados } from "@/application/calendario-letivo";
import { listarTodasTurmas } from "@/application/turmas";
import { diasDoMes } from "@/domain/frequencia";
import {
  alertasDeFrequencia,
  PERCENTUAL_MINIMO_MAIOR,
  PERCENTUAL_MINIMO_MENOR,
  AULAS_POR_DIA_MAXIMO,
  type AlertaFrequenciaBeneficio,
  type RegraFrequenciaBeneficio,
} from "@/domain/beneficios-frequencia";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp, ehDuplicidade } from "@/infra/erros";

const nomeBeneficio = z
  .string("Informe o nome do benefício.")
  .trim()
  .min(2, "O nome deve ter ao menos 2 caracteres.")
  .max(60, "O nome deve ter no máximo 60 caracteres.");

const percentualMinimo = z
  .number("Informe o percentual mínimo de frequência.")
  .int("O percentual mínimo deve ser um número inteiro.")
  .min(
    PERCENTUAL_MINIMO_MENOR,
    `O percentual mínimo deve ser de ao menos ${PERCENTUAL_MINIMO_MENOR}%.`,
  )
  .max(
    PERCENTUAL_MINIMO_MAIOR,
    `O percentual mínimo deve ser de no máximo ${PERCENTUAL_MINIMO_MAIOR}%.`,
  );

const cargaDiaria = z
  .number("Informe a quantidade de aulas por dia.")
  .int("A quantidade de aulas por dia deve ser um número inteiro.")
  .min(1, "Informe ao menos uma aula por dia.")
  .max(AULAS_POR_DIA_MAXIMO, `Informe até ${AULAS_POR_DIA_MAXIMO} aulas por dia.`)
  .nullable();

export const esquemaCriarBeneficio = z.object({
  nome: nomeBeneficio,
  percentualMinimoFrequencia: percentualMinimo,
  aulasPorDia: cargaDiaria.default(null),
  faltasJustificadasContam: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const esquemaAtualizarBeneficio = z
  .object({
    nome: nomeBeneficio.optional(),
    percentualMinimoFrequencia: percentualMinimo.optional(),
    aulasPorDia: cargaDiaria.optional(),
    faltasJustificadasContam: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

const CAMPOS = {
  id: true,
  nome: true,
  percentualMinimoFrequencia: true,
  aulasPorDia: true,
  faltasJustificadasContam: true,
  ativo: true,
} as const;

const MENSAGEM_DUPLICADO = "Já existe um benefício com este nome.";

/** Benefícios em ordem alfabética pelo nome, ativos ou não. */
export async function listarBeneficios(): Promise<RegraFrequenciaBeneficio[]> {
  const linhas = await banco().beneficioFrequencia.findMany({ select: CAMPOS });
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Cria um benefício com a regra de frequência mínima. */
export async function criarBeneficio(
  admin: { id: string },
  entrada: unknown,
): Promise<RegraFrequenciaBeneficio> {
  const dados = esquemaCriarBeneficio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().beneficioFrequencia.findFirst({
    where: { nome: { equals: dados.data.nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) throw new ErroHttp(MENSAGEM_DUPLICADO, 409);
  try {
    return await comTransacao(async (tx) => {
      const criado = await tx.beneficioFrequencia.create({ data: dados.data, select: CAMPOS });
      await auditar(
        tx,
        admin.id,
        "beneficio.criar",
        `${criado.nome} (${criado.percentualMinimoFrequencia}%)`,
      );
      return criado;
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) throw new ErroHttp(MENSAGEM_DUPLICADO, 409);
    throw erro;
  }
}

/** Atualiza nome, percentual, tratamento de justificadas ou situação de um benefício. */
export async function atualizarBeneficio(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<RegraFrequenciaBeneficio> {
  const dados = esquemaAtualizarBeneficio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().beneficioFrequencia.findUnique({
    where: { id },
    select: { id: true, nome: true },
  });
  if (!existente) throw new ErroHttp("Benefício não encontrado.", 404);
  if (dados.data.nome !== undefined) {
    const outro = await banco().beneficioFrequencia.findFirst({
      where: { nome: { equals: dados.data.nome, mode: "insensitive" }, NOT: { id } },
      select: { id: true },
    });
    if (outro) throw new ErroHttp(MENSAGEM_DUPLICADO, 409);
  }
  try {
    return await comTransacao(async (tx) => {
      const atualizado = await tx.beneficioFrequencia.update({
        where: { id },
        data: dados.data,
        select: CAMPOS,
      });
      const campos = Object.entries(dados.data)
        .filter(([, valor]) => valor !== undefined)
        .map(([campo]) => campo)
        .join(", ");
      await auditar(tx, admin.id, "beneficio.atualizar", `${existente.nome} (${campos})`);
      return atualizado;
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) throw new ErroHttp(MENSAGEM_DUPLICADO, 409);
    throw erro;
  }
}

/** Remove um benefício. Não há histórico preso a ele: os alertas são calculados a cada leitura. */
export async function removerBeneficio(admin: { id: string }, id: string): Promise<void> {
  const existente = await banco().beneficioFrequencia.findUnique({
    where: { id },
    select: { id: true, nome: true },
  });
  if (!existente) throw new ErroHttp("Benefício não encontrado.", 404);
  await comTransacao(async (tx) => {
    await tx.beneficioFrequencia.delete({ where: { id } });
    await auditar(tx, admin.id, "beneficio.excluir", existente.nome);
  });
}

/** Alertas do mês informado (AAAA-MM), segundo as regras dos benefícios ativos. */
export async function alertasDeBeneficiosDoMes(mes: string): Promise<AlertaFrequenciaBeneficio[]> {
  const dias = diasDoMes(mes);
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  if (!primeiro || !ultimo) return [];
  const regras = (await listarBeneficios()).filter((regra) => regra.ativo);
  if (regras.length === 0) return [];
  const [alunos, turmas, feriados, linhas] = await Promise.all([
    listarTodosAlunos(),
    listarTodasTurmas(),
    listarFeriados(Number(mes.slice(0, 4))),
    banco().frequencia.findMany({
      where: {
        dia: { gte: new Date(`${primeiro}T12:00:00Z`), lte: new Date(`${ultimo}T12:00:00Z`) },
      },
      select: {
        dia: true,
        turmaId: true,
        aulas: { select: { horarioId: true } },
        alunos: { select: { alunoId: true } },
        faltas: { select: { alunoId: true, justificativa: true } },
      },
    }),
  ]);
  return alertasDeFrequencia({
    mes,
    alunos,
    turmas,
    feriados,
    regras,
    chamadas: linhas.map((linha) => ({
      dia: linha.dia.toISOString().slice(0, 10),
      turmaId: linha.turmaId,
      aulas: linha.aulas.length,
      alunoIds: linha.alunos.map((aluno) => aluno.alunoId),
    })),
    faltas: linhas.flatMap((linha) =>
      linha.faltas.map((falta) => ({
        alunoId: falta.alunoId,
        justificada: Boolean(falta.justificativa),
      })),
    ),
  });
}
