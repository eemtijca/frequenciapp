"use client";

// Minhas turmas: estatísticas só de leitura da turma de origem do diretor,
// por mês, com números em destaque, gráficos e a mesma informação em tabela.
import { useEffect, useState } from "react";
import { ChartColumn, ChevronLeft, ChevronRight, LoaderCircle, Table2 } from "lucide-react";
import { diasDoMes, mesSeguinte, rotuloDataCurta, rotuloMes } from "@/domain/frequencia";
import type {
  ContextoDiretor,
  EstatisticasDoDiretor,
  EstatisticasTurma,
} from "@/domain/estatisticas-diretor";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { cn } from "@/lib/utils";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Selo } from "@/components/ui/selo";
import { GraficoAlunos, GraficoSemanas } from "@/components/graficos/graficos-sob-demanda";

interface Props {
  contexto: ContextoDiretor;
}

type Exibicao = "grafico" | "tabela";

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function dataPorExtenso(dia: string): string {
  return dia.split("-").reverse().join("/");
}

function Destaque({ valor, rotulo, tom }: { valor: string; rotulo: string; tom?: string }) {
  return (
    <div className="superficie-vidro flex min-h-20 flex-col items-center justify-center gap-1 px-3 py-3">
      <span className={`numerais-tabulares text-2xl font-semibold ${tom ?? ""}`}>{valor}</span>
      <span className="text-muted-foreground text-center text-xs font-medium">{rotulo}</span>
    </div>
  );
}

function TabelaAlunos({ estatisticas }: { estatisticas: EstatisticasTurma }) {
  const verJustificadas = estatisticas.categorias.includes("justificativas");
  const verSaidas = estatisticas.categorias.includes("saidas");
  return (
    <div className="superficie-vidro overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Ausência por aluno no período</caption>
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th scope="col" className="px-3 py-2 font-medium">
              Aluno
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Ausências
            </th>
            {verJustificadas && (
              <>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Faltas
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Justificadas
                </th>
              </>
            )}
            {verSaidas && (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Saídas
              </th>
            )}
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Dias com chamada
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Ausência
            </th>
          </tr>
        </thead>
        <tbody>
          {estatisticas.alunos.map((aluno) => (
            <tr key={aluno.alunoId} className="border-b last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex flex-wrap items-center gap-2">
                  {aluno.nome}
                  {aluno.emRisco && <Selo variante="atencao">em risco</Selo>}
                </span>
              </th>
              <td className="numerais-tabulares px-3 py-2 text-right">{aluno.ausencias}</td>
              {verJustificadas && (
                <>
                  <td className="numerais-tabulares px-3 py-2 text-right">{aluno.faltas}</td>
                  <td className="numerais-tabulares px-3 py-2 text-right">{aluno.justificadas}</td>
                </>
              )}
              {verSaidas && (
                <td className="numerais-tabulares px-3 py-2 text-right">{aluno.saidas}</td>
              )}
              <td className="numerais-tabulares px-3 py-2 text-right">{aluno.diasComChamada}</td>
              <td className="numerais-tabulares px-3 py-2 text-right font-medium">
                {aluno.diasComChamada > 0 ? percentual.format(aluno.taxa) : "sem chamada"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VistaMinhasTurmas({ contexto }: Props) {
  const mesCorrente = contexto.diaCorrente.slice(0, 7);
  const [turmaId, setTurmaId] = useState(contexto.turmas[0]?.turmaId ?? "");
  const [mes, setMes] = useState(mesCorrente);
  const [exibicao, setExibicao] = useState<Exibicao>("grafico");
  const [dados, setDados] = useState<EstatisticasDoDiretor | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");

  useEffect(() => {
    if (!turmaId) return;
    const dias = diasDoMes(mes);
    const de = dias[0] ?? `${mes}-01`;
    const ate = dias[dias.length - 1] ?? de;
    let viva = true;
    async function buscar() {
      setCarregando(true);
      setErro("");
      try {
        const resposta = await pedir<EstatisticasDoDiretor>(
          `/api/diretor/estatisticas?turmaId=${turmaId}&de=${de}&ate=${ate}`,
        );
        if (viva) setDados(resposta);
      } catch (excecao) {
        if (!viva) return;
        setDados(null);
        setErro(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível carregar as estatísticas.",
        );
        setErroVariante(estadoDeErro(excecao));
      } finally {
        if (viva) setCarregando(false);
      }
    }
    void buscar();
    return () => {
      viva = false;
    };
  }, [turmaId, mes]);

  if (contexto.turmas.length === 0) {
    return (
      <section aria-label="Minhas turmas" className="flex flex-col gap-4 pb-6">
        <h1 className="text-xl font-semibold tracking-tight">Minhas turmas</h1>
        <p className="superficie-vidro text-muted-foreground px-4 py-8 text-center text-sm">
          Nenhuma turma vinculada a esta conta hoje. Procure a gestão da escola.
        </p>
      </section>
    );
  }

  const turma = contexto.turmas.find((item) => item.turmaId === turmaId);
  const estatisticas = dados?.turmaId === turmaId ? dados.estatisticas : null;
  const periodo = dados?.turmaId === turmaId ? dados.periodo : null;
  const semChamada = estatisticas !== null && estatisticas.resumo.alunoDias === 0;

  return (
    <section aria-label="Minhas turmas" className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Minhas turmas</h1>
        <p className="text-muted-foreground text-sm">
          {turma?.turma}
          {periodo && (
            <span className="numerais-tabulares">
              {" "}
              · {rotuloDataCurta(periodo.de)} a {rotuloDataCurta(periodo.ate)}
            </span>
          )}
        </p>
      </div>

      {contexto.turmas.length > 1 && (
        <div role="group" aria-label="Turma" className="flex flex-wrap gap-2">
          {contexto.turmas.map((item) => (
            <button
              key={item.turmaId}
              type="button"
              aria-pressed={item.turmaId === turmaId}
              onClick={() => setTurmaId(item.turmaId)}
              className={cn(
                "controle-vidro pressionavel flex min-h-11 items-center px-4 text-sm font-medium transition-colors",
                item.turmaId === turmaId && "vidro-selecionado",
              )}
            >
              {item.turma}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Mês anterior"
          onClick={() => setMes((atual) => mesSeguinte(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="mes-diretor"
            modo="mes"
            valor={mes}
            max={mesCorrente}
            rotuloAcessivel="Mês das estatísticas"
            rotulo={rotuloMes(mes)}
            onValor={setMes}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Mês seguinte"
          disabled={mes >= mesCorrente}
          onClick={() => setMes((atual) => mesSeguinte(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}

      {carregando && !estatisticas ? (
        <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          Carregando estatísticas
        </div>
      ) : dados && dados.turmaId === turmaId && !periodo ? (
        <p className="superficie-vidro text-muted-foreground px-4 py-8 text-center text-sm">
          O vínculo com esta turma começou em {dataPorExtenso(dados.vinculo.inicio)}; não há dados
          seus neste mês.
        </p>
      ) : estatisticas ? (
        <>
          <div
            className="grid grid-cols-3 gap-3"
            aria-label="Resumo do período"
            aria-busy={carregando}
          >
            <Destaque valor={String(estatisticas.resumo.alunos)} rotulo="Alunos acompanhados" />
            <Destaque
              valor={String(estatisticas.resumo.emRisco)}
              rotulo={`Em risco (a partir de ${estatisticas.limiteRisco}%)`}
              tom={estatisticas.resumo.emRisco > 0 ? "text-falta-texto" : ""}
            />
            <Destaque
              valor={semChamada ? "sem chamada" : percentual.format(estatisticas.resumo.taxa)}
              rotulo="Ausência da turma"
            />
          </div>

          {semChamada ? (
            <p className="superficie-vidro text-muted-foreground px-4 py-8 text-center text-sm">
              Nenhuma chamada registrada neste período.
              {periodo && dados && periodo.de === dados.vinculo.inicio
                ? ` Seu acompanhamento desta turma começou em ${dataPorExtenso(dados.vinculo.inicio)}.`
                : ""}
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <div
                  role="group"
                  aria-label="Forma de exibição"
                  className="superficie-vidro flex gap-1 p-1"
                >
                  <button
                    type="button"
                    aria-pressed={exibicao === "grafico"}
                    onClick={() => setExibicao("grafico")}
                    className={cn(
                      "pressionavel flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-sm font-medium",
                      exibicao === "grafico"
                        ? "vidro-selecionado"
                        : "vidro-discreto text-muted-foreground",
                    )}
                  >
                    <ChartColumn size={16} aria-hidden="true" />
                    Gráficos
                  </button>
                  <button
                    type="button"
                    aria-pressed={exibicao === "tabela"}
                    onClick={() => setExibicao("tabela")}
                    className={cn(
                      "pressionavel flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-sm font-medium",
                      exibicao === "tabela"
                        ? "vidro-selecionado"
                        : "vidro-discreto text-muted-foreground",
                    )}
                  >
                    <Table2 size={16} aria-hidden="true" />
                    Tabela
                  </button>
                </div>
              </div>

              {exibicao === "grafico" ? (
                <>
                  <div className="superficie-vidro flex flex-col gap-3 p-4">
                    <h2 className="text-sm font-semibold">Ausência por aluno</h2>
                    <GraficoAlunos
                      alunos={estatisticas.alunos}
                      limiteRisco={estatisticas.limiteRisco}
                    />
                  </div>
                  <div className="superficie-vidro flex flex-col gap-3 p-4">
                    <h2 className="text-sm font-semibold">Ausência da turma por semana</h2>
                    <GraficoSemanas
                      semanas={estatisticas.semanas}
                      limiteRisco={estatisticas.limiteRisco}
                      separarJustificadas={estatisticas.categorias.includes("justificativas")}
                    />
                  </div>
                </>
              ) : (
                <TabelaAlunos estatisticas={estatisticas} />
              )}
            </>
          )}

          <p className="text-muted-foreground text-xs">
            Ausência conta faltas e faltas justificadas sobre os dias em que a turma de cada aluno
            teve chamada registrada. Alunos da turma de origem, ativos hoje.
          </p>
        </>
      ) : null}
    </section>
  );
}
