"use client";

// Resumo semanal de frequência, com seções recolhíveis e atualização silenciosa.
import { useCallback, useMemo, useState } from "react";
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
import type { Aluno, Configuracoes, Frequencia, SaidaAntecipada, Turma } from "@/domain/frequencia";
import { rotuloData, rotuloDataCurta, rotuloDiaSemana, rotuloMomento } from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import {
  exigeConferenciaSeduc,
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
} from "@/domain/frequencia-personalizada";
import { limiaresDoPainel } from "@/domain/relatorios";
import { resumirSemanaDaTurma, type ResumoSemanaTurma } from "@/domain/resumo-semana";
import { pedir } from "@/lib/api-cliente";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { CirculosAcumulado } from "@/components/ui/circulo-contagem";
import { Selo } from "@/components/ui/selo";
import {
  CabecalhoResumo,
  CartaoDia,
  ResumoVazio,
  SecaoResumo,
} from "@/components/resumo-semanal/base";
import { useResumoSemanal } from "@/components/resumo-semanal/use-resumo-semanal";
import { GraficoEvolucao, GraficoRosca } from "@/components/graficos/graficos-sob-demanda";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  dias: readonly string[];
  domingo?: string | null;
  feriados: readonly Feriado[];
  configuracoes: Configuracoes;
  mostrarSaidas: boolean;
  versao?: number;
  contexto?: "painel" | "chamada";
  ativo?: boolean;
  pausado?: boolean;
  viewId?: string;
  fuso: string;
  onRecarregarConfiguracoes?: () => Promise<void>;
  onAbrirDia: (dia: string) => void;
}

interface DadosSemana {
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  entradas: EntradaAtrasada[];
  parciais: RegistroPersonalizado[];
  avisoSaidas: string;
  avisoEntradas: string;
  avisoParciais: string;
}

const LIMITE_ALUNOS = 5;
const LIMITE_MOVIMENTACOES = 8;

function horarioDoDia(dia: { feriado: string | null; salva: boolean; previsto: boolean }): {
  rotulo: string;
  tom: "salva" | "pendente" | "neutro";
} {
  if (dia.feriado) return { rotulo: "Feriado", tom: "neutro" };
  if (dia.salva) return { rotulo: "Chamada salva", tom: "salva" };
  if (dia.previsto) return { rotulo: "Chamada pendente", tom: "pendente" };
  return { rotulo: "Sem aula", tom: "neutro" };
}

function rotuloCurtoDoDia(dia: string): string {
  return rotuloDiaSemana(dia).replace("-feira", "").slice(0, 3);
}

function RankingAlunos({ resumo }: { resumo: ResumoSemanaTurma }) {
  const [listaCompleta, setListaCompleta] = useState(false);
  if (resumo.alunos.length === 0) return <ResumoVazio texto="Nenhuma falta nesta semana." />;
  const visiveis = listaCompleta ? resumo.alunos : resumo.alunos.slice(0, LIMITE_ALUNOS);
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Alunos com mais faltas na semana</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th scope="col" className="w-8 py-2">
              #
            </th>
            <th scope="col">Aluno</th>
            <th scope="col" className="w-9 text-right">
              F
            </th>
            <th scope="col" className="w-10 text-right">
              FJ
            </th>
            <th scope="col" className="w-12 text-right">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visiveis.map((aluno, indice) => (
            <tr key={aluno.alunoId}>
              <td className="text-muted-foreground numerais-tabulares py-2">{indice + 1}</td>
              <th scope="row" className="min-w-0 py-2 font-normal break-words">
                {aluno.nome}
              </th>
              <td className="text-falta-texto numerais-tabulares py-2 text-right">
                {aluno.faltas}
              </td>
              <td className="text-justificada-texto numerais-tabulares py-2 text-right">
                {aluno.justificadas}
              </td>
              <td className="numerais-tabulares py-2 text-right font-semibold">
                {aluno.faltas + aluno.justificadas}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground text-xs">F: falta. FJ: falta justificada.</p>
      {resumo.alunos.length > LIMITE_ALUNOS ? (
        <Button
          type="button"
          variant="link"
          className="min-h-11 self-start px-0"
          aria-expanded={listaCompleta}
          onClick={() => setListaCompleta((valor) => !valor)}
        >
          {listaCompleta ? "Mostrar menos" : "Ver a lista completa"}
        </Button>
      ) : null}
    </div>
  );
}

function ListaMovimentacoes({
  itens,
}: {
  itens: {
    id: string;
    tipo: "Saída" | "Entrada";
    nome: string;
    turma: string;
    dia: string;
    horario: string | null;
    momento: string;
  }[];
}) {
  const [completa, setCompleta] = useState(false);
  if (itens.length === 0) return <ResumoVazio texto="Nenhuma movimentação nesta semana." />;
  const visiveis = completa ? itens : itens.slice(0, LIMITE_MOVIMENTACOES);
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y">
        {visiveis.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium break-words">{item.nome}</p>
              <p className="text-muted-foreground text-xs">
                {item.turma} · {rotuloData(item.dia)} · {item.momento}
                {item.horario ? ` · ${item.horario}` : ""}
              </p>
            </div>
            <span className="bg-secondary text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {item.tipo}
            </span>
          </li>
        ))}
      </ul>
      {itens.length > LIMITE_MOVIMENTACOES ? (
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

export function VistaResumoSemana({
  turmas,
  alunos,
  dias,
  domingo,
  feriados,
  configuracoes,
  mostrarSaidas,
  versao = 0,
  contexto = "chamada",
  ativo = true,
  pausado = false,
  viewId = contexto === "painel" ? "painel" : "chamada",
  fuso,
  onRecarregarConfiguracoes,
  onAbrirDia,
}: Props) {
  const de = dias[0] ?? "";
  const ate = dias[dias.length - 1] ?? "";
  const turmasChave = useMemo(() => turmas.map((turma) => turma.id).join(","), [turmas]);
  const periodo = `${de}|${ate}|${turmasChave}|${contexto}|${mostrarSaidas ? 1 : 0}`;
  const painel = contexto === "painel";

  const carregar = useCallback(
    async (sinal: AbortSignal) => {
      const configuracao = onRecarregarConfiguracoes
        ? onRecarregarConfiguracoes().catch(() => undefined)
        : Promise.resolve(undefined);
      const [frequenciasResultado, saidasResultado, entradasResultado, parciaisResultado] =
        await Promise.allSettled([
          pedir<{ frequencias: Frequencia[] }>(`/api/frequencias?de=${de}&ate=${ate}`, {
            signal: sinal,
          }),
          mostrarSaidas
            ? pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?de=${de}&ate=${ate}`, {
                signal: sinal,
              })
            : Promise.resolve({ saidas: [] as SaidaAntecipada[] }),
          painel && mostrarSaidas
            ? pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${de}&ate=${ate}`, {
                signal: sinal,
              })
            : Promise.resolve({ entradas: [] as EntradaAtrasada[] }),
          painel
            ? pedir<{ registros: RegistroPersonalizado[] }>(
                `/api/frequencias-personalizadas?de=${de}&ate=${ate}`,
                { signal: sinal },
              )
            : Promise.resolve({ registros: [] as RegistroPersonalizado[] }),
        ]);
      await configuracao;
      if (frequenciasResultado.status === "rejected") {
        throw frequenciasResultado.reason;
      }
      const saidas = saidasResultado.status === "fulfilled" ? saidasResultado.value.saidas : [];
      const entradas =
        entradasResultado.status === "fulfilled" ? entradasResultado.value.entradas : [];
      const parciais =
        parciaisResultado.status === "fulfilled" ? parciaisResultado.value.registros : [];
      const idsVisiveis = new Set(turmas.map((turma) => turma.id));
      const dados: DadosSemana = {
        frequencias: frequenciasResultado.value.frequencias,
        saidas: saidas.filter((saida) => {
          const aluno = alunos.find((item) => item.id === saida.alunoId);
          return !aluno || idsVisiveis.has(aluno.turmaId);
        }),
        entradas: entradas.filter((entrada) => idsVisiveis.has(entrada.turmaId)),
        parciais: parciais.filter((registro) => idsVisiveis.has(registro.turmaId)),
        avisoSaidas:
          mostrarSaidas && saidasResultado.status === "rejected"
            ? "Não foi possível carregar as saídas."
            : "",
        avisoEntradas:
          painel && mostrarSaidas && entradasResultado.status === "rejected"
            ? "Não foi possível carregar as entradas."
            : "",
        avisoParciais:
          painel && parciaisResultado.status === "rejected"
            ? "Não foi possível carregar as pendências da Seduc."
            : "",
      };
      return { dados, assinatura: JSON.stringify(dados) };
    },
    [alunos, ate, de, mostrarSaidas, onRecarregarConfiguracoes, painel, turmas],
  );

  const resumo = useResumoSemanal<DadosSemana>({
    periodo,
    versao,
    ativo,
    pausado,
    viewId,
    fuso,
    carregar,
  });

  const dados = resumo.dados;
  const pronto = dados !== null;
  const resumos = useMemo(
    () =>
      dados
        ? turmas.map((turma) =>
            resumirSemanaDaTurma(
              turma,
              alunos,
              dias,
              dados.frequencias,
              painel ? [] : dados.saidas,
              feriados,
            ),
          )
        : [],
    [alunos, dados, dias, feriados, painel, turmas],
  );

  const chavesPadrao = useMemo(() => {
    const chaves: Record<string, boolean> = {};
    for (const turma of turmas) {
      chaves[`${turma.id}:visao`] = true;
      chaves[`${turma.id}:pendencias`] = false;
      chaves[`${turma.id}:alunos`] = false;
      chaves[`${turma.id}:saidas`] = false;
    }
    chaves.movimentacoes = false;
    chaves.pendenciasSeduc = false;
    return chaves;
  }, [turmas]);
  const [secoes, setSecoes] = useState<Record<string, boolean>>(chavesPadrao);
  const [chavesAtuais, setChavesAtuais] = useState(chavesPadrao);
  const [periodoSecoes, setPeriodoSecoes] = useState(periodo);
  if (chavesAtuais !== chavesPadrao || periodoSecoes !== periodo) {
    setChavesAtuais(chavesPadrao);
    setPeriodoSecoes(periodo);
    setSecoes(chavesPadrao);
  }

  function aberta(chave: string): boolean {
    return secoes[chave] ?? chavesPadrao[chave] ?? false;
  }
  function alternar(chave: string, valor: boolean) {
    setSecoes((atual) => ({ ...atual, [chave]: valor }));
  }

  const movimentacoes = useMemo(() => {
    if (!dados || !mostrarSaidas) return [];
    const alunosPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
    const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    const lista = [
      ...dados.saidas.flatMap((saida) => {
        const aluno = alunosPorId.get(saida.alunoId);
        if (!aluno) return [];
        return [
          {
            id: `saida:${saida.id}`,
            tipo: "Saída" as const,
            nome: aluno.nome,
            turma: turmasPorId.get(aluno.turmaId) ?? "Sem turma",
            dia: saida.dia,
            horario: saida.horario,
            momento: rotuloMomento(saida.momento),
          },
        ];
      }),
      ...dados.entradas.map((entrada) => ({
        id: `entrada:${entrada.id}`,
        tipo: "Entrada" as const,
        nome: entrada.nome,
        turma: entrada.turmaRotulo,
        dia: entrada.dia,
        horario: entrada.horario,
        momento: entrada.momento ? rotuloMomento(entrada.momento) : "Entrada",
      })),
    ];
    return lista.sort(
      (a, b) =>
        a.dia.localeCompare(b.dia) ||
        (a.horario ?? "").localeCompare(b.horario ?? "") ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [alunos, dados, mostrarSaidas, turmas]);

  const pendenciasSeduc = useMemo(() => {
    if (!dados) return [];
    return dados.parciais
      .filter((registro) => exigeConferenciaSeduc(registro) && !registro.registradoSeduc)
      .map((registro) => ({
        id: registro.id,
        nome: registro.alunoNome,
        turma: registro.turmaNome,
        dia: registro.dia,
        tipo: rotuloFrequenciaPersonalizada(registro),
      }))
      .sort(
        (a, b) =>
          a.dia.localeCompare(b.dia) ||
          a.turma.localeCompare(b.turma, "pt-BR") ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [dados]);

  const avisos = [dados?.avisoSaidas, dados?.avisoEntradas, dados?.avisoParciais].filter(
    (aviso): aviso is string => Boolean(aviso),
  );

  return (
    <section aria-label="Resumo da semana" aria-busy={!pronto} className="flex flex-col gap-5">
      <CabecalhoResumo
        dias={dias}
        domingo={domingo}
        atualizadoEm={resumo.atualizadoEm}
        fuso={fuso}
        descricao={
          painel
            ? "Frequência, movimentações e pendências da Seduc de todas as turmas visíveis."
            : "Frequência e saídas da turma selecionada."
        }
      />
      <p className="sr-only" role="status" aria-live="polite">
        {resumo.anuncio}
      </p>
      {resumo.erro && pronto ? (
        <AvisoCompacto
          variante="indisponivel"
          descricao={resumo.erro}
          tamanho="linha"
          acao={{ rotulo: "Tentar novamente", onClick: resumo.tentarNovamente }}
        />
      ) : null}
      {avisos.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Alguns dados não puderam ser carregados. As seções afetadas mostram o aviso.
        </p>
      ) : null}
      {!pronto && !resumo.erro ? (
        <p
          role="status"
          className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
        >
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando resumo da semana...
        </p>
      ) : null}
      {!pronto && resumo.erro ? (
        <AvisoCompacto
          variante="indisponivel"
          descricao={resumo.erro}
          tamanho="linha"
          acao={{ rotulo: "Tentar novamente", onClick: resumo.tentarNovamente }}
        />
      ) : null}
      {pronto && turmas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma turma disponível para o resumo.</p>
      ) : null}

      {resumos.map((item) => {
        const totalPendencias = item.pendencias.length;
        const evolucao = item.dias.map((dia) => {
          const registrados = dia.faltas + dia.justificadas + dia.presentes + dia.parciais;
          return {
            rotulo: rotuloDataCurta(dia.dia),
            valor:
              registrados > 0
                ? Math.round(((dia.faltas + dia.justificadas) / registrados) * 1000) / 10
                : null,
          };
        });
        return (
          <article
            key={item.turmaId}
            aria-labelledby={`resumo-turma-${item.turmaId}`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id={`resumo-turma-${item.turmaId}`} className="font-semibold">
                  {item.rotulo}
                </h3>
                <p className="text-muted-foreground text-xs">
                  {dias[0] ? `${rotuloDataCurta(dias[0])} a ${rotuloDataCurta(ate)}` : ""}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  totalPendencias === 0
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-alerta/40 bg-alerta-fraca text-alerta-texto"
                }`}
              >
                {totalPendencias === 0 ? (
                  <CheckCircle2 size={12} aria-hidden="true" />
                ) : (
                  <TriangleAlert size={12} aria-hidden="true" />
                )}
                {totalPendencias === 0
                  ? "Sem pendências"
                  : `${totalPendencias} ${totalPendencias === 1 ? "pendência" : "pendências"}`}
              </span>
            </div>

            <SecaoResumo
              id={`${item.turmaId}-visao`}
              titulo="Visão geral"
              descricao="Totais, evolução e dias da semana."
              icone={CalendarDays}
              aberto={aberta(`${item.turmaId}:visao`)}
              onAbertoChange={(valor) => alternar(`${item.turmaId}:visao`, valor)}
              resumo={
                <>
                  <Selo>{item.totais.faltas} faltas</Selo>
                  <Selo>{item.totais.justificadas} justificadas</Selo>
                  <Selo>{item.totais.presentes} presentes</Selo>
                </>
              }
            >
              <dl className="bg-card grid grid-cols-3 divide-x rounded-[14px] border">
                {[
                  ["Faltas", item.totais.faltas, "text-falta-texto"],
                  ["Justificadas", item.totais.justificadas, "text-justificada-texto"],
                  ["Presentes", item.totais.presentes, "text-primary"],
                ].map(([rotulo, valor, classe]) => (
                  <div key={rotulo} className="flex flex-col items-center gap-0.5 px-2 py-3">
                    <dt className="text-muted-foreground text-xs font-medium">{rotulo}</dt>
                    <dd className={`numerais-tabulares text-xl font-semibold ${classe}`}>
                      {valor}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-muted-foreground text-xs">Somente chamadas salvas.</p>
              {(() => {
                const previstos = item.dias.filter((dia) => dia.previsto).length;
                const salvos = item.dias.filter((dia) => dia.previsto && dia.salva).length;
                const cobertura = previstos > 0 ? Math.round((salvos / previstos) * 100) : 100;
                return (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">Cobertura da semana</span>
                      <span className="numerais-tabulares font-medium">
                        {salvos} de {previstos} dias com chamada
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Cobertura de chamadas da semana"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={cobertura}
                      className="bg-secondary h-2 w-full overflow-hidden rounded-full"
                    >
                      <div
                        aria-hidden="true"
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${cobertura}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="grid gap-4 lg:grid-cols-2">
                <GraficoRosca
                  tomValores="falta"
                  titulo={`Faltas, justificadas e presentes de ${item.rotulo}`}
                  fatias={[
                    { nome: "Faltas", valor: item.totais.faltas },
                    { nome: "Justificadas", valor: item.totais.justificadas },
                    { nome: "Presentes", valor: item.totais.presentes },
                  ]}
                  vazio="Nenhuma chamada salva nesta semana"
                />
                <GraficoEvolucao
                  evolucao={evolucao}
                  limiares={limiaresDoPainel(configuracoes)}
                  rotuloAcessivel={`Infrequência diária de ${item.rotulo}. Os valores também aparecem nos cartões de dia.`}
                />
              </div>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {item.dias.map((dia) => {
                  const situacao = horarioDoDia(dia);
                  const abre = Boolean(dia.salva || dia.previsto);
                  const detalhe = [
                    dia.feriado ? `Feriado: ${dia.feriado}` : "",
                    dia.parciais > 0
                      ? `${dia.parciais} ${dia.parciais === 1 ? "presença parcial" : "presenças parciais"}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(". ");
                  return (
                    <CartaoDia
                      key={dia.dia}
                      dia={dia.dia}
                      rotulo={rotuloCurtoDoDia(dia.dia)}
                      status={situacao.rotulo}
                      tom={situacao.tom}
                      abrir={abre}
                      onAbrir={() => onAbrirDia(dia.dia)}
                      ariaLabel={
                        abre
                          ? `Abrir ${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                          : `${rotuloDiaSemana(dia.dia)}, ${rotuloData(dia.dia)}, ${situacao.rotulo}`
                      }
                      contagens={
                        dia.salva ? (
                          <div className="flex w-full flex-col gap-1.5">
                            <CirculosAcumulado
                              faltas={dia.faltas}
                              justificadas={dia.justificadas}
                              saidas={
                                mostrarSaidas && !painel && dia.saidas > 0 ? dia.saidas : undefined
                              }
                            />
                            <div aria-hidden="true" className="flex w-full gap-0.5">
                              {dia.faltas > 0 ? (
                                <span
                                  className="bg-falta h-1 rounded-full"
                                  style={{ flexGrow: dia.faltas }}
                                />
                              ) : null}
                              {dia.justificadas > 0 ? (
                                <span
                                  className="bg-justificada h-1 rounded-full"
                                  style={{ flexGrow: dia.justificadas }}
                                />
                              ) : null}
                              {dia.presentes > 0 ? (
                                <span
                                  className="bg-primary h-1 rounded-full"
                                  style={{ flexGrow: dia.presentes }}
                                />
                              ) : null}
                            </div>
                          </div>
                        ) : undefined
                      }
                      detalhe={detalhe || undefined}
                    />
                  );
                })}
              </ul>
            </SecaoResumo>

            <SecaoResumo
              id={`${item.turmaId}-pendencias`}
              titulo="Pendências"
              descricao="Dias letivos sem chamada nesta semana."
              icone={TriangleAlert}
              aberto={aberta(`${item.turmaId}:pendencias`)}
              onAbertoChange={(valor) => alternar(`${item.turmaId}:pendencias`, valor)}
              resumo={
                <Selo>
                  {totalPendencias} {totalPendencias === 1 ? "dia" : "dias"}
                </Selo>
              }
            >
              {item.pendencias.length === 0 ? (
                <ResumoVazio texto="Nenhuma pendência nesta semana." />
              ) : (
                <ul className="divide-y">
                  {item.pendencias.map((dia) => (
                    <li
                      key={dia}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className="text-sm">
                        {rotuloDiaSemana(dia).replace("-feira", "")}, {rotuloData(dia)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => onAbrirDia(dia)}
                      >
                        Abrir {rotuloDataCurta(dia)}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SecaoResumo>

            <SecaoResumo
              id={`${item.turmaId}-alunos`}
              titulo="Alunos"
              descricao="Ranking de faltas e faltas justificadas."
              icone={Users}
              aberto={aberta(`${item.turmaId}:alunos`)}
              onAbertoChange={(valor) => alternar(`${item.turmaId}:alunos`, valor)}
              resumo={<Selo>{item.alunos.length} alunos</Selo>}
            >
              <RankingAlunos resumo={item} />
            </SecaoResumo>

            {!painel && mostrarSaidas ? (
              <SecaoResumo
                id={`${item.turmaId}-saidas`}
                titulo="Saídas"
                descricao="Saídas antecipadas da semana."
                icone={Clock3}
                aberto={aberta(`${item.turmaId}:saidas`)}
                onAbertoChange={(valor) => alternar(`${item.turmaId}:saidas`, valor)}
                resumo={<Selo>{item.saidas.length} saídas</Selo>}
              >
                {dados?.avisoSaidas ? (
                  <p role="alert" className="text-muted-foreground text-xs">
                    {dados.avisoSaidas}
                  </p>
                ) : null}
                {item.saidas.length === 0 ? (
                  <ResumoVazio texto="Nenhuma saída antecipada nesta semana." />
                ) : (
                  <ul className="divide-y">
                    {item.saidas.map((saida) => (
                      <li key={saida.id} className="py-2 text-sm">
                        <span className="font-medium">{saida.nome}</span>
                        <span className="text-muted-foreground">
                          {` · ${rotuloData(saida.dia)} · ${rotuloMomento(saida.momento)}`}
                          {saida.horario ? ` · ${saida.horario}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SecaoResumo>
            ) : null}
          </article>
        );
      })}

      {painel && mostrarSaidas ? (
        <SecaoResumo
          id="movimentacoes"
          titulo="Movimentações"
          descricao="Saídas e entradas da semana, com a turma gravada em cada registro."
          icone={Clock3}
          nivel="raiz"
          aberto={aberta("movimentacoes")}
          onAbertoChange={(valor) => alternar("movimentacoes", valor)}
          resumo={<Selo>{movimentacoes.length} registros</Selo>}
        >
          {dados?.avisoSaidas ? (
            <p role="alert" className="text-muted-foreground text-xs">
              {dados.avisoSaidas}
            </p>
          ) : null}
          {dados?.avisoEntradas ? (
            <p role="alert" className="text-muted-foreground text-xs">
              {dados.avisoEntradas}
            </p>
          ) : null}
          <ListaMovimentacoes itens={movimentacoes} />
        </SecaoResumo>
      ) : null}

      {painel ? (
        <SecaoResumo
          id="pendenciasSeduc"
          titulo="Pendentes na Seduc"
          descricao="Registros efetivos que exigem conferência na Seduc."
          icone={ClipboardList}
          nivel="raiz"
          aberto={aberta("pendenciasSeduc")}
          onAbertoChange={(valor) => alternar("pendenciasSeduc", valor)}
          resumo={<Selo>{pendenciasSeduc.length} pendentes</Selo>}
        >
          {dados?.avisoParciais ? (
            <p role="alert" className="text-muted-foreground text-xs">
              {dados.avisoParciais}
            </p>
          ) : null}
          {pendenciasSeduc.length === 0 ? (
            <ResumoVazio texto="Nenhuma pendência na Seduc nesta semana." />
          ) : (
            <>
              <ul className="divide-y">
                {pendenciasSeduc.map((item) => (
                  <li key={item.id} className="py-2 text-sm">
                    <p className="font-medium break-words">{item.nome}</p>
                    <p className="text-muted-foreground text-xs">
                      {item.turma} · {rotuloData(item.dia)} · {item.tipo}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                A conferência e a confirmação ficam na Chamada Parcial.
              </p>
            </>
          )}
        </SecaoResumo>
      ) : null}
    </section>
  );
}
