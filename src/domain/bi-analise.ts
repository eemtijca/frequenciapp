// Análise local do BI: dimensões, taxas ponderadas, filtros e agrupamento linear.
import { z } from "zod";
import { type LinhaBi, type RecursoBi, esquemaDiaBi } from "./bi";
export const BASES_ANALISE = [
  "chamadas",
  "faltas",
  "lista",
  "saidas",
  "entradas",
  "parciais",
  "alunos",
] as const;
export const DIMENSOES_BI = [
  "dia",
  "semana",
  "mes",
  "ano",
  "serie",
  "turma",
  "aluno",
  "aula",
  "disciplina",
  "justificativa",
  "tipo",
  "turno",
  "momento",
  "faixaHoraria",
  "diaSemana",
  "autoria",
  "situacao",
] as const;
export const MEDIDAS_BI = [
  "registros",
  "alunos",
  "turmas",
  "registrados",
  "presentes",
  "faltas",
  "justificadas",
  "ausencias",
  "presencaParcial",
  "aulas",
  "confirmacoes",
  "pendentes",
  "diasChamada",
  "infrequencia",
  "taxaPresenca",
  "taxaSeduc",
] as const;
export const TIPOS_GRAFICO_BI = [
  "barras",
  "horizontal",
  "agrupadas",
  "linha",
  "area",
  "rosca",
  "dispersao",
  "calor",
  "tabela",
  "indicador",
] as const;
export type DimensaoBi = (typeof DIMENSOES_BI)[number];
export type MedidaBi = (typeof MEDIDAS_BI)[number];
export const NOMES_MEDIDAS: Record<MedidaBi, string> = {
  registros: "Registros",
  alunos: "Alunos distintos",
  turmas: "Turmas distintas",
  registrados: "Registrados",
  presentes: "Presentes",
  faltas: "Faltas",
  justificadas: "Justificadas",
  ausencias: "Ausências",
  presencaParcial: "Presença parcial",
  aulas: "Aulas",
  confirmacoes: "Confirmados na Seduc",
  pendentes: "Pendentes na Seduc",
  diasChamada: "Dias com chamada",
  infrequencia: "Infrequência",
  taxaPresenca: "Taxa de presença",
  taxaSeduc: "Taxa de confirmação",
};
export const NOMES_DIMENSOES: Record<DimensaoBi, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
  ano: "Ano",
  serie: "Série",
  turma: "Turma",
  aluno: "Aluno",
  aula: "Aula",
  disciplina: "Disciplina",
  justificativa: "Justificativa",
  tipo: "Tipo",
  turno: "Turno",
  momento: "Momento",
  faixaHoraria: "Faixa horária",
  diaSemana: "Dia da semana",
  autoria: "Autoria",
  situacao: "Situação do aluno",
};
export const esquemaGraficoBi = z
  .object({
    id: z.string().max(80),
    titulo: z.string().trim().min(1).max(100),
    recurso: z.enum(BASES_ANALISE),
    dimensao: z.enum(DIMENSOES_BI),
    medida: z.enum(MEDIDAS_BI),
    tipo: z.enum(TIPOS_GRAFICO_BI),
    segundaDimensao: z.enum(DIMENSOES_BI).default("tipo"),
    largura: z.number().int().min(3).max(12).default(6),
    altura: z.number().int().min(260).max(900).default(360),
    meta: z.number().finite().nullable().default(null),
    anotacao: z.string().max(1000).default(""),
  })
  .strict()
  .refine(validarAnaliseBi, "A dimensão ou medida não pertence à base escolhida.");
export type GraficoBi = z.infer<typeof esquemaGraficoBi>;
export const esquemaFiltrosBi = z
  .object({
    inicio: z.union([esquemaDiaBi, z.literal("")]).default(""),
    fim: z.union([esquemaDiaBi, z.literal("")]).default(""),
    serieId: z.string().max(80).default(""),
    turmaId: z.string().max(80).default(""),
    alunoId: z.string().max(80).default(""),
    busca: z.string().max(200).default(""),
    justificativa: z.string().max(200).default(""),
    tipo: z.string().max(100).default(""),
    turno: z.string().max(100).default(""),
    situacao: z.string().max(30).default(""),
  })
  .strict()
  .refine((f) => !f.inicio || !f.fim || f.inicio <= f.fim, "Confira o período da análise.");
export type FiltrosBi = z.infer<typeof esquemaFiltrosBi>;
export type DadosBi = Partial<Record<RecursoBi, LinhaBi[]>>;
export interface PontoBi {
  nome: string;
  grupo: string;
  valor: number | null;
  registros: number;
  alunos: number;
  referencia: string;
  grupoReferencia: string;
}
export const numeroBi = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export function textoBi(v: unknown) {
  return v === null || v === undefined
    ? "Não informado"
    : Array.isArray(v)
      ? v.join(", ")
      : String(v);
}
export function filtrarBi(linhas: LinhaBi[], f: FiltrosBi) {
  const busca = f.busca.toLocaleLowerCase("pt-BR");
  return linhas.filter(
    (l) =>
      (!l.dia ||
        ((!f.inicio || String(l.dia) >= f.inicio) && (!f.fim || String(l.dia) <= f.fim))) &&
      (!f.serieId || l.serieId === f.serieId) &&
      (!f.turmaId || l.turmaId === f.turmaId) &&
      (!f.alunoId || l.alunoId === f.alunoId || l.id === f.alunoId) &&
      (!f.justificativa || l.justificativa === f.justificativa) &&
      (!f.tipo || l.tipo === f.tipo) &&
      (!f.turno || l.turno === f.turno) &&
      (!f.situacao ||
        (f.situacao === "desistente"
          ? Boolean(l.desistenteEm)
          : f.situacao === "ativo"
            ? l.ativo === true && !l.desistenteEm
            : l.ativo === false)) &&
      (!busca ||
        String(l.aluno ?? l.nome ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(busca)),
  );
}
function dimensao(l: LinhaBi, d: DimensaoBi) {
  const dia = typeof l.dia === "string" ? l.dia : "";
  if (d === "diaSemana" && dia)
    return (
      [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ][new Date(`${dia}T12:00:00Z`).getUTCDay()] ?? "Não informado"
    );
  if (d === "ano") return dia.slice(0, 4) || "Não informado";
  if (d === "mes") return dia.slice(0, 7) || "Não informado";
  if (d === "semana" && dia) {
    const data = new Date(`${dia}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() - ((data.getUTCDay() + 6) % 7));
    return data.toISOString().slice(0, 10);
  }
  if (d === "autoria") return textoBi(l.autoria ?? l.atualizadoPorNome ?? l.criadoPorNome);
  if (d === "situacao")
    return l.desistenteEm ? "Desistente" : l.ativo === false ? "Inativo" : "Ativo";
  return textoBi(l[d]);
}
interface Acumulador {
  registros: number;
  alunos: Set<string>;
  turmas: Set<string>;
  dias: Set<string>;
  valores: Record<string, number>;
  confirmados: number;
  referencia: string;
  grupoReferencia: string;
}
export function agregarBi(
  linhas: LinhaBi[],
  config: Pick<GraficoBi, "dimensao" | "medida" | "segundaDimensao" | "tipo">,
  filtros: FiltrosBi,
): PontoBi[] {
  const grupos = new Map<string, { nome: string; grupo: string; a: Acumulador }>();
  const filtradas = filtrarBi(linhas, filtros);
  const porAula =
    config.dimensao === "aula" ||
    ((config.tipo === "agrupadas" || config.tipo === "calor") && config.segundaDimensao === "aula");
  for (const l of porAula
    ? filtradas.flatMap((l) =>
        Array.isArray(l.aulas) ? l.aulas.map((aula) => ({ ...l, aula, aulas: 1 })) : [l],
      )
    : filtradas) {
    const nome = dimensao(l, config.dimensao);
    const grupo =
      config.tipo === "agrupadas" || config.tipo === "calor"
        ? dimensao(l, config.segundaDimensao)
        : "";
    const referencia = textoBi(l[`${config.dimensao}Id`] ?? l[config.dimensao] ?? "");
    const chave = JSON.stringify([
      nome,
      grupo,
      ["serie", "turma", "aluno"].includes(config.dimensao) ? referencia : "",
      ["serie", "turma", "aluno"].includes(config.segundaDimensao)
        ? l[`${config.segundaDimensao}Id`]
        : "",
    ]);
    let g = grupos.get(chave);
    if (!g) {
      g = {
        nome,
        grupo,
        a: {
          registros: 0,
          alunos: new Set(),
          turmas: new Set(),
          dias: new Set(),
          valores: {},
          confirmados: 0,
          referencia,
          grupoReferencia: textoBi(
            l[`${config.segundaDimensao}Id`] ?? l[config.segundaDimensao] ?? "",
          ),
        },
      };
      grupos.set(chave, g);
    }
    const a = g.a;
    a.registros++;
    if (l.alunoId) a.alunos.add(String(l.alunoId));
    if (l.turmaId) a.turmas.add(String(l.turmaId));
    if (l.dia) a.dias.add(String(l.dia));
    for (const m of [
      "registrados",
      "presentes",
      "faltas",
      "justificadas",
      "ausencias",
      "presencaParcial",
      "aulas",
      "confirmacoes",
    ])
      a.valores[m] =
        (a.valores[m] ?? 0) +
        (m === "aulas" && Array.isArray(l.aulas) ? l.aulas.length : numeroBi(l[m]));
    if (l.registradoSeduc === true) a.confirmados++;
  }
  return [...grupos.values()]
    .map(({ nome, grupo, a }) => {
      const v = a.valores;
      let valor: number | null;
      switch (config.medida) {
        case "registros":
          valor = a.registros;
          break;
        case "alunos":
          valor = a.alunos.size;
          break;
        case "turmas":
          valor = a.turmas.size;
          break;
        case "diasChamada":
          valor = a.dias.size;
          break;
        case "infrequencia":
          valor = v.registrados ? ((v.ausencias ?? 0) / v.registrados) * 100 : null;
          break;
        case "taxaPresenca":
          valor = v.registrados ? ((v.presentes ?? 0) / v.registrados) * 100 : null;
          break;
        case "taxaSeduc":
          valor = a.registros ? (a.confirmados / a.registros) * 100 : null;
          break;
        case "confirmacoes":
          valor = a.confirmados || (v.confirmacoes ?? 0);
          break;
        case "pendentes":
          valor = a.registros - a.confirmados;
          break;
        default:
          valor = v[config.medida] ?? 0;
      }
      return {
        nome,
        grupo,
        valor,
        registros: a.registros,
        alunos: a.alunos.size,
        referencia: a.referencia,
        grupoReferencia: a.grupoReferencia,
      };
    })
    .sort(
      (a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) ||
        a.grupo.localeCompare(b.grupo, "pt-BR"),
    );
}
export function totalBi(linhas: LinhaBi[], medida: MedidaBi, filtros: FiltrosBi): number | null {
  return (
    agregarBi(
      filtrarBi(linhas, filtros).map((l) => ({ ...l, tipo: "Total" })),
      { dimensao: "tipo", medida, segundaDimensao: "tipo", tipo: "indicador" },
      esquemaFiltrosBi.parse({}),
    )[0]?.valor ?? (["infrequencia", "taxaPresenca", "taxaSeduc"].includes(medida) ? null : 0)
  );
}
export function compararPeriodoBi(f: FiltrosBi, comparacao: "anterior" | "ano") {
  const inicio = new Date(`${f.inicio}T12:00:00Z`);
  const fim = new Date(`${f.fim}T12:00:00Z`);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) return f;
  if (comparacao === "anterior") {
    const dias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1;
    inicio.setUTCDate(inicio.getUTCDate() - dias);
    fim.setUTCDate(fim.getUTCDate() - dias);
  } else {
    for (const d of [inicio, fim]) {
      const mes = d.getUTCMonth();
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      if (d.getUTCMonth() !== mes) d.setUTCDate(0);
    }
  }
  return { ...f, inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}
export function csvBi(linhas: Record<string, unknown>[]) {
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
  const celula = (v: unknown) => {
    let s = textoBi(v);
    if (typeof v === "string" && /^[\s]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      colunas.map(celula).join(";"),
      ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(";")),
    ].join("\r\n")
  );
}
export function destaquesBi(dados: DadosBi, filtros: FiltrosBi): string[] {
  const chamadas = filtrarBi(dados.chamadas ?? [], filtros);
  const resultado: string[] = [];
  const grupos = agregarBi(
    chamadas,
    { dimensao: "turma", medida: "infrequencia", segundaDimensao: "tipo", tipo: "barras" },
    filtros,
  )
    .filter((g) => g.registros >= 5 && g.valor !== null)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  if (grupos[0])
    resultado.push(
      `${grupos[0].nome}: maior infrequência no recorte (${grupos[0].valor?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%).`,
    );
  const dias = agregarBi(
    chamadas,
    { dimensao: "dia", medida: "ausencias", segundaDimensao: "tipo", tipo: "barras" },
    filtros,
  ).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  if (dias[0]?.valor) resultado.push(`${dias[0].nome}: ${dias[0].valor} ausências.`);
  for (const recurso of ["saidas", "entradas"] as const) {
    const grupos = agregarBi(
      dados[recurso] ?? [],
      { dimensao: "faixaHoraria", medida: "registros", segundaDimensao: "tipo", tipo: "barras" },
      filtros,
    ).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    if (grupos[0] && grupos[0].registros >= 5)
      resultado.push(
        `${recurso === "saidas" ? "Saídas" : "Entradas"} mais frequentes às ${grupos[0].nome}.`,
      );
  }
  const faltas = agregarBi(
    dados.faltas ?? [],
    { dimensao: "aluno", medida: "registros", segundaDimensao: "tipo", tipo: "barras" },
    filtros,
  ).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  if (faltas[0]?.valor)
    resultado.push(`${faltas[0].nome}: ${faltas[0].valor} faltas por aula no recorte.`);
  const motivos = agregarBi(
    dados.faltas ?? [],
    { dimensao: "justificativa", medida: "registros", segundaDimensao: "tipo", tipo: "barras" },
    filtros,
  )
    .filter((g) => g.nome !== "Não informado" && g.registros >= 5)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  if (motivos[0]) resultado.push(`Justificativa mais frequente: ${motivos[0].nome}.`);
  const pendentes =
    filtrarBi(dados.parciais ?? [], filtros).filter((l) => !l.registradoSeduc).length +
    filtrarBi(dados.lista ?? [], filtros).filter((l) => !l.registradoSeduc).length;
  if (pendentes) resultado.push(`${pendentes} confirmações pendentes na Seduc.`);
  for (const dimensao of ["serie"] as const) {
    const g = agregarBi(
      chamadas,
      { dimensao, medida: "infrequencia", segundaDimensao: "tipo", tipo: "barras" },
      filtros,
    )
      .filter((g) => g.registros >= 5 && g.valor !== null)
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))[0];
    if (g)
      resultado.push(
        `${g.nome}: infrequência de ${g.valor?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em pelo menos 5 chamadas.`,
      );
  }
  const aulas = agregarBi(
    dados.faltas ?? [],
    { dimensao: "aula", medida: "registros", segundaDimensao: "tipo", tipo: "barras" },
    filtros,
  )
    .filter((g) => g.registros >= 5)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
  if (aulas[0])
    resultado.push(`Aula ${aulas[0].nome}: maior quantidade de faltas por aula no recorte.`);
  for (const r of ["saidas", "entradas"] as const) {
    const dias = agregarBi(
      dados[r] ?? [],
      { dimensao: "diaSemana", medida: "registros", segundaDimensao: "tipo", tipo: "barras" },
      filtros,
    )
      .filter((g) => g.registros >= 5)
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    if (dias[0])
      resultado.push(
        `${r === "saidas" ? "Saídas" : "Entradas"}: ${dias[0].nome} concentra mais registros.`,
      );
  }
  return resultado;
}

export function medidasRecursoBi(recurso: RecursoBi): MedidaBi[] {
  const comuns: MedidaBi[] = ["registros", "alunos", "turmas"];
  if (recurso === "chamadas")
    return [
      "registros",
      "turmas",
      "registrados",
      "presentes",
      "faltas",
      "justificadas",
      "ausencias",
      "presencaParcial",
      "diasChamada",
      "infrequencia",
      "taxaPresenca",
    ];
  if (recurso === "lista")
    return [
      ...comuns,
      "diasChamada",
      "confirmacoes",
      "pendentes",
      "taxaSeduc",
      "registrados",
      "presentes",
      "faltas",
      "justificadas",
      "ausencias",
      "presencaParcial",
      "infrequencia",
      "taxaPresenca",
    ];
  if (recurso === "parciais") return [...comuns, "aulas", "confirmacoes", "pendentes", "taxaSeduc"];
  if (recurso === "faltas") return [...comuns, "aulas"];
  return comuns;
}

export function enriquecerBi(dados: DadosBi): DadosBi {
  const alunos = new Map((dados.alunos ?? []).map((l) => [l.id, l]));
  return Object.fromEntries(
    Object.entries(dados).map(([r, linhas]) => [
      r,
      linhas?.map((l) => {
        const aluno = alunos.get(String(l.alunoId));
        const cadastro = aluno ? { ...l, ativo: aluno.ativo, desistenteEm: aluno.desistenteEm } : l;
        if (r !== "lista") return cadastro;
        const marca = String(l.tipo);
        const registrada = ["P", "F", "FJ", "S"].includes(marca);
        return {
          ...cadastro,
          registrados: Number(registrada),
          presentes: Number(marca === "P"),
          faltas: Number(marca === "F"),
          justificadas: Number(marca === "FJ"),
          ausencias: Number(marca === "F" || marca === "FJ"),
          presencaParcial: Number(marca === "S"),
        };
      }),
    ]),
  );
}
export function dimensoesRecursoBi(recurso: RecursoBi): DimensaoBi[] {
  const comuns: DimensaoBi[] = [
    "dia",
    "diaSemana",
    "semana",
    "mes",
    "ano",
    "serie",
    "turma",
    "autoria",
  ];
  if (recurso === "alunos") return ["serie", "turma", "aluno", "situacao"];
  if (recurso === "chamadas") return comuns;
  if (recurso === "faltas")
    return [...comuns, "aluno", "aula", "disciplina", "justificativa", "tipo"];
  if (recurso === "lista") return [...comuns, "aluno", "tipo"];
  if (recurso === "parciais") return [...comuns, "aluno", "tipo", "turno", "aula"];
  return [...comuns, "aluno", "justificativa", "momento", "faixaHoraria"];
}
export function metaBi(valor: number | null, meta: number | null) {
  return valor === null || meta === null ? null : valor >= meta;
}

/** Estimativa por turma-dia, sem reconstruir matrículas ou sábados sem chamada. */
export function coberturaBi(dados: DadosBi, f: FiltrosBi) {
  if (!dados.chamadas || !dados.alunos || !dados.feriados || !f.inicio || !f.fim) return null;
  const turmas = new Set(
    filtrarBi(dados.alunos, {
      ...f,
      alunoId: "",
      busca: "",
      tipo: "",
      turno: "",
      justificativa: "",
      situacao: "",
    })
      .filter((a) => a.ativo === true && !a.desistenteEm)
      .map((a) => String(a.turmaId)),
  );
  const feriados = new Set(dados.feriados.map((l) => String(l.dia)));
  const salvas = new Set(
    filtrarBi(dados.chamadas, f)
      .filter((l) => turmas.has(String(l.turmaId)))
      .map((l) => `${l.turmaId}:${l.dia}`),
  );
  const dias = new Date(`${f.inicio}T12:00:00Z`);
  const fim = new Date(`${f.fim}T12:00:00Z`);
  let uteis = 0;
  while (dias <= fim) {
    const dia = dias.toISOString().slice(0, 10);
    if (dias.getUTCDay() > 0 && dias.getUTCDay() < 6 && !feriados.has(dia)) uteis++;
    dias.setUTCDate(dias.getUTCDate() + 1);
  }
  let esperadas = uteis * turmas.size;
  for (const s of salvas) {
    const dia = s.slice(-10);
    const d = new Date(`${dia}T12:00:00Z`);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6 || feriados.has(dia)) esperadas++;
  }
  return {
    salvas: salvas.size,
    esperadas,
    taxa: esperadas ? (salvas.size / esperadas) * 100 : null,
  };
}

export function validarAnaliseBi(g: {
  recurso: RecursoBi;
  medida: MedidaBi;
  dimensao: DimensaoBi;
  segundaDimensao: DimensaoBi;
  tipo: string;
}) {
  return (
    medidasRecursoBi(g.recurso).includes(g.medida) &&
    dimensoesRecursoBi(g.recurso).includes(g.dimensao) &&
    (!["calor", "agrupadas"].includes(g.tipo) ||
      dimensoesRecursoBi(g.recurso).includes(g.segundaDimensao))
  );
}
