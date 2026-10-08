// Google Planilhas: casos de uso da planilha de saídas antecipadas. Leitura da
// aba única, prévia conservadora e envio com modo completo por janela.
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
import { listarSaidas } from "@/application/saidas";
import { listarJustificativas } from "@/application/justificativas";
import { ABA_ENTRADAS } from "@/domain/planilha-entradas";
import {
  ativarModoCompleto as ativarModoCompletoComum,
  chamarIntegracao,
  criarAba as criarAbaComum,
  desconectar,
  desativarModoCompleto as desativarModoCompletoComum,
  emSequencia,
  type SituacaoEnvioMovimentacao,
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
  CABECALHO_SAIDAS,
  atualizarLimitesSaida,
  detectarEsquemaSaida,
  planejarSaidas,
  saidasEnviaveisSozinhas,
  saidasTemNovidade,
  type AbaSaidaEsquema,
  type PlanoSaidas,
  type SaidaPlanilha,
} from "@/domain/planilha-saidas";
import {
  erroVigente,
  hashTexto,
  resultadoDeFalha,
  type AbaBruta,
  type LeituraAba,
} from "@/domain/planilha";
import {
  diasEntre,
  ehDiaValido,
  partesJustificativaSaida,
  rotuloMomento,
} from "@/domain/frequencia";

import {
  comTravaPlanilhaMovimentacoes,
  controleTravaPlanilhaMovimentacoes,
} from "@/infra/trava-planilha-movimentacoes";
import {
  haEnvioMovimentacaoSemConfirmacao,
  iniciarEnvioMovimentacao,
  concluirEnvioMovimentacao,
} from "./planilha-movimentacoes-envios";

const FINALIDADE = "SAIDAS" as const;
const LIMITE_DIAS_ENVIO = 92;

export interface EsquemaSaidasSalvo {
  planilha: { nome: string; url: string; fuso: string };
  abas: AbaSaidaEsquema[];
  aba: string;
  atualizadoEm: string;
}

function esquemaSaidasSalvo(linha: LinhaIntegracao): EsquemaSaidasSalvo | null {
  const bruto = linha.esquema;
  if (!bruto || typeof bruto !== "object") return null;
  const candidato = bruto as EsquemaSaidasSalvo;
  if (!Array.isArray(candidato.abas) || typeof candidato.aba !== "string") return null;
  return candidato;
}

/** Estado público da integração de saídas, para o botão da vista Saídas. */
export async function lerEstadoSaidas() {
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
    modo: completo ? ("completo" as const) : ("conservador" as const),
    modoCompletoAte: completo && linha.modoCompletoAte ? linha.modoCompletoAte.toISOString() : null,
    podeEnviar: Boolean(linha.ativa && linha.googleRefreshToken && linha.googlePlanilhaId),
    configurada: Boolean(esquemaSaidasSalvo(linha)),
  };
}

/** Configuração administrativa da planilha, sem revelar credenciais Google. */
export async function lerIntegracaoSaidasAdmin() {
  const linha = await lerLinha(FINALIDADE);
  const principal = await banco().integracaoPlanilha.findUnique({
    where: { id: "principal" },
    select: { googleRefreshToken: true },
  });
  const sincronizacoes = await banco().sincronizacaoPlanilha.findMany({
    where: { finalidade: FINALIDADE },
    orderBy: { criadoEm: "desc" },
    take: 10,
    select: {
      id: true,
      de: true,
      ate: true,
      modalidade: true,
      linhasCriadas: true,
      preenchidas: true,
      substituidas: true,
      removidasLinhas: true,
      puladasOcupadas: true,
      puladasFormula: true,
      resultado: true,
      erro: true,
      criadoEm: true,
    },
  });
  // Só o envio mais recente decide: um sucesso depois apaga o erro anterior.
  const ultimoEnvio = await banco().sincronizacaoPlanilha.findFirst({
    where: { finalidade: FINALIDADE },
    orderBy: { criadoEm: "desc" },
    select: { erro: true, resultado: true, criadoEm: true },
  });
  const ultimoErro = erroVigente(ultimoEnvio ? [ultimoEnvio] : [], () => FINALIDADE);
  return {
    ativa: linha.ativa,
    contaGoogle: Boolean(linha.googleRefreshToken || principal?.googleRefreshToken),
    googlePlanilha: linha.googlePlanilhaId
      ? { id: linha.googlePlanilhaId, nome: linha.googlePlanilhaNome }
      : null,
    esquema: esquemaSaidasSalvo(linha),
    esquemaEm: linha.esquemaEm?.toISOString() ?? null,
    modo: modoCompletoAtivo(linha) ? ("completo" as const) : ("conservador" as const),
    modoCompletoAte: modoCompletoAtivo(linha)
      ? (linha.modoCompletoAte?.toISOString() ?? null)
      : null,
    envioAutomatico: linha.envioAutomatico,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    fuso: ambiente.fuso,
    ultimoErro: ultimoErro
      ? {
          erro: ultimoErro.erro,
          resultado: ultimoErro.resultado,
          criadoEm: ultimoErro.criadoEm.toISOString(),
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

/** Salva as preferências da planilha conectada pela conta Google. */
export async function salvarIntegracaoSaidas(admin: { id: string }, entrada: unknown) {
  await salvarConfiguracao(admin, FINALIDADE, entrada);
  return lerIntegracaoSaidasAdmin();
}

/** Desliga a integração e apaga autorização Google e esquema. A planilha fica intacta. */
export async function desconectarSaidas(admin: { id: string }) {
  return desconectar(admin, FINALIDADE);
}

/** Remove a aba de saídas criada pela integração, no modo completo e com senha. */
export async function removerAbaSaidas(admin: { id: string }, entrada: unknown) {
  return comTravaPlanilhaMovimentacoes(() => removerAbaComum(admin, FINALIDADE, entrada));
}

/** Destrava o modo completo com frase, senha e duração. */
export async function ativarModoCompletoSaidas(admin: { id: string }, entrada: unknown) {
  return ativarModoCompletoComum(admin, FINALIDADE, entrada);
}

/** Volta ao conservador; qualquer sessão pode encerrar a janela. */
export async function desativarModoCompletoSaidas(usuario: { id: string }) {
  return desativarModoCompletoComum(usuario, FINALIDADE);
}

/** Lista as cópias ocultas da aba de saídas. */
export async function listarCopiasSaidas(entrada: unknown) {
  return listarCopiasComum(FINALIDADE, entrada);
}

/** Restaura uma cópia da aba de saídas; invalida o esquema salvo. */
export async function restaurarCopiaSaidas(admin: { id: string }, entrada: unknown) {
  return comTravaPlanilhaMovimentacoes(() => restaurarCopiaComum(admin, FINALIDADE, entrada));
}

/** Cria a aba de saídas com o cabeçalho padrão, se ela ainda não existir. */
export async function criarAbaSaidas(admin: { id: string }, entrada: unknown) {
  const dados = z
    .object({
      nome: z.string().trim().min(1, "Informe o nome da aba.").max(200),
      cabecalho: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    })
    .safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  return criarAbaComum(admin, FINALIDADE, {
    nome: dados.data.nome,
    cabecalho: dados.data.cabecalho ?? CABECALHO_SAIDAS,
  });
}

interface SugestaoAba {
  aba: string;
  confianca: "alta" | "media" | "baixa";
}

function sugerirAbaSaidas(abas: AbaSaidaEsquema[]): SugestaoAba | null {
  const visiveis = abas.filter((aba) => !aba.oculta && !aba.bloqueio);
  if (visiveis.length === 0) return null;
  const porNome = visiveis.find((aba) => /saiu|saida|saídas|saidas/i.test(aba.nome));
  if (porNome) return { aba: porNome.nome, confianca: "alta" };
  if (visiveis.length === 1) return { aba: visiveis[0]?.nome ?? "", confianca: "media" };
  return { aba: visiveis[0]?.nome ?? "", confianca: "baixa" };
}

/** Lê a estrutura das abas e sugere a aba única de registro das saídas. */
export async function lerEstruturaSaidas() {
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
  const abas: AbaSaidaEsquema[] = [];
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
      const detectada = detectarEsquemaSaida(bruta);
      if (bruta.nome === ABA_ENTRADAS)
        detectada.bloqueio =
          "A aba Entradas é reservada às chegadas atrasadas. Escolha outra aba para as saídas.";
      abas.push(detectada);
    } catch (erro) {
      problemas.push({
        aba: item.nome,
        erro: erro instanceof ErroHttp ? erro.message : "Não foi possível ler a aba.",
      });
    }
  }
  return { planilha: estrutura.planilha, abas, sugestao: sugerirAbaSaidas(abas), problemas };
}

const esquemaMapaSaidas = z.object({
  planilha: z.object({
    nome: z.string().max(200),
    url: z.string().max(500),
    fuso: z.string().max(60),
  }),
  abas: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  aba: z.string().min(1).max(200),
});

/** Salva a aba escolhida, o esquema das colunas e a assinatura. */
export async function salvarMapaSaidas(admin: { id: string }, entrada: unknown) {
  const dados = esquemaMapaSaidas.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Estrutura inválida.", 400);
  }
  const abas = dados.data.abas as unknown as AbaSaidaEsquema[];
  if (dados.data.aba === ABA_ENTRADAS)
    throw new ErroHttp(
      "A aba Entradas é reservada às chegadas atrasadas. Escolha outra aba para as saídas.",
      400,
    );
  const escolhida = abas.find((aba) => aba.nome === dados.data.aba);
  if (!escolhida) throw new ErroHttp("Aba escolhida não está na estrutura lida.", 400);
  if (escolhida.bloqueio) throw new ErroHttp(escolhida.bloqueio, 400);
  const salvo: EsquemaSaidasSalvo = {
    planilha: dados.data.planilha,
    abas,
    aba: escolhida.nome,
    atualizadoEm: new Date().toISOString(),
  };
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: idDaIntegracao(FINALIDADE) },
      data: {
        esquema: salvo as unknown as object,
        assinaturaEsquema: escolhida.assinatura,
        esquemaEm: new Date(),
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.saidas.mapear", `aba:${escolhida.nome}`);
  });
  return lerIntegracaoSaidasAdmin();
}

const esquemaEnvioSaidas = z.object({
  de: z.string().refine(ehDiaValido, "Data inicial inválida."),
  ate: z.string().refine(ehDiaValido, "Data final inválida."),
  removerLinhas: z.array(z.number().int().min(1).max(100000)).max(500).optional(),
  planoHash: z.string().max(64).optional(),
});

type EntradaEnvioSaidas = z.infer<typeof esquemaEnvioSaidas>;

interface SimulacaoSaidas {
  modalidade: "conservador" | "completo";
  plano: PlanoSaidas;
  esquema: AbaSaidaEsquema;
}

/** Monta o plano da aba única para o período informado. */
async function montarSimulacaoSaidas(
  linha: LinhaIntegracao,
  entrada: EntradaEnvioSaidas,
): Promise<SimulacaoSaidas> {
  const salvo = esquemaSaidasSalvo(linha);
  if (!salvo) {
    throw new ErroHttp(
      "Confira a estrutura da planilha de entradas e saídas antes de enviar.",
      400,
    );
  }
  const dias = diasEntre(entrada.de, entrada.ate);
  if (dias.length === 0 || dias.length > LIMITE_DIAS_ENVIO) {
    throw new ErroHttp("Envie períodos de até três meses por vez.", 400);
  }
  const esquemaAba = salvo.abas.find((aba) => aba.nome === salvo.aba);
  if (!esquemaAba) throw new ErroHttp(`A aba ${salvo.aba} não está mais na estrutura salva.`, 409);
  const [alunos, turmas, saidas, justificativas] = await Promise.all([
    listarTodosAlunos(),
    listarTodasTurmas(),
    listarSaidas({ de: entrada.de, ate: entrada.ate }),
    listarJustificativas(),
  ]);
  const alunosPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
  const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
  const linhas: SaidaPlanilha[] = [];
  for (const saida of saidas) {
    const aluno = alunosPorId.get(saida.alunoId);
    if (!aluno) continue;
    const partes = partesJustificativaSaida(saida, justificativas);
    linhas.push({
      id: saida.id,
      alunoId: aluno.id,
      nome: aluno.nome,
      turma: turmasPorId.get(aluno.turmaId) ?? "",
      dia: saida.dia,
      momento: saida.horario
        ? `${saida.horario} · ${rotuloMomento(saida.momento)}`
        : rotuloMomento(saida.momento),
      justificativa: partes.motivo,
      observacao: partes.complemento ?? "",
      liberadoPor: saida.liberadoPorNome ?? "",
    });
  }
  const leitura = await chamarIntegracao<{
    valores: string[][];
    formula: boolean[][];
    linhaInicial: number;
    colunaInicial: number;
    linhasCriadas: number[];
    colunasCriadas: number[];
  }>(linha, {
    acao: "ler",
    aba: salvo.aba,
    linhaInicial: 1,
    colunaInicial: 1,
    linhas: Math.max(esquemaAba.totalLinhas + 20, 2),
    colunas: Math.max(esquemaAba.ultimaColunaDados + 5, 2),
  });
  const conteudo: LeituraAba = {
    nome: salvo.aba,
    valores: leitura.valores,
    formula: leitura.formula,
    linhaInicial: leitura.linhaInicial,
    colunaInicial: leitura.colunaInicial,
    linhasCriadas: leitura.linhasCriadas,
    colunasCriadas: leitura.colunasCriadas,
  };
  const esquemaAtual = atualizarLimitesSaida(esquemaAba, conteudo);
  const completo = modoCompletoAtivo(linha);
  const modalidade = completo ? ("completo" as const) : ("conservador" as const);
  const plano = planejarSaidas(esquemaAtual, linhas, conteudo, {
    modo: modalidade,
    de: entrada.de,
    ate: entrada.ate,
    anoReferencia: new Date().getFullYear(),
    removerLinhas: completo ? (entrada.removerLinhas ?? []) : [],
  });
  plano.planoHash = hashTexto(JSON.stringify([linha.googlePlanilhaId, plano.planoHash]));
  return { modalidade, plano, esquema: esquemaAtual };
}

/** Prévia do envio das saídas, sem gravar nada. */
export async function simularEnvioSaidas(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvioSaidas.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (!(await limiteDeTentativas(`planilha-saidas:simular:${usuario.id}`, 60))) {
    throw new ErroHttp("Muitas prévias em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacaoSaidas(linha, dados.data);
  return {
    modalidade: simulacao.modalidade,
    planoHash: simulacao.plano.planoHash,
    aba: simulacao.plano.aba,
    bloqueado: simulacao.plano.bloqueado ?? false,
    resumo: simulacao.plano.resumo,
    avisos: simulacao.plano.avisos.slice(0, 10),
    criar: simulacao.plano.criar.slice(0, 20),
    preencher: simulacao.plano.preencher.slice(0, 20),
    substituir: simulacao.plano.substituir.slice(0, 20),
    candidatosRemocao: simulacao.plano.candidatosRemocao,
  };
}

function operacoesDoPlanoSaidas(plano: PlanoSaidas) {
  const operacoes: Record<string, unknown>[] = [];
  if (plano.criar.length > 0) {
    operacoes.push({
      tipo: "criarLinhas",
      itens: plano.criar.map((linha) => ({ linha: linha.linha, celulas: linha.celulas })),
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
  if (plano.remover.length > 0) {
    operacoes.push({
      tipo: "removerLinhas",
      linhas: plano.remover.map((item) => item.linha).sort((a, b) => b - a),
    });
  }
  return operacoes;
}

function temDestrutivaSaidas(plano: PlanoSaidas): boolean {
  return plano.substituir.length > 0 || plano.remover.length > 0;
}

/** Aplica o plano revisado. Recalcula tudo e exige o mesmo hash. */
export function aplicarEnvioSaidas(usuario: { id: string }, entrada: unknown) {
  return comTravaPlanilhaMovimentacoes(() => aplicarEnvioSaidasProtegido(usuario, entrada));
}

async function aplicarEnvioSaidasProtegido(usuario: { id: string }, entrada: unknown) {
  const dados = esquemaEnvioSaidas.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (!dados.data.planoHash) {
    throw new ErroHttp("Faça a prévia antes de enviar.", 400);
  }
  if (!(await limiteDeTentativas(`planilha-saidas:envio:${usuario.id}`, 30))) {
    throw new ErroHttp("Muitos envios em sequência. Aguarde alguns minutos.", 429);
  }
  const linha = await lerLinha(FINALIDADE);
  const simulacao = await montarSimulacaoSaidas(linha, dados.data);
  if (dados.data.planoHash !== simulacao.plano.planoHash) {
    throw new ErroHttp("Os dados mudaram desde a prévia. Revise o envio de novo.", 409);
  }
  if (simulacao.plano.bloqueado || simulacao.plano.resumo.ambiguidades > 0)
    throw new ErroHttp(simulacao.plano.avisos[0] ?? "Confira a aba de saídas.", 409);
  const operacoes = operacoesDoPlanoSaidas(simulacao.plano);
  const registroId = await iniciarEnvioMovimentacao(
    usuario.id,
    linha,
    simulacao.plano.aba,
    dados.data,
    simulacao.plano.planoHash,
    simulacao.modalidade,
  );
  if (operacoes.length === 0) {
    controleTravaPlanilhaMovimentacoes()?.conferir();
    await concluirEnvioMovimentacao(registroId, "SUCESSO", {
      puladasOcupadas: simulacao.plano.resumo.puladasOcupadas,
      puladasFormula: simulacao.plano.resumo.puladasFormula,
    });
    return { resultado: "sucesso" as const, contagens: {} };
  }
  const destrutiva = temDestrutivaSaidas(simulacao.plano);
  try {
    const contagens = await chamarIntegracao<Record<string, number>>(linha, {
      acao: "aplicar",
      aba: simulacao.plano.aba,
      cabecalhoLinha: simulacao.esquema.cabecalho,
      assinatura: simulacao.plano.assinatura,
      modoCompleto: destrutiva,
      operacoes,
    });
    controleTravaPlanilhaMovimentacoes()?.conferir();
    const esperadas = simulacao.plano.resumo;
    if (
      [
        [contagens.linhasCriadas, esperadas.criar],
        [contagens.preenchidas, esperadas.preencher],
        [contagens.substituidas, esperadas.substituir],
        [contagens.removidasLinhas, esperadas.remover],
      ].some(([confirmadas, esperado]) => (confirmadas ?? 0) !== esperado)
    )
      throw new ErroHttp("Parte das alterações não foi confirmada.", 502);
    await concluirEnvioMovimentacao(registroId, "SUCESSO", {
      ...contagens,
      puladasOcupadas: esperadas.puladasOcupadas,
      puladasFormula: esperadas.puladasFormula,
    });
    return { resultado: "sucesso" as const, contagens };
  } catch (erro) {
    const mensagem = erro instanceof ErroHttp ? erro.message : "Falha ao enviar para a planilha.";
    const registro = `Saídas: ${mensagemParaRegistro(erro, mensagem)}`;
    // Falha de rede pode ter aplicado parte do plano; recusa explícita, não.
    const parcial = !(erro instanceof ErroGoogle && erro.recusado);
    await concluirEnvioMovimentacao(registroId, resultadoDeFalha(!parcial), {}, registro);
    return { resultado: parcial ? ("parcial" as const) : ("falha" as const), erro: mensagem };
  }
}

/**
 * Envia à planilha as saídas recém-registradas de um dia. Só roda com a
 * integração ativa e a chave ligada, em modo conservador, só acrescentando
 * linhas e sem repetir depois de um envio sem confirmação. Nunca lança: o
 * registro já foi confirmado. O que pedir revisão fica para o envio manual.
 */
export async function enviarSaidasAposRegistro(
  usuario: { id: string },
  dia: string,
): Promise<SituacaoEnvioMovimentacao> {
  try {
    const configuracao = await lerLinha(FINALIDADE);
    if (!configuracao.ativa || !configuracao.envioAutomatico || modoCompletoAtivo(configuracao))
      return "desligado";
    return await emSequencia(() =>
      comTravaPlanilhaMovimentacoes(async () => {
        const linha = await lerLinha(FINALIDADE);
        if (!linha.ativa || !linha.envioAutomatico || modoCompletoAtivo(linha)) return "desligado";
        const aba = esquemaSaidasSalvo(linha)?.aba;
        if (!aba) return "pendente_manual";
        if (await haEnvioMovimentacaoSemConfirmacao(linha, aba)) return "sem_confirmacao";
        const periodo = { de: dia, ate: dia };
        const simulacao = await montarSimulacaoSaidas(linha, periodo);
        if (simulacao.modalidade !== "conservador" || !saidasEnviaveisSozinhas(simulacao.plano))
          return "pendente_manual";
        if (!saidasTemNovidade(simulacao.plano)) return "enviado";
        const resposta = await aplicarEnvioSaidas(usuario, {
          ...periodo,
          planoHash: simulacao.plano.planoHash,
        });
        if (resposta.resultado === "sucesso") return "enviado";
        return resposta.resultado === "parcial" ? "sem_confirmacao" : "falhou";
      }),
    );
  } catch (erro) {
    console.error(
      "Envio automático das saídas não concluído.",
      erro instanceof Error ? erro.name : "",
    );
    if (erro instanceof ErroHttp && erro.status === 409) return "pendente_manual";
    return "falhou";
  }
}
