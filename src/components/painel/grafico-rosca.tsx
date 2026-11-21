"use client";

// Rosca de distribuição de faltas em MUI X, com legenda acessível e total no centro.
import { useId } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
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
  alunos?: number;
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

function corDaCategoria(id: string): string {
  // FNV-1a: o mesmo identificador conserva a cor em qualquer ordem ou recorte.
  let hash = 2166136261;
  for (const caractere of id) hash = Math.imul(hash ^ (caractere.codePointAt(0) ?? 0), 16777619);
  return `var(--rosca-categoria-${(hash >>> 0) % CORES_CATEGORIAS.length})`;
}

function LegendaCategorias({
  titulo,
  fatias,
  total,
}: {
  titulo: string;
  fatias: (FatiaGrafico & { cor: string })[];
  total: number;
}) {
  return (
    <Table
      aria-label={`Legenda de ${titulo}`}
      size="small"
      sx={{
        tableLayout: "fixed",
        "& .MuiTableCell-root": { px: 0.5, whiteSpace: "normal", overflowWrap: "anywhere" },
        "& .MuiTableCell-head": { height: "auto", typography: "caption", fontWeight: 600 },
        "& .MuiTableRow-root:last-child .MuiTableCell-body": { borderBottom: 0 },
      }}
    >
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
    </Table>
  );
}

interface Props {
  titulo: string;
  fatias: FatiaGrafico[];
  rotuloTotal?: string;
  unidadeSingular?: string;
  unidadePlural?: string;
  vazio?: string;
  tomValores?: "neutro" | "falta";
}

export default function GraficoRosca({
  titulo,
  fatias,
  rotuloTotal = "faltas",
  unidadeSingular = "falta",
  unidadePlural = "faltas",
  vazio = "Nenhuma falta registrada",
  tomValores = "neutro",
}: Props) {
  const descricaoId = useId();
  const tema = useTheme();
  const cores = coresGrafico(tema);
  const porCategoria = fatias.some((fatia) => fatia.categoriaId !== undefined);
  const visiveis = fatias
    .filter((fatia) => fatia.valor > 0)
    .map((fatia, indice) => ({
      ...fatia,
      cor:
        fatia.categoriaId !== undefined
          ? corDaCategoria(fatia.categoriaId)
          : (cores[indice % cores.length] ?? tema.vars.palette.primary.main),
    }));
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
              valueFormatter: (_valor, contexto) => {
                const fatia = visiveis[contexto.dataIndex];
                return fatia ? rotuloFatia(fatia) : "";
              },
            },
          ]}
          width={TAMANHO_GRAFICO}
          height={TAMANHO_GRAFICO}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
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
              detalhe={
                fatia.alunos !== undefined ? (
                  <Box
                    component="span"
                    role="img"
                    aria-label={fatia.detalhe ?? `${fatia.alunos} alunos`}
                    title={fatia.detalhe ?? `${fatia.alunos} alunos`}
                    sx={{
                      display: "inline-block",
                      mt: 0.5,
                      px: 1,
                      py: 0.5,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                      backgroundColor: "action.hover",
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "0.75rem",
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span aria-hidden="true">{fatia.alunos} alunos</span>
                  </Box>
                ) : fatia.detalhe ? (
                  fatia.detalhe
                ) : null
              }
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
