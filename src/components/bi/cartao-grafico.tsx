"use client";

// Cartão de análise com tabela ordenável, meta local, exportações confirmadas e aprofundamento.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { Botao } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Cartao } from "@/components/ui/mui/cartao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
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
    <Box
      role="status"
      data-bi-modulo-carregando
      sx={{ display: "flex", alignItems: "center", gap: 1 }}
    >
      <CircularProgress size={16} />
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Preparando gráfico...
      </Typography>
    </Box>
  ),
});
const PONTOS_VAZIOS: PontoBi[] = [];
const APENAS_LEITOR = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
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
  const ref = useRef<HTMLDivElement>(null);
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
  const corIndicador = CORES_BI[config.paleta][0] ?? "#37ad84";
  return (
    <Box
      ref={ref}
      component="article"
      data-grafico-id={config.id}
      data-bi-carregando={!indisponivel && calculando ? "true" : undefined}
      sx={{ display: "flex", minWidth: 0, height: "100%" }}
    >
      <Cartao
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flex: 1,
          minWidth: 0,
          "@media print": { breakInside: "avoid", boxShadow: "none" },
        }}
      >
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ alignItems: "flex-start", justifyContent: "space-between", minWidth: 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="h3"
              variant="subtitle1"
              sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
            >
              {config.titulo}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {NOMES_MEDIDAS[config.medida]}
            </Typography>
          </Box>
          {acoes ? <Box data-acoes-grafico>{acoes}</Box> : null}
        </Stack>
        {indisponivel ? (
          <Typography
            role="note"
            variant="body2"
            sx={{ py: 5, textAlign: "center", color: "text.secondary" }}
          >
            {indisponivel}
          </Typography>
        ) : erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : calculando ? (
          <Box
            role="status"
            sx={{
              display: "flex",
              minHeight: 160,
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
            }}
          >
            <CircularProgress size={24} aria-hidden="true" />
            <Typography component="span" sx={APENAS_LEITOR}>
              Calculando análise
            </Typography>
          </Box>
        ) : !pontos.length ? (
          <Typography variant="body2" sx={{ py: 5, textAlign: "center", color: "text.secondary" }}>
            Sem registros neste recorte.
          </Typography>
        ) : (
          <>
            {config.tipo === "indicador" ? (
              <Stack spacing={1} sx={{ minHeight: 144, justifyContent: "center" }}>
                {pontos.slice(0, 12).map((p) => (
                  <Stack
                    key={`${p.referencia}:${p.nome}:${p.grupo}`}
                    direction="row"
                    useFlexGap
                    spacing={1}
                    sx={{ alignItems: "center", justifyContent: "space-between" }}
                  >
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {p.nome}
                    </Typography>
                    <Typography
                      component="strong"
                      variant="h5"
                      sx={{ color: corIndicador, fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatar(p.valor)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : (
              config.tipo !== "tabela" && (
                <Box
                  sx={{
                    minHeight: 160,
                    flex: 1,
                    height: Math.max(160, config.altura - 150),
                    "@media print": { height: "auto !important" },
                  }}
                >
                  <LimiteGrafico>
                    <VistaGrafico
                      config={config}
                      pontos={pontos}
                      onFiltrar={(p) => onFiltrar(config, p)}
                    />
                  </LimiteGrafico>
                </Box>
              )
            )}
            {config.meta !== null && (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Referência: {formatar(config.meta)}
                {metaBi(valor, config.meta) === null
                  ? ""
                  : metaBi(valor, config.meta)
                    ? " | No limiar ou acima"
                    : " | Abaixo do limiar"}
                {pontos.length > 1 &&
                  ` | ${pontos.filter((p) => metaBi(p.valor, config.meta)).length} grupos no limiar ou acima`}
              </Typography>
            )}
            {pontos.length > (config.tipo === "indicador" ? 12 : 100) &&
              !["tabela", "calor", "agrupadas"].includes(config.tipo) && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Exibidos os primeiros {config.tipo === "indicador" ? 12 : 100} grupos. A tabela e
                  o CSV incluem todos.
                </Typography>
              )}
            {config.tipo === "agrupadas" &&
              new Set(pontos.map((p) => p.grupoReferencia)).size > 12 && (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Exibidos até 12 subgrupos. A tabela e o CSV incluem todos.
                </Typography>
              )}
            <Stack
              direction="row"
              useFlexGap
              spacing={1}
              data-acoes-grafico
              sx={{ flexWrap: "wrap", "@media print": { display: "none" } }}
            >
              <Botao
                variante="secundario"
                tamanho="pequeno"
                sx={{ height: 48 }}
                icone={<ExpandMoreRoundedIcon />}
                onClick={() => setDetalhes(!detalhes)}
                aria-expanded={detalhes || config.tipo === "tabela"}
              >
                Tabela
              </Botao>
              {onAprofundar && ["serie", "turma"].includes(config.dimensao) && (
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  sx={{ height: 48 }}
                  onClick={() => onAprofundar(config)}
                >
                  Aprofundar
                </Botao>
              )}
              <Botao
                variante="secundario"
                tamanho="pequeno"
                sx={{ height: 48 }}
                aria-label={`Exportar CSV de ${config.titulo}`}
                icone={<DownloadRoundedIcon />}
                onClick={() =>
                  confirmar(() =>
                    baixarBi(
                      new Blob([csvBi(linhasTabela)], { type: "text/csv;charset=utf-8" }),
                      "frequencibi-tabela.csv",
                    ),
                  )
                }
              >
                CSV
              </Botao>
              <Botao
                variante="secundario"
                tamanho="pequeno"
                sx={{ height: 48 }}
                aria-label={`Exportar PNG de ${config.titulo}`}
                icone={<ImageRoundedIcon />}
                onClick={() =>
                  confirmar(async () => {
                    if (ref.current)
                      baixarBi(
                        await pngBi(
                          ref.current,
                          config.titulo,
                          pontosRotulados.map(
                            (p) =>
                              `${p.nome}${p.grupo ? ` | ${p.grupo}` : ""}: ${formatar(p.valor)}`,
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
                PNG
              </Botao>
            </Stack>
            {(detalhes || config.tipo === "tabela") && (
              <Box sx={{ minWidth: 0 }}>
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  data-acoes-grafico
                  sx={{ mb: 1, flexWrap: "wrap", "@media print": { display: "none" } }}
                >
                  <BarraBusca
                    id={`${config.id}-busca`}
                    valor={busca}
                    onValor={(valor) => {
                      setBusca(valor);
                      setPagina(0);
                    }}
                    placeholder="Buscar na tabela"
                    rotulo={`Buscar na tabela de ${config.titulo}`}
                    sx={{ width: { xs: "100%", sm: 360 } }}
                  />
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    sx={{ height: 48 }}
                    onClick={() => {
                      setCompletos(!completos);
                      setPagina(0);
                      setOrdem("valor");
                    }}
                  >
                    {completos ? "Ver agregados" : "Ver registros"}
                  </Botao>
                </Stack>
                {linhasTabela.length === 0 && (
                  <Typography
                    role="note"
                    aria-live="polite"
                    variant="body2"
                    sx={{ p: 2, color: "text.secondary" }}
                  >
                    Nenhum registro corresponde à busca.
                  </Typography>
                )}
                <Box
                  role="region"
                  aria-label={`Tabela de ${config.titulo}`}
                  tabIndex={0}
                  sx={{
                    maxHeight: 384,
                    overflow: "auto",
                    "@media print": { maxHeight: "none", overflow: "visible" },
                  }}
                >
                  <Table
                    size="small"
                    sx={{
                      width: "100%",
                      "& .MuiTableCell-root": { p: 1, fontSize: "0.75rem" },
                      "@media print": { tableLayout: "fixed" },
                    }}
                  >
                    <Box component="caption" sx={APENAS_LEITOR}>
                      Dados de {config.titulo}
                    </Box>
                    <TableHead>
                      <TableRow>
                        {colunas.map((c) => (
                          <TableCell
                            key={c}
                            component="th"
                            scope="col"
                            aria-sort={
                              (ordem === "valor" ? "Valor" : ordem) === c
                                ? desc
                                  ? "descending"
                                  : "ascending"
                                : "none"
                            }
                            sx={{
                              position: "sticky",
                              top: 0,
                              zIndex: 1,
                              backgroundColor: "background.paper",
                              "@media print": { position: "static" },
                            }}
                          >
                            <Botao
                              variante="texto"
                              tamanho="pequeno"
                              aria-label={`Ordenar por ${c}`}
                              onClick={() => {
                                setOrdem(c);
                                setDesc(ordem === c ? !desc : false);
                                setPagina(0);
                              }}
                              sx={{
                                minHeight: 44,
                                height: "auto",
                                p: 0,
                                justifyContent: "flex-start",
                                fontWeight: 600,
                                color: "text.primary",
                              }}
                            >
                              {c}
                            </Botao>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {linhasTabela.slice(atual * 50, (atual + 1) * 50).map((l, i) => (
                        <TableRow key={i}>
                          {colunas.map((c) => (
                            <TableCell key={c} sx={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                              {!completos && c === "Grupo" && podeFiltrar ? (
                                <Botao
                                  variante="texto"
                                  tamanho="pequeno"
                                  aria-label={`Filtrar: ${textoBi(l[c])}`}
                                  onClick={() => {
                                    const ponto = pontos.find(
                                      (p) =>
                                        p.referencia === l.Referencia &&
                                        p.grupoReferencia === l.ReferenciaGrupo,
                                    );
                                    if (ponto) onFiltrar(config, ponto);
                                  }}
                                  sx={{
                                    minHeight: 44,
                                    height: "auto",
                                    p: 0,
                                    justifyContent: "flex-start",
                                    textAlign: "left",
                                    fontWeight: 400,
                                  }}
                                >
                                  {textoBi(l[c])}
                                </Botao>
                              ) : !completos && c === "Valor" ? (
                                formatar(typeof l[c] === "number" ? l[c] : null)
                              ) : (
                                textoBi(l[c])
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ display: "none", mt: 1, "@media print": { display: "block" } }}
                >
                  Página {atual + 1} de {Math.max(1, Math.ceil(linhasTabela.length / 50))}. Exibidos{" "}
                  {Math.min(50, Math.max(0, linhasTabela.length - atual * 50))} de{" "}
                  {linhasTabela.length} registros.
                  {linhasTabela.length > 50 && " O CSV inclui todos os registros filtrados."}
                </Typography>
                <Stack
                  direction="row"
                  data-acoes-grafico
                  sx={{
                    mt: 1,
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                    "@media print": { display: "none" },
                  }}
                >
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    sx={{ height: 48 }}
                    disabled={!atual}
                    onClick={() => setPagina(atual - 1)}
                  >
                    Anterior
                  </Botao>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {linhasTabela.length} registros | {atual + 1}/
                    {Math.max(1, Math.ceil(linhasTabela.length / 50))}
                  </Typography>
                  <Botao
                    variante="secundario"
                    tamanho="pequeno"
                    sx={{ height: 48 }}
                    disabled={(atual + 1) * 50 >= linhasTabela.length}
                    onClick={() => setPagina(atual + 1)}
                  >
                    Próxima
                  </Botao>
                </Stack>
              </Box>
            )}
          </>
        )}
        {config.anotacao && (
          <Typography
            variant="caption"
            sx={{
              borderTop: 1,
              borderColor: "divider",
              pt: 1,
              color: "text.secondary",
              whiteSpace: "pre-wrap",
            }}
          >
            {config.anotacao}
          </Typography>
        )}
      </Cartao>
    </Box>
  );
}
