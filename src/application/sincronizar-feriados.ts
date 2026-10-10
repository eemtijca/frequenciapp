// Sincronização administrativa dos feriados de um ano, bloqueada depois da primeira gravação.
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { travarCalendario } from "@/application/calendario-letivo";
import { conferirSenhaDoAdmin } from "@/application/confirmacao-admin";
import { ehAnoLetivoValido } from "@/domain/calendario-letivo";
import type {
  EstadoSincronizacaoFeriados,
  FeriadoExterno,
  ResumoSincronizacaoFeriados,
} from "@/domain/feriados-externos";
import { auditar } from "@/infra/auditoria";
import { banco } from "@/infra/banco";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import {
  abrangenciaFeriados,
  buscarFeriadosDoAno,
  consultaFeriadosConfigurada,
} from "@/infra/feriados-api";
import {
  conferirProvaSincronizacao,
  emitirProvaSincronizacao,
} from "@/infra/prova-sincronizacao-feriados";
import {
  comTravaPlanilhaFrequencia,
  controleTravaPlanilhaFrequencia,
} from "@/infra/trava-planilha-frequencia";
import { comTransacao } from "@/infra/transacoes";

const MENSAGEM_BLOQUEIO =
  "Os feriados já estão gravados. Informe a senha do administrador para sincronizar de novo.";

const anoDoPedido = z
  .number("Informe o ano do calendário.")
  .int("Informe o ano do calendário.")
  .refine(ehAnoLetivoValido, "Informe um ano entre 1900 e 2199.");

const esquemaSincronizar = z
  .object({
    ano: anoDoPedido,
    prova: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

const esquemaDesbloqueio = z
  .object({
    ano: anoDoPedido,
    senha: z
      .string("Informe a senha do administrador.")
      .min(1, "Informe a senha do administrador.")
      .max(200, "Informe a senha do administrador."),
  })
  .strict();

function instante(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`);
}

function diaCivil(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function exigirProva(prova: string | undefined, usuarioId: string, ano: number): void {
  if (!prova) throw new ErroHttp(MENSAGEM_BLOQUEIO, 409);
  conferirProvaSincronizacao(prova, usuarioId, ano);
}

function mensagemDe(erro: { issues: readonly { message: string }[] }): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}

/** Informa se já existe feriado importado e se a base está configurada. */
export async function lerEstadoSincronizacao(): Promise<EstadoSincronizacaoFeriados> {
  const total = await banco().feriado.count({ where: { origem: "API" } });
  return {
    sincronizado: total > 0,
    configurado: consultaFeriadosConfigurada(),
    abrangencia: abrangenciaFeriados(),
  };
}

/** Confere a senha e devolve a prova que libera uma sincronização do ano. */
export async function desbloquearSincronizacaoFeriados(
  admin: { id: string },
  entrada: unknown,
): Promise<{ prova: string }> {
  const dados = esquemaDesbloqueio.safeParse(entrada);
  if (!dados.success) throw new ErroHttp(mensagemDe(dados.error), 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "sincronizar-feriados");
  return { prova: emitirProvaSincronizacao(admin.id, dados.data.ano) };
}

async function gravar(
  tx: Prisma.TransactionClient,
  admin: { id: string },
  ano: number,
  feriados: readonly FeriadoExterno[],
  prova: string | undefined,
): Promise<ResumoSincronizacaoFeriados> {
  await travarCalendario(tx, "SHARE ROW EXCLUSIVE");
  const importados = await tx.feriado.count({ where: { origem: "API" } });
  if (importados > 0) exigirProva(prova, admin.id, ano);

  const linhas = await tx.feriado.findMany({
    where: { dia: { gte: instante(`${ano}-01-01`), lte: instante(`${ano}-12-31`) } },
    select: { dia: true, nome: true, origem: true },
  });
  const porDia = new Map(linhas.map((linha) => [diaCivil(linha.dia), linha]));
  const datasNovas = feriados
    .filter((feriado) => !porDia.has(feriado.dia))
    .map((feriado) => instante(feriado.dia));
  const [chamadas, parciais] = await Promise.all([
    datasNovas.length === 0
      ? []
      : tx.frequencia.findMany({ where: { dia: { in: datasNovas } }, select: { dia: true } }),
    datasNovas.length === 0
      ? []
      : tx.frequenciaParcial.findMany({
          where: { dia: { in: datasNovas } },
          select: { dia: true },
        }),
  ]);
  const ocupados = new Set([
    ...chamadas.map((item) => diaCivil(item.dia)),
    ...parciais.map((item) => diaCivil(item.dia)),
  ]);
  const resumo = { gravados: 0, atualizados: 0, mantidos: 0, ignorados: 0 };

  for (const feriado of feriados) {
    const atual = porDia.get(feriado.dia);
    if (!atual) {
      if (ocupados.has(feriado.dia)) {
        resumo.ignorados += 1;
        continue;
      }
      controleTravaPlanilhaFrequencia()?.conferir();
      await tx.feriado.create({
        data: {
          dia: instante(feriado.dia),
          nome: feriado.nome,
          origem: "API",
          criadoPorId: admin.id,
        },
      });
      resumo.gravados += 1;
      continue;
    }
    if (atual.origem !== "API" || atual.nome === feriado.nome) {
      resumo.mantidos += 1;
      continue;
    }
    controleTravaPlanilhaFrequencia()?.conferir();
    await tx.feriado.update({
      where: { dia: instante(feriado.dia) },
      data: { nome: feriado.nome },
    });
    resumo.atualizados += 1;
  }

  controleTravaPlanilhaFrequencia()?.conferir();
  await auditar(tx, admin.id, "feriado.sincronizar", `feriados:${ano}`);
  controleTravaPlanilhaFrequencia()?.conferir();
  return { ...resumo, sincronizado: importados > 0 || resumo.gravados > 0 };
}

/** Busca todas as páginas do ano e grava. Com feriado importado, exige a prova da senha. */
export async function sincronizarFeriados(
  admin: { id: string },
  entrada: unknown,
): Promise<ResumoSincronizacaoFeriados> {
  const dados = esquemaSincronizar.safeParse(entrada);
  if (!dados.success) throw new ErroHttp(mensagemDe(dados.error), 400);
  if (!consultaFeriadosConfigurada()) {
    throw new ErroHttp(
      "A consulta de feriados não está configurada.",
      503,
      "FERIADOS_CONFIGURACAO",
    );
  }
  const importados = await banco().feriado.count({ where: { origem: "API" } });
  if (importados > 0) exigirProva(dados.data.prova, admin.id, dados.data.ano);

  const feriados = await buscarFeriadosDoAno(dados.data.ano);
  if (feriados.length === 0) {
    throw new ErroHttp("A consulta não retornou feriados para este ano.", 400);
  }

  try {
    return await comTravaPlanilhaFrequencia(() =>
      comTransacao((tx) => gravar(tx, admin, dados.data.ano, feriados, dados.data.prova)),
    );
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp(
        "O calendário mudou durante a sincronização. Atualize e tente novamente.",
        409,
      );
    }
    throw erro;
  }
}
