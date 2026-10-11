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
import { LimiteGrafico } from "./limite-grafico";
const VistaGrafico = dynamic(() => import("./vista-grafico"), {
  ssr: false,
  loading: () => <span className="text-muted-foreground text-sm">Preparando gráfico...</span>,
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
}: {
  config: GraficoBi;
  filtros: FiltrosBi;
  linhas: LinhaBi[];
  calcular: CalcularBi;
  onFiltrar: (config: GraficoBi, p: PontoBi) => void;
  onAprofundar?: (config: GraficoBi) => void;
  confirmar: ConfirmarExportacaoBi;
  acoes?: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visivel, setVisivel] = useState(false);
  const consulta = useMemo(() => ({ config, filtros, linhas }), [config, filtros, linhas]);
  const [resultado, setResultado] = useState<{
    consulta: typeof consulta;
    pontos: PontoBi[];
    erro: string;
  } | null>(null);
  const pontos = resultado?.consulta === consulta ? resultado.pontos : PONTOS_VAZIOS;
  const erro = resultado?.consulta === consulta ? resultado.erro : "";
  const calculando = !visivel || resultado?.consulta !== consulta;
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
    if (!visivel) return;
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
  }, [consulta, calcular, visivel]);
  const linhasTabela = useMemo(() => {
    const base: Record<string, unknown>[] = completos
      ? filtrarBi(linhas, filtros)
      : pontos.map((p) => ({
          Grupo: p.nome,
          Referencia: p.referencia,
          Subgrupo: p.grupo,
          ReferenciaGrupo: p.grupoReferencia,
          Valor: p.valor,
          Registros: p.registros,
          Alunos: p.alunos,
        }));
    const chave = ordem === "valor" ? "Valor" : ordem;
    return base
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
  }, [pontos, linhas, filtros, completos, ordem, desc, busca]);
  const colunas = useMemo(
    () => [...new Set(linhasTabela.flatMap((l) => Object.keys(l)))],
    [linhasTabela],
  );
  const percentual = ["infrequencia", "taxaPresenca", "taxaSeduc"].includes(config.medida);
  const formatar = (v: number | null) =>
    v === null
      ? "Sem base de cálculo"
      : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${percentual ? "%" : ""}`;
  const valor = pontos.length === 1 ? (pontos[0]?.valor ?? null) : null;
  return (
    <article
      ref={ref}
      className="superficie-vidro flex h-full min-w-0 flex-col gap-3 p-4"
      data-grafico-id={config.id}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold break-words">{config.titulo}</h3>
          <p className="text-muted-foreground text-xs">{NOMES_MEDIDAS[config.medida]}</p>
        </div>
        {acoes}
      </header>
      {erro ? (
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
                  <strong className="text-2xl tabular-nums">{formatar(p.valor)}</strong>
                </div>
              ))}
            </div>
          ) : (
            config.tipo !== "tabela" && (
              <div
                className="min-h-40 flex-1"
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
          {pontos.length > 100 && (
            <p className="text-muted-foreground text-xs">
              Gráfico limitado aos primeiros 100 grupos. A tabela e o CSV incluem todos.
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
                        pontos.map((p) => `${p.nome}: ${formatar(p.valor)}`),
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
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Dados de {config.titulo}</caption>
                  <thead>
                    <tr>
                      {colunas.map((c) => (
                        <th key={c} scope="col" className="bg-background sticky top-0 p-2">
                          <button
                            className="min-h-11"
                            onClick={() => {
                              setOrdem(c);
                              setDesc(!desc);
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
                    {linhasTabela.slice(pagina * 50, (pagina + 1) * 50).map((l, i) => (
                      <tr key={i} className="border-border border-b">
                        {colunas.map((c) => (
                          <td key={c} className="max-w-80 p-2 break-words">
                            {textoBi(l[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 print:hidden">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!pagina}
                  onClick={() => setPagina(pagina - 1)}
                >
                  Anterior
                </Button>
                <span className="text-muted-foreground text-xs">
                  {linhasTabela.length} registros | {pagina + 1}/
                  {Math.max(1, Math.ceil(linhasTabela.length / 50))}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={(pagina + 1) * 50 >= linhasTabela.length}
                  onClick={() => setPagina(pagina + 1)}
                >
                  Próxima
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 print:hidden">
                {pontos.slice(0, 20).map((p) => (
                  <Button
                    key={`${p.referencia}:${p.nome}:${p.grupo}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => onFiltrar(config, p)}
                  >
                    Filtrar: {p.nome}
                  </Button>
                ))}
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
