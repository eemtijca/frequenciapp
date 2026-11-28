// Provas específicas (Enem, vestibulares e similares): cadastro, inscrição de alunos e frequência, com auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import {
  caixaDeBusca,
  coordenadaDoTexto,
  LIMITE_PARTICIPANTES_PROVA,
  normalizarLocalDoAluno,
  normalizarProvaEspecifica,
  ocupacaoDasProvas,
  problemaNaProvaEspecifica,
  problemaNasCoordenadas,
  problemaNoLocalDoAluno,
  RAIO_DO_MESMO_LOCAL_METROS,
  resumirMarcas,
  type LocalGravado,
  type MarcaDaProva,
  type OcupacaoDoLocal,
  type ParticipanteDaProva,
  type ProvaEspecifica,
  type ProvaParaOcupacao,
} from "@/domain/provas-especificas";

const esquemaProva = z
  .object({
    nome: z.string("Informe o nome da prova."),
    local: z.string("Local inválido.").nullish(),
    latitude: z.number("Latitude inválida.").nullish(),
    longitude: z.number("Longitude inválida.").nullish(),
    dia: z.string("Informe a data da prova."),
  })
  .strict();

const listaDeAlunos = z
  .array(z.uuid("Aluno inválido."), "Informe os alunos da prova.")
  .max(LIMITE_PARTICIPANTES_PROVA, `Escolha no máximo ${LIMITE_PARTICIPANTES_PROVA} alunos.`)
  .refine((ids) => new Set(ids).size === ids.length, "Há alunos repetidos na lista.");

const esquemaParticipantes = z.object({ alunoIds: listaDeAlunos }).strict();

const esquemaLocalDoAluno = z
  .object({
    alunoId: z.uuid("Aluno inválido."),
    local: z.string("Local inválido.").nullable(),
    latitude: z.number("Latitude inválida.").nullish(),
    longitude: z.number("Longitude inválida.").nullish(),
  })
  .strict();

const esquemaLocais = z
  .object({
    locais: z
      .array(esquemaLocalDoAluno, "Informe os locais.")
      .min(1, "Informe ao menos um local.")
      .max(LIMITE_PARTICIPANTES_PROVA, `Envie no máximo ${LIMITE_PARTICIPANTES_PROVA} locais.`)
      .refine(
        (itens) => new Set(itens.map((item) => item.alunoId)).size === itens.length,
        "Há alunos repetidos na lista.",
      ),
  })
  .strict();

const esquemaFrequencia = z
  .object({
    marcas: z
      .array(
        z.object({ alunoId: z.uuid("Aluno inválido."), presente: z.boolean().nullable() }).strict(),
        "Informe as marcas de frequência.",
      )
      .min(1, "Informe ao menos uma marca.")
      .max(LIMITE_PARTICIPANTES_PROVA, `Envie no máximo ${LIMITE_PARTICIPANTES_PROVA} marcas.`),
  })
  .strict();

const coordenadaDaConsulta = z
  .string("Informe a latitude e a longitude.")
  .transform((texto, contexto) => {
    const valor = coordenadaDoTexto(texto);
    if (valor === null) {
      contexto.addIssue({ code: "custom", message: "Informe a latitude e a longitude." });
      return z.NEVER;
    }
    return valor;
  });

const esquemaOcupacao = z.object({
  latitude: coordenadaDaConsulta,
  longitude: coordenadaDaConsulta,
  provaId: z
    .string()
    .nullish()
    .transform((texto) => (texto === null || texto === undefined || texto === "" ? null : texto))
    .refine((texto) => texto === null || z.uuid().safeParse(texto).success, "Prova inválida."),
});

function primeiroErro(erro: z.ZodError): ErroHttp {
  return new ErroHttp(erro.issues[0]?.message ?? "Dados inválidos.", 400);
}

function exigirId(id: string): void {
  if (!z.uuid().safeParse(id).success) throw new ErroHttp("Prova não encontrada.", 404);
}

function paraDia(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

function validarProvaDaEntrada(entrada: unknown) {
  const dados = esquemaProva.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const prova = normalizarProvaEspecifica(dados.data);
  const problema = problemaNaProvaEspecifica(prova);
  if (problema) throw new ErroHttp(problema, 400);
  return prova;
}

/** Provas da mais recente para a mais antiga, com as contagens de frequência. */
export async function listarProvasEspecificas(): Promise<ProvaEspecifica[]> {
  const cliente = banco();
  const [provas, contagens] = await Promise.all([
    cliente.provaEspecifica.findMany({ orderBy: [{ dia: "desc" }, { nome: "asc" }] }),
    cliente.participanteProva.groupBy({ by: ["provaId", "presente"], _count: { _all: true } }),
  ]);
  return provas.map((prova) => {
    let total = 0;
    let presentes = 0;
    let ausentes = 0;
    for (const linha of contagens) {
      if (linha.provaId !== prova.id) continue;
      total += linha._count._all;
      if (linha.presente === true) presentes += linha._count._all;
      if (linha.presente === false) ausentes += linha._count._all;
    }
    return {
      id: prova.id,
      nome: prova.nome,
      local: prova.local,
      latitude: prova.latitude,
      longitude: prova.longitude,
      dia: paraDia(prova.dia),
      total,
      presentes,
      ausentes,
    };
  });
}

/** Uma prova com os alunos inscritos, em ordem alfabética. */
export async function lerProvaEspecifica(
  id: string,
): Promise<{ prova: ProvaEspecifica; participantes: ParticipanteDaProva[] }> {
  exigirId(id);
  const prova = await banco().provaEspecifica.findUnique({
    where: { id },
    include: {
      participantes: {
        select: {
          alunoId: true,
          presente: true,
          local: true,
          latitude: true,
          longitude: true,
          aluno: { select: { nome: true, turmaId: true } },
        },
      },
    },
  });
  if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
  const participantes = prova.participantes
    .map((linha) => ({
      alunoId: linha.alunoId,
      nome: linha.aluno.nome,
      turmaId: linha.aluno.turmaId,
      presente: linha.presente,
      local: linha.local,
      latitude: linha.latitude,
      longitude: linha.longitude,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const contagem = resumirMarcas(participantes.map((p) => p.presente));
  return {
    prova: {
      id: prova.id,
      nome: prova.nome,
      local: prova.local,
      latitude: prova.latitude,
      longitude: prova.longitude,
      dia: paraDia(prova.dia),
      total: contagem.total,
      presentes: contagem.presentes,
      ausentes: contagem.ausentes,
    },
    participantes,
  };
}

/** Cadastra uma prova sem alunos; a inscrição vem em seguida. */
export async function criarProvaEspecifica(
  usuario: { id: string },
  entrada: unknown,
): Promise<ProvaEspecifica> {
  const prova = validarProvaDaEntrada(entrada);
  return comTransacao(async (tx) => {
    const criada = await tx.provaEspecifica.create({
      data: {
        nome: prova.nome,
        local: prova.local,
        latitude: prova.latitude,
        longitude: prova.longitude,
        dia: new Date(`${prova.dia}T12:00:00Z`),
      },
    });
    await auditar(tx, usuario.id, "prova-especifica.criar", `prova:${criada.id}`);
    return {
      id: criada.id,
      nome: criada.nome,
      local: criada.local,
      latitude: criada.latitude,
      longitude: criada.longitude,
      dia: prova.dia,
      total: 0,
      presentes: 0,
      ausentes: 0,
    };
  });
}

/** Substitui nome, local, coordenadas e data de uma prova, sem mexer nos alunos nem na frequência. */
export async function editarProvaEspecifica(
  usuario: { id: string },
  id: string,
  entrada: unknown,
): Promise<void> {
  exigirId(id);
  const prova = validarProvaDaEntrada(entrada);
  await comTransacao(async (tx) => {
    const alteradas = await tx.provaEspecifica.updateMany({
      where: { id },
      data: {
        nome: prova.nome,
        local: prova.local,
        latitude: prova.latitude,
        longitude: prova.longitude,
        dia: new Date(`${prova.dia}T12:00:00Z`),
      },
    });
    if (alteradas.count === 0) throw new ErroHttp("Prova não encontrada.", 404);
    await auditar(tx, usuario.id, "prova-especifica.editar", `prova:${id}`);
  });
}

/** Remove a prova com os alunos inscritos e a frequência dela. */
export async function removerProvaEspecifica(usuario: { id: string }, id: string): Promise<void> {
  exigirId(id);
  await comTransacao(async (tx) => {
    const removidas = await tx.provaEspecifica.deleteMany({ where: { id } });
    if (removidas.count === 0) throw new ErroHttp("Prova não encontrada.", 404);
    await auditar(tx, usuario.id, "prova-especifica.remover", `prova:${id}`);
  });
}

/**
 * Define a lista completa de alunos da prova. Quem já estava na lista mantém a marca; quem
 * sai perde a inscrição; quem entra precisa estar ativo e sem desistência.
 */
export async function definirParticipantes(
  usuario: { id: string },
  id: string,
  entrada: unknown,
): Promise<void> {
  exigirId(id);
  const dados = esquemaParticipantes.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const desejados = new Set(dados.data.alunoIds);

  return comTransacao(async (tx) => {
    const prova = await tx.provaEspecifica.findUnique({ where: { id }, select: { id: true } });
    if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
    const atuais = await tx.participanteProva.findMany({
      where: { provaId: id },
      select: { alunoId: true },
    });
    const jaInscritos = new Set(atuais.map((linha) => linha.alunoId));
    const sairam = [...jaInscritos].filter((alunoId) => !desejados.has(alunoId));
    const entraram = [...desejados].filter((alunoId) => !jaInscritos.has(alunoId));

    if (entraram.length > 0) {
      const validos = await tx.aluno.count({
        where: { id: { in: entraram }, ativo: true, desistenteEm: null },
      });
      if (validos !== entraram.length) {
        throw new ErroHttp("Há aluno inexistente, inativo ou desistente na lista.", 400);
      }
    }
    if (sairam.length > 0) {
      await tx.participanteProva.deleteMany({ where: { provaId: id, alunoId: { in: sairam } } });
    }
    if (entraram.length > 0) {
      await tx.participanteProva.createMany({
        data: entraram.map((alunoId) => ({ provaId: id, alunoId })),
      });
    }
    await auditar(
      tx,
      usuario.id,
      "prova-especifica.participantes",
      `prova:${id}:entraram:${entraram.length}:sairam:${sairam.length}`,
    );
  });
}

/**
 * Grava o local próprio de alunos já inscritos. Local nulo e sem coordenadas volta a herdar
 * o da prova. Não altera a frequência. A auditoria guarda só a prova e a quantidade.
 */
export async function definirLocaisDaProva(
  usuario: { id: string },
  id: string,
  entrada: unknown,
): Promise<void> {
  exigirId(id);
  const dados = esquemaLocais.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const preparados: Array<LocalGravado & { alunoId: string }> = [];
  for (const item of dados.data.locais) {
    const local = normalizarLocalDoAluno(item);
    const problema = problemaNoLocalDoAluno(local);
    if (problema) throw new ErroHttp(problema, 400);
    preparados.push({ alunoId: item.alunoId, ...local });
  }

  await comTransacao(async (tx) => {
    const prova = await tx.provaEspecifica.findUnique({ where: { id }, select: { id: true } });
    if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
    const alunoIds = preparados.map((item) => item.alunoId);
    const inscritos = await tx.participanteProva.count({
      where: { provaId: id, alunoId: { in: alunoIds } },
    });
    if (inscritos !== alunoIds.length) {
      throw new ErroHttp("Há aluno que não está inscrito nesta prova.", 400);
    }
    const grupos = new Map<string, { dados: LocalGravado; alunoIds: string[] }>();
    for (const item of preparados) {
      const chave = JSON.stringify([item.local, item.latitude, item.longitude]);
      const grupo = grupos.get(chave);
      if (grupo) grupo.alunoIds.push(item.alunoId);
      else {
        grupos.set(chave, {
          dados: { local: item.local, latitude: item.latitude, longitude: item.longitude },
          alunoIds: [item.alunoId],
        });
      }
    }
    for (const grupo of grupos.values()) {
      await tx.participanteProva.updateMany({
        where: { provaId: id, alunoId: { in: grupo.alunoIds } },
        data: grupo.dados,
      });
    }
    await auditar(
      tx,
      usuario.id,
      "prova-especifica.locais",
      `prova:${id}:locais:${alunoIds.length}`,
    );
  });
}

/** Grava presente, ausente ou sem registro para alunos já inscritos na prova. */
export async function registrarFrequenciaDaProva(
  usuario: { id: string },
  id: string,
  entrada: unknown,
): Promise<void> {
  exigirId(id);
  const dados = esquemaFrequencia.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const porAluno = new Map<string, MarcaDaProva>();
  for (const { alunoId, presente } of dados.data.marcas) porAluno.set(alunoId, presente);

  return comTransacao(async (tx) => {
    const prova = await tx.provaEspecifica.findUnique({ where: { id }, select: { id: true } });
    if (!prova) throw new ErroHttp("Prova não encontrada.", 404);
    const alunoIds = [...porAluno.keys()];
    const inscritos = await tx.participanteProva.count({
      where: { provaId: id, alunoId: { in: alunoIds } },
    });
    if (inscritos !== alunoIds.length) {
      throw new ErroHttp("Há aluno que não está inscrito nesta prova.", 400);
    }
    for (const valor of [true, false, null] as const) {
      const grupo = alunoIds.filter((alunoId) => porAluno.get(alunoId) === valor);
      if (grupo.length === 0) continue;
      await tx.participanteProva.updateMany({
        where: { provaId: id, alunoId: { in: grupo } },
        data: { presente: valor },
      });
    }
    await auditar(
      tx,
      usuario.id,
      "prova-especifica.frequencia",
      `prova:${id}:marcas:${alunoIds.length}`,
    );
  });
}

/**
 * Soma os alunos distintos cujo local efetivo fica a até 100 m do ponto. Coordenadas próprias
 * do aluno vencem as da prova; texto próprio sem ponto fica fora do mapa. A prova em edição
 * empresta o ponto consultado a quem ainda herda o local dela, mesmo antes de salvar.
 * Um aluno em duas provas do mesmo lugar conta uma vez.
 */
export async function lerOcupacaoDoLocal(entrada: unknown): Promise<OcupacaoDoLocal> {
  const dados = esquemaOcupacao.safeParse(entrada);
  if (!dados.success) throw primeiroErro(dados.error);
  const { latitude, longitude, provaId } = dados.data;
  const problema = problemaNasCoordenadas(latitude, longitude);
  if (problema) throw new ErroHttp(problema, 400);

  // A caixa é folgada de propósito; a distância exata é conferida em seguida, em metros.
  const ponto = { latitude, longitude };
  const caixa = caixaDeBusca(ponto, RAIO_DO_MESMO_LOCAL_METROS);
  const linhas = await banco().provaEspecifica.findMany({
    where: {
      OR: [
        ...(provaId === null ? [] : [{ id: provaId }]),
        caixa,
        { participantes: { some: caixa } },
      ],
    },
    select: {
      id: true,
      nome: true,
      dia: true,
      latitude: true,
      longitude: true,
      participantes: { select: { alunoId: true, local: true, latitude: true, longitude: true } },
    },
  });

  const provas: ProvaParaOcupacao[] = linhas.map((linha) => {
    const emEdicao = linha.id === provaId;
    return {
      id: linha.id,
      nome: linha.nome,
      dia: paraDia(linha.dia),
      latitude: linha.latitude,
      longitude: linha.longitude,
      participantes: linha.participantes,
      emEdicao,
      pontoHerdado: emEdicao ? ponto : null,
    };
  });
  return ocupacaoDasProvas(ponto, provas);
}
