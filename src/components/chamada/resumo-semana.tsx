// Resumo somente leitura da semana letiva encerrada, por turma.
"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Feriado } from "@/domain/calendario-letivo";
import type { Aluno, Frequencia, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDiaSemana } from "@/domain/frequencia";
import {
  resumirSemanaDaTurma,
  type DiaNoResumoSemana,
  type ResumoSemanaTurma,
} from "@/domain/resumo-semana";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { Button } from "@/components/ui/button";
import { CirculosAcumulado } from "@/components/ui/circulo-contagem";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  dias: readonly string[];
  feriados: readonly Feriado[];
  mostrarSaidas: boolean;
  versao?: number;
  onAbrirDia: (dia: string) => void;
}

interface CargaSemana {
  chave: string;
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  erro: string;
  variante: VarianteEstado;
  avisoSaidas: string;
}

const LIMITE_ALUNOS = 10;

function abortou(motivo: unknown): boolean {
  return motivo instanceof DOMException && motivo.name === "AbortError";
}

function situacaoDoDia(dia: DiaNoResumoSemana): string {
  if (dia.feriado) return `Feriado · ${dia.feriado}`;
  if (dia.salva) return "Chamada salva";
  if (dia.previsto) return "Chamada pendente";
  return "Sem aula";
}

function rotuloDoDia(dia: string): string {
  const semana = rotuloDiaSemana(dia).replace("-feira", "");
  return `${semana}, ${rotuloData(dia)}`;
}

function CartaoTotais({ totais }: { totais: ResumoSemanaTurma["totais"] }) {
  const itens = [
    { rotulo: "Faltas", valor: totais.faltas, classe: "text-falta-texto" },
    { rotulo: "Justificadas", valor: totais.justificadas, classe: "text-justificada-texto" },
    { rotulo: "Presentes", valor: totais.presentes, classe: "text-primary" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" aria-label="Totais da semana">
      {itens.map((item) => (
        <div
          key={item.rotulo}
          className="bg-card flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[14px] border px-2 py-2"
        >
          <span className={`numerais-tabulares text-2xl font-semibold ${item.classe}`}>
            {item.valor}
          </span>
          <span className="text-muted-foreground text-xs font-medium">{item.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

function CartaoTurma({
  resumo,
  mostrarSaidas,
  onAbrirDia,
}: {
  resumo: ResumoSemanaTurma;
  mostrarSaidas: boolean;
  onAbrirDia: (dia: string) => void;
}) {
  const [listaCompleta, setListaCompleta] = useState(false);
  const alunosVisiveis = listaCompleta ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS);
  const saidas = mostrarSaidas ? resumo.saidas : [];

  return (
    <article className="superficie overflow-hidden">
      <div className="bg-secondary/50 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="font-medium">{resumo.rotulo}</h2>
        <span className="text-muted-foreground text-xs">Somente leitura</span>
      </div>
      <div className="flex flex-col gap-4 p-3">
        <CartaoTotais totais={resumo.totais} />

        <ul className="divide-y" aria-label={`Dias de ${resumo.rotulo}`}>
          {resumo.dias.map((dia) => (
            <li key={dia.dia} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{rotuloDoDia(dia.dia)}</p>
                  <p className="text-muted-foreground text-xs">{situacaoDoDia(dia)}</p>
                </div>
                {dia.salva ? (
                  <CirculosAcumulado
                    faltas={dia.faltas}
                    justificadas={dia.justificadas}
                    saidas={mostrarSaidas && dia.saidas > 0 ? dia.saidas : undefined}
                  />
                ) : null}
              </div>
              {dia.salva && dia.parciais > 0 ? (
                <p className="text-muted-foreground text-xs">
                  {dia.parciais === 1 ? "1 presença parcial" : `${dia.parciais} presenças parciais`}
                </p>
              ) : null}
              {dia.salva || dia.previsto ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 self-start"
                  onClick={() => onAbrirDia(dia.dia)}
                >
                  Abrir {rotuloData(dia.dia)}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>

        <section aria-label={`Pendências de ${resumo.rotulo}`}>
          <h3 className="text-sm font-medium">Pendências</h3>
          {resumo.pendencias.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Nenhum dia letivo sem chamada nesta semana.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {resumo.pendencias.map((dia) => (
                <li key={dia} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm capitalize">{rotuloDoDia(dia)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => onAbrirDia(dia)}
                  >
                    Abrir {rotuloData(dia)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={`Alunos com mais faltas em ${resumo.rotulo}`}>
          <h3 className="text-sm font-medium">Alunos com mais faltas</h3>
          {resumo.alunos.length === 0 ? (
            <p className="text-muted-foreground mt-1 text-sm">Nenhuma falta nesta semana.</p>
          ) : (
            <>
              <ul className="mt-2 divide-y">
                {alunosVisiveis.map((aluno) => (
                  <li key={aluno.alunoId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm">{aluno.nome}</span>
                    <CirculosAcumulado faltas={aluno.faltas} justificadas={aluno.justificadas} />
                  </li>
                ))}
              </ul>
              {resumo.alunos.length > LIMITE_ALUNOS ? (
                <button
                  type="button"
                  className="text-primary pressionavel mt-2 text-sm font-medium hover:underline"
                  onClick={() => setListaCompleta((atual) => !atual)}
                >
                  {listaCompleta ? "Mostrar menos" : "Ver a lista completa"}
                </button>
              ) : null}
            </>
          )}
        </section>

        {saidas.length > 0 ? (
          <section aria-label={`Saídas antecipadas de ${resumo.rotulo}`}>
            <h3 className="text-sm font-medium">Saídas antecipadas</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {saidas.map((saida) => (
                <li key={saida.id} className="text-sm">
                  <span className="font-medium">{saida.nome}</span>
                  <span className="text-muted-foreground">
                    {` · ${rotuloData(saida.dia)} · ${saida.momento}`}
                    {saida.horario ? ` · ${saida.horario}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

/** Carrega a semana e mostra o resumo de cada turma visível. */
export function VistaResumoSemana({
  turmas,
  alunos,
  dias,
  feriados,
  mostrarSaidas,
  versao = 0,
  onAbrirDia,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const turmasChave = turmas.map((turma) => turma.id).join(",");
  const [tentativa, setTentativa] = useState(0);
  const [carga, setCarga] = useState<CargaSemana | null>(null);
  const chave = `${de}|${ate}|${turmasChave}|${versao}|${tentativa}|${mostrarSaidas ? 1 : 0}`;

  useEffect(() => {
    if (!de || !ate || turmasChave === "") return;
    const controlador = new AbortController();
    let viva = true;
    void (async () => {
      const frequenciasPedido = pedir<{ frequencias: Frequencia[] }>(
        `/api/frequencias?de=${de}&ate=${ate}`,
        { signal: controlador.signal },
      );
      const saidasPedido = mostrarSaidas
        ? pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?de=${de}&ate=${ate}`, {
            signal: controlador.signal,
          })
        : Promise.resolve({ saidas: [] as SaidaAntecipada[] });
      const [frequenciasResultado, saidasResultado] = await Promise.allSettled([
        frequenciasPedido,
        saidasPedido,
      ]);
      if (!viva) return;
      if (frequenciasResultado.status === "rejected") {
        if (abortou(frequenciasResultado.reason)) return;
        const excecao = frequenciasResultado.reason;
        setCarga({
          chave,
          frequencias: [],
          saidas: [],
          erro:
            excecao instanceof ErroApi
              ? excecao.message
              : "Não foi possível carregar o resumo da semana.",
          variante: estadoDeErro(excecao),
          avisoSaidas: "",
        });
        return;
      }
      if (saidasResultado.status === "rejected" && abortou(saidasResultado.reason)) return;
      const avisoSaidas =
        saidasResultado.status === "rejected" ? "Não foi possível carregar as saídas." : "";
      setCarga({
        chave,
        frequencias: frequenciasResultado.value.frequencias,
        saidas: saidasResultado.status === "fulfilled" ? saidasResultado.value.saidas : [],
        erro: "",
        variante: "indisponivel",
        avisoSaidas,
      });
    })();
    return () => {
      viva = false;
      controlador.abort();
    };
  }, [ate, chave, de, mostrarSaidas, turmasChave]);

  const pronto = carga?.chave === chave;
  const resumos =
    pronto && carga.erro === ""
      ? turmas.map((turma) =>
          resumirSemanaDaTurma(
            turma,
            alunos,
            dias,
            carga.frequencias,
            mostrarSaidas ? carga.saidas : [],
            feriados,
          ),
        )
      : [];

  return (
    <section
      aria-label="Resumo da semana"
      aria-busy={turmas.length > 0 && !pronto}
      className="flex flex-col gap-4"
    >
      {!pronto && turmas.length > 0 ? (
        <p
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
        >
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando resumo da semana...
        </p>
      ) : null}
      {pronto && carga.erro !== "" ? (
        <AvisoCompacto
          variante={carga.variante}
          descricao={carga.erro}
          tamanho="linha"
          acao={{ rotulo: "Tentar novamente", onClick: () => setTentativa((valor) => valor + 1) }}
        />
      ) : null}
      {pronto && carga.avisoSaidas !== "" ? (
        <AvisoCompacto variante="indisponivel" descricao={carga.avisoSaidas} tamanho="linha" />
      ) : null}
      {turmas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma turma disponível para o resumo.</p>
      ) : null}
      {resumos.map((resumo) => (
        <CartaoTurma
          key={resumo.turmaId}
          resumo={resumo}
          mostrarSaidas={mostrarSaidas}
          onAbrirDia={onAbrirDia}
        />
      ))}
    </section>
  );
}
