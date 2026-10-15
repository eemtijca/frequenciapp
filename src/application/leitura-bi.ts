// Leitura escolar por chave: interseção de escopos, projeções explícitas e páginas limitadas.
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp } from "@/infra/erros";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { ipDoPedido } from "@/infra/http";
import { hashChaveBi, recusarChaveBi } from "@/application/chaves-bi";
import {
  RECURSOS_BI,
  esquemaDiaBi,
  esquemaEscopoBi,
  estadoChaveBi,
  periodoBi,
  recursoPermitidoBi,
  type LinhaBi,
  type PaginaBi,
  type EscopoBi,
  type RecursoBi,
} from "@/domain/bi";
import { montarIndicadores } from "@/domain/indicadores";
import { marcaDoAluno, rotuloDeTurma } from "@/domain/frequencia";
import { disciplinasDoHorario } from "@/domain/horarios-semanais";

const pedido = z
  .object({
    recurso: z.enum(["acesso", ...RECURSOS_BI]).default("acesso"),
    inicio: esquemaDiaBi.optional(),
    fim: esquemaDiaBi.optional(),
    turmaId: z.string().uuid().optional(),
    serieId: z.string().uuid().optional(),
    pagina: z.coerce.number().int().min(1).max(1000000).default(1),
    limite: z.coerce.number().int().min(1).max(200).default(200),
  })
  .strict()
  .refine((p) => !p.inicio || !p.fim || p.inicio <= p.fim, "Confira o período da consulta.");
const civil = (d: Date) => d.toISOString().slice(0, 10);
const nome = { select: { nome: true } } as const;
const turmaSelect = { id: true, nome: true, serieId: true, serie: nome } as const;
const chamadaSelect = {
  id: true,
  dia: true,
  turmaId: true,
  revisao: true,
  criadoEm: true,
  atualizadoEm: true,
  criadoPor: nome,
  atualizadoPor: nome,
  turma: { select: { ...turmaSelect, horarios: true } },
  alunos: { select: { alunoId: true, aluno: { select: { nome: true, desistenteEm: true } } } },
  faltas: { select: { alunoId: true, horarioId: true, justificativa: true, observacao: true } },
  aulas: { select: { horarioId: true } },
} as const;
type Chamada = Prisma.FrequenciaGetPayload<{ select: typeof chamadaSelect }>;
/** Somente valores escolares selecionados chegam à serialização; relações de autoria expõem apenas nome. */
function linha(registro: Record<string, unknown>): LinhaBi {
  const resultado: LinhaBi = { id: String(registro.id ?? "") };
  for (const [campo, valor] of Object.entries(registro)) {
    if (/PorId$/.test(campo)) continue;
    if (valor instanceof Date) resultado[campo] = valor.toISOString();
    else if (
      valor === null ||
      typeof valor === "string" ||
      typeof valor === "number" ||
      typeof valor === "boolean"
    )
      resultado[campo] = valor;
    else if (Array.isArray(valor) && valor.every((v) => typeof v === "number"))
      resultado[campo] = valor;
    else if (campo === "disciplinas") resultado[campo] = JSON.stringify(valor);
    else if (
      valor &&
      typeof valor === "object" &&
      "nome" in valor &&
      typeof valor.nome === "string"
    )
      resultado[`${campo}Nome`] = valor.nome;
  }
  return resultado;
}
function dimensoes(
  turma: { id: string; nome: string; serieId: string; serie: { nome: string } },
  dia?: Date,
) {
  return {
    turmaId: turma.id,
    turma: rotuloDeTurma(turma.serie.nome, turma.nome),
    serieId: turma.serieId,
    serie: turma.serie.nome,
    ...(dia ? { dia: civil(dia) } : {}),
  };
}
function horarioDominio(h: Chamada["turma"]["horarios"][number]) {
  return { ...h, disciplinas: disciplinasDoHorario(h.disciplinas) };
}
function retrato(c: Chamada) {
  return {
    dia: civil(c.dia),
    turmaId: c.turmaId,
    turma: c.turma,
    horarios: c.turma.horarios.map(horarioDominio),
    alunos: c.alunos.map((a) => ({
      alunoId: a.alunoId,
      desistenteEm: a.aluno.desistenteEm ? civil(a.aluno.desistenteEm) : null,
    })),
    aulas: c.aulas.map((a) => a.horarioId),
    faltas: c.faltas,
  };
}
export async function lerDadosBi(hash: string, requisicao: Request): Promise<PaginaBi> {
  const url = new URL(requisicao.url);
  const dados = pedido.safeParse(Object.fromEntries(url.searchParams));
  if (
    !dados.success ||
    [...url.searchParams.keys()].some((k) => url.searchParams.getAll(k).length > 1)
  )
    throw new ErroHttp("Confira o recurso, o período e a página da consulta.", 400);
  const p = dados.data;
  if (!(await limiteDeTentativas(`bi-chave:${hash}`, 240, 60000)))
    throw new ErroHttp("Muitas consultas. Aguarde um minuto.", 429);
  return comTransacao(async (tx) => {
    const chave = await tx.chaveBi.findUnique({ where: { segredoHash: hash } });
    const escopo = chave ? esquemaEscopoBi.safeParse(chave.escopo) : null;
    if (!chave || estadoChaveBi(chave) !== "ativa" || !escopo?.success)
      return recusarChaveBi(hashChaveBi(ipDoPedido(requisicao)));
    const recursos = RECURSOS_BI.filter((r) => recursoPermitidoBi(escopo.data, r));
    if (p.recurso !== "acesso" && !recursos.includes(p.recurso))
      throw new ErroHttp("A chave não permite esta consulta. Confira o escopo com a Gestão.", 403);
    const periodo = periodoBi(escopo.data, p.inicio, p.fim);
    const agora = new Date();
    const turmaWhere: Prisma.TurmaWhereInput = {
      AND: [
        ...(escopo.data.series ? [{ serieId: { in: escopo.data.series } }] : []),
        ...(escopo.data.turmas ? [{ id: { in: escopo.data.turmas } }] : []),
        ...(p.serieId ? [{ serieId: p.serieId }] : []),
        ...(p.turmaId ? [{ id: p.turmaId }] : []),
      ],
    };
    const turmas =
      p.recurso === "acesso"
        ? []
        : await tx.turma.findMany({
            where: turmaWhere,
            select: turmaSelect,
            orderBy: [{ serie: { ordem: "asc" } }, { nome: "asc" }, { id: "asc" }],
          });
    const ids = turmas.map((t) => t.id);
    const turmaId = { in: ids };
    const dia = {
      ...(periodo.inicio ? { gte: new Date(`${periodo.inicio}T00:00:00Z`) } : {}),
      ...(periodo.fim ? { lte: new Date(`${periodo.fim}T00:00:00Z`) } : {}),
    };
    const paginacao = { skip: (p.pagina - 1) * p.limite, take: p.limite + 1 };
    let linhas: LinhaBi[] = [];
    if (!periodo.vazio && p.recurso !== "acesso")
      linhas = await lerRecurso(tx, p.recurso, {
        turmas,
        ids,
        turmaId,
        dia,
        paginacao,
        escopo: escopo.data,
      });
    await tx.chaveBi.update({
      where: { id: chave.id },
      data: {
        primeiroUsoEm: chave.primeiroUsoEm ?? agora,
        ultimoUsoEm: agora,
        usos: { increment: 1 },
      },
    });
    return {
      recurso: p.recurso,
      linhas: linhas.slice(0, p.limite),
      pagina: p.pagina,
      proximaPagina: linhas.length > p.limite ? p.pagina + 1 : null,
      consultadoEm: agora.toISOString(),
      escopo: escopo.data,
      recursos,
    };
  });
}
interface Recorte {
  turmas: Prisma.TurmaGetPayload<{ select: typeof turmaSelect }>[];
  ids: string[];
  turmaId: { in: string[] };
  dia: Prisma.DateTimeFilter;
  paginacao: { skip: number; take: number };
  escopo: EscopoBi;
}
async function lerRecurso(
  tx: Prisma.TransactionClient,
  recurso: RecursoBi,
  r: Recorte,
): Promise<LinhaBi[]> {
  const { turmaId, dia, paginacao } = r;
  const porId = { id: "asc" as const };
  // Chave com séries ou turmas vazias recusa tudo, inclusive os catálogos da escola.
  const negaTudo = r.escopo.series?.length === 0 || r.escopo.turmas?.length === 0;
  const dataTurma = (id: string) => {
    const t = r.turmas.find((t) => t.id === id);
    return t ? dimensoes(t) : {};
  };
  switch (recurso) {
    case "turmas":
      return r.turmas
        .slice(paginacao.skip, paginacao.skip + paginacao.take)
        .map((t) => ({ id: t.id, nome: t.nome, ...dimensoes(t) }));
    case "series": {
      const ids = [...new Set(r.turmas.map((t) => t.serieId))];
      return (
        await tx.serie.findMany({
          where: { id: { in: ids } },
          orderBy: [{ ordem: "asc" }, porId],
          ...paginacao,
        })
      ).map(linha);
    }
    case "alunos":
      return (await tx.aluno.findMany({ where: { turmaId }, orderBy: porId, ...paginacao })).map(
        (a) => ({ ...linha(a), ...dataTurma(a.turmaId), aluno: a.nome, alunoId: a.id }),
      );
    case "horarios":
      return (await tx.horario.findMany({ where: { turmaId }, orderBy: porId, ...paginacao })).map(
        (h) => ({ ...linha(h), ...dataTurma(h.turmaId), aula: h.ordem }),
      );
    case "justificativas":
      if (negaTudo) return [];
      return (await tx.justificativa.findMany({ orderBy: porId, ...paginacao })).map(linha);
    case "liberadores":
      if (negaTudo) return [];
      return (await tx.liberador.findMany({ orderBy: porId, ...paginacao })).map(linha);
    case "feriados":
      if (negaTudo) return [];
      return (
        await tx.feriado.findMany({
          where: { dia },
          select: {
            dia: true,
            nome: true,
            origem: true,
            criadoEm: true,
            atualizadoEm: true,
            criadoPor: nome,
          },
          orderBy: { dia: "asc" },
          ...paginacao,
        })
      ).map((f) => ({ ...linha(f), id: civil(f.dia), dia: civil(f.dia) }));
    case "chamadas": {
      const registros = await tx.frequencia.findMany({
        where: { turmaId, dia },
        select: chamadaSelect,
        orderBy: porId,
        ...paginacao,
      });
      return registros.map((c) => {
        const valores = montarIndicadores([retrato(c)], [], [])[0]?.linhas[0];
        return {
          ...linha(c),
          ...dimensoes(c.turma, c.dia),
          registrados: Number(valores?.[5] ?? 0),
          presentes: Number(valores?.[6] ?? 0),
          faltas: Number(valores?.[7] ?? 0),
          justificadas: Number(valores?.[8] ?? 0),
          presencaParcial: Number(valores?.[9] ?? 0),
          ausencias: Number(valores?.[10] ?? 0),
        };
      });
    }
    case "faltas": {
      const registros = await tx.falta.findMany({
        where: { frequencia: { turmaId, dia } },
        include: {
          aluno: { select: { nome: true } },
          horario: { select: { ordem: true, disciplinas: true } },
          frequencia: {
            select: { dia: true, turmaId: true, criadoPor: nome, atualizadoPor: nome },
          },
        },
        orderBy: [{ frequenciaId: "asc" }, { alunoId: "asc" }, { horarioId: "asc" }],
        ...paginacao,
      });
      return registros.map((f) => ({
        ...linha(f),
        ...dataTurma(f.frequencia.turmaId),
        id: `${f.frequenciaId}:${f.alunoId}:${f.horarioId}`,
        dia: civil(f.frequencia.dia),
        aluno: f.aluno.nome,
        aula: f.horario.ordem,
        disciplina:
          disciplinasDoHorario(f.horario.disciplinas)[String(f.frequencia.dia.getUTCDay())] ??
          "Não informada",
        autoria:
          f.frequencia.atualizadoPor?.nome ?? f.frequencia.criadoPor?.nome ?? "Não informada",
        tipo: f.justificativa ? "FJ" : "F",
        aulas: 1,
      }));
    }
    case "lista": {
      const registros = await tx.alunoDaChamada.findMany({
        where: { frequencia: { turmaId, dia } },
        select: {
          frequenciaId: true,
          alunoId: true,
          registradoSeduc: true,
          registradoSeducEm: true,
          registradoSeducPorNome: true,
          revisaoSeduc: true,
          aluno: { select: { nome: true, desistenteEm: true } },
        },
        orderBy: [{ frequenciaId: "asc" }, { alunoId: "asc" }],
        ...paginacao,
      });
      const chamadas = await tx.frequencia.findMany({
        where: { id: { in: [...new Set(registros.map((a) => a.frequenciaId))] } },
        select: chamadaSelect,
      });
      return registros.map((a) => {
        const c = chamadas.find((c) => c.id === a.frequenciaId);
        if (!c) throw new ErroHttp("A chamada foi alterada. Atualize a consulta.", 409);
        const frequencia = {
          ...c,
          dia: civil(c.dia),
          atualizadoEm: c.atualizadoEm.toISOString(),
          atualizadoPorNome: c.atualizadoPor?.nome ?? null,
          alunos: c.alunos.map((a) => a.alunoId),
          aulas: c.aulas.map((a) => a.horarioId),
          faltas: c.faltas.map((f) => ({
            alunoId: f.alunoId,
            horarios: [f.horarioId],
            justificativa: f.justificativa ?? undefined,
          })),
        };
        const marca = marcaDoAluno(
          {
            id: a.alunoId,
            nome: a.aluno.nome,
            turmaId: c.turmaId,
            turmaOriginalId: c.turmaId,
            ordem: 0,
            ativo: true,
            desistenteEm: a.aluno.desistenteEm ? civil(a.aluno.desistenteEm) : null,
          },
          civil(c.dia),
          [frequencia],
          c.turma.horarios.map(horarioDominio),
        );
        return {
          ...linha(a),
          ...dimensoes(c.turma, c.dia),
          id: `${a.frequenciaId}:${a.alunoId}`,
          aluno: a.aluno.nome,
          tipo: marca ?? "Sem marca",
          autoria: c.atualizadoPor?.nome ?? c.criadoPor?.nome ?? "Não informada",
          confirmacoes: Number(a.registradoSeduc),
        };
      });
    }
    case "saidas":
      return (
        await tx.saidaAntecipada.findMany({
          where: { dia, aluno: { turmaId } },
          include: {
            aluno: { select: { nome: true, turmaId: true } },
            criadoPor: nome,
            liberadoPor: nome,
          },
          orderBy: porId,
          ...paginacao,
        })
      ).map((s) => ({
        ...linha(s),
        ...dataTurma(s.aluno.turmaId),
        dia: civil(s.dia),
        aluno: s.aluno.nome,
        autoria: s.criadoPor?.nome ?? "Não informada",
        faixaHoraria: s.horario ? `${s.horario.slice(0, 2)}:00` : "Não informada",
      }));
    case "entradas":
      return (
        await tx.entradaAtrasada.findMany({
          where: { turmaId, dia },
          include: { aluno: { select: { nome: true } }, criadoPor: nome },
          orderBy: porId,
          ...paginacao,
        })
      ).map((e) => ({
        ...linha(e),
        ...dataTurma(e.turmaId),
        dia: civil(e.dia),
        aluno: e.aluno.nome,
        turma: e.turmaRotulo,
        autoria: e.criadoPor?.nome ?? e.registradoPorNome,
        faixaHoraria: `${e.horario.slice(0, 2)}:00`,
      }));
    case "parciais":
      return (
        await tx.frequenciaParcial.findMany({
          where: { turmaId, dia },
          include: { criadoPor: nome, atualizadoPor: nome },
          orderBy: porId,
          ...paginacao,
        })
      ).map((p) => ({
        ...linha(p),
        ...dataTurma(p.turmaId),
        dia: civil(p.dia),
        aluno: p.alunoNome,
        turma: p.turmaNome,
        quantidadeAulas: p.aulas.length,
        confirmacoes: Number(p.registradoSeduc),
        autoria: p.atualizadoPor?.nome ?? p.criadoPor?.nome ?? "Não informada",
      }));
    case "contexto": {
      if (paginacao.skip) return [];
      const datas: Date[] = [];
      const limites = [
        [
          "chamadas",
          () =>
            tx.frequencia.aggregate({
              where: { turmaId, dia },
              _min: { dia: true },
              _max: { dia: true },
            }),
        ],
        [
          "saidas",
          () =>
            tx.saidaAntecipada.aggregate({
              where: { dia, aluno: { turmaId } },
              _min: { dia: true },
              _max: { dia: true },
            }),
        ],
        [
          "entradas",
          () =>
            tx.entradaAtrasada.aggregate({
              where: { turmaId, dia },
              _min: { dia: true },
              _max: { dia: true },
            }),
        ],
        [
          "parciais",
          () =>
            tx.frequenciaParcial.aggregate({
              where: { turmaId, dia },
              _min: { dia: true },
              _max: { dia: true },
            }),
        ],
      ] as const;
      for (const [recurso, carregar] of limites) {
        if (!recursoPermitidoBi(r.escopo, recurso)) continue;
        const agregado = await carregar();
        if (agregado._min.dia) datas.push(agregado._min.dia);
        if (agregado._max.dia) datas.push(agregado._max.dia);
      }
      const configuracao = await tx.configuracao.findUnique({
        where: { id: "principal" },
        select: { frequenciaPorAula: true, saidaAntecipada: true, origemNaChamada: true },
      });
      return [
        {
          ...linha(configuracao ?? {}),
          id: "contexto",
          turmas: r.ids.length,
          ...(recursoPermitidoBi(r.escopo, "alunos")
            ? { alunosAtivos: await tx.aluno.count({ where: { turmaId, ativo: true } }) }
            : {}),
          anoInicial: datas.length
            ? Math.min(...datas.map((d) => d.getUTCFullYear()))
            : new Date().getUTCFullYear(),
          anoFinal: datas.length
            ? Math.max(...datas.map((d) => d.getUTCFullYear()))
            : new Date().getUTCFullYear(),
        },
      ];
    }
  }
}
