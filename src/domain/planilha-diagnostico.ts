// Contrato e regras do diagnóstico mensal da configuração, sem inferir envio de frequências.
export type SituacaoTurmaPlanilha =
  "pronta" | "sem_aba" | "estrutura_alterada" | "bloqueada" | "indisponivel";

export interface TurmaDiagnosticoPlanilha {
  id: string;
  rotulo: string;
  tipo: "mensal" | "legado" | "ausente";
  aba: string | null;
  situacao: SituacaoTurmaPlanilha;
  mensagem: string | null;
}

export interface DiagnosticoPlanilha {
  mes: string;
  conferidoEm: string;
  conexao: { conectada: boolean; verificada: boolean; erro: string | null };
  ativa: boolean;
  modo: "conservador" | "completo";
  envioAutomatico: boolean;
  estruturaPronta: boolean;
  resumo: { total: number; prontas: number; semAba: number; revisar: number };
  turmas: TurmaDiagnosticoPlanilha[];
  alteradasDepois: number;
  ultimoErro: {
    erro: string | null;
    resultado: string;
    criadoEm: string;
    turma: string | null;
  } | null;
}

export interface VinculoDiagnosticoPlanilha {
  aba: string;
  turmaOriginalId: string;
  mes?: string;
  destino?: string;
}

/** Uma turma que já usa meses nunca volta silenciosamente para a aba sem mês. */
export function vinculosDoMes(
  mapa: readonly VinculoDiagnosticoPlanilha[],
  turmaId: string,
  mes: string,
): VinculoDiagnosticoPlanilha[] {
  const origem = mapa.filter((item) => item.turmaOriginalId === turmaId);
  return origem.some((item) => item.mes) ? origem.filter((item) => item.mes === mes) : origem;
}

/** Uma estrutura pronta não confirma a gravação nem resolve divergências de frequência. */
export function resumirDiagnostico(turmas: readonly TurmaDiagnosticoPlanilha[]) {
  const prontas = turmas.filter((turma) => turma.situacao === "pronta").length;
  const semAba = turmas.filter((turma) => turma.situacao === "sem_aba").length;
  return { total: turmas.length, prontas, semAba, revisar: turmas.length - prontas - semAba };
}
