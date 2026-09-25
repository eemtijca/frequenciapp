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

/** Aula da turma: ordem, janela de horário e dias da semana em que acontece. */
export interface Horario {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
}

/** Turma de uma série, com rótulo composto e aulas configuradas. */
export interface Turma {
  id: string;
  serieId: string;
  nome: string;
  rotulo: string;
  serieNome: string;
  horarios: Horario[];
}

/** Aluno de uma turma. Dados mínimos para a finalidade de frequência. */
export interface Aluno {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
}

/** Falta de um aluno nas aulas indicadas. Presença é implícita. */
export interface FaltaAluno {
  alunoId: string;
  horarios: string[];
}

/** Frequência salva de um dia e turma, compartilhada pela coordenação. */
export interface Frequencia {
  dia: string;
  turmaId: string;
  revisao: number;
  atualizadoEm: string;
  atualizadoPorNome: string | null;
  faltas: FaltaAluno[];
}

/** Resultado do salvamento: conflito devolve a versão vigente. */
export type ResultadoSalvamento =
  { situacao: "salvo"; frequencia: Frequencia } | { situacao: "conflito"; frequencia: Frequencia };

/** Rótulo de exibição de uma turma: série + nome, por exemplo "1º ano A". */
export function rotuloDeTurma(serieNome: string, turmaNome: string): string {
  return `${serieNome.trim()} ${turmaNome.trim()}`.trim();
}

/** Rótulo curto de uma aula: ordem + janela, por exemplo "Aula 1 · 07:00 às 07:50". */
export function rotuloAula(horario: Horario): string {
  return `${horario.ordem}ª aula · ${horario.inicio} às ${horario.fim}`;
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

/** Valida horário no formato HH:MM (00:00 a 23:59). */
export function ehHoraValida(hora: string): boolean {
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(hora);
}

/** Dia da semana ISO de um dia civil: 1 é segunda e 7 é domingo. */
export function diaDaSemanaIso(dia: string): number {
  const data = new Date(`${dia}T12:00:00Z`);
  const domingoZero = data.getUTCDay();
  return domingoZero === 0 ? 7 : domingoZero;
}

/** Aulas ativas de uma turma que acontecem no dia da semana informado. */
export function horariosDoDia(horarios: Horario[], dia: string): Horario[] {
  const diaSemana = diaDaSemanaIso(dia);
  return horarios
    .filter((horario) => horario.ativo && horario.diasSemana.includes(diaSemana))
    .slice()
    .sort((a, b) => a.ordem - b.ordem);
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
 * Marca de um aluno em um dia, a partir das frequências do mês.
 * Regra: falta se houver registro de falta em qualquer aula do dia;
 * presente se a turma atual do aluno teve frequência naquele dia; vazio
 * quando a turma não teve frequência.
 */
export function marcaDoAluno(
  aluno: Aluno,
  dia: string,
  frequenciasDoDia: Frequencia[],
): Marca | null {
  if (
    frequenciasDoDia.some((frequencia) =>
      frequencia.faltas.some((falta) => falta.alunoId === aluno.id),
    )
  ) {
    return "F";
  }
  if (frequenciasDoDia.some((frequencia) => frequencia.turmaId === aluno.turmaId)) return "P";
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
  frequencias: number;
}

export function montarGrade(
  alunosDaTurma: Aluno[],
  frequenciasDoMes: Frequencia[],
  mes: string,
): { dias: string[]; linhas: LinhaGrade[] } {
  const dias = diasDoMes(mes);
  const porDia = new Map<string, Frequencia[]>();
  for (const dia of dias) {
    porDia.set(
      dia,
      frequenciasDoMes.filter((frequencia) => frequencia.dia === dia),
    );
  }
  const linhas = alunosDaTurma
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((aluno) => {
      const marcas: Record<string, Marca | undefined> = {};
      let faltas = 0;
      let frequencias = 0;
      for (const dia of dias) {
        const marca = marcaDoAluno(aluno, dia, porDia.get(dia) ?? []);
        if (marca === "F") faltas += 1;
        if (marca !== null) frequencias += 1;
        marcas[dia] = marca ?? undefined;
      }
      return { aluno, marcas, faltas, frequencias };
    });
  return { dias, linhas };
}

/**
 * Resumo de uma frequência para a lista do histórico.
 */
export interface ResumoFrequencia {
  frequencia: Frequencia;
  totalAlunos: number;
}

export function resumirFrequencia(
  frequencia: Frequencia,
  alunos: Aluno[],
  turmaId: string,
): ResumoFrequencia {
  const total = alunos.filter((aluno) => aluno.ativo && aluno.turmaId === turmaId).length;
  return { frequencia, totalAlunos: total };
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
