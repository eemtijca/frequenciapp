// Domínio da frequência. Regras puras, sem dependência de framework
// ou de banco: tudo aqui é testável de forma isolada.

/** Marca de frequência de um aluno em um dia. */
export type Marca = "P" | "S" | "F" | "FJ";

/** Justificativa de falta ou de saída, com código estável e rótulo. */
export interface Justificativa {
  codigo: string;
  rotulo: string;
}

/** Justificativa com a situação, como o catálogo é lido da Gestão. */
export interface JustificativaConfigurada extends Justificativa {
  ativo: boolean;
}

/**
 * Catálogo inicial de justificativas. É o mesmo que a migração e a semente
 * gravam; o catálogo em uso vem do banco e pode ser editado na Gestão.
 */
export const JUSTIFICATIVAS_PADRAO: readonly Justificativa[] = [
  { codigo: "D", rotulo: "Doente" },
  { codigo: "Dat", rotulo: "Doente com atestado" },
  { codigo: "LM", rotulo: "Licença Maternidade" },
  { codigo: "G", rotulo: "Grávida" },
  { codigo: "T", rotulo: "Transporte" },
  { codigo: "Vi", rotulo: "Viagem" },
  { codigo: "CM", rotulo: "Consulta Médica" },
  { codigo: "De", rotulo: "Dentista" },
  { codigo: "Lt", rotulo: "Luto" },
  { codigo: "O", rotulo: "Outros" },
  { codigo: "C", rotulo: "Consulta" },
  { codigo: "S", rotulo: "Suspensão" },
];

/** Código que aceita observação escrita. */
export const JUSTIFICATIVA_OUTROS = "O";

/** Ordena o catálogo pelo rótulo, em português e sem diferenciar caixa. */
export function ordenarJustificativas<T extends Justificativa>(catalogo: readonly T[]): T[] {
  return catalogo
    .slice()
    .sort(
      (a, b) =>
        a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" }) ||
        a.codigo.localeCompare(b.codigo, "pt-BR"),
    );
}

/** Momento da saída antecipada, com código estável e rótulo. */
export interface MomentoSaida {
  codigo: string;
  rotulo: string;
}

/** Momentos da saída, iguais aos do aplicativo de referência. */
export const MOMENTOS_SAIDA: readonly MomentoSaida[] = [
  ...Array.from({ length: 9 }, (_, indice) => ({
    codigo: `aula_${indice + 1}`,
    rotulo: `${indice + 1}ª aula`,
  })),
  { codigo: "intervalo_1", rotulo: "1º intervalo" },
  { codigo: "intervalo_2", rotulo: "2º intervalo" },
  { codigo: "almoco", rotulo: "Almoço" },
];

/** Limite do texto livre da saída durante a aula. */
export const LIMITE_TEXTO_SAIDA = 100;

/** Rótulo de uma justificativa no catálogo, ou texto vazio quando não existe. */
export function rotuloJustificativa(
  codigo: string | null | undefined,
  catalogo: readonly Justificativa[] = JUSTIFICATIVAS_PADRAO,
): string {
  return catalogo.find((item) => item.codigo === codigo)?.rotulo ?? "";
}

/** Valida um código no catálogo informado. */
export function ehJustificativaValida(
  codigo: string,
  catalogo: readonly Justificativa[] = JUSTIFICATIVAS_PADRAO,
): boolean {
  return catalogo.some((item) => item.codigo === codigo);
}

/** Rótulo de um momento de saída, com o código como reserva. */
export function rotuloMomento(codigo: string): string {
  return MOMENTOS_SAIDA.find((item) => item.codigo === codigo)?.rotulo ?? codigo;
}

/** Valida um código de momento de saída. */
export function ehMomentoValido(codigo: string): boolean {
  return MOMENTOS_SAIDA.some((item) => item.codigo === codigo);
}

/** Verdadeiro quando a saída aconteceu durante uma aula. */
export function ehMomentoDeAula(codigo: string): boolean {
  return codigo.startsWith("aula_");
}

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

/** Falta de um aluno nas aulas indicadas, com justificativa opcional. */
export interface FaltaAluno {
  alunoId: string;
  horarios: string[];
  justificativa?: string | null;
  observacao?: string | null;
}

/** Saída antecipada registrada pela coordenação, separada da chamada. */
export interface SaidaAntecipada {
  id: string;
  alunoId: string;
  dia: string;
  momento: string;
  justificativa: string;
  observacao: string | null;
  /** Texto livre da saída durante a aula, opcional. */
  texto: string | null;
  liberadoPorId: string | null;
  liberadoPorNome: string | null;
  criadoEm: string;
}

/** Recursos configuráveis pela administração na Gestão. */
export interface Configuracoes {
  frequenciaPorAula: boolean;
  saidaAntecipada: boolean;
}

/** Padrões de fábrica dos recursos. */
export const CONFIGURACOES_PADRAO: Configuracoes = {
  frequenciaPorAula: false,
  saidaAntecipada: true,
};

/** Acumulado de um aluno desde a primeira chamada salva. */
export interface AcumuladoAluno {
  alunoId: string;
  faltas: number;
  faltasJustificadas: number;
  diasComRegistro: number;
}

/** Resumo acumulado da escola, usado na Chamada e no Painel. */
export interface ResumoAcumulado {
  primeiroDia: string | null;
  diasLetivos: number;
  porAluno: AcumuladoAluno[];
}

/** Pessoa da equipe que pode liberar uma saída. */
export interface Responsavel {
  id: string;
  nome: string;
  papel: "ADMIN" | "COORDENACAO";
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
  const total = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  const dias: string[] = [];
  for (let dia = 1; dia <= total; dia += 1) {
    dias.push(`${mes}-${String(dia).padStart(2, "0")}`);
  }
  return dias;
}

/** Limite de dias de um período de consulta. */
export const LIMITE_DIAS_PERIODO = 366;

/** Dias civis de um intervalo inclusivo, com limite de segurança. */
export function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = [];
  let atual = de;
  while (atual <= ate && dias.length < LIMITE_DIAS_PERIODO) {
    dias.push(atual);
    atual = diaSeguinte(atual, 1);
  }
  return dias;
}

/** Segunda a sexta da semana de um dia. */
export function semanaDeAula(dia: string): string[] {
  const segunda = diaSeguinte(dia, -(diaDaSemanaIso(dia) - 1));
  return [0, 1, 2, 3, 4].map((deslocamento) => diaSeguinte(segunda, deslocamento));
}

/** Modos de período da grade e dos relatórios. */
export type ModoPeriodo = "dia" | "semana" | "periodo" | "mes";

/** Dias de um período conforme o modo escolhido na interface. */
export function diasDoPeriodo(modo: ModoPeriodo, de: string, ate?: string): string[] {
  if (modo === "dia") return [de];
  if (modo === "semana") return semanaDeAula(de);
  if (modo === "mes") return diasDoMes(de.slice(0, 7));
  const fim = ate && ate >= de ? ate : de;
  return diasEntre(de, fim);
}

const NOMES_DOS_DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Nome do mês por extenso e capitalizado, a partir do mês civil. */
export function nomeDoMes(mes: string): string {
  const numero = Number(mes.split("-")[1] ?? "0");
  const nome = NOMES_DOS_MESES[numero - 1] ?? "";
  return nome === "" ? "" : `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
}

/** Mês por extenso com ano, para rótulos amigáveis. */
export function rotuloMes(mes: string): string {
  const nome = nomeDoMes(mes);
  const ano = mes.split("-")[0] ?? "";
  return nome === "" ? "" : `${nome} de ${ano}`;
}

/**
 * Células da grade do mês em semanas que começam no domingo, com vazios
 * antes do dia 1 e depois do último dia, sem linhas vazias no fim.
 */
export function celulasDoMes(mes: string): (string | null)[] {
  const dias = diasDoMes(mes);
  const celulas: (string | null)[] = [];
  const primeiro = dias[0];
  if (primeiro) {
    const deslocamento = diaDaSemanaIso(primeiro) % 7;
    for (let i = 0; i < deslocamento; i += 1) celulas.push(null);
  }
  celulas.push(...dias);
  const total = Math.ceil(celulas.length / 7) * 7;
  while (celulas.length < total) celulas.push(null);
  return celulas;
}

/** Dia da semana por extenso, a partir do dia civil. */
export function rotuloDiaSemana(dia: string): string {
  const data = new Date(`${dia}T12:00:00Z`);
  return NOMES_DOS_DIAS[data.getUTCDay()] ?? "";
}

/** Data curta DD/MM, para rótulos densos. */
export function rotuloDataCurta(dia: string): string {
  const [, mes = "", numero = ""] = dia.split("-");
  return `${numero}/${mes}`;
}

/** Dia civil deslocado em dias, sem depender do fuso do processo. */
export function diaSeguinte(dia: string, deslocamento: number): string {
  const [anoTexto = "0", mesTexto = "0", numeroTexto = "0"] = dia.split("-");
  const data = new Date(
    Date.UTC(Number(anoTexto), Number(mesTexto) - 1, Number(numeroTexto) + deslocamento),
  );
  return data.toISOString().slice(0, 10);
}

/** Mês civil deslocado em meses, formato YYYY-MM. */
export function mesSeguinte(mes: string, deslocamento: number): string {
  const [anoTexto = "0", numeroTexto = "0"] = mes.split("-");
  const data = new Date(Date.UTC(Number(anoTexto), Number(numeroTexto) - 1 + deslocamento, 1));
  return data.toISOString().slice(0, 7);
}

/** Hora local de um instante ISO no fuso da escola, formato HH:MM. */
export function horaNoFuso(instanteIso: string, fuso: string): string {
  const data = new Date(instanteIso);
  if (Number.isNaN(data.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: fuso,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(data);
  } catch {
    return "";
  }
}

/**
 * Dia da semana ISO e minutos do dia no fuso da escola, independentes do
 * fuso do navegador. Espelha a decisão do servidor para a aula corrente.
 */
export function partesNoFuso(agora: Date, fuso: string): { diaSemana: number; minutos: number } {
  const nomes: Record<string, number> = {
    Sun: 7,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  try {
    const formatador = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const partes = formatador.formatToParts(agora);
    const valor = (tipo: Intl.DateTimeFormatPartTypes): string =>
      partes.find((parte) => parte.type === tipo)?.value ?? "";
    const diaSemana = nomes[valor("weekday")] ?? diaDaSemanaIso(diaLocal(agora, fuso));
    const horas = Number(valor("hour")) % 24;
    return { diaSemana, minutos: horas * 60 + Number(valor("minute")) };
  } catch {
    return {
      diaSemana: diaDaSemanaIso(diaLocal(agora, fuso)),
      minutos: agora.getUTCHours() * 60 + agora.getUTCMinutes(),
    };
  }
}

/**
 * Marca de um aluno em um dia, a partir das frequências do mês e da grade de
 * aulas. Regra: falta em todas as aulas vira F, ou FJ quando todas as faltas
 * do dia têm justificativa; falta em parte vira S (saiu antes ou chegou
 * depois); sem falta e com frequência vira P; vazio quando a turma não teve
 * frequência. A falta prevalece mesmo em aula que saiu da grade depois do
 * registro.
 */
export function marcaDoAluno(
  aluno: Aluno,
  dia: string,
  frequenciasDoDia: Frequencia[],
  horarios: Horario[],
): Marca | null {
  // Aula para situação de justificativa: todas as faltas da mesma aula
  // precisam estar justificadas para a marca ser FJ.
  const faltasDoAluno = new Map<string, boolean>();
  for (const frequencia of frequenciasDoDia) {
    for (const falta of frequencia.faltas) {
      if (falta.alunoId !== aluno.id) continue;
      const justificada = Boolean(falta.justificativa);
      for (const horarioId of falta.horarios) {
        faltasDoAluno.set(horarioId, (faltasDoAluno.get(horarioId) ?? true) && justificada);
      }
    }
  }
  const temFrequencia = frequenciasDoDia.some((frequencia) => frequencia.turmaId === aluno.turmaId);
  const aulasDaTurma = horariosDoDia(
    horarios.filter((horario) => horario.turmaId === aluno.turmaId),
    dia,
  );

  if (faltasDoAluno.size === 0) return temFrequencia ? "P" : null;
  const tudoJustificado = [...faltasDoAluno.values()].every(Boolean);
  const marcaIntegral = tudoJustificado ? "FJ" : "F";
  // Sem frequência da turma no dia, a falta de outra turma prevalece.
  if (!temFrequencia) return marcaIntegral;
  const faltando = aulasDaTurma.filter((aula) => faltasDoAluno.has(aula.id)).length;
  if (aulasDaTurma.length === 0 || faltando >= aulasDaTurma.length) return marcaIntegral;
  if (faltando > 0) return "S";
  return marcaIntegral;
}

/**
 * Grade de consulta por turma original: linhas são alunos da turma
 * original, colunas são os dias do mês e as células são P, S, F ou vazio.
 */
export interface LinhaGrade {
  aluno: Aluno;
  marcas: Record<string, Marca | undefined>;
  faltas: number;
  justificadas: number;
  parciais: number;
  frequencias: number;
}

export function montarGrade(
  alunosDaTurma: Aluno[],
  frequenciasDoPeriodo: Frequencia[],
  dias: string[],
  horarios: Horario[] = [],
): { dias: string[]; linhas: LinhaGrade[] } {
  const porDia = new Map<string, Frequencia[]>();
  for (const dia of dias) {
    porDia.set(
      dia,
      frequenciasDoPeriodo.filter((frequencia) => frequencia.dia === dia),
    );
  }
  const linhas = alunosDaTurma
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((aluno) => {
      const marcas: Record<string, Marca | undefined> = {};
      let faltas = 0;
      let justificadas = 0;
      let parciais = 0;
      let frequencias = 0;
      for (const dia of dias) {
        const marca = marcaDoAluno(aluno, dia, porDia.get(dia) ?? [], horarios);
        if (marca === "F") faltas += 1;
        if (marca === "FJ") justificadas += 1;
        if (marca === "S") parciais += 1;
        if (marca !== null) frequencias += 1;
        marcas[dia] = marca ?? undefined;
      }
      return { aluno, marcas, faltas, justificadas, parciais, frequencias };
    });
  return { dias, linhas };
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
