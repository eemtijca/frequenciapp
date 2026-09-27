// Google Planilhas: casos de uso da integração da frequência. Leitura do
// esquema, planejamento conservador, envio manual e modo completo.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { limiteDeTentativas } from "@/infra/auth/limite";
import { chamarGas, ErroGas, mensagemParaRegistro } from "@/infra/planilha";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarFrequenciasDoPeriodo } from "@/application/frequencias";
import {
  ativarModoCompleto as ativarModoCompletoComum,
  criarAba as criarAbaComum,
  desconectar,
  desativarModoCompleto as desativarModoCompletoComum,
  exigirConexao,
  gerarToken as gerarTokenComum,
  idDaIntegracao,
  lerLinha,
  listarCopias as listarCopiasComum,
  modoCompletoAtivo,
  removerAba as removerAbaComum,
  restaurarCopia as restaurarCopiaComum,
  revelarToken as revelarTokenComum,
  salvarConfiguracao,
  testarConexao as testarConexaoComum,
  type LinhaIntegracao,
} from "@/application/planilha-comum";
import {
  detectarEsquema,
  hashTexto,
  montarTurmaPlanilha,
  planejarSincronizacao,
  resultadoDeFalha,
  type AbaEsquema,
  type AbaBruta,
  type CelulaPlano,
  type LeituraAba,
  type PlanoSincronizacao,
} from "@/domain/planilha";
import { diasEntre, ehDiaValido, normalizar } from "@/domain/frequencia";

const FINALIDADE = "FREQUENCIA" as const;
const LIMITE_DIAS_ENVIO = 92;

export interface MapaAba {
  aba: string;
  turmaOriginalId: string;
}

export interface EsquemaSalvo {
  planilha: { nome: string; url: string; fuso: string; versao: number };
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
    versao: z.number().int().min(1).max(999),
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
});

type EntradaEnvio = z.infer<typeof esquemaEnvio>;

function esquemaSalvo(linha: LinhaIntegracao): EsquemaSalvo | null {
  const bruto = linha.esquema;
  if (!bruto || typeof bruto !== "object") return null;
  const candidato = bruto as EsquemaSalvo;
  if (!Array.isArray(candidato.abas) || !Array.isArray(candidato.mapa)) return null;
  return candidato;
}

/** Chamadas alteradas desde o último envio bem-sucedido da frequência. */
async function contarAlteradasDepois(): Promise<number> {
  const ultima = await banco().sincronizacaoPlanilha.findFirst({
    where: { finalidade: FINALIDADE, resultado: { not: "FALHA" } },
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  });
  if (!ultima) return 0;
  return banco().frequencia.count({ where: { atualizadoEm: { gt: ultima.criadoEm } } });
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
    podeEnviar: Boolean(linha.ativa && linha.endpoint && linha.token),
    alteradasDepois: await contarAlteradasDepois(),
  };
}

/** Configuração completa para a administração. O token nunca volta inteiro. */
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
  const ultimoErro = await banco().sincronizacaoPlanilha.findFirst({
    where: { finalidade: FINALIDADE, resultado: { in: ["FALHA", "PARCIAL"] } },
    orderBy: { criadoEm: "desc" },
    select: {
      erro: true,
      resultado: true,
      criadoEm: true,
      turmaOriginal: { select: { nome: true, serie: { select: { nome: true } } } },
    },
  });
  return {
    ativa: linha.ativa,
    endpoint: linha.endpoint,
    token: linha.token ? `••••••••${linha.token.slice(-4)}` : null,
    temToken: Boolean(linha.token),
    versaoScript: linha.versaoScript,
    esquema: esquemaSalvo(linha),
    esquemaEm: linha.esquemaEm?.toISOString() ?? null,
    modo: modoCompletoAtivo(linha) ? ("completo" as const) : ("conservador" as const),
    modoCompletoAte: modoCompletoAtivo(linha)
      ? (linha.modoCompletoAte?.toISOString() ?? null)
      : null,
    atualizadoEm: linha.atualizadoEm.toISOString(),
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

/** Salva integração ativa e endereço do Web App, com validação de host. */
export async function salvarIntegracao(admin: { id: string }, entrada: unknown) {
  await salvarConfiguracao(admin, FINALIDADE, entrada);
  return lerIntegracaoAdmin();
}

/** Gera um token novo. Rotacionar invalida a conexão até atualizar o script. */
export async function gerarToken(admin: { id: string }, entrada: unknown) {
  return gerarTokenComum(admin, FINALIDADE, entrada);
}

/** Revela o token com a senha, para reinstalar ou corrigir o script. */
export async function revelarToken(admin: { id: string }, entrada: unknown) {
  return revelarTokenComum(admin, FINALIDADE, entrada);
}

/** Testa o Web App publicado: ping sem alterar a planilha. */
export async function testarConexao(entrada: unknown) {
  return testarConexaoComum(FINALIDADE, entrada);
}

/** Lê o esquema de todas as abas e sugere o mapa por turma de origem. */
export async function lerEstrutura() {
  const linha = await lerLinha(FINALIDADE);
  const { endpoint, token } = exigirConexao(linha);
  const estrutura = await chamarGas<{
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
  }>(endpoint, token, { acao: "estrutura" });
  const turmas = await listarTodasTurmas();
  const abas: AbaEsquema[] = [];
  const problemas: { aba: string; erro: string }[] = [];
  for (const item of estrutura.abas) {
    try {
      const leitura = await chamarGas<{
        valores: string[][];
        formula: boolean[][];
      }>(endpoint, token, {
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

interface SimulacaoInterna {
  modalidade: "conservador" | "completo";
  planos: { plano: PlanoSincronizacao; esquema: AbaEsquema }[];
  planoHashGeral: string;
}

/** Monta os planos de todas as turmas mapeadas para o período. */
async function montarSimulacao(
  linha: LinhaIntegracao,
  entrada: EntradaEnvio,
): Promise<SimulacaoInterna> {
  const { endpoint, token } = exigirConexao(linha);
  const salvo = esquemaSalvo(linha);
  if (!salvo || salvo.mapa.length === 0) {
    throw new ErroHttp("Confira a estrutura da planilha antes de enviar.", 400);
  }
  const dias = diasEntre(entrada.de, entrada.ate);
  if (dias.length === 0 || dias.length > LIMITE_DIAS_ENVIO) {
    throw new ErroHttp("Envie períodos de até três meses por vez.", 400);
  }
  const pares = entrada.todas
    ? salvo.mapa
    : salvo.mapa.filter((item) => item.turmaOriginalId === entrada.turmaOriginalId);
  if (pares.length === 0) {
    throw new ErroHttp("Nenhuma turma de origem mapeada para o envio.", 400);
  }
  const [turmas, alunos, frequencias] = await Promise.all([
    listarTodasTurmas(),
    listarTodosAlunos(),
    listarFrequenciasDoPeriodo(entrada.de, entrada.ate),
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
  const planos: { plano: PlanoSincronizacao; esquema: AbaEsquema }[] = [];
  for (const par of pares) {
    const esquemaAba = salvo.abas.find((aba) => aba.nome === par.aba);
    if (!esquemaAba) throw new ErroHttp(`A aba ${par.aba} não está mais na estrutura salva.`, 409);
    const turmaPlanilha = montarTurmaPlanilha(
      par.turmaOriginalId,
      rotuloDaTurma(par.turmaOriginalId) || par.aba,
      alunos,
      frequencias,
      horarios,
      dias,
      rotuloDaTurma,
    );
    const leitura = await chamarGas<{
      valores: string[][];
      formula: boolean[][];
      linhaInicial: number;
      colunaInicial: number;
      linhasCriadas: number[];
      colunasCriadas: number[];
    }>(endpoint, token, {
      acao: "ler",
      aba: par.aba,
      linhaInicial: 1,
      colunaInicial: 1,
      linhas: Math.max(esquemaAba.ultimaLinhaDados + 20, 2),
      colunas: Math.max(esquemaAba.ultimaColunaDados + 5, 2),
    });
    const conteudo: LeituraAba = {
      nome: par.aba,
      valores: leitura.valores,
      formula: leitura.formula,
      linhaInicial: leitura.linhaInicial,
      colunaInicial: leitura.colunaInicial,
      linhasCriadas: leitura.linhasCriadas,
      colunasCriadas: leitura.colunasCriadas,
    };
    const plano = planejarSincronizacao(esquemaAba, turmaPlanilha, conteudo, {
      ...opcoesBase,
      substituirDivergencias: completo && (entrada.substituirDivergencias ?? false),
      limparCelulas: completo ? (entrada.limparCelulas ?? []) : [],
      removerLinhas: completo ? (entrada.removerLinhas ?? []) : [],
      removerColunas: completo ? (entrada.removerColunas ?? []) : [],
    });
    planos.push({ plano, esquema: esquemaAba });
  }
  return {
    modalidade,
    planos,
    planoHashGeral: hashTexto(
      JSON.stringify([
        modalidade,
        entrada.de,
        entrada.ate,
        planos.map((item) => item.plano.planoHash),
      ]),
    ),
  };
}

/** Prévia do envio, sem gravar nada. */
export async function simularEnvio(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (!limiteDeTentativas(`planilha:simular:${usuario.id}`, 60)) {
    throw new ErroHttp("Muitas prévias em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacao(linha, dados.data);
  return {
    modalidade: simulacao.modalidade,
    planoHashGeral: simulacao.planoHashGeral,
    planos: simulacao.planos.map(({ plano }) => ({
      turmaOriginalId: plano.turmaOriginalId,
      rotulo: plano.rotulo,
      aba: plano.aba,
      bloqueado: plano.bloqueado ?? false,
      resumo: plano.resumo,
      avisos: plano.avisos.slice(0, 10),
      novasColunas: plano.novasColunas,
      novosAlunos: plano.novosAlunos,
      substituir: plano.substituir.slice(0, 20),
      removerLinhas: plano.removerLinhas,
      removerColunas: plano.removerColunas,
      candidatosRemocaoLinhas: plano.candidatosRemocaoLinhas,
      candidatosRemocaoColunas: plano.candidatosRemocaoColunas,
      amostra: amostraDeCelulas(plano),
      assinatura: plano.assinatura,
    })),
  };
}

function amostraDeCelulas(plano: PlanoSincronizacao): CelulaPlano[] {
  return [...plano.substituir, ...plano.preencher].slice(0, 8);
}

interface ResultadoTurma {
  turmaOriginalId: string;
  rotulo: string;
  aba: string;
  resultado: "sucesso" | "parcial" | "falha";
  erro?: string;
  contagens?: Record<string, number>;
}

/** Aplica o plano revisado. Recalcula tudo e exige o mesmo hash. */
export async function aplicarEnvio(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (!dados.data.planoHashGeral) {
    throw new ErroHttp("Faça a prévia antes de enviar.", 400);
  }
  if (!limiteDeTentativas(`planilha:envio:${usuario.id}`, 30)) {
    throw new ErroHttp("Muitos envios em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacao(linha, dados.data);
  if (dados.data.planoHashGeral !== simulacao.planoHashGeral) {
    throw new ErroHttp("Os dados mudaram desde a prévia. Revise o envio de novo.", 409);
  }
  const { endpoint, token } = exigirConexao(linha);
  const resultados: ResultadoTurma[] = [];
  for (const { plano, esquema } of simulacao.planos) {
    const operacoes = operacoesDoPlano(plano, esquema);
    if (operacoes.length === 0) continue;
    const destrutiva = temDestrutiva(plano);
    try {
      const contagens = await chamarGas<Record<string, number>>(
        endpoint,
        token,
        {
          acao: "aplicar",
          aba: plano.aba,
          cabecalhoLinha: esquema.cabecalho,
          assinatura: plano.assinatura,
          modoCompleto: destrutiva,
          operacoes,
        },
        { retentavel: !destrutiva },
      );
      await registrarSincronizacao(
        usuario.id,
        plano,
        simulacao.modalidade,
        contagens,
        "SUCESSO",
        dados.data.de,
        dados.data.ate,
      );
      resultados.push({
        turmaOriginalId: plano.turmaOriginalId,
        rotulo: plano.rotulo,
        aba: plano.aba,
        resultado: "sucesso",
        contagens,
      });
    } catch (erro) {
      const mensagem = erro instanceof ErroHttp ? erro.message : "Falha ao enviar para a planilha.";
      const registro = mensagemParaRegistro(erro, mensagem);
      // Falha de rede pode ter aplicado parte do plano; recusa explícita, não.
      const parcial = erro instanceof ErroGas && !erro.recusado;
      await registrarSincronizacao(
        usuario.id,
        plano,
        simulacao.modalidade,
        {},
        resultadoDeFalha(!parcial),
        dados.data.de,
        dados.data.ate,
        registro,
      );
      resultados.push({
        turmaOriginalId: plano.turmaOriginalId,
        rotulo: plano.rotulo,
        aba: plano.aba,
        resultado: parcial ? "parcial" : "falha",
        erro: mensagem,
      });
    }
  }
  const falhas = resultados.filter((item) => item.resultado === "falha").length;
  const parciais = resultados.filter((item) => item.resultado === "parcial").length;
  return {
    resultados,
    resumo: {
      turmas: resultados.length,
      falhas,
      parciais,
      sucesso: resultados.length - falhas - parciais,
    },
  };
}

function operacoesDoPlano(plano: PlanoSincronizacao, esquema: AbaEsquema) {
  const operacoes: Record<string, unknown>[] = [];
  const colunaAluno = esquema.colunas.find((coluna) => coluna.tipo === "aluno")?.indice ?? 1;
  const colunaTurma = esquema.colunas.find((coluna) => coluna.tipo === "turma")?.indice;
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

async function registrarSincronizacao(
  usuarioId: string,
  plano: PlanoSincronizacao,
  modalidade: "conservador" | "completo",
  contagens: Record<string, number>,
  resultado: "SUCESSO" | "PARCIAL" | "FALHA",
  de: string,
  ate: string,
  erro?: string,
) {
  await banco().sincronizacaoPlanilha.create({
    data: {
      turmaOriginalId: plano.turmaOriginalId,
      de: new Date(`${de}T12:00:00Z`),
      ate: new Date(`${ate}T12:00:00Z`),
      modalidade: modalidade === "completo" ? "COMPLETO" : "CONSERVADOR",
      preenchidas: contagens.preenchidas ?? plano.resumo.preencher,
      substituidas: contagens.substituidas ?? plano.resumo.substituir,
      limpas: contagens.limpas ?? plano.resumo.limpar,
      removidasLinhas: contagens.removidasLinhas ?? plano.resumo.removerLinhas,
      removidasColunas: contagens.removidasColunas ?? plano.resumo.removerColunas,
      alunosCriados: plano.novosAlunos.length,
      colunasCriadas: contagens.colunasCriadas ?? plano.novasColunas.length,
      puladasOcupadas: plano.resumo.puladasOcupadas,
      puladasFormula: plano.resumo.puladasFormula,
      planoHash: plano.planoHash,
      resultado,
      erro: erro?.slice(0, 300) ?? null,
      autorId: usuarioId,
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

/** Desliga a integração e apaga token e esquema. A planilha fica intacta. */
export async function desconectarIntegracao(admin: { id: string }) {
  return desconectar(admin, FINALIDADE);
}
