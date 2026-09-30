"use client";

// Gráfico personalizado de infrequência, com consulta explícita de período
// e filtros por série e turma, usando apenas chamadas salvas.
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Aluno, Frequencia, Serie, Turma } from "@/domain/frequencia";
import { LIMITE_DIAS_PERIODO, rotuloData } from "@/domain/frequencia";
import { ausencias, distribuicaoDoPeriodo, infrequencia } from "@/domain/relatorios";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import GraficoRosca from "@/components/painel/grafico-rosca";

interface Props {
  diaCorrente: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
}

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function VistaPeriodo({ diaCorrente, series, turmas, alunos }: Props) {
  const [de, setDe] = useState(`${diaCorrente.slice(0, 7)}-01`);
  const [ate, setAte] = useState(diaCorrente);
  const [serieId, setSerieId] = useState("todas");
  const [turmaId, setTurmaId] = useState("todas");
  const [resultado, setResultado] = useState<Frequencia[] | null>(null);
  const [erro, setErro] = useState("");
  const consulta = useRef<AbortController | null>(null);
  useEffect(() => () => consulta.current?.abort(), []);

  const turmasDisponiveis = turmas.filter(
    (turma) => serieId === "todas" || turma.serieId === serieId,
  );
  const distribuicao = useMemo(
    () => distribuicaoDoPeriodo(series, turmas, alunos, resultado ?? [], de, ate),
    [series, turmas, alunos, resultado, de, ate],
  );
  const serie = distribuicao.find((item) => item.serieId === serieId);
  const grupos = serie ? serie.turmas : distribuicao;
  const selecionados = grupos.filter(
    (item) => turmaId === "todas" || ("turmaId" in item && item.turmaId === turmaId),
  );
  const resumo = selecionados.reduce(
    (soma, item) => ({
      esperados: soma.esperados + item.esperados,
      registrados: soma.registrados + item.registrados,
      presentes: soma.presentes + item.presentes,
      faltas: soma.faltas + item.faltas,
      justificadas: soma.justificadas + item.justificadas,
    }),
    { esperados: 0, registrados: 0, presentes: 0, faltas: 0, justificadas: 0 },
  );

  function invalidar() {
    setResultado(null);
    setErro("");
  }

  const { executando, executar: gerar } = useAcaoUnica(async () => {
    invalidar();
    if (ate < de) {
      setErro("A data final deve ser igual ou posterior à inicial.");
      return;
    }
    if (de > diaCorrente || ate > diaCorrente) {
      setErro("Escolha um período até hoje.");
      return;
    }
    const totalDias =
      Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
    if (totalDias > LIMITE_DIAS_PERIODO) {
      setErro("O período é grande demais. Escolha até 366 dias.");
      return;
    }
    const controlador = new AbortController();
    consulta.current = controlador;
    try {
      const dados = await pedir<{ frequencias: Frequencia[] }>(
        `/api/frequencias?de=${de}&ate=${ate}`,
        { signal: controlador.signal },
      );
      if (!controlador.signal.aborted) setResultado(dados.frequencias);
    } catch (excecao) {
      if (!controlador.signal.aborted) {
        setErro(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível carregar o período. Tente novamente.",
        );
      }
    }
  });

  return (
    <section
      aria-label="Infrequência personalizada"
      className="bg-card space-y-5 rounded-lg border p-4"
    >
      <header>
        <h2 className="font-medium">Infrequência por período</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Escolha as datas e o recorte para comparar as faltas das chamadas salvas.
        </p>
      </header>
      <form
        className="space-y-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void gerar();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="periodo-painel-de">Data inicial</Label>
            <SeletorPeriodo
              id="periodo-painel-de"
              modo="dia"
              valor={de}
              max={diaCorrente}
              disabled={executando}
              rotuloAcessivel="Data inicial do gráfico"
              rotulo={rotuloData(de)}
              onValor={(valor) => {
                setDe(valor);
                invalidar();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="periodo-painel-ate">Data final</Label>
            <SeletorPeriodo
              id="periodo-painel-ate"
              modo="dia"
              valor={ate}
              max={diaCorrente}
              disabled={executando}
              rotuloAcessivel="Data final do gráfico"
              rotulo={rotuloData(ate)}
              onValor={(valor) => {
                setAte(valor);
                invalidar();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="periodo-painel-serie">Série</Label>
            <Selecionar
              id="periodo-painel-serie"
              value={serieId}
              disabled={executando}
              onValueChange={(valor) => {
                setSerieId(valor);
                setTurmaId("todas");
                invalidar();
              }}
              opcoes={[
                { valor: "todas", rotulo: "Todas as séries" },
                ...series.map((item) => ({ valor: item.id, rotulo: item.nome })),
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="periodo-painel-turma">Turma</Label>
            <Selecionar
              id="periodo-painel-turma"
              value={turmaId}
              disabled={executando || serieId === "todas"}
              onValueChange={(valor) => {
                setTurmaId(valor);
                invalidar();
              }}
              opcoes={[
                { valor: "todas", rotulo: "Todas as turmas" },
                ...turmasDisponiveis.map((item) => ({ valor: item.id, rotulo: item.rotulo })),
              ]}
            />
          </div>
        </div>
        <Button type="submit" disabled={executando}>
          {executando && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          {executando ? "Gerando gráfico..." : "Gerar gráfico"}
        </Button>
      </form>
      {erro && (
        <p role="alert" className="text-falta-texto text-sm">
          {erro}
        </p>
      )}
      {executando && (
        <p role="status" className="text-muted-foreground text-sm">
          Carregando chamadas do período...
        </p>
      )}
      {resultado !== null && (
        <div aria-live="polite" className="space-y-4 border-t pt-4">
          <p className="numerais-tabulares text-sm font-medium">
            De {rotuloData(de)} a {rotuloData(ate)}
          </p>
          <div
            role="group"
            aria-label="Resumo do período"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {[
              ["Faltas (F + FJ)", String(ausencias(resumo))],
              ["Registros de aluno por dia", String(resumo.registrados)],
              [
                "Infrequência",
                resumo.registrados > 0 ? percentual.format(infrequencia(resumo)) : "Sem dados",
              ],
            ].map(([rotulo, valor]) => (
              <div
                key={rotulo}
                className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center"
              >
                <strong className="numerais-tabulares text-xl font-semibold">{valor}</strong>
                <span className="text-muted-foreground text-xs">{rotulo}</span>
              </div>
            ))}
          </div>
          <GraficoRosca
            titulo={
              serie ? `Faltas do período por turma da ${serie.nome}` : "Faltas do período por série"
            }
            fatias={selecionados.map((item) => ({
              nome: "rotulo" in item ? item.rotulo : item.nome,
              valor: ausencias(item),
              detalhe: `${percentual.format(infrequencia(item))} de infrequência`,
            }))}
            vazio={
              resumo.registrados === 0
                ? "Nenhuma chamada salva neste período e recorte"
                : "Nenhuma falta registrada neste período e recorte"
            }
          />
          <p className="text-muted-foreground text-sm">
            A taxa considera F + FJ sobre os registros de aluno por dia com chamada salva. Dias sem
            chamada ficam fora do cálculo. A rosca mostra a distribuição das faltas por{" "}
            {serie ? "turma atual" : "série atual"}.
          </p>
        </div>
      )}
    </section>
  );
}
