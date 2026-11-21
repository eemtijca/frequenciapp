"use client";

// Gráfico personalizado de infrequência, com consulta explícita de período
// e filtros por série e turma, usando apenas chamadas salvas.
import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Aluno, Frequencia, Serie, Turma } from "@/domain/frequencia";
import { LIMITE_DIAS_PERIODO, rotuloData } from "@/domain/frequencia";
import { ausencias, distribuicaoDoPeriodo, infrequencia } from "@/domain/relatorios";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Alerta } from "@/components/ui/mui/alerta";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo, CartaoTitulo } from "@/components/ui/mui/cartao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { GraficoRosca } from "@/components/graficos/graficos-sob-demanda";

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
      parciais: soma.parciais + item.parciais,
    }),
    { esperados: 0, registrados: 0, presentes: 0, faltas: 0, justificadas: 0, parciais: 0 },
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
    <Cartao component="section" aria-label="Infrequência personalizada">
      <CartaoCabecalho>
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <CartaoTitulo>Infrequência por período</CartaoTitulo>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Compare as faltas das chamadas salvas no período e no recorte escolhidos.
          </Typography>
        </Stack>
      </CartaoCabecalho>
      <CartaoConteudo>
        <Box
          component="form"
          onSubmit={(evento) => {
            evento.preventDefault();
            void gerar();
          }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Campo id="periodo-painel-de" rotulo="Data inicial">
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
              </Campo>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Campo id="periodo-painel-ate" rotulo="Data final">
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
              </Campo>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Campo id="periodo-painel-serie" rotulo="Série">
                <Selecionar
                  id="periodo-painel-serie"
                  valor={serieId}
                  disabled={executando}
                  onValor={(valor) => {
                    setSerieId(valor);
                    setTurmaId("todas");
                    invalidar();
                  }}
                  opcoes={[
                    { valor: "todas", rotulo: "Todas as séries" },
                    ...series.map((item) => ({ valor: item.id, rotulo: item.nome })),
                  ]}
                />
              </Campo>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Campo id="periodo-painel-turma" rotulo="Turma">
                <Selecionar
                  id="periodo-painel-turma"
                  valor={turmaId}
                  disabled={executando || serieId === "todas"}
                  onValor={(valor) => {
                    setTurmaId(valor);
                    invalidar();
                  }}
                  opcoes={[
                    { valor: "todas", rotulo: "Todas as turmas" },
                    ...turmasDisponiveis.map((item) => ({ valor: item.id, rotulo: item.rotulo })),
                  ]}
                />
              </Campo>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Botao type="submit" variante="secundario" carregando={executando}>
              Gerar gráfico
            </Botao>
          </Box>
        </Box>
        {erro ? (
          <Alerta severity="error" role="alert">
            {erro}
          </Alerta>
        ) : null}
        {executando ? (
          <Alerta severity="info" role="status">
            Carregando chamadas do período...
          </Alerta>
        ) : null}
        {resultado !== null ? (
          <Box
            aria-live="polite"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              borderTop: 1,
              borderColor: "divider",
              pt: 2,
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
            >
              De {rotuloData(de)} a {rotuloData(ate)}
            </Typography>
            <Box role="group" aria-label="Resumo do período">
              <Grid container spacing={2}>
                {[
                  ["Faltas (F + FJ)", String(ausencias(resumo))],
                  ["Registros de aluno por dia", String(resumo.registrados)],
                  ["Presenças parciais", String(resumo.parciais)],
                  [
                    "Infrequência",
                    resumo.registrados > 0 ? percentual.format(infrequencia(resumo)) : "Sem dados",
                  ],
                ].map(([rotulo, valor]) => (
                  <Grid key={rotulo} size={{ xs: 6, sm: 3 }}>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 0.5,
                        p: 1.5,
                        textAlign: "center",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1,
                        backgroundColor: "action.hover",
                      }}
                    >
                      <Typography
                        component="strong"
                        variant="h6"
                        sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
                      >
                        {valor}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {rotulo}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
            <GraficoRosca
              titulo={
                serie
                  ? `Faltas do período por turma da ${serie.nome}`
                  : "Faltas do período por série"
              }
              fatias={selecionados.map((item) => ({
                categoriaId: "turmaId" in item ? item.turmaId : item.serieId,
                nome: "rotulo" in item ? item.rotulo : item.nome,
                valor: ausencias(item),
                detalhe:
                  item.registrados > 0
                    ? `${percentual.format(infrequencia(item))} de infrequência`
                    : "Sem dados de infrequência",
              }))}
              vazio={
                resumo.registrados === 0
                  ? "Nenhuma chamada salva neste período e recorte"
                  : "Nenhuma falta registrada neste período e recorte"
              }
            />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              A taxa considera F + FJ sobre os registros de aluno por dia com chamada salva. Dias
              sem chamada ficam fora do cálculo. A rosca mostra a distribuição das faltas por{" "}
              {serie ? "turma atual" : "série atual"}.
            </Typography>
          </Box>
        ) : null}
      </CartaoConteudo>
    </Cartao>
  );
}
