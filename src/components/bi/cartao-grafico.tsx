"use client";

// Cartão de análise com tabela ordenável, meta local, exportações confirmadas e aprofundamento.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageDown, ChevronDown, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filtrarBi,
  metaBi,
  NOMES_MEDIDAS,
  textoBi,
  csvBi,
  type FiltrosBi,
  type GraficoBi,
  type PontoBi,
} from "@/domain/bi-analise";
import type { LinhaBi } from "@/domain/bi";
import { baixarBi, pngBi } from "@/lib/bi-exportacao";
import { CORES_BI, formatarValorBi, paginaTabelaBi, rotularPontosBi } from "@/lib/bi-visualizacao";
import { LimiteGrafico } from "./limite-grafico";
const VistaGrafico = dynamic(() => import("./vista-grafico"), {
  ssr: false,
  loading: () => (
    <span role="status" data-bi-modulo-carregando className="text-muted-foreground text-sm">
      Preparando gráfico...
    </span>
  ),
});
const PONTOS_VAZIOS: PontoBi[] = [];
export type CalcularBi = (config: GraficoBi, filtros: FiltrosBi) => Promise<PontoBi[]>;
export type ConfirmarExportacaoBi = (acao: () => Promise<void> | void) => void;
export function CartaoGrafico({
  config,
  filtros,
  linhas,
  calcular,
  onFiltrar,
  onAprofundar,
  confirmar,
  acoes,
  indisponivel,
  filtrosDados,
  prepararImpressao = false,
}: {
  config: GraficoBi;
  filtros: FiltrosBi;
  linhas: LinhaBi[];
  calcular: CalcularBi;
  onFiltrar: (config: GraficoBi, p: PontoBi) => void;
  onAprofundar?: (config: GraficoBi) => void;
  confirmar: ConfirmarExportacaoBi;
  acoes?: React.ReactNode;
  indisponivel?: string;
  filtrosDados?: FiltrosBi;
  prepararImpressao?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visivel, setVisivel] = useState(false);
  const ativado = visivel || prepararImpressao;
  const consulta = useMemo(() => ({ config, filtros, linhas }), [config, filtros, linhas]);
  const [resultado, setResultado] = useState<{
    consulta: typeof consulta;
    pontos: PontoBi[];
    erro: string;
  } | null>(null);
  const pontos = resultado?.consulta === consulta ? resultado.pontos : PONTOS_VAZIOS;
  const erro = resultado?.consulta === consulta ? resultado.erro : "";
  const calculando = !ativado || resultado?.consulta !== consulta;
  const [detalhes, setDetalhes] = useState(config.tipo === "tabela");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("valor");
  const [desc, setDesc] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [completos, setCompletos] = useState(false);
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    if (!("IntersectionObserver" in window)) {
      const frame = requestAnimationFrame(() => setVisivel(true));
      return () => cancelAnimationFrame(frame);
    }
    const o = new IntersectionObserver(
      (e) => {
        if (e.some((e) => e.isIntersecting)) {
          setVisivel(true);
          o.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    o.observe(elemento);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    if (!ativado || indisponivel) return;
    let ativo = true;
    void calcular(consulta.config, consulta.filtros)
      .then((pontos) => {
        if (ativo) setResultado({ consulta, pontos, erro: "" });
      })
      .catch(() => {
        if (ativo)
          setResultado({
            consulta,
            pontos: [],
            erro: "Não foi possível calcular. Atualize os dados ou ajuste a análise.",
          });
      });
    return () => {
      ativo = false;
    };
  }, [consulta, calcular, ativado, indisponivel]);
  const linhasBase = useMemo(() => {
    const base: Record<string, unknown>[] = completos
      ? filtrarBi(linhas, filtrosDados ?? filtros)
      : pontos.map((p) => ({
          Grupo: p.nome,
          Referencia: p.referencia,
          Subgrupo: p.grupo,
          ReferenciaGrupo: p.grupoReferencia,
          Valor: p.valor,
          Registros: p.registros,
          Alunos: p.alunos,
        }));
    return base;
  }, [pontos, linhas, filtros, filtrosDados, completos]);
  const linhasTabela = useMemo(() => {
    const chave = ordem === "valor" ? "Valor" : ordem;
    return linhasBase
      .filter((l) =>
        Object.values(l).some((v) => textoBi(v).toLowerCase().includes(busca.toLowerCase())),
      )
      .sort((a, b) => {
        const x = a[chave],
          y = b[chave];
        const n =
          typeof x === "number" && typeof y === "number"
            ? x - y
            : textoBi(x).localeCompare(textoBi(y), "pt-BR", { numeric: true });
        return desc ? -n : n;
      });
  }, [linhasBase, ordem, desc, busca]);
  const colunas = useMemo(
    () => [...new Set(linhasBase.flatMap((l) => Object.keys(l)))],
    [linhasBase],
  );
  const formatar = (v: number | null) => formatarValorBi(v, config.medida);
  const atual = paginaTabelaBi(pagina, linhasTabela.length);
  const podeFiltrar = ["serie", "turma", "aluno", "justificativa", "tipo", "turno", "dia"].includes(
    config.dimensao,
  );
  const pontosRotulados = useMemo(() => rotularPontosBi(pontos), [pontos]);
  const valor = pontos.length === 1 ? (pontos[0]?.valor ?? null) : null;
  return (
    <article
      ref={ref}
      className="superficie-vidro flex h-full min-w-0 flex-col gap-3 p-4"
      data-grafico-id={config.id}
      data-bi-carregando={!indisponivel && calculando ? "true" : undefined}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{config.titulo}</h3>
          <p className="text-muted-foreground text-xs">{NOMES_MEDIDAS[config.medida]}</p>
        </div>
        {acoes}
      </header>
      {indisponivel ? (
        <p role="note" className="text-muted-foreground py-10 text-center text-sm">
          {indisponivel}
        </p>
      ) : erro ? (
        <p role="alert" className="text-falta-texto text-sm">
          {erro}
        </p>
      ) : calculando ? (
        <div role="status" className="flex min-h-40 items-center justify-center">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          <span className="sr-only">Calculando análise</span>
        </div>
      ) : !pontos.length ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Sem registros neste recorte.
        </p>
      ) : (
        <>
          {config.tipo === "indicador" ? (
            <div className="flex min-h-36 flex-col justify-center gap-2">
              {pontos.slice(0, 12).map((p) => (
                <div
                  key={`${p.referencia}:${p.nome}:${p.grupo}`}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="text-muted-foreground text-sm">{p.nome}</span>
                  <strong
                    className="text-2xl tabular-nums"
                    style={{ color: CORES_BI[config.paleta][0] }}
                  >
                    {formatar(p.valor)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            config.tipo !== "tabela" && (
              <div
                className={`min-h-40 flex-1 ${config.tipo === "calor" ? "print:h-auto!" : ""}`}
                style={{ height: Math.max(160, config.altura - 150) }}
              >
                <LimiteGrafico>
                  <VistaGrafico
                    config={config}
                    pontos={pontos}
                    onFiltrar={(p) => onFiltrar(config, p)}
                  />
                </LimiteGrafico>
              </div>
            )
          )}
          {config.meta !== null && (
            <p className="text-muted-foreground text-xs">
              Referência: {formatar(config.meta)}
              {metaBi(valor, config.meta) === null
                ? ""
                : metaBi(valor, config.meta)
                  ? " | No limiar ou acima"
                  : " | Abaixo do limiar"}
              {pontos.length > 1 &&
                ` | ${pontos.filter((p) => metaBi(p.valor, config.meta)).length} grupos no limiar ou acima`}
            </p>
          )}
          {pontos.length > (config.tipo === "indicador" ? 12 : 100) &&
            !["tabela", "calor", "agrupadas"].includes(config.tipo) && (
              <p className="text-muted-foreground text-xs">
                Exibidos os primeiros {config.tipo === "indicador" ? 12 : 100} grupos. A tabela e o
                CSV incluem todos.
              </p>
            )}
          {config.tipo === "agrupadas" &&
            new Set(pontos.map((p) => p.grupoReferencia)).size > 12 && (
              <p className="text-muted-foreground text-xs">
                Exibidos até 12 subgrupos. A tabela e o CSV incluem todos.
              </p>
            )}
          <div className="flex flex-wrap gap-1 print:hidden">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDetalhes(!detalhes)}
              aria-expanded={detalhes || config.tipo === "tabela"}
            >
              <ChevronDown size={15} />
              Tabela
            </Button>
            {onAprofundar && ["serie", "turma"].includes(config.dimensao) && (
              <Button size="sm" variant="ghost" onClick={() => onAprofundar(config)}>
                Aprofundar
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Exportar CSV de ${config.titulo}`}
              onClick={() =>
                confirmar(() =>
                  baixarBi(
                    new Blob([csvBi(linhasTabela)], { type: "text/csv;charset=utf-8" }),
                    "frequencibi-tabela.csv",
                  ),
                )
              }
            >
              <Download size={15} />
              CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Exportar PNG de ${config.titulo}`}
              onClick={() =>
                confirmar(async () => {
                  if (ref.current)
                    baixarBi(
                      await pngBi(
                        ref.current,
                        config.titulo,
                        pontosRotulados.map(
                          (p) => `${p.nome}${p.grupo ? ` | ${p.grupo}` : ""}: ${formatar(p.valor)}`,
                        ),
                        {
                          contexto: `${NOMES_MEDIDAS[config.medida]} | ${filtros.inicio} a ${filtros.fim}`,
                          legenda:
                            config.mostrarLegenda && ["rosca", "agrupadas"].includes(config.tipo)
                              ? (config.tipo === "rosca"
                                  ? pontosRotulados
                                      .slice(0, 100)
                                      .filter((p) => p.valor !== null)
                                      .map((p) => p.nome)
                                  : [...new Set(pontosRotulados.map((p) => p.grupo))].slice(0, 12)
                                ).map((nome, i) => ({
                                  nome,
                                  cor:
                                    CORES_BI[config.paleta][i % CORES_BI[config.paleta].length] ??
                                    CORES_BI[config.paleta][0],
                                }))
                              : [],
                        },
                      ),
                      "frequencibi-grafico.png",
                    );
                })
              }
            >
              <ImageDown size={15} />
              PNG
            </Button>
          </div>
          {(detalhes || config.tipo === "tabela") && (
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-2 print:hidden">
                <Input
                  aria-label={`Buscar na tabela de ${config.titulo}`}
                  placeholder="Buscar na tabela"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(0);
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCompletos(!completos);
                    setPagina(0);
                    setOrdem("valor");
                  }}
                >
                  {completos ? "Ver agregados" : "Ver registros"}
                </Button>
              </div>
              {linhasTabela.length === 0 && (
                <p role="note" aria-live="polite" className="text-muted-foreground p-4 text-sm">
                  Nenhum registro corresponde à busca.
                </p>
              )}
              <div
                className="max-h-96 overflow-auto print:max-h-none print:overflow-visible"
                role="region"
                aria-label={`Tabela de ${config.titulo}`}
                tabIndex={0}
              >
                <table className="w-full text-left text-xs print:table-fixed">
                  <caption className="sr-only">Dados de {config.titulo}</caption>
                  <thead>
                    <tr>
                      {colunas.map((c) => (
                        <th
                          key={c}
                          scope="col"
                          aria-sort={
                            (ordem === "valor" ? "Valor" : ordem) === c
                              ? desc
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                          className="bg-background sticky top-0 p-2 print:static print:wrap-anywhere"
                        >
                          <button
                            className="min-h-11"
                            onClick={() => {
                              setOrdem(c);
                              setDesc(ordem === c ? !desc : false);
                              setPagina(0);
                            }}
                            aria-label={`Ordenar por ${c}`}
                          >
                            {c}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasTabela.slice(atual * 50, (atual + 1) * 50).map((l, i) => (
                      <tr key={i} className="border-border border-b">
                        {colunas.map((c) => (
                          <td key={c} className="max-w-80 p-2 break-words print:wrap-anywhere">
                            {!completos && c === "Grupo" && podeFiltrar ? (
                              <button
                                className="text-primary min-h-11 text-left underline-offset-4 hover:underline"
                                aria-label={`Filtrar: ${textoBi(l[c])}`}
                                onClick={() => {
                                  const ponto = pontos.find(
                                    (p) =>
                                      p.referencia === l.Referencia &&
                                      p.grupoReferencia === l.ReferenciaGrupo,
                                  );
                                  if (ponto) onFiltrar(config, ponto);
                                }}
                              >
                                {textoBi(l[c])}
                              </button>
                            ) : !completos && c === "Valor" ? (
                              formatar(typeof l[c] === "number" ? l[c] : null)
                            ) : (
                              textoBi(l[c])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 hidden text-xs print:block">
                Página {atual + 1} de {Math.max(1, Math.ceil(linhasTabela.length / 50))}. Exibidos{" "}
                {Math.min(50, Math.max(0, linhasTabela.length - atual * 50))} de{" "}
                {linhasTabela.length} registros.
                {linhasTabela.length > 50 && " O CSV inclui todos os registros filtrados."}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 print:hidden">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!atual}
                  onClick={() => setPagina(atual - 1)}
                >
                  Anterior
                </Button>
                <span className="text-muted-foreground text-xs">
                  {linhasTabela.length} registros | {atual + 1}/
                  {Math.max(1, Math.ceil(linhasTabela.length / 50))}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={(atual + 1) * 50 >= linhasTabela.length}
                  onClick={() => setPagina(atual + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {config.anotacao && (
        <p className="text-muted-foreground border-border border-t pt-2 text-xs whitespace-pre-wrap">
          {config.anotacao}
        </p>
      )}
    </article>
  );
}
