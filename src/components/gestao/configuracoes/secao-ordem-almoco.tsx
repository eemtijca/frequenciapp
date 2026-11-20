"use client";

// Ordem do almoço no rascunho: a administração ordena as turmas de cada dia
// da semana, com horário opcional, e a aba Horários mostra.
import { useId, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import PlaylistAddRoundedIcon from "@mui/icons-material/PlaylistAddRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import {
  DIAS_ORDEM_ALMOCO,
  ordemDoDia,
  problemaNaOrdemAlmoco,
  type ItemOrdemAlmoco,
  type OrdemAlmocoDoDia,
} from "@/domain/ordem-almoco";
import { avisarSucesso } from "@/lib/avisos";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { Selo } from "@/components/ui/mui/selo";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface ItemRascunho {
  turmaId: string;
  /** "HH:MM" ou vazio, quando a turma só tem posição. */
  inicio: string;
}

function rotuloDia(valor: number): string {
  const rotulo = DIAS_DA_SEMANA.find((dia) => dia.valor === valor)?.rotulo ?? "dia";
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

function paraRascunho(dias: OrdemAlmocoDoDia[], dia: number): ItemRascunho[] {
  return ordemDoDia(dias, dia).map((item) => ({
    turmaId: item.turmaId,
    inicio: item.inicio ?? "",
  }));
}

function paraItens(itens: ItemRascunho[]): ItemOrdemAlmoco[] {
  return itens.map((item, indice) => ({
    turmaId: item.turmaId,
    posicao: indice + 1,
    inicio: item.inicio || null,
  }));
}

export default function SecaoOrdemAlmoco({
  turmas,
  dias,
  onMudar,
  onCopiarParaTodos,
}: {
  turmas: Turma[];
  dias: OrdemAlmocoDoDia[];
  onMudar: (dia: number, itens: ItemOrdemAlmoco[]) => void;
  onCopiarParaTodos: (dia: number, itens: ItemOrdemAlmoco[]) => void;
}) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(1);
  const [paraAdicionar, setParaAdicionar] = useState("");
  const [erro, setErro] = useState("");
  const [copiando, setCopiando] = useState(false);

  const rascunho = paraRascunho(dias, dia);
  const rotuloDe = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
  const restantes = turmas.filter((turma) => !rascunho.some((item) => item.turmaId === turma.id));
  const diasDefinidos = dias.filter((item) => item.itens.length > 0).length;

  function aplicar(itens: ItemRascunho[]) {
    const problema = problemaNaOrdemAlmoco(paraItens(itens));
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    onMudar(dia, paraItens(itens));
  }

  function trocarDia(valor: string) {
    setDia(Number(valor));
    setParaAdicionar("");
    setErro("");
  }

  function mover(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    if (destino < 0 || destino >= rascunho.length) return;
    const novo = [...rascunho];
    const [item] = novo.splice(indice, 1);
    if (item) novo.splice(destino, 0, item);
    aplicar(novo);
  }

  function atualizarInicio(indice: number, inicio: string) {
    aplicar(rascunho.map((item, i) => (i === indice ? { ...item, inicio } : item)));
  }

  return (
    <Box data-secao="config-ordem-almoco">
      <Acordeao
        titulo="Ordem do almoço"
        resumo={
          <Selo>{`${diasDefinidos} ${diasDefinidos === 1 ? "dia definido" : "dias definidos"}`}</Selo>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Box
          role="region"
          aria-label="Ordem do almoço"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { sm: "flex-end" }, flexWrap: "wrap" }}
          >
            <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 320 } }}>
              <Campo id={`${base}-dia`} rotulo="Dia da semana">
                <Selecionar
                  id={`${base}-dia`}
                  valor={String(dia)}
                  onValor={trocarDia}
                  opcoes={DIAS_ORDEM_ALMOCO.map((valor) => ({
                    valor: String(valor),
                    rotulo: rotuloDia(valor),
                  }))}
                />
              </Campo>
            </Box>
            <Botao
              type="button"
              variante="contorno"
              icone={<ContentCopyRoundedIcon />}
              aria-label="Copiar para os outros dias"
              disabled={rascunho.length === 0}
              onClick={() => setCopiando(true)}
            >
              Copiar para os outros dias
            </Botao>
          </Stack>

          {restantes.length > 0 ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: 2,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              <Campo id={`${base}-adicionar`} rotulo="Turma">
                <Selecionar
                  id={`${base}-adicionar`}
                  buscavel
                  valor={paraAdicionar}
                  onValor={setParaAdicionar}
                  placeholder="Selecione a turma"
                  opcoes={restantes.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo }))}
                />
              </Campo>
              <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
                <Botao
                  type="button"
                  variante="primario"
                  aria-label="Adicionar à ordem"
                  icone={<AddRoundedIcon />}
                  disabled={!paraAdicionar}
                  onClick={() => {
                    aplicar([...rascunho, { turmaId: paraAdicionar, inicio: "" }]);
                    setParaAdicionar("");
                  }}
                >
                  Adicionar
                </Botao>
                <Botao
                  type="button"
                  variante="contorno"
                  aria-label="Incluir todas as turmas restantes"
                  icone={<PlaylistAddRoundedIcon />}
                  onClick={() => {
                    aplicar([
                      ...rascunho,
                      ...restantes.map((turma) => ({ turmaId: turma.id, inicio: "" })),
                    ]);
                    setParaAdicionar("");
                  }}
                >
                  Incluir todas
                </Botao>
              </Box>
            </Box>
          ) : null}

          {rascunho.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhuma turma na ordem de {rotuloDia(dia)}.
            </Typography>
          ) : (
            <Box
              component="ol"
              aria-label={`Ordem do almoço de ${rotuloDia(dia)}`}
              sx={{
                display: "flex",
                flexDirection: "column",
                margin: 0,
                padding: 0,
                listStyle: "none",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              {rascunho.map((item, indice) => {
                const rotulo = rotuloDe.get(item.turmaId) ?? "Turma";
                return (
                  <Stack
                    component="li"
                    key={item.turmaId}
                    spacing={1}
                    sx={{
                      paddingX: 2,
                      paddingY: 1.5,
                      borderBottom: 1,
                      borderColor: "divider",
                      "&:last-of-type": { borderBottom: 0 },
                    }}
                  >
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                      <Box
                        sx={(tema) => ({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          border: `1px solid ${tema.vars.palette.divider}`,
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                        })}
                      >
                        <span aria-hidden="true">{indice + 1}º</span>
                        <Box component="span" sx={ESTILO_SOMENTE_LEITOR}>
                          {indice + 1}º lugar
                        </Box>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {rotulo}
                      </Typography>
                      <BotaoIcone
                        rotulo={`Subir ${rotulo}`}
                        variante="texto"
                        tamanho="pequeno"
                        disabled={indice === 0}
                        icone={<ArrowUpwardRoundedIcon />}
                        onClick={() => mover(indice, -1)}
                        sx={ESTILO_ALVO_TOQUE}
                      />
                      <BotaoIcone
                        rotulo={`Descer ${rotulo}`}
                        variante="texto"
                        tamanho="pequeno"
                        disabled={indice === rascunho.length - 1}
                        icone={<ArrowDownwardRoundedIcon />}
                        onClick={() => mover(indice, 1)}
                        sx={ESTILO_ALVO_TOQUE}
                      />
                      <BotaoIcone
                        rotulo={`Tirar ${rotulo} da ordem`}
                        variante="texto"
                        tamanho="pequeno"
                        icone={<DeleteOutlineRoundedIcon />}
                        onClick={() => aplicar(rascunho.filter((_, i) => i !== indice))}
                        sx={(tema) => ({
                          ...ESTILO_ALVO_TOQUE,
                          color: tema.vars.palette.falta.main,
                        })}
                      />
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", paddingLeft: { sm: 6 }, minWidth: 0 }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 220 } }}>
                        <SeletorHorario
                          id={`${base}-inicio-${item.turmaId}`}
                          valor={item.inicio}
                          rotuloAcessivel={`Horário de ${rotulo} no almoço`}
                          onValor={(valor) => atualizarInicio(indice, valor)}
                        />
                      </Box>
                      {item.inicio ? (
                        <BotaoIcone
                          rotulo={`Limpar horário de ${rotulo}`}
                          variante="texto"
                          tamanho="pequeno"
                          icone={<CloseRoundedIcon />}
                          onClick={() => atualizarInicio(indice, "")}
                          sx={ESTILO_ALVO_TOQUE}
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                );
              })}
            </Box>
          )}

          {erro ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}

          <Acordeao
            titulo="Ajuda"
            nivelTitulo="h4"
            resumo={
              <Typography
                component="span"
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />
                Como a ordem aparece em Horários
              </Typography>
            }
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Use as setas para ordenar as turmas. Os horários são opcionais. A ordem aparece na
              consulta de Horários depois de salvar as configurações.
            </Typography>
          </Acordeao>
        </Box>
      </Acordeao>

      <DialogoConfirmacao
        aberto={copiando}
        titulo="Copiar a ordem para os outros dias?"
        descricao={`A ordem e os horários de ${rotuloDia(dia)} substituem os de todos os outros dias, de segunda a sábado, no rascunho.`}
        rotuloConfirmar="Copiar"
        onConfirmar={() => {
          onCopiarParaTodos(dia, paraItens(rascunho));
          setCopiando(false);
          avisarSucesso(
            "Ordem copiada no rascunho.",
            "Salve as configurações para aplicar aos outros dias.",
          );
        }}
        onCancelar={() => setCopiando(false)}
      />
    </Box>
  );
}

const ESTILO_ALVO_TOQUE = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
  minWidth: TOKENS_LAYOUT.alvoToque,
} as const;

const ESTILO_SOMENTE_LEITOR = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
