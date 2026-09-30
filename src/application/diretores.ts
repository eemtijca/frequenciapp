// Diretores de turma, geridos pela administração: cadastro com vínculos às
// turmas de origem, emissão e revogação da palavra-chave e situação da conta.
// Toda escrita é auditada na mesma transação (ADR-021).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { banco } from "@/infra/banco";
import { hashearSenha } from "@/infra/auth/hash";
import { gerarPalavraChave } from "@/infra/auth/palavra-chave";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp, ehDuplicidade } from "@/infra/erros";
import { ambiente } from "@/infra/ambiente";
import { diaLocal, diaSeguinte, ehDiaValido, rotuloDeTurma } from "@/domain/frequencia";
import {
  estadoDaCredencial,
  normalizarLogin,
  problemaDeIdentificador,
  vinculoVigente,
  type DiretorDTO,
} from "@/domain/diretores";
import { lerParametrosAcesso } from "@/application/parametros-acesso";

const DIA_MS = 24 * 60 * 60 * 1000;

const nomeDiretor = z
  .string()
  .trim()
  .min(2, "O nome deve ter ao menos 2 caracteres.")
  .max(100, "O nome deve ter no máximo 100 caracteres.");

const identificadorDiretor = z
  .string()
  .transform(normalizarLogin)
  .superRefine((valor, contexto) => {
    const problema = problemaDeIdentificador(valor);
    if (problema) contexto.addIssue({ code: "custom", message: problema });
  });

const turmasDoDiretor = z
  .array(z.string().uuid("Turma inválida."))
  .max(20, "Um diretor acompanha no máximo 20 turmas.")
  .transform((lista) => [...new Set(lista)]);

const inicioDoVinculo = z
  .string()
  .refine(ehDiaValido, "A data de início do acompanhamento é inválida.");

export const esquemaCriarDiretor = z.object({
  nome: nomeDiretor,
  identificador: identificadorDiretor,
  turmaIds: turmasDoDiretor.default([]),
  inicioVinculo: inicioDoVinculo.optional(),
});

export const esquemaAtualizarDiretor = z
  .object({
    nome: nomeDiretor.optional(),
    ativo: z.boolean().optional(),
    turmaIds: turmasDoDiretor.optional(),
    inicioVinculo: inicioDoVinculo.optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

export const esquemaRevogar = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, "Informe o motivo da revogação.")
    .max(200, "O motivo deve ter no máximo 200 caracteres."),
});

function diaDe(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function dataCivil(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`);
}

function hoje(): string {
  return diaLocal(new Date(), ambiente.fuso);
}

const PRIMEIRO_DIA_ACOMPANHAMENTO = "2000-01-01";

/** Início pedido para o acompanhamento: passado à vontade, futuro nunca. */
function inicioPedido(informado: string | undefined, dia: string): string {
  if (informado === undefined) return dia;
  if (informado > dia) {
    throw new ErroHttp("A data de início do acompanhamento não pode ser futura.", 400);
  }
  if (informado < PRIMEIRO_DIA_ACOMPANHAMENTO) {
    throw new ErroHttp("A data de início do acompanhamento é anterior ao permitido.", 400);
  }
  return informado;
}

/** Hash de uma senha aleatória descartada: a conta existe, mas ninguém entra. */
async function hashInutilizavel(): Promise<string> {
  return hashearSenha(randomBytes(32).toString("hex"));
}

const SELECAO = {
  id: true,
  nome: true,
  email: true,
  ativo: true,
  credencialDiretor: {
    select: {
      emitidaEm: true,
      expiraEm: true,
      primeiroUsoEm: true,
      revogadaEm: true,
      motivoRevogacao: true,
      trocaObrigatoria: true,
    },
  },
  vinculosDiretor: {
    select: {
      id: true,
      turmaId: true,
      inicio: true,
      fim: true,
      turma: { select: { nome: true, serie: { select: { nome: true } } } },
    },
    orderBy: { inicio: "asc" as const },
  },
} as const;

type LinhaDiretor = NonNullable<Awaited<ReturnType<typeof buscarDiretor>>>;

const idValido = z.string().uuid();

/** Diretor pelo id; id malformado ou de outra conta é tratado como inexistente. */
async function buscarDiretor(id: string) {
  if (!idValido.safeParse(id).success) return null;
  return banco().usuario.findFirst({
    where: { id, papel: "DIRETOR_TURMA" },
    select: SELECAO,
  });
}

function paraDiretor(linha: LinhaDiretor, dia: string, agora: Date): DiretorDTO {
  const credencial = linha.credencialDiretor;
  const turmas = linha.vinculosDiretor
    .map((vinculo) => ({
      id: vinculo.id,
      turmaId: vinculo.turmaId,
      turma: rotuloDeTurma(vinculo.turma.serie.nome, vinculo.turma.nome),
      inicio: diaDe(vinculo.inicio),
      fim: vinculo.fim ? diaDe(vinculo.fim) : null,
    }))
    .filter((vinculo) => vinculoVigente(vinculo, dia));
  return {
    id: linha.id,
    nome: linha.nome,
    identificador: linha.email,
    ativo: linha.ativo,
    estado: estadoDaCredencial(credencial, agora),
    emitidaEm: credencial?.emitidaEm.toISOString() ?? null,
    expiraEm: credencial?.expiraEm.toISOString() ?? null,
    primeiroUsoEm: credencial?.primeiroUsoEm?.toISOString() ?? null,
    revogadaEm: credencial?.revogadaEm?.toISOString() ?? null,
    motivoRevogacao: credencial?.motivoRevogacao ?? null,
    turmas,
  };
}

async function carregarDiretor(id: string): Promise<DiretorDTO> {
  const linha = await buscarDiretor(id);
  if (!linha) throw new ErroHttp("Diretor de turma não encontrado.", 404);
  return paraDiretor(linha, hoje(), new Date());
}

async function conferirTurmas(turmaIds: string[]): Promise<void> {
  if (turmaIds.length === 0) return;
  const total = await banco().turma.count({ where: { id: { in: turmaIds } } });
  if (total !== turmaIds.length) throw new ErroHttp("Turma não encontrada.", 404);
}

/** Todos os diretores, ativos primeiro, com o estado da palavra-chave. */
export async function listarDiretores(): Promise<DiretorDTO[]> {
  const linhas = await banco().usuario.findMany({
    where: { papel: "DIRETOR_TURMA" },
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    select: SELECAO,
  });
  const dia = hoje();
  const agora = new Date();
  return linhas.map((linha) => paraDiretor(linha, dia, agora));
}

/**
 * Cadastra o diretor sem palavra-chave: a conta só permite entrar depois da
 * emissão. Os vínculos começam na data informada (padrão: hoje), que pode ser
 * retroativa para o acompanhamento cobrir o período em que já exercia a função.
 */
export async function criarDiretor(admin: { id: string }, entrada: unknown): Promise<DiretorDTO> {
  const dados = esquemaCriarDiretor.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().usuario.findFirst({
    where: { email: { equals: dados.data.identificador, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) throw new ErroHttp("Já existe uma conta com este identificador.", 409);
  await conferirTurmas(dados.data.turmaIds);
  const senhaHash = await hashInutilizavel();
  const inicio = dataCivil(inicioPedido(dados.data.inicioVinculo, hoje()));
  try {
    const id = await comTransacao(async (tx) => {
      const criado = await tx.usuario.create({
        data: {
          nome: dados.data.nome,
          email: dados.data.identificador,
          senhaHash,
          papel: "DIRETOR_TURMA",
          ativo: true,
        },
        select: { id: true },
      });
      if (dados.data.turmaIds.length > 0) {
        await tx.vinculoDiretor.createMany({
          data: dados.data.turmaIds.map((turmaId) => ({
            usuarioId: criado.id,
            turmaId,
            inicio,
            criadoPorId: admin.id,
          })),
        });
      }
      await auditar(
        tx,
        admin.id,
        "diretor.criar",
        `${dados.data.identificador} (${dados.data.turmaIds.length} turmas)`,
      );
      return criado.id;
    });
    return carregarDiretor(id);
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp("Já existe uma conta com este identificador.", 409);
    }
    throw erro;
  }
}

/**
 * Atualiza nome, situação e turmas. Turma retirada deixa de valer na hora e
 * o vínculo fica no histórico; desativar encerra as sessões abertas.
 */
export async function atualizarDiretor(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<DiretorDTO> {
  const dados = esquemaAtualizarDiretor.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const alvo = await buscarDiretor(id);
  if (!alvo) throw new ErroHttp("Diretor de turma não encontrado.", 404);
  const turmaIds = dados.data.turmaIds;
  if (turmaIds) await conferirTurmas(turmaIds);
  const dia = hoje();
  const inicioNovo = inicioPedido(dados.data.inicioVinculo, dia);
  const diaData = dataCivil(inicioNovo);

  await comTransacao(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: {
        ...(dados.data.nome !== undefined ? { nome: dados.data.nome } : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
      },
    });
    if (dados.data.ativo === false) {
      await tx.assinaturaPush.deleteMany({ where: { usuarioId: id } });
      await tx.sessao.deleteMany({ where: { usuarioId: id } });
    }
    if (turmaIds || dados.data.inicioVinculo !== undefined) {
      const vigentes = await tx.vinculoDiretor.findMany({
        where: { usuarioId: id, fim: null },
        select: { id: true, turmaId: true, inicio: true },
      });
      // Antecipar o início de quem já é acompanhado: a data informada só vale
      // se for anterior à registrada, para nunca esconder dias já visíveis.
      if (dados.data.inicioVinculo !== undefined) {
        for (const vinculo of vigentes) {
          const mantida = turmaIds ? turmaIds.includes(vinculo.turmaId) : true;
          if (mantida && inicioNovo < diaDe(vinculo.inicio)) {
            await tx.vinculoDiretor.update({
              where: { id: vinculo.id },
              data: { inicio: diaData },
            });
          }
        }
      }
    }
    if (turmaIds) {
      const vigentes = await tx.vinculoDiretor.findMany({
        where: { usuarioId: id, fim: null },
        select: { id: true, turmaId: true, inicio: true },
      });
      // A retirada vale na hora: o vínculo termina ontem (fim é inclusivo) e,
      // se começou hoje, sai inteiro, porque não chegou a valer um dia.
      const encerrar = vigentes.filter((vinculo) => !turmaIds.includes(vinculo.turmaId));
      const ontem = dataCivil(diaSeguinte(dia, -1));
      for (const vinculo of encerrar) {
        if (diaDe(vinculo.inicio) >= dia) {
          await tx.vinculoDiretor.delete({ where: { id: vinculo.id } });
        } else {
          await tx.vinculoDiretor.update({ where: { id: vinculo.id }, data: { fim: ontem } });
        }
      }
      const jaVigentes = new Set(vigentes.map((vinculo) => vinculo.turmaId));
      const novas = turmaIds.filter((turmaId) => !jaVigentes.has(turmaId));
      if (novas.length > 0) {
        await tx.vinculoDiretor.createMany({
          data: novas.map((turmaId) => ({
            usuarioId: id,
            turmaId,
            inicio: diaData,
            criadoPorId: admin.id,
          })),
        });
      }
    }
    const mudancas = [
      dados.data.nome !== undefined ? "nome" : null,
      dados.data.ativo !== undefined ? "situação" : null,
      turmaIds !== undefined ? "turmas" : null,
      dados.data.inicioVinculo !== undefined ? "início" : null,
    ].filter((parte): parte is string => parte !== null);
    await auditar(tx, admin.id, "diretor.atualizar", `${alvo.email} (${mudancas.join(", ")})`);
  });
  return carregarDiretor(id);
}

/**
 * Emite uma palavra-chave nova e a devolve uma única vez. A anterior deixa de
 * valer, as sessões abertas caem e a troca no primeiro acesso é obrigatória.
 */
export async function emitirPalavraChave(
  admin: { id: string },
  id: string,
): Promise<{ palavraChave: string; diretor: DiretorDTO }> {
  const alvo = await buscarDiretor(id);
  if (!alvo) throw new ErroHttp("Diretor de turma não encontrado.", 404);
  if (!alvo.ativo) throw new ErroHttp("Reative o diretor antes de emitir a palavra-chave.", 409);
  const parametros = await lerParametrosAcesso();
  const palavraChave = gerarPalavraChave();
  const senhaHash = await hashearSenha(palavraChave);
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + parametros.validadePalavraDias * DIA_MS);
  const credencial = {
    emitidaEm: agora,
    expiraEm,
    primeiroUsoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    trocaObrigatoria: true,
  };
  await comTransacao(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { senhaHash } });
    await tx.credencialDiretor.upsert({
      where: { usuarioId: id },
      update: credencial,
      create: { usuarioId: id, ...credencial },
    });
    await tx.assinaturaPush.deleteMany({ where: { usuarioId: id } });
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await auditar(tx, admin.id, "diretor.emitirPalavraChave", alvo.email);
  });
  return { palavraChave, diretor: await carregarDiretor(id) };
}

/**
 * Revoga a palavra-chave com motivo: a senha vira inutilizável e todas as
 * sessões do diretor caem na hora. Só uma nova emissão devolve o acesso.
 */
export async function revogarPalavraChave(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<DiretorDTO> {
  const dados = esquemaRevogar.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const alvo = await buscarDiretor(id);
  if (!alvo) throw new ErroHttp("Diretor de turma não encontrado.", 404);
  if (!alvo.credencialDiretor || alvo.credencialDiretor.revogadaEm) {
    throw new ErroHttp("Não há palavra-chave ativa para revogar.", 409);
  }
  const senhaHash = await hashInutilizavel();
  await comTransacao(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { senhaHash } });
    await tx.credencialDiretor.update({
      where: { usuarioId: id },
      data: { revogadaEm: new Date(), motivoRevogacao: dados.data.motivo },
    });
    await tx.assinaturaPush.deleteMany({ where: { usuarioId: id } });
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await auditar(tx, admin.id, "diretor.revogarPalavraChave", alvo.email);
  });
  return carregarDiretor(id);
}
