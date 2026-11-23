"use client";

// Histórico: frequências salvas de um mês, filtradas por série e abertas em um toque.
import { useState } from "react";
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import { ESPACO_COMPOSICAO } from "@/theme/layout";
import Typography from "@mui/material/Typography";
import type { Frequencia, Serie, Turma } from "@/domain/frequencia";
import {
  dataNoFuso,
  horaNoFuso,
  horariosDaChamada,
  mesSeguinte,
  normalizar,
  rotuloDiaSemana,
  rotuloMes,
} from "@/domain/frequencia";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { GrupoOpcoes } from "@/components/ui/mui/grupo-opcoes";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface Props {
  frequencias: Frequencia[];
  turmas: Turma[];
  series: Serie[];
  mes: string;
  mesCorrente: string;
  fuso: string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  bloqueado: boolean;
  rotuloTurma: (id: string) => string;
}

function rotuloDia(dia: string): { numero: string; mesAno: string; semana: string } {
  const [ano, mes, diaDoMes] = dia.split("-");
  return {
    numero: diaDoMes ?? "",
    mesAno: `${mes}/${ano}`,
    semana: rotuloDiaSemana(dia).slice(0, 3),
  };
}

export default function VistaHistorico({
  frequencias,
  turmas,
  series,
  mes,
  mesCorrente,
  fuso,
  onMes,
  onAbrir,
  bloqueado,
  rotuloTurma,
}: Props) {
  const [busca, setBusca] = useState("");
  const [serieFiltro, setSerieFiltro] = useState("");

  const ordenadas = [...frequencias].sort(
    (a, b) =>
      b.dia.localeCompare(a.dia) ||
      rotuloTurma(b.turmaId).localeCompare(rotuloTurma(a.turmaId), "pt-BR"),
  );
  const termo = normalizar(busca);
  const serieDaTurma = new Map(turmas.map((turma) => [turma.id, turma.serieId]));
  const filtradas = ordenadas.filter((frequencia) => {
    if (serieFiltro && serieDaTurma.get(frequencia.turmaId) !== serieFiltro) return false;
    if (termo === "") return true;
    const alvo = normalizar(
      `${rotuloTurma(frequencia.turmaId)} ${frequencia.dia} ${frequencia.atualizadoPorNome ?? ""}`,
    );
    return alvo.includes(termo);
  });

  return (
    <Box
      component="section"
      aria-label="Histórico de frequências"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Stack spacing={ESPACO_COMPOSICAO.tituloDescricao} useFlexGap>
        <Typography component="h1" variant="h4">
          Histórico
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {frequencias.length === 0
            ? "Frequências salvas do mês"
            : `${frequencias.length} ${frequencias.length === 1 ? "frequência salva" : "frequências salvas"}`}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <BotaoIcone
          rotulo="Mês anterior"
          variante="contorno"
          icone={<ChevronLeftRoundedIcon />}
          onClick={() => onMes(mesSeguinte(mes, -1))}
          sx={{ width: 48, height: 48 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SeletorPeriodo
            id="mes-historico"
            modo="mes"
            valor={mes}
            max={mesCorrente}
            rotuloAcessivel="Mês do histórico"
            rotulo={rotuloMes(mes)}
            onValor={onMes}
          />
        </Box>
        <BotaoIcone
          rotulo="Mês seguinte"
          variante="contorno"
          icone={<ChevronRightRoundedIcon />}
          disabled={mes >= mesCorrente}
          onClick={() => onMes(mesSeguinte(mes, 1))}
          sx={{ width: 48, height: 48 }}
        />
      </Stack>

      {mes !== mesCorrente ? (
        <Box sx={{ display: "flex" }}>
          <Botao
            variante="secundario"
            icone={<ReplayRoundedIcon />}
            onClick={() => onMes(mesCorrente)}
          >
            Voltar para este mês
          </Botao>
        </Box>
      ) : null}

      {series.length > 0 ? (
        <GrupoOpcoes
          rotulo="Filtrar por série"
          valor={serieFiltro}
          onValor={setSerieFiltro}
          sx={(tema) => ({ boxShadow: "none", ...tema.applyStyles("dark", { boxShadow: "none" }) })}
          opcoes={[
            { valor: "", rotulo: "Todas" },
            ...series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
          ]}
        />
      ) : null}

      {bloqueado ? (
        <AlertaCompacto
          variante="conflito"
          descricao="Há alterações na frequência em aberto. Salve antes de abrir outra."
          tamanho="linha"
        />
      ) : null}

      {frequencias.length === 0 ? (
        <EstadoVazio
          icone={<HistoryRoundedIcon />}
          titulo="Nenhuma frequência neste mês"
          descricao="Escolha outro mês ou faça a primeira frequência do período."
        />
      ) : (
        <Stack spacing={2}>
          <BarraBusca
            id="busca-historico"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por turma, dia ou autoria"
          />
          {filtradas.length === 0 ? (
            <EstadoVazio
              icone={<HistoryRoundedIcon />}
              titulo="Nenhuma frequência encontrada"
              descricao="Tente outro termo de busca."
            />
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden", boxShadow: "none" }}>
              <List disablePadding>
                {filtradas.map((frequencia) => {
                  const rotulo = rotuloDia(frequencia.dia);
                  const dataSalva = dataNoFuso(frequencia.atualizadoEm, fuso);
                  const hora = horaNoFuso(frequencia.atualizadoEm, fuso);
                  const turma = turmas.find((item) => item.id === frequencia.turmaId);
                  const aulasDoDia = horariosDaChamada(turma?.horarios ?? [], frequencia.dia, true);
                  const totalAulas = frequencia.aulas?.length ?? aulasDoDia.length;
                  const estimativaAulas = frequencia.faltas.length > 0 && !frequencia.aulas?.length;
                  const parciais = frequencia.faltas.filter(
                    (falta) => totalAulas > 0 && falta.horarios.length < totalAulas,
                  ).length;
                  const justificadas = frequencia.faltas.filter(
                    (falta) => falta.justificativa,
                  ).length;
                  const resumo =
                    frequencia.faltas.length === 0
                      ? "Todos presentes"
                      : `${frequencia.faltas.length} ${
                          frequencia.faltas.length === 1 ? "falta" : "faltas"
                        }${
                          justificadas > 0
                            ? ` · ${justificadas} ${
                                justificadas === 1 ? "justificada" : "justificadas"
                              }`
                            : ""
                        }${
                          parciais > 0
                            ? ` · ${parciais} ${
                                parciais === 1 ? "saída parcial" : "saídas parciais"
                              }`
                            : ""
                        }`;
                  const autoria =
                    dataSalva && hora
                      ? ` · salva em ${dataSalva} às ${hora}${frequencia.atualizadoPorNome ? ` por ${frequencia.atualizadoPorNome}` : ""}`
                      : "";
                  return (
                    <ListItem
                      key={`${frequencia.dia}|${frequencia.turmaId}`}
                      disablePadding
                      divider
                      sx={{ "&:last-of-type": { borderBottom: 0 } }}
                    >
                      <ListItemButton
                        disabled={bloqueado}
                        onClick={() => onAbrir(frequencia.dia, frequencia.turmaId)}
                        sx={{ gap: 2, px: 2, py: 1.5, alignItems: "center" }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            borderRadius: 1,
                            bgcolor: "action.hover",
                            lineHeight: 1,
                          }}
                        >
                          <Typography
                            component="span"
                            sx={{ fontWeight: 600, fontSize: "1.125rem" }}
                          >
                            {rotulo.numero}
                          </Typography>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: "text.secondary", textTransform: "uppercase" }}
                          >
                            {rotulo.semana}
                          </Typography>
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap sx={{ fontWeight: 500 }}>
                            Turma {rotuloTurma(frequencia.turmaId)}
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ color: "text.secondary", ml: 1 }}
                            >
                              {rotulo.mesAno}
                            </Typography>
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                          >
                            {resumo}
                            {autoria}
                          </Typography>
                          {estimativaAulas ? (
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              Aulas estimadas pela grade atual.
                            </Typography>
                          ) : null}
                        </Box>
                        <ArrowOutwardRoundedIcon
                          aria-hidden="true"
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          )}
        </Stack>
      )}
    </Box>
  );
}
