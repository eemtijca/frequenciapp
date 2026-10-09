// Indicadores agregados para fontes externas: datas e totais, sem cadastro ou texto livre.
import { marcaDoAluno, rotuloDeTurma, type Frequencia, type Horario } from "./frequencia";

export type CelulaIndicador = string | number;
export interface FonteIndicadores {
  nome: string;
  cabecalho: string[];
  linhas: CelulaIndicador[][];
}
export interface TurmaIndicador {
  nome: string;
  serie: { nome: string };
}
export interface ChamadaIndicador {
  dia: string;
  turmaId: string;
  turma: TurmaIndicador;
  horarios: Horario[];
  alunos: { alunoId: string; desistenteEm: string | null }[];
  faltas: { alunoId: string; horarioId: string; justificativa: string | null }[];
}
export interface MovimentoIndicador {
  dia: string;
  turma: TurmaIndicador;
  tipo: "Entrada" | "Saída";
  horario: string | null;
}
export interface ParcialIndicador {
  dia: string;
  turma: TurmaIndicador;
  tipo: string;
  turno: string | null;
  aulas: number[];
  registradoSeduc: boolean;
}

function dimensoes(dia: string, turma: TurmaIndicador): CelulaIndicador[] {
  return [
    dia,
    Number(dia.slice(0, 4)),
    dia.slice(0, 7),
    turma.serie.nome,
    rotuloDeTurma(turma.serie.nome, turma.nome),
  ];
}

function agrupar(linhas: { dimensoes: CelulaIndicador[]; valores: number[] }[]) {
  const grupos = new Map<string, CelulaIndicador[]>();
  for (const linha of linhas) {
    const chave = JSON.stringify(linha.dimensoes);
    const anterior = grupos.get(chave);
    grupos.set(chave, [
      ...linha.dimensoes,
      ...linha.valores.map(
        (valor, i) => valor + Number(anterior?.[linha.dimensoes.length + i] ?? 0),
      ),
    ]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([, linha]) => linha);
}

/** Conta somente a lista histórica das chamadas salvas, inclusive após transferências. */
export function montarIndicadores(
  chamadas: ChamadaIndicador[],
  movimentos: MovimentoIndicador[],
  parciais: ParcialIndicador[],
): FonteIndicadores[] {
  const base = ["Data", "Ano", "Mes", "Serie", "Turma"];
  const frequencia = chamadas.map((chamada) => {
    const faltas = new Map<string, { horarios: string[]; codigos: Set<string>; sem: boolean }>();
    for (const falta of chamada.faltas) {
      const grupo = faltas.get(falta.alunoId) ?? {
        horarios: [],
        codigos: new Set<string>(),
        sem: false,
      };
      grupo.horarios.push(falta.horarioId);
      if (falta.justificativa) grupo.codigos.add(falta.justificativa);
      else grupo.sem = true;
      faltas.set(falta.alunoId, grupo);
    }
    const frequencia: Frequencia = {
      dia: chamada.dia,
      turmaId: chamada.turmaId,
      revisao: 1,
      atualizadoEm: "",
      atualizadoPorNome: null,
      alunos: chamada.alunos.map((aluno) => aluno.alunoId),
      faltas: [...faltas].map(([alunoId, grupo]) => ({
        alunoId,
        horarios: grupo.horarios,
        justificativa: !grupo.sem && grupo.codigos.size === 1 ? [...grupo.codigos][0] : undefined,
      })),
    };
    const totais = { P: 0, F: 0, FJ: 0, S: 0 };
    for (const aluno of chamada.alunos) {
      const marca = marcaDoAluno(
        {
          id: aluno.alunoId,
          nome: "",
          turmaId: chamada.turmaId,
          turmaOriginalId: chamada.turmaId,
          ordem: 0,
          ativo: true,
          desistenteEm: aluno.desistenteEm,
        },
        chamada.dia,
        [frequencia],
        chamada.horarios,
      );
      if (marca) totais[marca]++;
    }
    return [
      ...dimensoes(chamada.dia, chamada.turma),
      totais.P + totais.F + totais.FJ + totais.S,
      totais.P,
      totais.F,
      totais.FJ,
      totais.S,
      totais.F + totais.FJ,
    ];
  });
  return [
    {
      nome: "Frequencia",
      cabecalho: [
        ...base,
        "Registrados",
        "Presentes",
        "Faltas",
        "Justificadas",
        "Parciais",
        "Ausencias",
      ],
      linhas: frequencia,
    },
    {
      nome: "Movimentacoes",
      cabecalho: [...base, "Tipo", "Faixa_horaria", "Quantidade"],
      linhas: agrupar(
        movimentos.map((m) => ({
          dimensoes: [
            ...dimensoes(m.dia, m.turma),
            m.tipo,
            m.horario && /^\d{2}:\d{2}$/.test(m.horario)
              ? `${m.horario.slice(0, 2)}:00`
              : "Não informado",
          ],
          valores: [1],
        })),
      ),
    },
    {
      nome: "Parciais",
      cabecalho: [...base, "Tipo", "Turno", "Registros", "RS_confirmados", "RS_pendentes"],
      linhas: agrupar(
        parciais.map((p) => ({
          dimensoes: [...dimensoes(p.dia, p.turma), p.tipo, p.turno ?? "Não se aplica"],
          valores: [1, Number(p.registradoSeduc), Number(!p.registradoSeduc)],
        })),
      ),
    },
    {
      nome: "Aulas_parciais",
      cabecalho: [...base, "Aula", "Registros"],
      linhas: agrupar(
        parciais
          .filter((p) => p.tipo === "AULAS")
          .flatMap((p) =>
            [...new Set(p.aulas)].map((aula) => ({
              dimensoes: [...dimensoes(p.dia, p.turma), aula],
              valores: [1],
            })),
          ),
      ),
    },
  ];
}

export interface EstadoIndicadores {
  ativa: boolean;
  ano: number | null;
  anoEfetivo: number;
  conectada: boolean;
  planilhaUrl: string | null;
  urlRelatorio: string | null;
  ultimoEnvioEm: string | null;
  linhas: number;
  erro: string | null;
  criacaoPendente: boolean;
  agendaDisponivel: boolean;
}

/** Aceita somente visualizações HTTPS dos serviços suportados, sem credenciais na URL. */
export function enderecoPainelPermitido(endereco: string): boolean {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (url.hostname === "lookerstudio.google.com") return url.pathname.startsWith("/reporting/");
  return (
    url.hostname === "analytics.zoho.com" && /^\/workspace\/\d+\/view\/\d+\/?$/.test(url.pathname)
  );
}
