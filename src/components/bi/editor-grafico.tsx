"use client";

// Construtor de análises com medidas e dimensões compatíveis, metas e anotações locais.
import { useId } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import {
  BASES_ANALISE,
  dimensoesRecursoBi,
  medidasRecursoBi,
  NOMES_DIMENSOES,
  NOMES_MEDIDAS,
  PALETAS_GRAFICO_BI,
  TIPOS_GRAFICO_BI,
  type GraficoBi,
} from "@/domain/bi-analise";
import { ROTULOS_RECURSOS_BI, type RecursoBi } from "@/domain/bi";
const TIPOS: Record<GraficoBi["tipo"], string> = {
  barras: "Barras",
  horizontal: "Barras horizontais",
  agrupadas: "Barras agrupadas",
  linha: "Linha",
  area: "Área",
  rosca: "Rosca",
  dispersao: "Dispersão",
  calor: "Mapa de calor",
  tabela: "Tabela detalhada",
  indicador: "Indicadores",
};
const PALETAS: Record<GraficoBi["paleta"], string> = {
  escola: "Padrão da escola",
  verde: "Verde",
  azul: "Azul",
  vermelho: "Vermelho",
  violeta: "Violeta",
};
export function EditorGraficoBi({
  config,
  onAlterar,
  recursos,
}: {
  config: GraficoBi;
  onAlterar: (g: GraficoBi) => void;
  recursos: RecursoBi[];
}) {
  const id = useId();
  const visual = !["tabela", "indicador"].includes(config.tipo);
  const largura = Math.round((config.largura / 12) * 100);
  const idCampo = (nome: string) =>
    `${id}-${nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")}`;
  const campo = (
    nome: string,
    value: string,
    opcoes: { valor: string; rotulo: string }[],
    alterar: (v: string) => void,
  ) => (
    <Grid size={{ xs: 12, sm: 6, lg: 4 }} sx={{ minWidth: 0 }}>
      <Campo id={idCampo(nome)} rotulo={nome}>
        <Selecionar valor={value} opcoes={opcoes} onValor={alterar} ariaLabel={nome} />
      </Campo>
    </Grid>
  );
  return (
    <Box
      component="section"
      aria-label="Construtor de gráficos"
      sx={{ "@media print": { display: "none" } }}
    >
      <SecaoConteudo>
        <Grid container spacing={2}>
          <Grid size={12}>
            <Campo
              id={`${id}-titulo`}
              rotulo="Título da análise"
              erro={!config.titulo.trim() ? "Informe um título para a análise." : undefined}
            >
              <CampoTexto
                valor={config.titulo}
                onValor={(valor) => onAlterar({ ...config, titulo: valor })}
                maxLength={100}
                erro={!config.titulo.trim() ? "Informe um título para a análise." : undefined}
              />
            </Campo>
          </Grid>
          {campo(
            "Base",
            config.recurso,
            BASES_ANALISE.filter((r) => recursos.includes(r)).map((r) => ({
              valor: r,
              rotulo: ROTULOS_RECURSOS_BI[r],
            })),
            (r) => {
              const recurso = r as GraficoBi["recurso"];
              const dimensoes = dimensoesRecursoBi(recurso);
              const medidas = medidasRecursoBi(recurso);
              const dimensao = dimensoes.includes(config.dimensao)
                ? config.dimensao
                : (dimensoes[0] ?? "dia");
              onAlterar({
                ...config,
                recurso,
                medida: medidas.includes(config.medida) ? config.medida : "registros",
                dimensao,
                segundaDimensao: dimensoes.includes(config.segundaDimensao)
                  ? config.segundaDimensao
                  : (dimensoes.find((d) => d !== dimensao) ?? dimensao),
              });
            },
          )}
          {campo(
            "Dimensão",
            config.dimensao,
            dimensoesRecursoBi(config.recurso).map((d) => ({
              valor: d,
              rotulo: NOMES_DIMENSOES[d],
            })),
            (d) => onAlterar({ ...config, dimensao: d as GraficoBi["dimensao"] }),
          )}
          {campo(
            "Medida",
            config.medida,
            medidasRecursoBi(config.recurso).map((m) => ({
              valor: m,
              rotulo: NOMES_MEDIDAS[m],
            })),
            (m) => onAlterar({ ...config, medida: m as GraficoBi["medida"] }),
          )}
          {campo(
            "Visualização",
            config.tipo,
            TIPOS_GRAFICO_BI.map((t) => ({ valor: t, rotulo: TIPOS[t] })),
            (t) =>
              onAlterar({
                ...config,
                tipo: t as GraficoBi["tipo"],
                segundaDimensao: dimensoesRecursoBi(config.recurso).includes(config.segundaDimensao)
                  ? config.segundaDimensao
                  : (dimensoesRecursoBi(config.recurso)[0] ?? "dia"),
              }),
          )}
          {["agrupadas", "calor"].includes(config.tipo) &&
            campo(
              "Segunda dimensão",
              config.segundaDimensao,
              dimensoesRecursoBi(config.recurso).map((d) => ({
                valor: d,
                rotulo: NOMES_DIMENSOES[d],
              })),
              (d) => onAlterar({ ...config, segundaDimensao: d as GraficoBi["dimensao"] }),
            )}
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Campo id={`${id}-meta`} rotulo="Meta ou limiar">
              <TextField
                id={`${id}-meta`}
                type="number"
                value={config.meta ?? ""}
                onChange={(e) =>
                  onAlterar({ ...config, meta: e.target.value ? Number(e.target.value) : null })
                }
                fullWidth
                slotProps={{ htmlInput: { step: "any" } }}
              />
            </Campo>
          </Grid>
        </Grid>
        <Acordeao titulo="Aparência e tamanho">
          <Grid container spacing={2}>
            {visual &&
              campo(
                "Paleta de cores",
                config.paleta,
                PALETAS_GRAFICO_BI.map((p) => ({ valor: p, rotulo: PALETAS[p] })),
                (p) => onAlterar({ ...config, paleta: p as GraficoBi["paleta"] }),
              )}
            {visual && (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Interruptor
                  checked={config.mostrarValores}
                  onChange={(mostrarValores) => onAlterar({ ...config, mostrarValores })}
                  rotulo="Mostrar valores"
                />
              </Grid>
            )}
            {["rosca", "agrupadas", "calor"].includes(config.tipo) && (
              <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                <Interruptor
                  checked={config.mostrarLegenda}
                  onChange={(mostrarLegenda) => onAlterar({ ...config, mostrarLegenda })}
                  rotulo="Mostrar legenda"
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", gap: 2, alignItems: "baseline" }}
              >
                <Typography component="span" variant="body2">
                  Largura no painel
                </Typography>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {largura}%
                </Typography>
              </Stack>
              <Slider
                min={3}
                max={12}
                step={1}
                value={config.largura}
                getAriaLabel={() => "Largura no painel"}
                getAriaValueText={() => `${largura}% da linha no desktop`}
                valueLabelDisplay="auto"
                aria-describedby={`${id}-largura-ajuda`}
                onChange={(_e, valor) => {
                  if (typeof valor === "number") onAlterar({ ...config, largura: valor });
                }}
              />
              <Typography
                id={`${id}-largura-ajuda`}
                variant="caption"
                sx={{ color: "text.secondary" }}
              >
                No celular, ocupa toda a largura.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack
                direction="row"
                sx={{ justifyContent: "space-between", gap: 2, alignItems: "baseline" }}
              >
                <Typography component="span" variant="body2">
                  Altura do gráfico
                </Typography>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {config.altura} px
                </Typography>
              </Stack>
              <Slider
                min={260}
                max={900}
                step={1}
                value={config.altura}
                getAriaLabel={() => "Altura do gráfico"}
                getAriaValueText={() => `${config.altura} pixels`}
                valueLabelDisplay="auto"
                onChange={(_e, valor) => {
                  if (typeof valor === "number") onAlterar({ ...config, altura: valor });
                }}
              />
            </Grid>
          </Grid>
        </Acordeao>
        <Acordeao titulo="Anotação local">
          <TextField
            value={config.anotacao}
            onChange={(e) => onAlterar({ ...config, anotacao: e.target.value })}
            multiline
            minRows={3}
            fullWidth
            slotProps={{ htmlInput: { "aria-label": "Anotação do gráfico", maxLength: 1000 } }}
          />
        </Acordeao>
      </SecaoConteudo>
    </Box>
  );
}
