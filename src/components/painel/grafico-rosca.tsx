"use client";

// Rosca de distribuição de faltas em MUI X, com legenda acessível e total no centro.
import { useId } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { PieChart } from "@mui/x-charts/PieChart";
import { CirculoValor } from "@/components/ui/mui/circulo-contagem";
import { ItemLegendaGrafico } from "@/components/ui/mui/item-legenda-grafico";
import { CORES_CATEGORIAS, coresGrafico } from "@/theme/paleta";
import { numeraisTabulares } from "@/theme/tipografia";

export interface FatiaGrafico {
  /** Identidade da série ou turma, independente do rótulo e da seleção. */
  categoriaId?: string;
  nome: string;
  valor: number;
  detalhe?: string;
  unidadeSingular?: string;
  unidadePlural?: string;
}

const TAMANHO_GRAFICO = 176;
const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const TEXTO_OCULTO = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function variaveisCategorias(modo: "claro" | "escuro") {
  return Object.fromEntries(
    CORES_CATEGORIAS.map((cores, i) => [`--rosca-categoria-${i}`, cores[modo]]),
  );
}

function indicesDasCategorias(categorias: readonly string[], fatias: FatiaGrafico[]) {
  const ids = new Set(categorias);
  for (const { categoriaId } of fatias) {
    if (categoriaId !== undefined) ids.add(categoriaId);
  }
  return new Map([...ids].sort().map((id, indice) => [id, indice]));
}

function LegendaCategorias({
  titulo,
  fatias,
  total,
}: {
  titulo: string;
  fatias: (FatiaGrafico & { cor: string; marcador?: string })[];
  total: number;
}) {
  return (
    <TabelaPadrao caption={`Legenda de ${titulo}`} compacta>
      <TableHead>
        <TableRow>
          <TableCell>Categoria</TableCell>
          <TableCell align="right" sx={{ width: "4em" }}>
            Qtd.
          </TableCell>
          <TableCell align="right" sx={{ width: "6em" }}>
            % do total
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {fatias.map((fatia) => (
          <TableRow key={fatia.categoriaId ?? fatia.nome}>
            <TableCell component="th" scope="row">
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0 }}>
                <Box
                  component="span"
                  aria-hidden="true"
                  style={{ backgroundColor: fatia.cor }}
                  sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  {fatia.marcador ? `${fatia.marcador} · ` : ""}
                  {fatia.nome}
                  {fatia.detalhe && (
                    <Typography component="div" variant="caption" color="text.secondary">
                      {fatia.detalhe}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </TableCell>
            <TableCell align="right" sx={{ ...numeraisTabulares, fontWeight: 600 }}>
              {fatia.valor}
            </TableCell>
            <TableCell align="right" sx={{ ...numeraisTabulares, color: "text.secondary" }}>
              {percentual.format(fatia.valor / total)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </TabelaPadrao>
  );
}

interface Props {
  titulo: string;
  fatias: FatiaGrafico[];
  /** Cadastro completo deste recorte, inclusive categorias sem faltas. */
  categorias?: readonly string[];
  rotuloTotal?: string;
  unidadeSingular?: string;
  unidadePlural?: string;
  vazio?: string;
  tomValores?: "neutro" | "falta";
}

export default function GraficoRosca({
  titulo,
  fatias,
  categorias = [],
  rotuloTotal = "faltas",
  unidadeSingular = "falta",
  unidadePlural = "faltas",
  vazio = "Nenhuma falta registrada",
  tomValores = "neutro",
}: Props) {
  const descricaoId = useId();
  const tema = useTheme();
  const cores = coresGrafico(tema);
  const indices = indicesDasCategorias(categorias, fatias);
  const porCategoria = indices.size > 0;
  const usaMarcadores = indices.size > CORES_CATEGORIAS.length;
  const visiveis = fatias
    .filter((fatia) => fatia.valor > 0)
    .map((fatia, indice) => {
      const indiceCategoria =
        fatia.categoriaId === undefined ? undefined : indices.get(fatia.categoriaId);
      return {
        ...fatia,
        cor:
          indiceCategoria === undefined
            ? (cores[indice % cores.length] ?? tema.vars.palette.primary.main)
            : `var(--rosca-categoria-${indiceCategoria % CORES_CATEGORIAS.length})`,
        marcador:
          usaMarcadores && indiceCategoria !== undefined ? String(indiceCategoria + 1) : undefined,
      };
    });
  const marcadores = new Map(visiveis.map((fatia) => [fatia.categoriaId, fatia.marcador]));
  const total = visiveis.reduce((soma, fatia) => soma + fatia.valor, 0);
  const rotuloFatia = (fatia: FatiaGrafico) =>
    `${fatia.valor} ${fatia.valor === 1 ? (fatia.unidadeSingular ?? unidadeSingular) : (fatia.unidadePlural ?? unidadePlural)}`;
  const descricao = `${titulo}: ${visiveis
    .map((fatia) => `${fatia.nome}, ${rotuloFatia(fatia)}`)
    .join("; ")}. Total: ${total} ${rotuloTotal}.`;

  if (total === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          minHeight: 160,
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: 2,
          textAlign: "center",
          border: 1,
          borderStyle: "dashed",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {vazio}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2.5}
      sx={(theme) => ({
        alignItems: "center",
        minWidth: 0,
        ...(porCategoria && {
          ...variaveisCategorias("claro"),
          ...theme.applyStyles("dark", variaveisCategorias("escuro")),
        }),
      })}
    >
      <Box
        role="img"
        tabIndex={0}
        aria-label={titulo}
        aria-describedby={descricaoId}
        data-grafico={titulo}
        sx={{
          position: "relative",
          width: TAMANHO_GRAFICO,
          height: TAMANHO_GRAFICO,
          flexShrink: 0,
        }}
      >
        <PieChart
          series={[
            {
              data: visiveis.map((fatia) => ({
                id: fatia.categoriaId ?? fatia.nome,
                value: fatia.valor,
                label: fatia.nome,
                color: fatia.cor,
              })),
              innerRadius: "62%",
              outerRadius: "96%",
              paddingAngle: 2,
              ...(usaMarcadores && {
                arcLabel: (fatia: { id?: string | number }) =>
                  marcadores.get(String(fatia.id)) ?? "",
                arcLabelMinAngle: 12,
              }),
              valueFormatter: (_valor, contexto) => {
                const fatia = visiveis[contexto.dataIndex];
                return fatia ? rotuloFatia(fatia) : "";
              },
            },
          ]}
          width={TAMANHO_GRAFICO}
          height={TAMANHO_GRAFICO}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          sx={
            usaMarcadores
              ? {
                  "& .MuiPieArcLabel-root": {
                    fill: "background.paper",
                    stroke: "text.primary",
                    strokeWidth: 2,
                    paintOrder: "stroke",
                    fontWeight: 700,
                  },
                }
              : undefined
          }
          hideLegend
          skipAnimation
          slotProps={{ tooltip: { trigger: "item" } }}
          title={titulo}
          desc={descricao}
        />
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: "24%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: "50%",
            backgroundColor: "background.paper",
            pointerEvents: "none",
          }}
        >
          <Typography
            component="strong"
            variant="h5"
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {total}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {rotuloTotal}
          </Typography>
        </Box>
      </Box>
      <Typography id={descricaoId} sx={TEXTO_OCULTO}>
        {descricao}
      </Typography>
      {porCategoria ? (
        <Box sx={{ width: "100%", flex: 1, minWidth: 0 }}>
          <LegendaCategorias titulo={titulo} fatias={visiveis} total={total} />
        </Box>
      ) : (
        <Stack
          component="ul"
          spacing={0.75}
          aria-label={`Legenda de ${titulo}`}
          sx={{ width: "100%", minWidth: 0, flex: 1, m: 0, p: 0, listStyle: "none" }}
        >
          {visiveis.map((fatia) => (
            <ItemLegendaGrafico
              key={fatia.nome}
              cor={fatia.cor}
              nome={fatia.nome}
              detalhe={fatia.detalhe}
            >
              <CirculoValor
                texto={String(fatia.valor)}
                rotulo={rotuloFatia(fatia)}
                tom={tomValores}
              />
              <CirculoValor
                texto={percentual.format(fatia.valor / total)}
                rotulo={`${percentual.format(fatia.valor / total)} do total`}
                tom={tomValores}
              />
            </ItemLegendaGrafico>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
