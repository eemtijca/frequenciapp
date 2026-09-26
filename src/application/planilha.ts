// Google Planilhas: casos de uso da integração opcional. Leitura do esquema,
// planejamento conservador, envio manual, modo completo e cópias de segurança.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ambiente } from "@/infra/ambiente";
import { conferirSenha } from "@/infra/auth/hash";
import { limiteDeTentativas, limparTentativas } from "@/infra/auth/limite";
import { chamarGas } from "@/infra/planilha";
import { listarTodosAlunos } from "@/application/alunos";
import { listarTodasTurmas } from "@/application/turmas";
import { listarFrequenciasDoPeriodo } from "@/application/frequencias";
import {
  DURACOES_MODO_COMPLETO,
  FRASE_MODO_COMPLETO,
  detectarEsquema,
  hashTexto,
  montarTurmaPlanilha,
  planejarSincronizacao,
  validarEndpoint,
  type AbaEsquema,
  type AbaBruta,
  type CelulaPlano,
  type LeituraAba,
  type PlanoSincronizacao,
} from "@/domain/planilha";
import { diasEntre, ehDiaValido, normalizar } from "@/domain/frequencia";

const ID = "principal";
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

const esquemaSalvar = z
  .object({
    ativa: z.boolean().optional(),
    endpoint: z.string().trim().max(500).optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

const esquemaSenha = z.object({ senha: z.string().min(1, "Informe a senha do administrador.") });

const esquemaModoCompleto = z.object({
  frase: z.string().trim().min(1, "Digite a frase de confirmação."),
  senha: z.string().min(1, "Informe a senha do administrador."),
  duracaoMinutos: z.number().int().optional(),
});

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

const esquemaRestaurar = z.object({
  aba: z.string().min(1).max(200),
  copia: z.string().min(1).max(300),
  frase: z.string().trim().min(1, "Digite a frase de confirmação."),
  senha: z.string().min(1, "Informe a senha do administrador."),
});

type EntradaEnvio = z.infer<typeof esquemaEnvio>;

interface LinhaIntegracao {
  ativa: boolean;
  endpoint: string | null;
  token: string | null;
  versaoScript: string | null;
  esquema: unknown;
  assinaturaEsquema: string | null;
  esquemaEm: Date | null;
  modo: "CONSERVADOR" | "COMPLETO";
  modoCompletoAte: Date | null;
  atualizadoEm: Date;
}

async function lerLinha(): Promise<LinhaIntegracao> {
  const linha = await banco().integracaoPlanilha.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
    select: {
      ativa: true,
      endpoint: true,
      token: true,
      versaoScript: true,
      esquema: true,
      assinaturaEsquema: true,
      esquemaEm: true,
      modo: true,
      modoCompletoAte: true,
      atualizadoEm: true,
    },
  });
  return linha as LinhaIntegracao;
}

function modoCompletoAtivo(linha: LinhaIntegracao): boolean {
  return (
    linha.modo === "COMPLETO" &&
    linha.modoCompletoAte !== null &&
    linha.modoCompletoAte.getTime() > Date.now()
  );
}

function exigirConexao(linha: LinhaIntegracao): { endpoint: string; token: string } {
  if (!linha.ativa || !linha.endpoint || !linha.token) {
    throw new ErroHttp("A integração com a planilha não está ativa.", 400);
  }
  return { endpoint: linha.endpoint, token: linha.token };
}

function esquemaSalvo(linha: LinhaIntegracao): EsquemaSalvo | null {
  const bruto = linha.esquema;
  if (!bruto || typeof bruto !== "object") return null;
  const candidato = bruto as EsquemaSalvo;
  if (!Array.isArray(candidato.abas) || !Array.isArray(candidato.mapa)) return null;
  return candidato;
}

/** Estado público da integração, para o selo e o botão da Grade. */
export async function lerEstadoPlanilha(): Promise<EstadoPlanilha> {
  const linha = await lerLinha();
  const completo = modoCompletoAtivo(linha);
  if (linha.modo === "COMPLETO" && !completo) {
    await banco().integracaoPlanilha.update({
      where: { id: ID },
      data: { modo: "CONSERVADOR", modoCompletoAte: null },
    });
  }
  const ultima = await banco().sincronizacaoPlanilha.findFirst({
    where: { resultado: { not: "FALHA" } },
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  });
  const alteradasDepois = ultima
    ? await banco().frequencia.count({ where: { atualizadoEm: { gt: ultima.criadoEm } } })
    : 0;
  return {
    ativa: linha.ativa,
    modo: completo ? "completo" : "conservador",
    modoCompletoAte: completo && linha.modoCompletoAte ? linha.modoCompletoAte.toISOString() : null,
    podeEnviar: Boolean(linha.ativa && linha.endpoint && linha.token),
    alteradasDepois,
  };
}

/** Configuração completa para a administração. O token nunca volta inteiro. */
export async function lerIntegracaoAdmin() {
  const linha = await lerLinha();
  const sincronizacoes = await banco().sincronizacaoPlanilha.findMany({
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
  const dados = esquemaSalvar.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.endpoint !== undefined) {
    const problema = validarEndpoint(dados.data.endpoint, !ambiente.ehProducao);
    if (problema) throw new ErroHttp(problema, 400);
  }
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id: ID },
      update: {
        ...(dados.data.ativa !== undefined ? { ativa: dados.data.ativa } : {}),
        ...(dados.data.endpoint !== undefined
          ? { endpoint: dados.data.endpoint.trim() || null }
          : {}),
        atualizadoPorId: admin.id,
      },
      create: {
        id: ID,
        ativa: dados.data.ativa ?? false,
        endpoint: dados.data.endpoint?.trim() || null,
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.salvar", `integracao:${ID}`);
  });
  return lerIntegracaoAdmin();
}

/** Gera um token novo. Rotacionar invalida a conexão até atualizar o script. */
export async function gerarToken(admin: { id: string }, entrada: unknown) {
  const dados = esquemaSenha.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a senha do administrador.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "planilha:token");
  const token = randomBytes(32).toString("base64url");
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id: ID },
      update: { token, ativa: false, atualizadoPorId: admin.id },
      create: { id: ID, token, atualizadoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.token.gerar", `integracao:${ID}`);
  });
  return { token };
}

/** Revela o token com a senha, para reinstalar ou corrigir o script. */
export async function revelarToken(admin: { id: string }, entrada: unknown) {
  const dados = esquemaSenha.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a senha do administrador.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "planilha:token");
  const linha = await lerLinha();
  if (!linha.token) throw new ErroHttp("Ainda não há token gerado.", 404);
  return { token: linha.token };
}

async function conferirSenhaDoAdmin(
  usuarioId: string,
  senha: string,
  chaveLimite: string,
): Promise<void> {
  const chave = `${chaveLimite}:${usuarioId}`;
  if (!limiteDeTentativas(chave, 5)) {
    throw new ErroHttp("Muitas tentativas incorretas. Aguarde alguns minutos.", 429);
  }
  const usuario = await banco().usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !(await conferirSenha(senha, usuario.senhaHash))) {
    throw new ErroHttp("A senha do administrador está incorreta.", 400);
  }
  limparTentativas(chave);
}

/** Testa o Web App publicado: ping sem alterar a planilha. */
export async function testarConexao(admin: { id: string }, entrada: unknown) {
  const dados = esquemaSalvar.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Endereço inválido.", 400);
  const linha = await lerLinha();
  const endpoint = dados.data.endpoint?.trim() || linha.endpoint;
  if (!endpoint) throw new ErroHttp("Informe o endereço do aplicativo da Web.", 400);
  const problema = validarEndpoint(endpoint, !ambiente.ehProducao);
  if (problema) throw new ErroHttp(problema, 400);
  if (!linha.token) throw new ErroHttp("Gere o token antes de testar.", 400);
  const ping = await chamarGas<{
    versao: number;
    planilha: { nome: string; url: string; fuso: string };
    abas: { nome: string; linhas: number; colunas: number; oculta: boolean }[];
  }>(endpoint, linha.token, { acao: "ping" });
  await banco().integracaoPlanilha.update({
    where: { id: ID },
    data: { endpoint, versaoScript: String(ping.versao) },
  });
  return ping;
}

/** Lê o esquema de todas as abas e sugere o mapa por turma de origem. */
export async function lerEstrutura() {
  const linha = await lerLinha();
  const { endpoint, token } = exigirConexao(linha);
  const estrutura = await chamarGas<{
    planilha: { nome: string; url: string; fuso: string };
    abas: {
      nome: string;
      oculta: boolean;
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
      where: { id: ID },
      data: {
        esquema: salvo as unknown as object,
        assinaturaEsquema: hashTexto(JSON.stringify(abas.map((aba) => aba.assinatura))),
        esquemaEm: new Date(),
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.mapear", `integracao:${ID}`);
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
export async function simularEnvio(entrada: unknown) {
  const dados = esquemaEnvio.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const linha = await lerLinha();
  const simulacao = await montarSimulacao(linha, dados.data);
  return {
    modalidade: simulacao.modalidade,
    planoHashGeral: simulacao.planoHashGeral,
    planos: simulacao.planos.map(({ plano }) => ({
      turmaOriginalId: plano.turmaOriginalId,
      rotulo: plano.rotulo,
      aba: plano.aba,
      resumo: plano.resumo,
      avisos: plano.avisos.slice(0, 10),
      novasColunas: plano.novasColunas,
      novosAlunos: plano.novosAlunos,
      removerLinhas: plano.removerLinhas,
      removerColunas: plano.removerColunas,
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
  const linha = await lerLinha();
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
      await registrarSincronizacao(
        usuario.id,
        plano,
        simulacao.modalidade,
        {},
        "FALHA",
        dados.data.de,
        dados.data.ate,
        mensagem,
      );
      resultados.push({
        turmaOriginalId: plano.turmaOriginalId,
        rotulo: plano.rotulo,
        aba: plano.aba,
        resultado: "falha",
        erro: mensagem,
      });
    }
  }
  const falhas = resultados.filter((item) => item.resultado === "falha").length;
  return {
    resultados,
    resumo: {
      turmas: resultados.length,
      falhas,
      sucesso: resultados.length - falhas,
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
  const dados = esquemaModoCompleto.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO) {
    throw new ErroHttp("A frase de confirmação não confere.", 400);
  }
  const duracao = dados.data.duracaoMinutos ?? 15;
  if (!(DURACOES_MODO_COMPLETO as readonly number[]).includes(duracao)) {
    throw new ErroHttp("Duração inválida.", 400);
  }
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "planilha:modo");
  const ate = new Date(Date.now() + duracao * 60_000);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id: ID },
      update: { modo: "COMPLETO", modoCompletoAte: ate, modoCompletoPorId: admin.id },
      create: { id: ID, modo: "COMPLETO", modoCompletoAte: ate, modoCompletoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.modoCompleto.ativar", `duracao:${duracao}`);
  });
  return { modo: "completo" as const, modoCompletoAte: ate.toISOString() };
}

/** Volta ao conservador; qualquer sessão pode encerrar a janela. */
export async function desativarModoCompleto(usuario: { id: string }) {
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: ID },
      data: { modo: "CONSERVADOR", modoCompletoAte: null },
    });
    await auditar(tx, usuario.id, "planilha.modoCompleto.encerrar", `integracao:${ID}`);
  });
  return { modo: "conservador" as const };
}

/** Lista as cópias ocultas de uma aba. */
export async function listarCopias(entrada: unknown) {
  const dados = z.object({ aba: z.string().min(1).max(200) }).safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a aba.", 400);
  const linha = await lerLinha();
  const { endpoint, token } = exigirConexao(linha);
  return chamarGas<{ copias: { nome: string; criadaEm: string }[] }>(endpoint, token, {
    acao: "listarCopias",
    aba: dados.data.aba,
  });
}

/** Restaura uma cópia, com senha e frase; invalida o esquema salvo. */
export async function restaurarCopia(admin: { id: string }, entrada: unknown) {
  const dados = esquemaRestaurar.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO) {
    throw new ErroHttp("A frase de confirmação não confere.", 400);
  }
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, "planilha:restaurar");
  const linha = await lerLinha();
  const { endpoint, token } = exigirConexao(linha);
  const resultado = await chamarGas<{ aba: string; copia: string; anterior: string }>(
    endpoint,
    token,
    { acao: "restaurarCopia", aba: dados.data.aba, copia: dados.data.copia },
    { retentavel: false },
  );
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: ID },
      data: { esquema: Prisma.DbNull, assinaturaEsquema: null, esquemaEm: null },
    });
    await auditar(tx, admin.id, "planilha.restaurar", `aba:${dados.data.aba}`);
  });
  return resultado;
}

/** Desliga a integração e apaga token e esquema. A planilha fica intacta. */
export async function desconectarIntegracao(admin: { id: string }) {
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: ID },
      data: {
        ativa: false,
        endpoint: null,
        token: null,
        esquema: Prisma.DbNull,
        assinaturaEsquema: null,
        esquemaEm: null,
        modo: "CONSERVADOR",
        modoCompletoAte: null,
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.desconectar", `integracao:${ID}`);
  });
  return { ok: true };
}
