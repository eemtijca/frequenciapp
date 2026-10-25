// Resumo semanal da Chamada Parcial, a partir dos registros efetivos da tela.
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import { alunoDesistenteNoDia, horariosDoDia, type Aluno, type Turma } from "@/domain/frequencia";
import {
  exigeConferenciaSeduc,
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
} from "@/domain/frequencia-personalizada";

export interface DiaNoResumoSemanaParcial {
  dia: string;
  feriado: string | null;
  previsto: boolean;
  temChamada: boolean;
  registros: number;
  ajustes: number;
  pendentes: number;
  registrados: number;
  presencasParciais: number;
  justificadas: number;
  saidas: number;
  semRegistro: number;
}

export interface PendenciaSeduc {
  id: string;
  alunoId: string;
  alunoNome: string;
  turmaNome: string;
  dia: string;
  tipo: string;
}

export interface AlunoNoResumoSemanaParcial {
  alunoId: string;
  nome: string;
  ajustes: number;
  pendentes: number;
  registrados: number;
  presencasParciais: number;
  justificadas: number;
  saidas: number;
}

export interface ResumoSemanaParcial {
  turmaId: string;
  rotulo: string;
  dias: DiaNoResumoSemanaParcial[];
  pendenciasSeduc: PendenciaSeduc[];
  diasSemChamada: string[];
  alunos: AlunoNoResumoSemanaParcial[];
  totais: {
    ajustes: number;
    pendentes: number;
    registrados: number;
    presencasParciais: number;
    justificadas: number;
    saidas: number;
  };
}

export function resumirSemanaParcial(
  turma: Turma,
  alunos: Aluno[],
  dias: readonly string[],
  registros: readonly RegistroPersonalizado[],
  feriados: readonly Feriado[],
): ResumoSemanaParcial {
  const daTurma = registros.filter(
    (registro) => registro.turmaId === turma.id && dias.includes(registro.dia),
  );
  const alunosAtivos = alunos.filter((aluno) => aluno.ativo && aluno.turmaId === turma.id);

  const diasResumo = dias.map((dia) => {
    const feriado = feriadoNaData(feriados, dia)?.nome ?? null;
    const ativos = alunosAtivos.filter((aluno) => !alunoDesistenteNoDia(aluno, dia));
    const doDia = daTurma.filter((registro) => registro.dia === dia);
    const ajustes = doDia.filter(exigeConferenciaSeduc);
    const pendentes = ajustes.filter((registro) => !registro.registradoSeduc);
    const registrados = ajustes.filter((registro) => registro.registradoSeduc);
    const previsto =
      feriado === null && horariosDoDia(turma.horarios, dia).length > 0 && ativos.length > 0;
    const idsComRegistro = new Set(doDia.map((registro) => registro.alunoId));
    return {
      dia,
      feriado,
      previsto,
      temChamada: doDia.some((registro) => registro.tipo === "CHAMADA"),
      registros: doDia.length,
      ajustes: ajustes.length,
      pendentes: pendentes.length,
      registrados: registrados.length,
      presencasParciais: doDia.filter(
        (registro) =>
          registro.tipo === "TURNO" || registro.tipo === "AULAS" || registro.tipo === "DIA_INTEIRO",
      ).length,
      justificadas: doDia.filter((registro) => registro.tipo === "JUSTIFICADA").length,
      saidas: doDia.filter((registro) => registro.tipo === "SAIDA").length,
      // Dias sem aula não entram na conta de alunos sem registro.
      semRegistro: previsto ? ativos.filter((aluno) => !idsComRegistro.has(aluno.id)).length : 0,
    };
  });

  const pendenciasSeduc = daTurma
    .filter((registro) => exigeConferenciaSeduc(registro) && !registro.registradoSeduc)
    .map((registro) => ({
      id: registro.id,
      alunoId: registro.alunoId,
      alunoNome: registro.alunoNome,
      turmaNome: registro.turmaNome,
      dia: registro.dia,
      tipo: rotuloFrequenciaPersonalizada(registro),
    }))
    .sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        a.alunoNome.localeCompare(b.alunoNome, "pt-BR") ||
        a.id.localeCompare(b.id),
    );

  const porAluno = new Map<string, AlunoNoResumoSemanaParcial>();
  for (const registro of daTurma) {
    const atual = porAluno.get(registro.alunoId) ?? {
      alunoId: registro.alunoId,
      nome: registro.alunoNome,
      ajustes: 0,
      pendentes: 0,
      registrados: 0,
      presencasParciais: 0,
      justificadas: 0,
      saidas: 0,
    };
    if (registro.tipo === "TURNO" || registro.tipo === "AULAS" || registro.tipo === "DIA_INTEIRO")
      atual.presencasParciais += 1;
    if (registro.tipo === "JUSTIFICADA") atual.justificadas += 1;
    if (registro.tipo === "SAIDA") atual.saidas += 1;
    if (exigeConferenciaSeduc(registro)) {
      atual.ajustes += 1;
      if (registro.registradoSeduc) atual.registrados += 1;
      else atual.pendentes += 1;
    }
    porAluno.set(registro.alunoId, atual);
  }

  const alunosResumo = [...porAluno.values()]
    .filter((aluno) => aluno.ajustes > 0)
    .sort(
      (a, b) =>
        b.pendentes - a.pendentes || b.ajustes - a.ajustes || a.nome.localeCompare(b.nome, "pt-BR"),
    );

  return {
    turmaId: turma.id,
    rotulo: turma.rotulo,
    dias: diasResumo,
    pendenciasSeduc,
    diasSemChamada: diasResumo
      .filter((dia) => dia.previsto && !dia.temChamada)
      .map((dia) => dia.dia),
    alunos: alunosResumo,
    totais: {
      ajustes: diasResumo.reduce((soma, dia) => soma + dia.ajustes, 0),
      pendentes: diasResumo.reduce((soma, dia) => soma + dia.pendentes, 0),
      registrados: diasResumo.reduce((soma, dia) => soma + dia.registrados, 0),
      presencasParciais: diasResumo.reduce((soma, dia) => soma + dia.presencasParciais, 0),
      justificadas: diasResumo.reduce((soma, dia) => soma + dia.justificadas, 0),
      saidas: diasResumo.reduce((soma, dia) => soma + dia.saidas, 0),
    },
  };
}
