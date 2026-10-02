// Google Planilhas: casos de uso da integração da frequência. Leitura do
// esquema, planejamento conservador, envio manual e modo completo.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { ambiente } from "@/infra/ambiente";
import { mensagemParaRegistro } from "@/infra/planilha-erros";
import { ErroGoogle } from "@/infra/google-planilhas-escrita";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarFrequenciasDoPeriodo } from "@/application/frequencias";
import {
  ativarModoCompleto as ativarModoCompletoComum,
  criarAba as criarAbaComum,
  desconectar,
  desativarModoCompleto as desativarModoCompletoComum,
  chamarIntegracao,
  idDaIntegracao,
  lerLinha,
  listarCopias as listarCopiasComum,
  modoCompletoAtivo,
  removerAba as removerAbaComum,
  restaurarCopia as restaurarCopiaComum,
  salvarConfiguracao,
  type LinhaIntegracao,
} from "@/application/planilha-comum";
import {
  detectarEsquema,
  erroVigente,
  hashTexto,
  montarTurmaPlanilha,
  planejarSincronizacao,
  blocosDeColunas,
  colunasNecessarias,
  leituraDosBlocos,
  type AbaEsquema,
  type AbaBruta,
  type CelulaPlano,
  type LeituraAba,
  type PlanoSincronizacao,
} from "@/domain/planilha";
import { diasEntre, ehDiaValido, normalizar } from "@/domain/frequencia";
import { diasSemEnvioConfirmado } from "@/domain/planilha-envios";

const FINALIDADE = "FREQUENCIA" as const;
const LIMITE_DIAS_ENVIO = 92;

export interface MapaAba {
  aba: string;
  turmaOriginalId: string;
}

export interface EsquemaSalvo {
  planilha: { nome: string; url: string; fuso: string };
  abas: AbaEsquema[];
  mapa: MapaAba[];
  atualizadoEm: string;
}

export interface EstadoPlanilha {
  ativa: boolean;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  podeEnviar: boolean;
  alteradasDepois: number;
}

const esquemaMapa = z.object({
  planilha: z.object({
    nome: z.string().max(200),
    url: z.string().max(500),
    fuso: z.string().max(60),
  }),
  abas: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  mapa: z
    .array(z.object({ aba: z.string().min(1).max(200), turmaOriginalId: z.string().uuid() }))
    .min(1)
    .max(200),
});

const esquemaEnvio = z.object({
  turmaOriginalId: z.string().uuid().optional(),
  todas: z.boolean().optional(),
  de: z.string().refine(ehDiaValido, "Data inicial inválida."),
  ate: z.string().refine(ehDiaValido, "Data final inválida."),
  permitirInserirColunas: z.boolean().optional(),
  permitirNovosAlunos: z.boolean().optional(),
  substituirDivergencias: z.boolean().optional(),
  limparCelulas: z.array(z.string().max(20)).max(2000).optional(),
  removerLinhas: z.array(z.number().int().min(1).max(100000)).max(500).optional(),
  removerColunas: z.array(z.number().int().min(1).max(2000)).max(200).optional(),
  planoHashGeral: z.string().max(64).optional(),
  // Padrão: só os dias com chamada ainda sem confirmação para a origem.
  // Falso envia o período inteiro, para conferência.
  somenteAlteradas: z.boolean().optional(),
});

type EntradaEnvio = z.infer<typeof esquemaEnvio>;

function esquemaSalvo(linha: LinhaIntegracao): EsquemaSalvo | null {
  const bruto = linha.esquema;
  if (!bruto || typeof bruto !== "object") return null;
  const candidato = bruto as EsquemaSalvo;
  if (!Array.isArray(candidato.abas) || !Array.isArray(candidato.mapa)) return null;
  return candidato;
}

/**
 * Chamadas sem sucesso completo posterior que cubra o dia de cada origem
 * da lista. Cada chamada conta uma vez, mesmo com alunos de várias origens.
 */
async function contarAlteradasDepois(): Promise<number> {
  const contagem = await banco().$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM frequencias AS frequencia
    WHERE EXISTS (
      SELECT 1
      FROM alunos_chamada AS chamada
      JOIN alunos AS aluno ON aluno.id = chamada.aluno_id
      WHERE chamada.frequencia_id = frequencia.id
        AND NOT EXISTS (
          SELECT 1
          FROM sincronizacoes_planilha AS envio
          WHERE envio.finalidade = ${FINALIDADE}::finalidade_integracao
            AND envio.turma_original_id = aluno.turma_original_id
            AND envio.resultado = 'SUCESSO'
            AND envio.puladas_ocupadas = 0
            AND envio.puladas_formula = 0
            AND envio.de <= frequencia.dia
            AND envio.ate >= frequencia.dia
            AND envio.criado_em > frequencia.atualizado_em
        )
    )
  `;
  return Number(contagem[0]?.total ?? 0n);
}

/** Estado público da integração, para o selo e o botão da Grade. */
export async function lerEstadoPlanilha(): Promise<EstadoPlanilha> {
  const linha = await lerLinha(FINALIDADE);
  const completo = modoCompletoAtivo(linha);
  if (linha.modo === "COMPLETO" && !completo) {
    await banco().integracaoPlanilha.update({
      where: { id: idDaIntegracao(FINALIDADE) },
      data: { modo: "CONSERVADOR", modoCompletoAte: null },
    });
  }
  return {
    ativa: linha.ativa,
    modo: completo ? "completo" : "conservador",
    modoCompletoAte: completo && linha.modoCompletoAte ? linha.modoCompletoAte.toISOString() : null,
    podeEnviar: Boolean(linha.ativa && linha.googleRefreshToken && linha.googlePlanilhaId),
    alteradasDepois: await contarAlteradasDepois(),
  };
}

/** Configuração administrativa da planilha, sem revelar credenciais Google. */
export async function lerIntegracaoAdmin() {
  const linha = await lerLinha(FINALIDADE);
  const sincronizacoes = await banco().sincronizacaoPlanilha.findMany({
    where: { finalidade: FINALIDADE },
    orderBy: { criadoEm: "desc" },
    take: 10,
    select: {
      id: true,
      turmaOriginalId: true,
      de: true,
      ate: true,
      modalidade: true,
      preenchidas: true,
      substituidas: true,
      limpas: true,
      removidasLinhas: true,
      removidasColunas: true,
      alunosCriados: true,
      colunasCriadas: true,
      puladasOcupadas: true,
      puladasFormula: true,
      resultado: true,
      erro: true,
      criadoEm: true,
    },
  });
  const ultimoErro = await lerErroVigente();
  return {
    ativa: linha.ativa,
    googleConectado: Boolean(linha.googleRefreshToken),
    googlePlanilha: linha.googlePlanilhaId
      ? { id: linha.googlePlanilhaId, nome: linha.googlePlanilhaNome }
      : null,
    esquema: esquemaSalvo(linha),
    esquemaEm: linha.esquemaEm?.toISOString() ?? null,
    modo: modoCompletoAtivo(linha) ? ("completo" as const) : ("conservador" as const),
    modoCompletoAte: modoCompletoAtivo(linha)
      ? (linha.modoCompletoAte?.toISOString() ?? null)
      : null,
    envioAutomatico: linha.envioAutomatico,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    fuso: ambiente.fuso,
    alteradasDepois: await contarAlteradasDepois(),
    ultimoErro: ultimoErro
      ? {
          erro: ultimoErro.erro,
          resultado: ultimoErro.resultado,
          criadoEm: ultimoErro.criadoEm.toISOString(),
          turma: ultimoErro.turmaOriginal
            ? `${ultimoErro.turmaOriginal.serie.nome} ${ultimoErro.turmaOriginal.nome}`
            : null,
        }
      : null,
    sincronizacoes: sincronizacoes.map((item) => ({
      ...item,
      de: item.de.toISOString().slice(0, 10),
      ate: item.ate.toISOString().slice(0, 10),
      criadoEm: item.criadoEm.toISOString(),
    })),
  };
}

/**
 * Erro vigente da frequência, por turma de origem: só o envio mais recente de
 * cada turma conta, para um sucesso posterior apagar o erro daquela turma sem
 * esconder a falha de outra. Duas consultas: o último instante por turma e os
 * registros desses instantes.
 */
async function lerErroVigente() {
  const ultimos = await banco().sincronizacaoPlanilha.groupBy({
    by: ["turmaOriginalId"],
    where: { finalidade: FINALIDADE, turmaOriginalId: { not: null } },
    _max: { criadoEm: true },
  });
  const limites = ultimos.flatMap((item) =>
    item.turmaOriginalId && item._max.criadoEm
      ? [{ turmaOriginalId: item.turmaOriginalId, criadoEm: item._max.criadoEm }]
      : [],
  );
  if (limites.length === 0) return null;
  const registros = await banco().sincronizacaoPlanilha.findMany({
    where: { finalidade: FINALIDADE, OR: limites },
    select: {
      turmaOriginalId: true,
      erro: true,
      resultado: true,
      criadoEm: true,
      turmaOriginal: { select: { nome: true, serie: { select: { nome: true } } } },
    },
  });
  return erroVigente(registros, (registro) => registro.turmaOriginalId);
}

/** Salva as preferências da planilha conectada pela conta Google. */
export async function salvarIntegracao(admin: { id: string }, entrada: unknown) {
  await salvarConfiguracao(admin, FINALIDADE, entrada);
  return lerIntegracaoAdmin();
}

/** Lê o esquema de todas as abas e sugere o mapa por turma de origem. */
export async function lerEstrutura() {
  const linha = await lerLinha(FINALIDADE);
  const estrutura = await chamarIntegracao<{
    planilha: { nome: string; url: string; fuso: string };
    abas: {
      nome: string;
      oculta: boolean;
      criada: boolean;
      linhas: number;
      colunas: number;
      congeladasLinhas: number;
      congeladasColunas: number;
      mesclagens: string[];
      amostra: string[][];
    }[];
  }>(linha, { acao: "estrutura" });
  const turmas = await listarTodasTurmas();
  const abas: AbaEsquema[] = [];
  const problemas: { aba: string; erro: string }[] = [];
  for (const item of estrutura.abas) {
    try {
      const leitura = await chamarIntegracao<{
        valores: string[][];
        formula: boolean[][];
      }>(linha, {
        acao: "ler",
        aba: item.nome,
        linhaInicial: 1,
        colunaInicial: 1,
        linhas: Math.max(item.linhas, 1),
        colunas: Math.max(item.colunas, 1),
      });
      const bruta: AbaBruta = {
        nome: item.nome,
        valores: leitura.valores,
        formulas: leitura.formula.map((fileira) => fileira.map((tem) => (tem ? "=" : ""))),
        linhas: item.linhas,
        colunas: item.colunas,
        oculta: item.oculta,
        criada: item.criada,
        congeladasLinhas: item.congeladasLinhas,
        congeladasColunas: item.congeladasColunas,
        mesclagens: item.mesclagens,
      };
      abas.push(detectarEsquema(bruta, new Date().getFullYear()));
    } catch (erro) {
      problemas.push({
        aba: item.nome,
        erro: erro instanceof ErroHttp ? erro.message : "Não foi possível ler a aba.",
      });
    }
  }
  const sugestoes = abas.map((aba) => ({
    aba: aba.nome,
    ...sugerirTurma(aba.nome, turmas),
  }));
  return { planilha: estrutura.planilha, abas, sugestoes, problemas };
}

/** Sugere a turma de origem pelo nome da aba, com confiança. */
function sugerirTurma(nomeAba: string, turmas: { id: string; rotulo: string }[]) {
  const chave = chaveComparacao(nomeAba);
  for (const turma of turmas) {
    if (chave === chaveComparacao(turma.rotulo)) {
      return { turmaOriginalId: turma.id, confianca: "alta" as const };
    }
  }
  for (const turma of turmas) {
    const alvo = chaveComparacao(turma.rotulo);
    if (alvo !== "" && (chave.includes(alvo) || alvo.includes(chave))) {
      return { turmaOriginalId: turma.id, confianca: "media" as const };
    }
  }
  return { turmaOriginalId: null, confianca: "baixa" as const };
}

function chaveComparacao(texto: string): string {
  return normalizar(texto)
    .replace(/\bano\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Salva o esquema e o mapa aba por turma de origem. */
export async function salvarMapa(admin: { id: string }, entrada: unknown) {
  const dados = esquemaMapa.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Estrutura inválida.", 400);
  }
  const turmas = await listarTodasTurmas();
  // Uma aba por turma original: duas abas gravariam a mesma turma duas vezes.
  const repetida = turmas.find(
    (turma) => dados.data.mapa.filter((item) => item.turmaOriginalId === turma.id).length > 1,
  );
  if (repetida) {
    throw new ErroHttp(`A turma ${repetida.rotulo} está em mais de uma aba. Escolha só uma.`, 400);
  }
  for (const item of dados.data.mapa) {
    if (!turmas.some((turma) => turma.id === item.turmaOriginalId)) {
      throw new ErroHttp("Turma de origem não encontrada.", 404);
    }
    if (!dados.data.abas.some((aba) => (aba as { nome?: string }).nome === item.aba)) {
      throw new ErroHttp("Aba mapeada não está na estrutura lida.", 400);
    }
  }
  const abas = dados.data.abas as unknown as AbaEsquema[];
  const salvo: EsquemaSalvo = {
    planilha: dados.data.planilha,
    abas,
    mapa: dados.data.mapa,
    atualizadoEm: new Date().toISOString(),
  };
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: idDaIntegracao(FINALIDADE) },
      data: {
        esquema: salvo as unknown as object,
        assinaturaEsquema: hashTexto(JSON.stringify(abas.map((aba) => aba.assinatura))),
        esquemaEm: new Date(),
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.mapear", `integracao:${idDaIntegracao(FINALIDADE)}`);
  });
  return lerIntegracaoAdmin();
}

/** Plano de uma turma, ou nulo quando não há dia a enviar. */
interface PlanoDaTurma {
  turmaOriginalId: string;
  aba: string;
  rotulo: string;
  dias: string[];
  incremental: boolean;
  plano: PlanoSincronizacao | null;
  esquema: AbaEsquema;
}

interface SimulacaoInterna {
  modalidade: "conservador" | "completo";
  planos: PlanoDaTurma[];
  planoHashGeral: string;
}

/**
 * Dias a enviar para uma turma original: com `somenteAlteradas`, os dias com
 * chamada sem sucesso posterior à sua atualização que cubra aquele dia,
 * em qualquer turma atual que tenha aluno dela na lista. Células puladas não
 * comprovam envio completo. Sem a opção, vale o período pedido inteiro.
 */
async function diasDoEnvio(
  turmaOriginalId: string,
  entrada: EntradaEnvio,
  incluirSituacao: boolean,
): Promise<{ dias: string[]; incremental: boolean }> {
  const periodo = diasEntre(entrada.de, entrada.ate);
  if (entrada.somenteAlteradas === false) return { dias: periodo, incremental: false };
  const de = new Date(`${entrada.de}T12:00:00Z`);
  const ate = new Date(`${entrada.ate}T12:00:00Z`);
  const sucessoCompleto = {
    finalidade: FINALIDADE,
    turmaOriginalId,
    resultado: "SUCESSO" as const,
    puladasOcupadas: 0,
    puladasFormula: 0,
  };
  const [linhas, envios, ultimo] = await Promise.all([
    banco().frequencia.findMany({
      where: {
        dia: { gte: de, lte: ate },
        alunos: { some: { aluno: { turmaOriginalId } } },
      },
      select: { dia: true, atualizadoEm: true },
      orderBy: { dia: "asc" },
    }),
    banco().sincronizacaoPlanilha.findMany({
      where: { ...sucessoCompleto, de: { lte: ate }, ate: { gte: de } },
      select: { de: true, ate: true, criadoEm: true },
    }),
    // A situação é conferida para toda a origem em qualquer período enviado.
    incluirSituacao
      ? banco().sincronizacaoPlanilha.findFirst({
          where: sucessoCompleto,
          orderBy: { criadoEm: "desc" },
          select: { criadoEm: true },
        })
      : Promise.resolve(null),
  ]);
  const situacaoPendente = incluirSituacao
    ? await banco().aluno.count({
        where: {
          turmaOriginalId,
          situacaoAtualizadaEm: ultimo ? { gt: ultimo.criadoEm } : { not: null },
        },
      })
    : 0;
  const dias = [
    ...new Set([
      ...diasSemEnvioConfirmado(linhas, envios),
      ...(situacaoPendente > 0 ? [entrada.ate] : []),
    ]),
  ].sort();
  // Mais que o limite de um envio: vão os mais recentes; o resto fica pendente.
  return { dias: dias.slice(-LIMITE_DIAS_ENVIO), incremental: true };
}

type LeituraPlanilha = {
  valores: string[][];
  formula: boolean[][];
  linhaInicial: number;
  colunaInicial: number;
  linhasCriadas: number[];
  colunasCriadas: number[];
  alunosDasLinhas?: { linha: number; alunoId: string }[];
  ultimaLinha?: number;
  assinatura?: string;
  blocos?: { coluna: number; colunas: number; valores: string[][]; formula: boolean[][] }[];
  tempos?: Record<string, number>;
};

/**
 * Lê as colunas necessárias e confere a assinatura e os vínculos dos alunos.
 */
async function lerParaPlano(
  linha: LinhaIntegracao,
  esquema: AbaEsquema,
  dias: string[],
): Promise<{ conteudo: LeituraAba; assinatura: string | null }> {
  const colunas = colunasNecessarias(esquema, dias);
  const leitura = await chamarIntegracao<LeituraPlanilha>(linha, {
    acao: "ler",
    aba: esquema.nome,
    linhaInicial: 1,
    colunaInicial: 1,
    colunas: Math.max(...colunas, 1),
    blocos: blocosDeColunas(colunas),
    cabecalhoLinha: esquema.cabecalho,
  });
  if (!leitura.alunosDasLinhas) {
    throw new ErroHttp("Não foi possível conferir os vínculos dos alunos na planilha.", 502);
  }
  const base = leitura.blocos
    ? leituraDosBlocos(esquema.nome, leitura.linhaInicial, leitura.blocos)
    : {
        nome: esquema.nome,
        valores: leitura.valores,
        formula: leitura.formula,
        linhaInicial: leitura.linhaInicial,
        colunaInicial: leitura.colunaInicial,
      };
  return {
    conteudo: {
      ...base,
      linhasCriadas: leitura.linhasCriadas,
      colunasCriadas: leitura.colunasCriadas,
      alunosDasLinhas: leitura.alunosDasLinhas,
      ...(leitura.ultimaLinha !== undefined ? { ultimaLinhaAba: leitura.ultimaLinha } : {}),
    },
    assinatura: leitura.assinatura ?? null,
  };
}

/** Detecta de novo o esquema de uma aba, pela mesma regra da conferência de estrutura. */
async function detectarAba(linha: LinhaIntegracao, nome: string): Promise<AbaEsquema> {
  const estrutura = await chamarIntegracao<{
    abas: {
      nome: string;
      oculta: boolean;
      criada: boolean;
      linhas: number;
      colunas: number;
      congeladasLinhas: number;
      congeladasColunas: number;
      mesclagens: string[];
    }[];
  }>(linha, { acao: "estrutura", aba: nome });
  const item = estrutura.abas.find((aba) => aba.nome === nome);
  if (!item) throw new ErroHttp(`A aba ${nome} não foi encontrada na planilha.`, 409);
  const leitura = await chamarIntegracao<{ valores: string[][]; formula: boolean[][] }>(linha, {
    acao: "ler",
    aba: nome,
    linhaInicial: 1,
    colunaInicial: 1,
    linhas: Math.max(item.linhas, 1),
    colunas: Math.max(item.colunas, 1),
  });
  return detectarEsquema(
    {
      nome,
      valores: leitura.valores,
      formulas: leitura.formula.map((fileira) => fileira.map((tem) => (tem ? "=" : ""))),
      linhas: item.linhas,
      colunas: item.colunas,
      oculta: item.oculta,
      criada: item.criada,
      congeladasLinhas: item.congeladasLinhas,
      congeladasColunas: item.congeladasColunas,
      mesclagens: item.mesclagens,
    },
    new Date().getFullYear(),
  );
}

/** Troca o esquema de uma aba no esquema salvo, mantendo o mapa. */
async function salvarEsquemaDaAba(aba: AbaEsquema): Promise<void> {
  const linha = await lerLinha(FINALIDADE);
  const salvo = esquemaSalvo(linha);
  if (!salvo) return;
  const abas = salvo.abas.map((item) => (item.nome === aba.nome ? aba : item));
  await banco().integracaoPlanilha.update({
    where: { id: idDaIntegracao(FINALIDADE) },
    data: {
      esquema: { ...salvo, abas, atualizadoEm: new Date().toISOString() } as unknown as object,
      assinaturaEsquema: hashTexto(JSON.stringify(abas.map((item) => item.assinatura))),
      esquemaEm: new Date(),
    },
  });
}

/** Relê o cabeçalho após correção sem alterar o mapa das turmas. */
export async function atualizarEsquemaDaAba(linha: LinhaIntegracao, nome: string): Promise<void> {
  await salvarEsquemaDaAba(await detectarAba(linha, nome));
}

/** Monta os planos de todas as turmas mapeadas para o período. */
async function montarSimulacao(
  linha: LinhaIntegracao,
  entrada: EntradaEnvio,
): Promise<SimulacaoInterna> {
  const salvo = esquemaSalvo(linha);
  if (!salvo || salvo.mapa.length === 0) {
    throw new ErroHttp("Confira a estrutura da planilha antes de enviar.", 400);
  }
  const periodo = diasEntre(entrada.de, entrada.ate);
  if (periodo.length === 0 || periodo.length > LIMITE_DIAS_ENVIO) {
    throw new ErroHttp("Envie períodos de até três meses por vez.", 400);
  }
  const pares = entrada.todas
    ? salvo.mapa
    : salvo.mapa.filter((item) => item.turmaOriginalId === entrada.turmaOriginalId);
  if (pares.length === 0) {
    throw new ErroHttp("Nenhuma turma de origem mapeada para o envio.", 400);
  }
  const diasPorTurma = new Map<string, { dias: string[]; incremental: boolean }>();
  for (const par of pares) {
    diasPorTurma.set(par.turmaOriginalId, await diasDoEnvio(par.turmaOriginalId, entrada, true));
  }
  const todosOsDias = [...diasPorTurma.values()].flatMap((item) => item.dias).sort();
  const [turmas, alunos, frequencias] = await Promise.all([
    listarTodasTurmas(),
    listarTodosAlunos(),
    todosOsDias.length > 0
      ? listarFrequenciasDoPeriodo(todosOsDias[0] ?? entrada.de, todosOsDias.at(-1) ?? entrada.ate)
      : Promise.resolve([]),
  ]);
  const rotuloDaTurma = (id: string) => turmas.find((turma) => turma.id === id)?.rotulo ?? "";
  const horarios = turmas.flatMap((turma) => turma.horarios);
  const completo = modoCompletoAtivo(linha);
  const modalidade = completo ? ("completo" as const) : ("conservador" as const);
  const opcoesBase = {
    modo: modalidade,
    permitirInserirColunas: entrada.permitirInserirColunas ?? true,
    permitirNovosAlunos: entrada.permitirNovosAlunos ?? true,
  };
  const planos: PlanoDaTurma[] = [];
  for (const par of pares) {
    let esquemaAba = salvo.abas.find((aba) => aba.nome === par.aba);
    if (!esquemaAba) throw new ErroHttp(`A aba ${par.aba} não está mais na estrutura salva.`, 409);
    const { dias, incremental } = diasPorTurma.get(par.turmaOriginalId) ?? {
      dias: [],
      incremental: true,
    };
    const rotulo = rotuloDaTurma(par.turmaOriginalId) || par.aba;
    if (dias.length === 0) {
      planos.push({ plano: null, esquema: esquemaAba, dias, incremental, rotulo, ...par });
      continue;
    }
    const turmaPlanilha = montarTurmaPlanilha(
      par.turmaOriginalId,
      rotulo,
      alunos,
      frequencias.filter((frequencia) => dias.includes(frequencia.dia)),
      horarios,
      dias,
      rotuloDaTurma,
    );
    let leitura = await lerParaPlano(linha, esquemaAba, dias);
    // A aba mudou desde a última conferência (por exemplo, um envio anterior
    // criou o dia e não chegou a responder): o esquema é detectado de novo e
    // salvo, e a prévia já mostra o plano sobre a estrutura atual.
    let estruturaAtualizada = false;
    if (leitura.assinatura && leitura.assinatura !== esquemaAba.assinatura) {
      esquemaAba = await detectarAba(linha, par.aba);
      await salvarEsquemaDaAba(esquemaAba);
      leitura = await lerParaPlano(linha, esquemaAba, dias);
      estruturaAtualizada = true;
    }
    const plano = planejarSincronizacao(esquemaAba, turmaPlanilha, leitura.conteudo, {
      ...opcoesBase,
      sinalizarSituacao: true,
      substituirDivergencias: completo && (entrada.substituirDivergencias ?? false),
      limparCelulas: completo ? (entrada.limparCelulas ?? []) : [],
      removerLinhas: completo ? (entrada.removerLinhas ?? []) : [],
      removerColunas: completo ? (entrada.removerColunas ?? []) : [],
    });
    if (estruturaAtualizada) {
      plano.avisos.unshift(
        "A estrutura da aba mudou desde a última conferência; a prévia já usa a atual.",
      );
    }
    planos.push({ plano, esquema: esquemaAba, dias, incremental, rotulo, ...par });
  }
  return {
    modalidade,
    planos,
    planoHashGeral: hashDoEnvio(modalidade, entrada, planos),
  };
}

/**
 * Hash do envio: modalidade, período pedido e o hash de cada plano. Serve à
 * prévia de todas as turmas e, com um plano só, ao envio de cada turma.
 */
function hashDoEnvio(
  modalidade: "conservador" | "completo",
  entrada: EntradaEnvio,
  planos: PlanoDaTurma[],
): string {
  return hashTexto(
    JSON.stringify([
      modalidade,
      entrada.de,
      entrada.ate,
      entrada.somenteAlteradas !== false,
      planos.map((item) => [item.turmaOriginalId, item.dias, item.plano?.planoHash ?? null]),
    ]),
  );
}

export type SituacaoEnvioAutomatico =
  "enviado" | "desligado" | "sem_mapa" | "pendente_manual" | "sem_confirmacao" | "falhou";

/**
 * Envia à planilha a chamada recém-salva de uma turma atual. Só roda com a
 * integração ativa e a chave ligada, em modo conservador, uma turma original
 * por vez e uma tentativa por salvamento. Nunca lança: o salvamento já foi
 * confirmado. Plano que precise de mais que preencher célula vazia, criar a
 * coluna do dia e vincular aluno, ou turma com envio ainda sem confirmação,
 * fica para o envio manual.
 */
export async function enviarAposSalvar(
  usuario: { id: string },
  turmaId: string,
  dia: string,
): Promise<Map<string, SituacaoEnvioAutomatico>> {
  const situacoes = new Map<string, SituacaoEnvioAutomatico>();
  try {
    const linha = await lerLinha(FINALIDADE);
    if (!linha.ativa || !linha.envioAutomatico || modoCompletoAtivo(linha)) {
      situacoes.set(turmaId, "desligado");
      return situacoes;
    }
    const salvo = esquemaSalvo(linha);
    const frequencia = await banco().frequencia.findFirst({
      where: { turmaId, dia: new Date(`${dia}T12:00:00Z`) },
      select: { alunos: { select: { aluno: { select: { turmaOriginalId: true } } } } },
    });
    const origens = new Set((frequencia?.alunos ?? []).map((item) => item.aluno.turmaOriginalId));
    for (const origem of origens) {
      if (!salvo?.mapa.some((par) => par.turmaOriginalId === origem)) {
        situacoes.set(origem, "sem_mapa");
        continue;
      }
      situacoes.set(origem, await enviarTurmaAutomatico(usuario, linha, origem, dia));
    }
  } catch (erro) {
    console.error(
      "Envio automático à planilha não concluído.",
      erro instanceof Error ? erro.name : "",
    );
  }
  return situacoes;
}

async function enviarTurmaAutomatico(
  usuario: { id: string },
  linha: LinhaIntegracao,
  turmaOriginalId: string,
  dia: string,
): Promise<SituacaoEnvioAutomatico> {
  try {
    // Envio anterior sem confirmação (ou ainda em curso): nunca se repete sozinho.
    const ultimo = await banco().sincronizacaoPlanilha.findFirst({
      where: { finalidade: FINALIDADE, turmaOriginalId },
      orderBy: { criadoEm: "desc" },
      select: { resultado: true },
    });
    if (ultimo?.resultado === "PARCIAL") return "sem_confirmacao";
    const entrada: EntradaEnvio = {
      turmaOriginalId,
      de: dia,
      ate: dia,
      permitirInserirColunas: true,
      permitirNovosAlunos: false,
      somenteAlteradas: false,
    };
    const simulacao = await montarSimulacao(linha, entrada);
    const item = simulacao.planos[0];
    if (!item?.plano || simulacao.modalidade !== "conservador") return "pendente_manual";
    const { resumo } = item.plano;
    const naoSeguro =
      resumo.substituir + resumo.limpar + resumo.removerLinhas + resumo.removerColunas > 0 ||
      resumo.novosAlunos > 0 ||
      resumo.ambiguidades > 0 ||
      resumo.puladasOcupadas > 0 ||
      resumo.puladasFormula > 0 ||
      item.plano.avisos.length > 0;
    if (naoSeguro) return "pendente_manual";
    // Mesmo sem escrita, a conferência confirma a revisão recém-salva.
    // O fluxo comum relê e valida o hash antes de registrar o sucesso.
    const resposta = await aplicarEnvio(usuario, {
      ...entrada,
      planoHashGeral: simulacao.planoHashGeral,
    });
    const envio = resposta.resultados[0];
    const resultado = envio?.resultado;
    if (resultado === "sucesso" || resultado === "sem_envio") {
      const contagens = envio?.contagens;
      const puladas = ["puladasOcupadas", "puladasFormula", "puladasVinculo"].some(
        (chave) => Number(contagens?.[chave] ?? 0) > 0,
      );
      return puladas ? "pendente_manual" : "enviado";
    }
    return resultado === "parcial" ? "sem_confirmacao" : "falhou";
  } catch {
    return "falhou";
  }
}

const RESUMO_VAZIO = {
  preencher: 0,
  sinalizar: 0,
  substituir: 0,
  limpar: 0,
  novasColunas: 0,
  novosAlunos: 0,
  vincular: 0,
  removerLinhas: 0,
  removerColunas: 0,
  puladasFormula: 0,
  puladasOcupadas: 0,
  ambiguidades: 0,
};

/** Frase de envio sem confirmação: nunca afirma que nada mudou. */
export const ERRO_SEM_CONFIRMACAO =
  "Não foi possível confirmar o resultado na planilha. Confira a aba antes de reenviar; o reenvio não sobrescreve o que já foi gravado.";

/** Prévia do envio, sem gravar nada. */
export async function simularEnvio(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (!(await limiteDeTentativas(`planilha:simular:${usuario.id}`, 60))) {
    throw new ErroHttp("Muitas prévias em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacao(linha, dados.data);
  return {
    modalidade: simulacao.modalidade,
    planoHashGeral: simulacao.planoHashGeral,
    planos: simulacao.planos.map((item) => {
      const { plano } = item;
      return {
        turmaOriginalId: item.turmaOriginalId,
        rotulo: item.rotulo,
        aba: item.aba,
        dias: item.dias,
        incremental: item.incremental,
        // Hash de uma turma só: o envio vai uma turma por requisição.
        planoHashTurma: hashDoEnvio(simulacao.modalidade, dados.data, [item]),
        semEnvio: plano === null,
        bloqueado: plano?.bloqueado ?? false,
        resumo: plano?.resumo ?? RESUMO_VAZIO,
        avisos: plano?.avisos.slice(0, 10) ?? [],
        novasColunas: plano?.novasColunas ?? [],
        novosAlunos: plano?.novosAlunos ?? [],
        substituir: plano?.substituir.slice(0, 20) ?? [],
        sinalizar: plano?.sinalizar?.slice(0, 20) ?? [],
        removerLinhas: plano?.removerLinhas ?? [],
        removerColunas: plano?.removerColunas ?? [],
        candidatosRemocaoLinhas: plano?.candidatosRemocaoLinhas ?? [],
        candidatosRemocaoColunas: plano?.candidatosRemocaoColunas ?? [],
        amostra: plano ? amostraDeCelulas(plano) : [],
        assinatura: plano?.assinatura ?? item.esquema.assinatura,
      };
    }),
  };
}

function amostraDeCelulas(plano: PlanoSincronizacao): CelulaPlano[] {
  return [...(plano.sinalizar ?? []), ...plano.substituir, ...plano.preencher].slice(0, 8);
}

interface ResultadoTurma {
  turmaOriginalId: string;
  rotulo: string;
  aba: string;
  resultado: "sucesso" | "parcial" | "falha" | "sem_envio";
  dias: string[];
  erro?: string;
  contagens?: Record<string, unknown>;
}

/**
 * Aplica o plano revisado de uma turma. Recalcula tudo e exige o mesmo hash.
 * Uma turma por requisição: o envio de todas as turmas é uma sequência de
 * chamadas feita pela interface, para nenhuma estourar o tempo do servidor.
 * O registro nasce PARCIAL antes da chamada ao script e só vira SUCESSO com a
 * resposta: se a função for interrompida, fica a verdade, sem confirmação.
 */
export async function aplicarEnvio(usuario: { id: string }, entrada: unknown) {
  const inicio = Date.now();
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.todas || !dados.data.turmaOriginalId) {
    throw new ErroHttp("Envie uma turma por vez.", 400);
  }
  if (!dados.data.planoHashGeral) {
    throw new ErroHttp("Faça a prévia antes de enviar.", 400);
  }
  if (!(await limiteDeTentativas(`planilha:envio:${usuario.id}`, 60))) {
    throw new ErroHttp("Muitos envios em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacao(linha, dados.data);
  if (dados.data.planoHashGeral !== simulacao.planoHashGeral) {
    throw new ErroHttp("Os dados mudaram desde a prévia. Revise o envio de novo.", 409);
  }
  const resultados: ResultadoTurma[] = [];
  for (const item of simulacao.planos) {
    const base = {
      turmaOriginalId: item.turmaOriginalId,
      rotulo: item.rotulo,
      aba: item.aba,
      dias: item.dias,
    };
    const { plano, esquema } = item;
    if (!plano) {
      resultados.push({ ...base, resultado: "sem_envio" });
      continue;
    }
    const operacoes = operacoesDoPlano(plano, esquema);
    const destrutiva = temDestrutiva(plano);
    const registro = await criarRegistro(
      usuario.id,
      item,
      plano,
      simulacao.modalidade,
      new Date(inicio),
    );
    if (operacoes.length === 0) {
      // Registra a conferência; células puladas continuam pendentes.
      await concluirRegistro(registro, plano, "SUCESSO", {});
      resultados.push({ ...base, resultado: "sucesso", contagens: {} });
      continue;
    }
    try {
      const contagens = await chamarIntegracao<Record<string, unknown>>(linha, {
        acao: "aplicar",
        aba: plano.aba,
        cabecalhoLinha: esquema.cabecalho,
        assinatura: plano.assinatura,
        modoCompleto: destrutiva,
        operacoes,
      });
      await concluirRegistro(registro, plano, "SUCESSO", contagens);
      // Coluna ou linha nova muda a assinatura: o esquema salvo acompanha,
      // para o próximo envio não pedir nova conferência de estrutura.
      if (Number(contagens.colunasCriadas ?? 0) > 0 || Number(contagens.linhasCriadas ?? 0) > 0) {
        try {
          await salvarEsquemaDaAba(await detectarAba(linha, plano.aba));
        } catch {
          // A prévia seguinte detecta a mudança pela assinatura e reconfere.
        }
      }
      resultados.push({ ...base, resultado: "sucesso", contagens });
    } catch (erro) {
      const recusado = erro instanceof ErroGoogle && erro.recusado;
      const mensagem = recusado ? erro.message : ERRO_SEM_CONFIRMACAO;
      await concluirRegistro(
        registro,
        plano,
        recusado ? "FALHA" : "PARCIAL",
        {},
        mensagemParaRegistro(erro, mensagem),
      );
      resultados.push({ ...base, resultado: recusado ? "falha" : "parcial", erro: mensagem });
    }
  }
  const falhas = resultados.filter((item) => item.resultado === "falha").length;
  const parciais = resultados.filter((item) => item.resultado === "parcial").length;
  const semEnvio = resultados.filter((item) => item.resultado === "sem_envio").length;
  return {
    resultados,
    resumo: {
      turmas: resultados.length,
      falhas,
      parciais,
      semEnvio,
      sucesso: resultados.length - falhas - parciais - semEnvio,
    },
  };
}

function operacoesDoPlano(plano: PlanoSincronizacao, esquema: AbaEsquema) {
  const operacoes: Record<string, unknown>[] = [];
  const colunaAluno = esquema.colunas.find((coluna) => coluna.tipo === "aluno")?.indice ?? 1;
  const colunaTurma = esquema.colunas.find((coluna) => coluna.tipo === "turma")?.indice;
  // O vínculo vai primeiro, com as coordenadas exatamente como foram lidas.
  if (plano.vincular.length > 0) {
    operacoes.push({
      tipo: "vincularLinhas",
      itens: plano.vincular.map((item) => ({
        linha: item.linha,
        coluna: item.coluna,
        nome: item.nome,
        alunoId: item.alunoId,
      })),
    });
  }
  if (plano.novasColunas.length > 0) {
    const total = esquema.colunas.find((coluna) => coluna.tipo === "total");
    operacoes.push({
      tipo: "inserirColunas",
      antesDe: total?.indice ?? null,
      cabecalhoLinha: esquema.cabecalho,
      rotulos: plano.novasColunas.map((coluna) => coluna.rotulo),
    });
  }
  for (const aluno of plano.novosAlunos) {
    operacoes.push({
      tipo: "criarLinhas",
      itens: [
        {
          linha: aluno.linha,
          alunoId: aluno.alunoId,
          celulas: [
            { coluna: colunaAluno, valor: aluno.nome },
            ...(colunaTurma ? [{ coluna: colunaTurma, valor: aluno.turmaAtual }] : []),
          ],
        },
      ],
    });
  }
  for (const celula of plano.preencher) {
    operacoes.push({
      tipo: "preencher",
      linha: celula.linha,
      coluna: celula.coluna,
      valor: celula.valor,
    });
  }
  for (const celula of plano.sinalizar ?? []) {
    operacoes.push({
      tipo: "sinalizar",
      linha: celula.linha,
      coluna: celula.coluna,
      valor: celula.valor,
      anterior: celula.anterior,
      alunoId: celula.alunoId,
      nomeOriginal: celula.alunoNome,
    });
  }
  for (const celula of plano.substituir) {
    operacoes.push({
      tipo: "substituir",
      linha: celula.linha,
      coluna: celula.coluna,
      valor: celula.valor,
      anterior: celula.anterior,
    });
  }
  for (const celula of plano.limpar) {
    operacoes.push({
      tipo: "limpar",
      linha: celula.linha,
      coluna: celula.coluna,
      anterior: celula.anterior,
    });
  }
  if (plano.removerColunas.length > 0) {
    operacoes.push({
      tipo: "removerColunas",
      colunas: plano.removerColunas.map((item) => item.coluna).sort((a, b) => b - a),
    });
  }
  if (plano.removerLinhas.length > 0) {
    operacoes.push({
      tipo: "removerLinhas",
      linhas: plano.removerLinhas.map((item) => item.linha).sort((a, b) => b - a),
    });
  }
  return operacoes;
}

function temDestrutiva(plano: PlanoSincronizacao): boolean {
  return (
    plano.substituir.length > 0 ||
    plano.limpar.length > 0 ||
    plano.removerLinhas.length > 0 ||
    plano.removerColunas.length > 0
  );
}

/** Registro do envio de uma turma, criado como PARCIAL antes da chamada ao script. */
async function criarRegistro(
  usuarioId: string,
  item: PlanoDaTurma,
  plano: PlanoSincronizacao,
  modalidade: "conservador" | "completo",
  // Instante da leitura dos dados: chamada salva depois dele fica pendente.
  referencia: Date,
): Promise<string> {
  const de = item.dias[0] ?? new Date().toISOString().slice(0, 10);
  const ate = item.dias.at(-1) ?? de;
  const criado = await banco().sincronizacaoPlanilha.create({
    data: {
      turmaOriginalId: plano.turmaOriginalId,
      de: new Date(`${de}T12:00:00Z`),
      ate: new Date(`${ate}T12:00:00Z`),
      modalidade: modalidade === "completo" ? "COMPLETO" : "CONSERVADOR",
      planoHash: plano.planoHash,
      resultado: "PARCIAL",
      erro: ERRO_SEM_CONFIRMACAO.slice(0, 300),
      autorId: usuarioId,
      criadoEm: referencia,
    },
    select: { id: true },
  });
  return criado.id;
}

async function concluirRegistro(
  id: string,
  plano: PlanoSincronizacao,
  resultado: "SUCESSO" | "PARCIAL" | "FALHA",
  contagens: Record<string, unknown>,
  erro?: string,
) {
  const numero = (chave: string, padrao: number) =>
    typeof contagens[chave] === "number" ? (contagens[chave] as number) : padrao;
  const sucesso = resultado === "SUCESSO";
  await banco().sincronizacaoPlanilha.update({
    where: { id },
    data: {
      preenchidas: sucesso ? numero("preenchidas", plano.resumo.preencher) : 0,
      substituidas: sucesso
        ? numero("substituidas", plano.resumo.substituir) +
          numero("sinalizadas", plano.resumo.sinalizar ?? 0)
        : 0,
      limpas: sucesso ? numero("limpas", plano.resumo.limpar) : 0,
      removidasLinhas: sucesso ? numero("removidasLinhas", plano.resumo.removerLinhas) : 0,
      removidasColunas: sucesso ? numero("removidasColunas", plano.resumo.removerColunas) : 0,
      alunosCriados: sucesso ? plano.novosAlunos.length : 0,
      colunasCriadas: sucesso ? numero("colunasCriadas", plano.novasColunas.length) : 0,
      // Nome alterado impede o vínculo da linha e também mantém o dia pendente.
      puladasOcupadas:
        plano.resumo.puladasOcupadas + numero("puladasOcupadas", 0) + numero("puladasVinculo", 0),
      puladasFormula: plano.resumo.puladasFormula + numero("puladasFormula", 0),
      resultado,
      erro: sucesso ? null : (erro ?? ERRO_SEM_CONFIRMACAO).slice(0, 300),
    },
  });
}

// O período do envio é registrado por turma, com a modalidade aplicada.

/** Destrava o modo completo com frase, senha e duração. */
export async function ativarModoCompleto(admin: { id: string }, entrada: unknown) {
  return ativarModoCompletoComum(admin, FINALIDADE, entrada);
}

/** Volta ao conservador; qualquer sessão pode encerrar a janela. */
export async function desativarModoCompleto(usuario: { id: string }) {
  return desativarModoCompletoComum(usuario, FINALIDADE);
}

/** Lista as cópias ocultas de uma aba. */
export async function listarCopias(entrada: unknown) {
  return listarCopiasComum(FINALIDADE, entrada);
}

/** Restaura uma cópia, com senha e frase; invalida o esquema salvo. */
export async function restaurarCopia(admin: { id: string }, entrada: unknown) {
  return restaurarCopiaComum(admin, FINALIDADE, entrada);
}

/** Cria uma aba nova com o cabeçalho mínimo, para uma turma sem aba. */
export async function criarAba(admin: { id: string }, entrada: unknown) {
  return criarAbaComum(admin, FINALIDADE, entrada);
}

/** Remove uma aba criada pela integração, no modo completo, com senha e frase. */
export async function removerAba(admin: { id: string }, entrada: unknown) {
  return removerAbaComum(admin, FINALIDADE, entrada);
}

/** Desliga a integração e apaga autorização Google e esquema. A planilha fica intacta. */
export async function desconectarIntegracao(admin: { id: string }) {
  return desconectar(admin, FINALIDADE);
}
