"use client";

// Resumo semanal da Chamada Parcial, com os registros efetivos da tela.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LoaderCircle,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Feriado } from "@/domain/calendario-letivo";
import type { Aluno, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDataCurta, rotuloDiaSemana } from "@/domain/frequencia";
import type { RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import { resumirSemanaParcial, type ResumoSemanaParcial } from "@/domain/resumo-semana-parcial";
import { pedir } from "@/lib/api-cliente";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import {
  CabecalhoResumo,
  CartaoDia,
  ResumoVazio,
  SecaoResumo,
} from "@/components/resumo-semanal/base";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";

interface Props {
  turma: Turma | null;
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  feriados: readonly Feriado[];
  mostrarSaidas: boolean;
  versao?: number;
  ativa: boolean;
  pausado?: boolean;
  fuso: string;
  onAbrirDia: (dia: string) => void;
  onAbrirChamada?: (dia: string) => void;
}

interface DadosParciais {
  registros: RegistroPersonalizado[];
}

const LIMITE_ALUNOS = 5;

function RankingParcial({ resumo }: { resumo: ResumoSemanaParcial }) {
  const [completa, setCompleta] = useState(false);
  if (resumo.alunos.length === 0) return <ResumoVazio texto="Nenhum ajuste nesta semana." />;
  const visiveis = completa ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS);
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Alunos com ajustes na Chamada Parcial</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th scope="col">Aluno</th>
            <th scope="col" className="w-14 text-right">
              Ajustes
            </th>
            <th scope="col" className="w-16 text-right">
              Pendentes
            </th>
            <th scope="col" className="w-16 text-right">
              Registrados
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visiveis.map((aluno) => (
            <tr key={aluno.alunoId}>
              <th scope="row" className="min-w-0 py-2 font-normal break-words">
                {aluno.nome}
              </th>
              <td className="numerais-tabulares py-2 text-right">{aluno.ajustes}</td>
              <td className="text-alerta-texto numerais-tabulares py-2 text-right">
                {aluno.pendentes}
              </td>
              <td className="text-primary numerais-tabulares py-2 text-right">
                {aluno.registrados}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {resumo.alunos.length > LIMITE_ALUNOS ? (
        <Button
          type="button"
          variant="link"
          className="min-h-11 self-start px-0"
          aria-expanded={completa}
          onClick={() => setCompleta((valor) => !valor)}
        >
          {completa ? "Mostrar menos" : "Ver a lista completa"}
        </Button>
      ) : null}
    </div>
  );
}

function cartaoParcial(dia: ResumoSemanaParcial["dias"][number]) {
  if (dia.feriado) return { rotulo: "Feriado", tom: "neutro" as const };
  if (!dia.previsto && dia.registros === 0) return { rotulo: "Sem aula", tom: "neutro" as const };
  if (!dia.temChamada) return { rotulo: "Chamada pendente", tom: "pendente" as const };
  if (dia.pendentes > 0)
    return {
      rotulo: `${dia.pendentes} ${dia.pendentes === 1 ? "pendente" : "pendentes"}`,
      tom: "pendente" as const,
    };
  if (dia.registros > 0) return { rotulo: "Com ajustes", tom: "salva" as const };
  return { rotulo: "Sem registro", tom: "neutro" as const };
}

export function VistaResumoParcial({
  turma,
  alunos,
  dias,
  domingo,
  feriados,
  mostrarSaidas,
  versao = 0,
  ativa,
  pausado = false,
  fuso,
  onAbrirDia,
  onAbrirChamada,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const turmaId = turma?.id ?? "";
  const periodo = `${de}|${ate}|${turmaId}`;
  const [abertas, setAbertas] = useState<Record<string, boolean>>({ visao: true });
  const periodoAnterior = useRef(periodo);

  useEffect(() => {
    if (periodoAnterior.current === periodo) return;
    periodoAnterior.current = periodo;
    setAbertas({ visao: true });
  }, [periodo]);

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      if (!turmaId) return { dados: { registros: [] }, assinatura: "sem-turma" };
      const dados = await pedir<{ registros: RegistroPersonalizado[] }>(
        `/api/frequencias-personalizadas?de=${de}&ate=${ate}&turmaId=${encodeURIComponent(turmaId)}`,
        { signal: sinal },
      );
      return {
        dados: { registros: dados.registros },
        assinatura: JSON.stringify(dados.registros),
      };
    },
    [ate, de, turmaId],
  );

  const carga = useResumoSemanal<DadosParciais>({
    periodo,
    versao,
    ativo: ativa,
    pausado,
    viewId: "chamada-parcial",
    fuso,
    carregar,
  });

  const resumo = useMemo(
    () =>
      carga.dados && turma
        ? resumirSemanaParcial(turma, alunos, dias, carga.dados.registros, feriados)
        : null,
    [alunos, carga.dados, dias, feriados, turma],
  );

  const saidas = useMemo(
    () =>
      mostrarSaidas
        ? (carga.dados?.registros ?? [])
            .filter((registro) => registro.tipo === "SAIDA")
            .sort((a, b) => a.dia.localeCompare(b.dia) || a.alunoNome.localeCompare(b.alunoNome))
        : [],
    [carga.dados, mostrarSaidas],
  );

  function aberta(chave: string) {
    return abertas[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setAbertas((atual) => ({ ...atual, [chave]: valor }));
  }

  return (
    <section aria-label="Resumo da semana" aria-busy={!carga.dados} className="flex flex-col gap-5">
      <CabecalhoResumo
        dias={dias}
        domingo={domingo}
        atualizadoEm={carga.atualizadoEm}
        fuso={fuso}
        descricao="Registros efetivos da Chamada Parcial da turma selecionada."
      />
      <p className="sr-only" role="status" aria-live="polite">
        {carga.anuncio}
      </p>
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
      {!turma ? <ResumoVazio texto="Nenhuma turma selecionada." /> : null}

      {resumo ? (
        <article
          aria-labelledby={`resumo-parcial-${resumo.turmaId}`}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`resumo-parcial-${resumo.turmaId}`} className="font-semibold">
              {resumo.rotulo}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                resumo.totais.pendentes === 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-alerta/40 bg-alerta-fraca text-alerta-texto"
              }`}
            >
              {resumo.totais.pendentes === 0 ? (
                <CheckCircle2 size={12} aria-hidden="true" />
              ) : (
                <TriangleAlert size={12} aria-hidden="true" />
              )}
              {resumo.totais.pendentes === 0
                ? "Sem pendências"
                : `${resumo.totais.pendentes} ${resumo.totais.pendentes === 1 ? "pendência" : "pendências"}`}
            </span>
          </div>

          <SecaoResumo
            id="parcial-visao"
            titulo="Visão geral"
            descricao="Situação na Seduc, tipos de registro e dias da semana."
            icone={CalendarDays}
            aberto={aberta("visao")}
            onAbertoChange={(valor) => alternar("visao", valor)}
            resumo={
              <>
                <Selo>{resumo.totais.ajustes} ajustes</Selo>
                <Selo>{resumo.totais.pendentes} pendentes</Selo>
              </>
            }
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="bg-card rounded-[14px] border p-3">
                <p className="text-muted-foreground text-xs font-medium">Situação na Seduc</p>
                <dl className="mt-2 grid grid-cols-3 divide-x">
                  {[
                    ["Ajustes", resumo.totais.ajustes],
                    ["Pendentes", resumo.totais.pendentes],
                    ["Registrados", resumo.totais.registrados],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex flex-col items-center gap-0.5 px-2">
                      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
                      <dd className="numerais-tabulares text-xl font-semibold">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="bg-card rounded-[14px] border p-3">
                <p className="text-muted-foreground text-xs font-medium">Tipos de registro</p>
                <dl className="mt-2 grid grid-cols-3 divide-x">
                  {[
                    ["Parciais", resumo.totais.presencasParciais],
                    ["Justificativas", resumo.totais.justificadas],
                    ["Saídas", resumo.totais.saidas],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex flex-col items-center gap-0.5 px-2">
                      <dt className="text-muted-foreground text-center text-xs">{rotulo}</dt>
                      <dd className="numerais-tabulares text-xl font-semibold">{valor}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Ajustes incluem chamadas com saída parcial ou justificativa, saídas e personalizações.
            </p>
            <GraficoRosca
              titulo="Situação dos ajustes na Seduc"
              fatias={[
                { nome: "Pendentes", valor: resumo.totais.pendentes },
                { nome: "Registrados", valor: resumo.totais.registrados },
              ]}
              rotuloTotal="ajustes"
              unidadeSingular="ajuste"
              unidadePlural="ajustes"
              vazio="Nenhum ajuste nesta semana"
            />
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {resumo.dias.map((dia) => {
                const situacao = cartaoParcial(dia);
                return (
                  <CartaoDia
                    key={dia.dia}
                    dia={dia.dia}
                    rotulo={rotuloDiaSemana(dia.dia).replace("-feira", "").slice(0, 3)}
                    status={situacao.rotulo}
                    tom={situacao.tom}
                    abrir={Boolean(dia.previsto || dia.registros > 0)}
                    onAbrir={() => onAbrirDia(dia.dia)}
                    ariaLabel={
                      dia.previsto || dia.registros > 0
                        ? `Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                        : `${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                    }
                    contagens={
                      dia.registros > 0 ? (
                        <div className="flex w-full flex-col gap-1.5">
                          <span className="text-muted-foreground text-xs">
                            {dia.registros} {dia.registros === 1 ? "registro" : "registros"}
                          </span>
                          <div aria-hidden="true" className="flex w-full gap-0.5">
                            {dia.ajustes > 0 ? (
                              <span
                                className="bg-primary h-1 rounded-full"
                                style={{ flexGrow: dia.ajustes }}
                              />
                            ) : null}
                            {dia.pendentes > 0 ? (
                              <span
                                className="bg-alerta h-1 rounded-full"
                                style={{ flexGrow: dia.pendentes }}
                              />
                            ) : null}
                          </div>
                        </div>
                      ) : undefined
                    }
                    detalhe={
                      dia.semRegistro > 0
                        ? `${dia.semRegistro} ${dia.semRegistro === 1 ? "aluno sem registro" : "alunos sem registro"}`
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          </SecaoResumo>

          <SecaoResumo
            id="parcial-pendencias"
            titulo="Pendentes na Seduc"
            descricao="Registros que exigem conferência e ainda não foram confirmados."
            icone={ClipboardList}
            aberto={aberta("pendencias")}
            onAbertoChange={(valor) => alternar("pendencias", valor)}
            resumo={<Selo>{resumo.pendenciasSeduc.length} pendentes</Selo>}
          >
            {resumo.pendenciasSeduc.length === 0 ? (
              <ResumoVazio texto="Nenhuma pendência na Seduc nesta semana." />
            ) : (
              <ul className="divide-y">
                {resumo.pendenciasSeduc.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words">{item.alunoNome}</p>
                      <p className="text-muted-foreground text-xs">
                        {rotuloData(item.dia)} · {item.tipo}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => onAbrirDia(item.dia)}
                    >
                      Abrir {rotuloDataCurta(item.dia)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SecaoResumo>

          <SecaoResumo
            id="parcial-sem-chamada"
            titulo="Dias sem chamada"
            descricao="Dias letivos sem a chamada regular salva."
            icone={TriangleAlert}
            aberto={aberta("sem-chamada")}
            onAbertoChange={(valor) => alternar("sem-chamada", valor)}
            resumo={<Selo>{resumo.diasSemChamada.length} dias</Selo>}
          >
            {resumo.diasSemChamada.length === 0 ? (
              <ResumoVazio texto="Nenhum dia letivo sem chamada nesta semana." />
            ) : (
              <ul className="divide-y">
                {resumo.diasSemChamada.map((dia) => (
                  <li key={dia} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm">
                      {rotuloDiaSemana(dia).replace("-feira", "")}, {rotuloData(dia)}
                    </span>
                    {onAbrirChamada ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => onAbrirChamada(dia)}
                      >
                        Abrir na Chamada
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        A chamada regular é registrada na tela Chamada.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SecaoResumo>

          <SecaoResumo
            id="parcial-alunos"
            titulo="Alunos"
            descricao="Ajustes, pendentes e registrados por aluno."
            icone={Users}
            aberto={aberta("alunos")}
            onAbertoChange={(valor) => alternar("alunos", valor)}
            resumo={<Selo>{resumo.alunos.length} alunos</Selo>}
          >
            <RankingParcial resumo={resumo} />
          </SecaoResumo>

          {mostrarSaidas ? (
            <SecaoResumo
              id="parcial-saidas"
              titulo="Saídas"
              descricao="Saídas antecipadas da semana."
              icone={Clock3}
              aberto={aberta("saidas")}
              onAbertoChange={(valor) => alternar("saidas", valor)}
              resumo={<Selo>{saidas.length} saídas</Selo>}
            >
              {saidas.length === 0 ? (
                <ResumoVazio texto="Nenhuma saída antecipada nesta semana." />
              ) : (
                <ul className="divide-y">
                  {saidas.map((saida) => (
                    <li key={saida.id} className="py-2 text-sm">
                      <span className="font-medium">{saida.alunoNome}</span>
                      <span className="text-muted-foreground">
                        {` · ${rotuloData(saida.dia)} · ${saida.horario ?? ""}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoResumo>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
