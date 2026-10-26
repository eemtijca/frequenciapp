"use client";

// Resumo semanal de uma aba de Saídas e Entradas, com todas as turmas da área.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, LoaderCircle, Users } from "lucide-react";
import type { EntradaAtrasada } from "@/domain/entradas";
import type { Aluno, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDiaSemana } from "@/domain/frequencia";
import { resumirMovimentacoes } from "@/domain/resumo-semana-movimentacoes";
import { pedir } from "@/lib/api-cliente";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import {
  BarrasDia,
  CabecalhoResumo,
  CartaoDia,
  ResumoVazio,
  SecaoResumo,
} from "@/components/resumo-semanal/base";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";

interface Props {
  tipo: "saida" | "entrada";
  turmas: Turma[];
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  versao?: number;
  ativo: boolean;
  pausado?: boolean;
  fuso: string;
  onAbrirDia: (dia: string) => void;
  onVerDomingo?: () => void;
}

interface DadosMovimentacao {
  saidas: SaidaAntecipada[];
  entradas: EntradaAtrasada[];
}

const LIMITE_ALUNOS = 5;

export function VistaResumoMovimentacoes({
  tipo,
  turmas,
  alunos,
  dias,
  domingo,
  versao = 0,
  ativo,
  pausado = false,
  fuso,
  onAbrirDia,
  onVerDomingo,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const periodo = `${de}|${ate}|${tipo}`;
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ visao: true });
  const [alunosExpandidos, setAlunosExpandidos] = useState(false);
  const [temDomingo, setTemDomingo] = useState(false);
  const periodoAnterior = useRef(periodo);
  const onVerDomingoRef = useRef(onVerDomingo);

  useEffect(() => {
    onVerDomingoRef.current = onVerDomingo;
  }, [onVerDomingo]);

  useEffect(() => {
    if (periodoAnterior.current === periodo) return;
    periodoAnterior.current = periodo;
    setAbertas({ visao: true });
    setAlunosExpandidos(false);
  }, [periodo]);

  useEffect(() => {
    if (!domingo || !onVerDomingoRef.current) return;
    let viva = true;
    const url =
      tipo === "saida"
        ? `/api/saidas?dia=${domingo}`
        : `/api/entradas?de=${domingo}&ate=${domingo}`;
    pedir<{ saidas?: SaidaAntecipada[]; entradas?: EntradaAtrasada[] }>(url)
      .then((dados) => {
        if (!viva) return;
        setTemDomingo((dados.saidas?.length ?? 0) + (dados.entradas?.length ?? 0) > 0);
      })
      .catch(() => {
        if (viva) setTemDomingo(false);
      });
    return () => {
      viva = false;
    };
  }, [domingo, tipo]);

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      const dados =
        tipo === "saida"
          ? await pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?de=${de}&ate=${ate}`, {
              signal: sinal,
            }).then((resposta) => ({
              saidas: resposta.saidas,
              entradas: [] as EntradaAtrasada[],
            }))
          : await pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${de}&ate=${ate}`, {
              signal: sinal,
            }).then((resposta) => ({
              saidas: [] as SaidaAntecipada[],
              entradas: resposta.entradas,
            }));
      return { dados, assinatura: JSON.stringify(dados) };
    },
    [ate, de, tipo],
  );

  const carga = useResumoSemanal<DadosMovimentacao>({
    periodo,
    versao,
    ativo,
    pausado,
    viewId: "saidas",
    fuso,
    carregar,
  });

  const resumo = useMemo(
    () =>
      carga.dados
        ? tipo === "saida"
          ? resumirMovimentacoes("saida", {
              saidas: carga.dados.saidas,
              alunos,
              turmas,
              dias,
            })
          : resumirMovimentacoes("entrada", {
              entradas: carga.dados.entradas,
              dias,
            })
        : null,
    [alunos, carga.dados, dias, tipo, turmas],
  );

  function aberta(chave: string) {
    return abertas[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setAbertas((atual) => ({ ...atual, [chave]: valor }));
  }

  const singular = tipo === "saida" ? "saída" : "entrada";
  const plural = tipo === "saida" ? "saídas" : "entradas";
  const titulo = tipo === "saida" ? "Saídas da semana" : "Entradas da semana";

  return (
    <section aria-label="Resumo da semana" aria-busy={!carga.dados} className="flex flex-col gap-5">
      <CabecalhoResumo
        dias={dias}
        domingo={domingo}
        atualizadoEm={carga.atualizadoEm}
        fuso={fuso}
        descricao={`${titulo} de todas as turmas da área.`}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {carga.anuncio}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <CalendarDays size={14} aria-hidden="true" />
          Resumo de todas as turmas.
        </p>
        {domingo && onVerDomingo && temDomingo ? (
          <Button type="button" variant="link" className="min-h-11 px-0" onClick={onVerDomingo}>
            Ver registros do domingo
          </Button>
        ) : null}
      </div>
      {carga.erro && carga.dados ? (
        <AvisoCompacto
          variante="indisponivel"
          descricao={carga.erro}
          tamanho="linha"
          acao={{ rotulo: "Tentar novamente", onClick: carga.tentarNovamente }}
        />
      ) : null}
      {!carga.dados && !carga.erro ? (
        <p
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
        >
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando resumo da semana...
        </p>
      ) : null}
      {!carga.dados && carga.erro ? (
        <AvisoCompacto
          variante="indisponivel"
          descricao={carga.erro}
          tamanho="linha"
          acao={{ rotulo: "Tentar novamente", onClick: carga.tentarNovamente }}
        />
      ) : null}

      {resumo ? (
        <>
          <SecaoResumo
            id="movimentacoes-visao"
            titulo="Visão geral"
            descricao="Totais e distribuição diária."
            icone={Clock3}
            aberto={aberta("visao")}
            onAbertoChange={(valor) => alternar("visao", valor)}
            resumo={
              <>
                <Selo>
                  {resumo.total} {resumo.total === 1 ? singular : plural}
                </Selo>
                <Selo>{resumo.totalAlunos} alunos</Selo>
                <Selo>{resumo.totalTurmas} turmas</Selo>
              </>
            }
          >
            <dl className="bg-card grid grid-cols-3 divide-x rounded-[14px] border">
              {[
                [tipo === "saida" ? "Saídas" : "Entradas", resumo.total],
                ["Alunos", resumo.totalAlunos],
                ["Turmas", resumo.totalTurmas],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex flex-col items-center gap-0.5 px-2 py-3">
                  <dt className="text-muted-foreground text-xs font-medium">{rotulo}</dt>
                  <dd className="numerais-tabulares text-xl font-semibold">{valor}</dd>
                </div>
              ))}
            </dl>
            <BarrasDia
              dias={resumo.dias.map((dia) => ({
                dia: dia.dia,
                rotulo: rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3),
                valor: dia.total,
              }))}
              unidade={[singular, plural]}
              titulo={tipo === "saida" ? "Saídas" : "Entradas"}
            />
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {resumo.dias.map((dia) => (
                <CartaoDia
                  key={dia.dia}
                  dia={dia.dia}
                  rotulo={rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3)}
                  status={dia.total > 0 ? "Com registro" : "Sem registro"}
                  tom={dia.total > 0 ? "salva" : "neutro"}
                  abrir
                  onAbrir={() => onAbrirDia(dia.dia)}
                  ariaLabel={`Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${dia.total} ${dia.total === 1 ? singular : plural}`}
                  contagens={
                    <span className="numerais-tabulares text-sm font-semibold">{dia.total}</span>
                  }
                />
              ))}
            </ul>
          </SecaoResumo>

          <SecaoResumo
            id="movimentacoes-turmas"
            titulo="Turmas"
            descricao="Total por turma na semana."
            icone={CalendarDays}
            aberto={aberta("turmas")}
            onAbertoChange={(valor) => alternar("turmas", valor)}
            resumo={<Selo>{resumo.turmas.length} turmas</Selo>}
          >
            {resumo.turmas.length === 0 ? (
              <ResumoVazio texto="Nenhuma movimentação nesta semana." />
            ) : (
              <ul className="divide-y">
                {resumo.turmas.map((turma) => (
                  <li key={turma.turmaId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 text-sm break-words">{turma.rotulo}</span>
                    <span className="numerais-tabulares shrink-0 text-sm font-semibold">
                      {turma.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SecaoResumo>

          <SecaoResumo
            id="movimentacoes-alunos"
            titulo="Alunos"
            descricao="Alunos com mais registros na semana."
            icone={Users}
            aberto={aberta("alunos")}
            onAbertoChange={(valor) => alternar("alunos", valor)}
            resumo={<Selo>{resumo.alunos.length} alunos</Selo>}
          >
            {resumo.alunos.length === 0 ? (
              <ResumoVazio texto="Nenhuma movimentação nesta semana." />
            ) : (
              <div className="flex flex-col gap-3">
                <table className="w-full table-fixed text-left text-sm">
                  <caption className="sr-only">Alunos com mais registros na semana</caption>
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th scope="col">Aluno</th>
                      <th scope="col" className="w-24 text-right">
                        {tipo === "saida" ? "Saídas" : "Entradas"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(alunosExpandidos ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS)).map(
                      (aluno) => (
                        <tr key={aluno.alunoId}>
                          <th scope="row" className="min-w-0 py-2 font-normal break-words">
                            {aluno.nome}
                            <span className="text-muted-foreground block text-[11px]">
                              {aluno.turma}
                            </span>
                          </th>
                          <td className="numerais-tabulares py-2 text-right">{aluno.total}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {resumo.alunos.length > LIMITE_ALUNOS ? (
                  <Button
                    type="button"
                    variant="link"
                    className="min-h-11 self-start px-0"
                    aria-expanded={alunosExpandidos}
                    onClick={() => setAlunosExpandidos((valor) => !valor)}
                  >
                    {alunosExpandidos ? "Mostrar menos" : "Ver a lista completa"}
                  </Button>
                ) : null}
              </div>
            )}
          </SecaoResumo>
        </>
      ) : null}
    </section>
  );
}
