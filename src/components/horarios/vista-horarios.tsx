"use client";

// Consulta dos horários semanais por turma, com disciplinas por dia e leitura adaptada à tela.
import { useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import type { Horario, Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";

interface Props {
  turmas: Turma[];
  diaCorrente: string;
}

function diaDaSemana(dia: string): number {
  const valor = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return Number.isNaN(valor) ? 1 : valor || 7;
}

function rotuloDia(valor: number): string {
  const rotulo = DIAS_DA_SEMANA.find((dia) => dia.valor === valor)?.rotulo ?? "dia";
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

function nomeDisciplina(aula: Horario, dia: number): string {
  return aula.disciplinas?.[String(dia)]?.trim() || "Sem disciplina";
}

function AulasDoDia({ aulas, dia }: { aulas: Horario[]; dia: number }) {
  if (aulas.length === 0)
    return <p className="text-muted-foreground px-4 py-6 text-sm">Sem aulas neste dia.</p>;

  return (
    <ol aria-label={`Aulas de ${rotuloDia(dia)}`} className="divide-y">
      {aulas.map((aula) => (
        <li key={aula.id} className="flex items-start gap-3 px-4 py-4">
          <span className="controle-vidro numerais-tabulares flex size-11 shrink-0 items-center justify-center text-sm font-semibold">
            <span aria-hidden="true">{aula.ordem}ª</span>
            <span className="sr-only">{aula.ordem}ª aula</span>
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-medium break-words ${aula.disciplinas?.[String(dia)] ? "" : "text-muted-foreground"}`}
            >
              {nomeDisciplina(aula, dia)}
            </p>
            <p className="numerais-tabulares text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
              <Clock size={14} aria-hidden="true" className="shrink-0" />
              {aula.inicio} às {aula.fim}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function VistaHorarios({ turmas, diaCorrente }: Props) {
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [diaSelecionado, setDiaSelecionado] = useState(String(diaDaSemana(diaCorrente)));
  const turma = turmas.find((item) => item.id === turmaId) ?? turmas[0];
  const aulas = (turma?.horarios ?? [])
    .filter((aula) => aula.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.inicio.localeCompare(b.inicio));
  const semanaCompleta = diaSelecionado === "0";
  const diasDaGrade = DIAS_DA_SEMANA.filter(
    (dia) => dia.valor <= 5 || aulas.some((aula) => aula.diasSemana.includes(dia.valor)),
  );
  const dia = Number(diaSelecionado);
  const aulasDoDia = aulas.filter((aula) => aula.diasSemana.includes(dia));

  return (
    <section aria-label="Horários semanais" className="flex min-w-0 flex-col gap-5">
      <h1 className="sr-only">Horários</h1>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="horarios-turma">Turma</Label>
          <Selecionar
            id="horarios-turma"
            value={turma?.id ?? ""}
            onValueChange={setTurmaId}
            opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
            disabled={turmas.length === 0}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="horarios-dia">Dia da semana</Label>
          <Selecionar
            id="horarios-dia"
            value={diaSelecionado}
            onValueChange={setDiaSelecionado}
            opcoes={[
              { valor: "0", rotulo: "Semana completa" },
              ...DIAS_DA_SEMANA.map((item) => ({
                valor: String(item.valor),
                rotulo: rotuloDia(item.valor),
              })),
            ]}
            disabled={turmas.length === 0}
          />
        </div>
        <Button
          variant="outline"
          className="min-h-11 self-end"
          aria-pressed={semanaCompleta}
          onClick={() => setDiaSelecionado("0")}
          disabled={turmas.length === 0}
        >
          <CalendarDays size={16} aria-hidden="true" />
          Semana completa
        </Button>
      </div>

      {aulas.length === 0 ? (
        <div className="superficie-vidro flex min-h-44 flex-col items-center justify-center gap-3 px-5 text-center">
          <CalendarDays size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">
            {turmas.length === 0 ? "Nenhuma turma cadastrada" : "Nenhum horário configurado"}
          </p>
        </div>
      ) : semanaCompleta ? (
        <>
          <div className="superficie-vidro hidden overflow-hidden lg:block">
            <div className="overflow-x-auto overscroll-contain">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">Grade semanal de {turma?.rotulo}</caption>
                <thead className="bg-secondary/50">
                  <tr>
                    <th scope="col" className="w-28 px-3 py-3 font-medium">
                      Aula
                    </th>
                    {diasDaGrade.map((item) => (
                      <th key={item.valor} scope="col" className="px-3 py-3 font-medium">
                        {item.abreviacao}
                        <span className="sr-only">: {rotuloDia(item.valor)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {aulas.map((aula) => (
                    <tr key={aula.id}>
                      <th scope="row" className="numerais-tabulares px-3 py-4 font-medium">
                        {aula.ordem}ª aula
                        <span className="text-muted-foreground mt-1 block text-xs font-normal">
                          {aula.inicio} às {aula.fim}
                        </span>
                      </th>
                      {diasDaGrade.map((item) => (
                        <td key={item.valor} className="px-3 py-4 align-top break-words">
                          {aula.diasSemana.includes(item.valor) ? (
                            <span
                              className={
                                aula.disciplinas?.[String(item.valor)]
                                  ? "font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {nomeDisciplina(aula, item.valor)}
                            </span>
                          ) : (
                            <span className="sr-only">Sem aula</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {diasDaGrade.map((item) => (
              <section
                key={item.valor}
                aria-label={`Aulas de ${rotuloDia(item.valor)}`}
                className="superficie-vidro overflow-hidden"
              >
                <h2 className="bg-secondary/50 border-b px-4 py-3 text-sm font-medium">
                  {rotuloDia(item.valor)}
                </h2>
                <AulasDoDia
                  dia={item.valor}
                  aulas={aulas.filter((aula) => aula.diasSemana.includes(item.valor))}
                />
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="superficie-vidro overflow-hidden">
          <h2 className="bg-secondary/50 border-b px-4 py-3 text-sm font-medium">
            {rotuloDia(dia)}
          </h2>
          <AulasDoDia dia={dia} aulas={aulasDoDia} />
        </div>
      )}
    </section>
  );
}
