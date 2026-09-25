// Domínio da frequência. Regras puras, sem dependência de framework
// ou de banco: tudo aqui é testável de forma isolada.

/** Marca de frequência de um aluno em um dia. */
export type Marca = "P" | "F";

/** Série escolar (por exemplo, "1º ano"). */
export interface Serie {
  id: string;
  nome: string;
  ordem: number;
}

/** Turma de uma série, com rótulo composto para exibição. */
export interface Turma {
  id: string;
  serieId: string;
  nome: string;
  rotulo: string;
  serieNome: string;
}

/** Aluno de uma turma. Dados mínimos para a finalidade de chamada. */
export interface Aluno {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
}

/** Chamada salva de um dia e turma. Faltas por identificador do aluno. */
export interface Chamada {
  dia: string;
  turmaId: string;
  revisao: number;
  atualizadoEm: string;
  faltas: string[];
}

/** Resultado do salvamento: conflito devolve a versão vigente. */
export type ResultadoSalvamento =
  { situacao: "salvo"; chamada: Chamada } | { situacao: "conflito"; chamada: Chamada };

/** Rótulo de exibição de uma turma: série + nome, por exemplo "1º ano A". */
export function rotuloDeTurma(serieNome: string, turmaNome: string): string {
  return `${serieNome.trim()} ${turmaNome.trim()}`.trim();
}

/** Dia local no fuso do professor, formato YYYY-MM-DD. */
export function diaLocal(agora: Date, fuso: string): string {
  const formato = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formato.format(agora);
}

/** Valida formato de dia (YYYY-MM-DD real do calendário). */
export function ehDiaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const prova = new Date(`${dia}T12:00:00Z`);
  return !Number.isNaN(prova.getTime()) && prova.toISOString().slice(0, 10) === dia;
}

/** Valida formato de mês (YYYY-MM real do calendário). */
export function ehMesValido(mes: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return false;
  const [anoTexto = "0", numeroTexto = "0"] = mes.split("-");
  const ano = Number(anoTexto);
  const numero = Number(numeroTexto);
  return ano >= 2000 && numero >= 1 && numero <= 12;
}

/** Dias de um mês, para as colunas da grade. */
export function diasDoMes(mes: string): string[] {
  const [anoTexto = "0", numeroTexto = "0"] = mes.split("-");
  const ano = Number(anoTexto);
  const numero = Number(numeroTexto);
  const total = new Date(ano, numero, 0).getUTCDate();
  const dias: string[] = [];
  for (let dia = 1; dia <= total; dia += 1) {
    dias.push(`${mes}-${String(dia).padStart(2, "0")}`);
  }
  return dias;
}

/**
 * Marca de um aluno em um dia, a partir das chamadas do mês.
 * Regra: falta se houver registro de falta em qualquer chamada do dia;
 * presente se a turma atual do aluno teve chamada naquele dia; vazio
 * quando a turma não foi chamada.
 */
export function marcaDoAluno(aluno: Aluno, dia: string, chamadasDoDia: Chamada[]): Marca | null {
  if (chamadasDoDia.some((chamada) => chamada.faltas.includes(aluno.id))) return "F";
  if (chamadasDoDia.some((chamada) => chamada.turmaId === aluno.turmaId)) return "P";
  return null;
}

/**
 * Grade de consulta por turma original: linhas são alunos da turma
 * original, colunas são os dias do mês e as células são P, F ou vazio.
 */
export interface LinhaGrade {
  aluno: Aluno;
  marcas: Record<string, Marca | undefined>;
  faltas: number;
  chamadas: number;
}

export function montarGrade(
  alunosDaTurma: Aluno[],
  chamadasDoMes: Chamada[],
  mes: string,
): { dias: string[]; linhas: LinhaGrade[] } {
  const dias = diasDoMes(mes);
  const porDia = new Map<string, Chamada[]>();
  for (const dia of dias) {
    porDia.set(
      dia,
      chamadasDoMes.filter((chamada) => chamada.dia === dia),
    );
  }
  const linhas = alunosDaTurma
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((aluno) => {
      const marcas: Record<string, Marca | undefined> = {};
      let faltas = 0;
      let chamadas = 0;
      for (const dia of dias) {
        const marca = marcaDoAluno(aluno, dia, porDia.get(dia) ?? []);
        if (marca === "F") faltas += 1;
        if (marca !== null) chamadas += 1;
        marcas[dia] = marca ?? undefined;
      }
      return { aluno, marcas, faltas, chamadas };
    });
  return { dias, linhas };
}

/**
 * Resumo de uma chamada para a lista do histórico.
 */
export interface ResumoChamada {
  chamada: Chamada;
  totalAlunos: number;
}

export function resumirChamada(chamada: Chamada, alunos: Aluno[], turmaId: string): ResumoChamada {
  const total = alunos.filter((aluno) => aluno.ativo && aluno.turmaId === turmaId).length;
  return { chamada, totalAlunos: total };
}

/** Normaliza texto para busca: remove acentos, ordinais e caixa. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[º°]/g, "o")
    .replace(/[ª]/g, "a")
    .toLowerCase()
    .trim();
}
