// PDF da Grade por turma de origem. Uma transação lê o período inteiro,
// grava o hash do retrato e devolve o arquivo dessa mesma leitura.
import { createHash } from "node:crypto";
import { z } from "zod";
import { auditar } from "@/infra/auditoria";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { lerChamadasParaRelatorio } from "@/application/frequencias";
import { disciplinasDoHorario } from "@/domain/horarios-semanais";
import {
  diaLocal,
  ehDiaValido,
  LIMITE_DIAS_PERIODO,
  rotuloDeTurma,
  type Horario,
} from "@/domain/frequencia";
import {
  canonicoDoRetrato,
  codigoDoHash,
  pdfDaGrade,
  type RetratoDaGrade,
} from "@/domain/relatorio-grade";
import type { Identidade } from "@/domain/usuarios";

const esquema = z
  .object({
    turmaOriginalId: z.uuid("Turma inválida."),
    de: z.string().refine(ehDiaValido, "Data inicial inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida."),
  })
  .strict();

export interface PdfDaGrade {
  nome: string;
  pdf: string;
  retrato: { instante: string; hash: string; codigo: string };
}

/** Gera o PDF e registra o hash, sem nome de aluno na auditoria. */
export async function prepararPdfDaGrade(
  usuario: Identidade,
  entrada: unknown,
): Promise<PdfDaGrade> {
  const dados = esquema.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Confira a turma e o período.", 400);
  }
  const { turmaOriginalId, de, ate } = dados.data;
  if (ate < de) throw new ErroHttp("A data final deve ser igual ou posterior à inicial.", 400);
  const hoje = diaLocal(new Date(), ambiente.fuso);
  if (ate > hoje) throw new ErroHttp("O período não pode passar de hoje.", 400);
  const dias =
    Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
  if (dias > LIMITE_DIAS_PERIODO) {
    throw new ErroHttp("O período é grande demais. Escolha até 366 dias.", 400);
  }

  return banco().$transaction(
    async (tx) => {
      const relogio = await tx.$queryRaw<{ instante: Date }[]>`SELECT now() AS instante`;
      const instante = relogio[0]?.instante.toISOString();
      if (!instante) throw new ErroHttp("Não foi possível registrar o instante do relatório.", 503);

      const turma = await tx.turma.findUnique({
        where: { id: turmaOriginalId },
        include: { serie: { select: { nome: true } } },
      });
      if (!turma) throw new ErroHttp("Turma não encontrada.", 404);

      const alunos = (
        await tx.aluno.findMany({
          where: { turmaOriginalId, ativo: true },
          select: {
            id: true,
            nome: true,
            ordem: true,
            turmaId: true,
            turmaOriginalId: true,
            desistenteEm: true,
          },
        })
      )
        .map((aluno) => ({
          id: aluno.id,
          nome: aluno.nome,
          ordem: aluno.ordem,
          turmaId: aluno.turmaId,
          turmaOriginalId: aluno.turmaOriginalId,
          desistenteEm: aluno.desistenteEm?.toISOString().slice(0, 10) ?? null,
        }))
        .sort(
          (a, b) =>
            a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id),
        );

      const { frequencias, brutas } = await lerChamadasParaRelatorio(tx, de, ate);
      const horariosDb = await tx.horario.findMany({
        orderBy: [{ turmaId: "asc" }, { ordem: "asc" }, { id: "asc" }],
      });
      const horarios: Horario[] = horariosDb.map((horario) => ({
        id: horario.id,
        turmaId: horario.turmaId,
        ordem: horario.ordem,
        inicio: horario.inicio,
        fim: horario.fim,
        diasSemana: [...horario.diasSemana].sort((a, b) => a - b),
        ativo: horario.ativo,
        disciplinas: disciplinasDoHorario(horario.disciplinas),
      }));
      const justificativas = (
        await tx.justificativa.findMany({
          select: { codigo: true, rotulo: true },
          orderBy: { codigo: "asc" },
        })
      ).map((item) => ({ codigo: item.codigo, rotulo: item.rotulo }));

      const ids = alunos.map((aluno) => aluno.id);
      const faltasHistoricas =
        ids.length === 0
          ? []
          : await tx.falta.findMany({
              where: {
                alunoId: { in: ids },
                frequencia: { dia: { lte: new Date(`${hoje}T12:00:00Z`) } },
              },
              select: {
                alunoId: true,
                justificativa: true,
                frequenciaId: true,
              },
            });
      const porAluno = new Map<string, Map<string, { total: number; justificadas: number }>>();
      for (const falta of faltasHistoricas) {
        const diasDoAluno = porAluno.get(falta.alunoId) ?? new Map();
        const registro = diasDoAluno.get(falta.frequenciaId) ?? { total: 0, justificadas: 0 };
        registro.total += 1;
        if (falta.justificativa) registro.justificadas += 1;
        diasDoAluno.set(falta.frequenciaId, registro);
        porAluno.set(falta.alunoId, diasDoAluno);
      }
      const historico = ids
        .map((alunoId) => {
          let faltas = 0;
          let faltasJustificadas = 0;
          for (const registro of porAluno.get(alunoId)?.values() ?? []) {
            if (registro.justificadas === registro.total) faltasJustificadas += 1;
            else faltas += 1;
          }
          return { alunoId, faltas, faltasJustificadas };
        })
        .sort((a, b) => a.alunoId.localeCompare(b.alunoId));

      const retrato: RetratoDaGrade = {
        versao: 1,
        instante,
        turmaOriginalId,
        rotulo: rotuloDeTurma(turma.serie.nome, turma.nome),
        de,
        ate,
        alunos,
        frequencias: brutas,
        horarios: horarios.map((horario) => ({
          id: horario.id,
          turmaId: horario.turmaId,
          ordem: horario.ordem,
          inicio: horario.inicio,
          fim: horario.fim,
          diasSemana: horario.diasSemana,
          ativo: horario.ativo,
          disciplinas: horario.disciplinas ?? {},
        })),
        justificativas,
        historico,
      };
      const hash = createHash("sha256").update(canonicoDoRetrato(retrato)).digest("hex");
      await auditar(tx, usuario.id, "relatorio-grade.preparar", `sha256:${hash}`);
      return {
        nome: "relatorio-grade.pdf",
        pdf: Buffer.from(pdfDaGrade(retrato, hash, frequencias, horarios)).toString("base64"),
        retrato: { instante, hash, codigo: codigoDoHash(hash) },
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 20_000 },
  );
}
