// Diretores de turma: identificador de entrada, ciclo de vida da palavra-chave,
// vínculos vigentes e categorias visíveis. Regras puras (ADR-021).

/** O que a administração pode liberar para o diretor ver; faltas sempre. */
export const CATEGORIAS_DIRETOR = ["faltas", "justificativas", "saidas"] as const;
export type CategoriaDiretor = (typeof CATEGORIAS_DIRETOR)[number];

export const ROTULOS_CATEGORIA_DIRETOR: Record<CategoriaDiretor, string> = {
  faltas: "Faltas",
  justificativas: "Faltas justificadas",
  saidas: "Saídas antecipadas",
};

/**
 * Identificador de entrada do diretor: minúsculas, números, ponto e hífen,
 * de 3 a 40 caracteres, começando por letra ou número. Sem arroba, para
 * nunca colidir com o e-mail da equipe, que divide a mesma coluna de login.
 */
const PADRAO_IDENTIFICADOR = /^[a-z0-9][a-z0-9.-]{2,39}$/;

/** Mensagem do problema no identificador, ou null quando serve. */
export function problemaDeIdentificador(identificador: string): string | null {
  if (identificador.length < 3) return "O identificador deve ter ao menos 3 caracteres.";
  if (identificador.length > 40) return "O identificador deve ter no máximo 40 caracteres.";
  if (!PADRAO_IDENTIFICADOR.test(identificador)) {
    return "Use letras minúsculas sem acento, números, ponto ou hífen, começando por letra ou número.";
  }
  return null;
}

/** Login digitado na entrada: e-mail da equipe ou identificador do diretor. */
export function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

/**
 * Alfabeto da palavra-chave gerada: sem 0, o, 1, l e i, que se confundem
 * ao ditar ou copiar à mão. Doze sorteios dão cerca de 59 bits.
 */
export const ALFABETO_PALAVRA_CHAVE = "abcdefghjkmnpqrstuvwxyz23456789";
export const TAMANHO_PALAVRA_CHAVE = 12;

/** Agrupa a palavra em blocos de quatro, para ler e ditar. */
export function formatarPalavraChave(caracteres: string): string {
  return caracteres.match(/.{1,4}/g)?.join("-") ?? caracteres;
}

export type EstadoCredencial = "sem_palavra" | "emitida" | "em_uso" | "expirada" | "revogada";

export const ROTULOS_ESTADO_CREDENCIAL: Record<EstadoCredencial, string> = {
  sem_palavra: "Sem palavra-chave",
  emitida: "Aguardando primeiro acesso",
  em_uso: "Em uso",
  expirada: "Expirada",
  revogada: "Revogada",
};

export interface CredencialResumo {
  expiraEm: Date | string;
  revogadaEm: Date | string | null;
  trocaObrigatoria: boolean;
}

/** Estado da palavra-chave num instante: a revogação vence a validade. */
export function estadoDaCredencial(
  credencial: CredencialResumo | null,
  agora: Date,
): EstadoCredencial {
  if (!credencial) return "sem_palavra";
  if (credencial.revogadaEm) return "revogada";
  if (new Date(credencial.expiraEm).getTime() <= agora.getTime()) return "expirada";
  return credencial.trocaObrigatoria ? "emitida" : "em_uso";
}

/** Só palavra emitida ou em uso permite entrar. */
export function credencialPermiteEntrada(estado: EstadoCredencial): boolean {
  return estado === "emitida" || estado === "em_uso";
}

/** Mensagem da recusa de entrada para cada estado que não permite entrar. */
export function mensagemDeCredencialRecusada(estado: EstadoCredencial): string {
  if (estado === "expirada") return "Palavra-chave vencida. Peça uma nova à coordenação.";
  return "Acesso encerrado. Procure a coordenação da escola.";
}

export interface PeriodoVinculo {
  inicio: string;
  fim: string | null;
}

/** Vínculo vigente no dia civil: começou e ainda não terminou. */
export function vinculoVigente(vinculo: PeriodoVinculo, dia: string): boolean {
  return vinculo.inicio <= dia && (vinculo.fim === null || vinculo.fim >= dia);
}

/**
 * Recorta um período pedido ao período do vínculo. Devolve null quando não
 * há interseção: o diretor nunca vê dia fora do próprio vínculo.
 */
export function recortarAoVinculo(
  vinculo: PeriodoVinculo,
  de: string,
  ate: string,
): { de: string; ate: string } | null {
  const inicio = de > vinculo.inicio ? de : vinculo.inicio;
  const fim = vinculo.fim !== null && vinculo.fim < ate ? vinculo.fim : ate;
  return inicio <= fim ? { de: inicio, ate: fim } : null;
}

/** Categorias válidas vindas do banco, com faltas sempre presente. */
export function categoriasValidas(valores: readonly string[]): CategoriaDiretor[] {
  const conjunto = new Set<CategoriaDiretor>(["faltas"]);
  for (const valor of valores) {
    if ((CATEGORIAS_DIRETOR as readonly string[]).includes(valor)) {
      conjunto.add(valor as CategoriaDiretor);
    }
  }
  return CATEGORIAS_DIRETOR.filter((categoria) => conjunto.has(categoria));
}

/** Parâmetros de acesso editáveis pela administração. */
export interface ParametrosAcesso {
  validadePalavraDias: number;
  sessaoDiretorHoras: number;
  tentativasPorOrigem: number;
  tentativasPorLogin: number;
  janelaMinutos: number;
  categoriasDiretor: CategoriaDiretor[];
  limiteRiscoPercentual: number;
}

export type ParametroNumerico = Exclude<keyof ParametrosAcesso, "categoriasDiretor">;

/**
 * Faixas aceitas de cada parâmetro numérico, com rótulo e unidade para o
 * formulário. As mesmas faixas estão na checagem da tabela no banco.
 */
export const FAIXAS_PARAMETROS: Record<
  ParametroNumerico,
  { minimo: number; maximo: number; rotulo: string; unidade: string }
> = {
  validadePalavraDias: {
    minimo: 1,
    maximo: 365,
    rotulo: "Validade da palavra-chave",
    unidade: "dias",
  },
  sessaoDiretorHoras: { minimo: 1, maximo: 72, rotulo: "Sessão do diretor", unidade: "horas" },
  tentativasPorOrigem: {
    minimo: 1,
    maximo: 100,
    rotulo: "Tentativas de entrada por dispositivo",
    unidade: "tentativas",
  },
  tentativasPorLogin: {
    minimo: 1,
    maximo: 500,
    rotulo: "Tentativas de entrada por conta",
    unidade: "tentativas",
  },
  janelaMinutos: { minimo: 1, maximo: 1440, rotulo: "Janela das tentativas", unidade: "minutos" },
  limiteRiscoPercentual: {
    minimo: 1,
    maximo: 100,
    rotulo: "Limite de risco de faltas",
    unidade: "% dos dias com chamada",
  },
};
