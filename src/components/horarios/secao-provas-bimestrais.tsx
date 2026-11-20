"use client";

// Horário das provas bimestrais na Gestão: a administração cadastra as provas do período por turma,
// remove uma prova e encerra o período, que apaga o horário inteiro.
import { useEffect, useId, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import dayjs, { type Dayjs } from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
  diaDaSemanaIso,
  diaSeguinte,
  rotuloData,
  rotuloDataCurta,
  rotuloDiaSemana,
  type Turma,
} from "@/domain/frequencia";
import {
  LIMITE_DISCIPLINA_PROVA,
  problemaNaProva,
  provasPorDia,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";
import { corpoAlteracao, corpoJson, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { deDiaCivil, paraDiaCivil } from "@/lib/data-civil";
import {
  avisarProvasBimestraisMudaram,
  ouvirProvasBimestraisMudaram,
} from "@/lib/eventos-provas-bimestrais";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo, useCampo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Cartao } from "@/components/ui/mui/cartao";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  turmas: Turma[];
  diaCorrente: string;
}

/** A mesma prova cadastrada para várias turmas aparece numa linha só. */
interface GrupoDeProva {
  chave: string;
  disciplina: string;
  inicio: string;
  fim: string;
  provas: ProvaBimestral[];
}

const TEXTO_INVISIVEL = {
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

const ESTILO_BOTAO_ICONE = {
  minWidth: TOKENS_LAYOUT.alvoToque,
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
  padding: 0,
  "& .MuiButton-startIcon": { margin: 0 },
} as const;

function agruparPorProva(provas: readonly ProvaBimestral[]): GrupoDeProva[] {
  const grupos = new Map<string, GrupoDeProva>();
  for (const prova of provas) {
    const chave = `${prova.inicio}|${prova.fim}|${prova.disciplina}`;
    const grupo = grupos.get(chave) ?? {
      chave,
      disciplina: prova.disciplina,
      inicio: prova.inicio,
      fim: prova.fim,
      provas: [],
    };
    grupo.provas.push(prova);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

function rotuloDoDia(dia: string): string {
  const nome = rotuloDiaSemana(dia);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${rotuloDataCurta(dia)}`;
}

function contarTurmas(quantidade: number): string {
  return quantidade === 1 ? "1 turma" : `${quantidade} turmas`;
}

function comoDia(dia: string): Dayjs | null {
  const data = deDiaCivil(dia);
  return data ? dayjs(data) : null;
}

interface SeletorDataProps {
  id: string;
  valor: string;
  min: string;
  max: string;
  disabled: boolean;
  onValor: (valor: string) => void;
}

/** Data civil da prova em DatePicker, ligada ao Campo pelo contexto do formulário. */
function SeletorDataProva({ id, valor, min, max, disabled, onValor }: SeletorDataProps) {
  const campo = useCampo();

  return (
    <DatePicker
      value={comoDia(valor)}
      onChange={(novo) => {
        const convertido = paraDiaCivil(novo?.toDate() ?? null);
        if (convertido) onValor(convertido);
      }}
      format="DD/MM/YYYY"
      minDate={comoDia(min) ?? undefined}
      maxDate={comoDia(max) ?? undefined}
      shouldDisableDate={(data) => data.day() === 0}
      disabled={disabled}
      label="Data"
      slotProps={{
        textField: {
          id,
          fullWidth: true,
          error: Boolean(campo?.erro),
          slotProps: {
            htmlInput: { "aria-describedby": campo?.descritoPor },
            ...(campo ? { input: { notched: false }, inputLabel: { sx: TEXTO_INVISIVEL } } : {}),
          },
          sx: (tema) => ({
            width: "100%",
            "& .MuiPickersOutlinedInput-root": {
              minHeight: TOKENS_LAYOUT.campo.medio,
              borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            },
            "& .MuiPickersOutlinedInput-notchedOutline": {
              borderRadius: `${TOKENS_LAYOUT.campo.raio}px`,
            },
            "& .MuiPickersOutlinedInput-root.Mui-focused": {
              boxShadow: `0 0 0 ${TOKENS_LAYOUT.campo.foco}px color-mix(in srgb, ${tema.palette.primary.main} 24%, transparent)`,
            },
          }),
        },
        openPickerButton: {
          sx: { width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque },
        },
        actionBar: {
          sx: { "& .MuiButton-root": { minHeight: TOKENS_LAYOUT.alvoToque } },
        },
      }}
      sx={{ width: "100%" }}
    />
  );
}

export default function SecaoProvasBimestrais({ turmas, diaCorrente }: Props) {
  const base = useId();
  const [provas, setProvas] = useState<ProvaBimestral[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erroLeitura, setErroLeitura] = useState("");
  const [versao, setVersao] = useState(0);
  // No domingo, a data sugerida já é a segunda-feira.
  const [dia, setDia] = useState(() =>
    diaDaSemanaIso(diaCorrente) === 7 ? diaSeguinte(diaCorrente, 1) : diaCorrente,
  );
  const [inicio, setInicio] = useState("07:00");
  const [fim, setFim] = useState("09:00");
  const [disciplina, setDisciplina] = useState("");
  const [turmaIds, setTurmaIds] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [removendo, setRemovendo] = useState<{ dia: string; grupo: GrupoDeProva } | null>(null);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => ouvirProvasBimestraisMudaram(() => setVersao((atual) => atual + 1)), []);
  useEffect(() => {
    let atual = true;
    pedir<{ provas: ProvaBimestral[] }>("/api/provas-bimestrais")
      .then((dados) => {
        if (!atual) return;
        setProvas(dados.provas);
        setErroLeitura("");
      })
      .catch(() => {
        if (atual) setErroLeitura("Não foi possível ler o horário de provas.");
      })
      .finally(() => {
        if (atual) setCarregado(true);
      });
    return () => {
      atual = false;
    };
  }, [versao]);

  const series = useMemo(() => {
    const grupos = new Map<string, { id: string; nome: string; turmas: Turma[] }>();
    for (const turma of turmas) {
      const grupo = grupos.get(turma.serieId) ?? {
        id: turma.serieId,
        nome: turma.serieNome,
        turmas: [],
      };
      grupo.turmas.push(turma);
      grupos.set(turma.serieId, grupo);
    }
    return [...grupos.values()];
  }, [turmas]);
  const rotuloDe = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma.rotulo])),
    [turmas],
  );
  const dias = provasPorDia(provas);

  function alternarTurmas(ids: string[], marcar: boolean) {
    setTurmaIds((atuais) =>
      marcar ? [...new Set([...atuais, ...ids])] : atuais.filter((id) => !ids.includes(id)),
    );
    setErro("");
  }

  function mudou() {
    setVersao((atual) => atual + 1);
    avisarProvasBimestraisMudaram();
  }

  const { executando: adicionando, executar: adicionar } = useAcaoUnica(async () => {
    const problema =
      turmaIds.length === 0
        ? "Escolha ao menos uma turma."
        : problemaNaProva({ dia, inicio, fim, disciplina }, diaCorrente);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    try {
      const { provas: criadas } = await pedir<{ provas: ProvaBimestral[] }>(
        "/api/provas-bimestrais",
        corpoJson({ turmaIds, dia, inicio, fim, disciplina: disciplina.trim() }),
      );
      avisarSucesso(
        "Prova adicionada.",
        `${disciplina.trim()} em ${rotuloData(dia)} para ${contarTurmas(criadas.length)}.`,
      );
      // Data e turmas ficam para a próxima prova do mesmo dia.
      setDisciplina("");
      setInicio(fim);
      mudou();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível adicionar a prova." });
    }
  });

  const { executando: removendoAgora, executar: remover } = useAcaoUnica(async () => {
    if (!removendo) return;
    try {
      for (const prova of removendo.grupo.provas) {
        await pedir(`/api/provas-bimestrais/${prova.id}`, corpoAlteracao("DELETE"));
      }
      avisarSucesso("Prova removida.");
      setRemovendo(null);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível remover a prova." });
    } finally {
      mudou();
    }
  });

  const { executando: encerrandoAgora, executar: encerrar } = useAcaoUnica(async () => {
    try {
      const { removidas } = await pedir<{ removidas: number }>(
        "/api/provas-bimestrais/encerrar",
        corpoJson({ confirmar: true }),
      );
      avisarSucesso(
        "Período de provas encerrado.",
        removidas === 1 ? "1 prova apagada." : `${removidas} provas apagadas.`,
      );
      setEncerrando(false);
      mudou();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível encerrar o período de provas." });
    }
  });

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        O horário de provas vale só durante o período de provas. A aba Horários mostra a cada turma
        as provas de hoje em diante; datas passadas saem sozinhas, e Encerrar período de provas
        apaga o horário inteiro.
      </Typography>
      <Box
        component="form"
        aria-label="Nova prova"
        onSubmit={(evento) => {
          evento.preventDefault();
          void adicionar();
        }}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          padding: 2,
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          backgroundColor: "background.paper",
        }}
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Campo id={`${base}-dia`} rotulo="Data">
              <SeletorDataProva
                id={`${base}-dia`}
                valor={dia}
                min={diaCorrente}
                max="2199-12-31"
                disabled={adicionando}
                onValor={(valor) => {
                  setDia(valor);
                  setErro("");
                }}
              />
            </Campo>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Campo id={`${base}-inicio`} rotulo="Início">
              <SeletorHorario
                valor={inicio}
                rotuloAcessivel="Início da prova"
                disabled={adicionando}
                onValor={(valor) => {
                  setInicio(valor);
                  setErro("");
                }}
              />
            </Campo>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Campo id={`${base}-fim`} rotulo="Fim">
              <SeletorHorario
                valor={fim}
                rotuloAcessivel="Fim da prova"
                disabled={adicionando}
                onValor={(valor) => {
                  setFim(valor);
                  setErro("");
                }}
              />
            </Campo>
          </Grid>
          <Grid size={12}>
            <Campo id={`${base}-disciplina`} rotulo="Disciplina">
              <CampoTexto
                valor={disciplina}
                onValor={(valor) => {
                  setDisciplina(valor);
                  setErro("");
                }}
                maxLength={LIMITE_DISCIPLINA_PROVA}
                placeholder="Ex.: Matemática"
                disabled={adicionando}
              />
            </Campo>
          </Grid>
        </Grid>
        <FormControl
          component="fieldset"
          disabled={adicionando}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          <FormLabel component="legend">Turmas</FormLabel>
          {series.map((serie) => {
            const ids = serie.turmas.map((turma) => turma.id);
            const marcadas = ids.filter((id) => turmaIds.includes(id)).length;
            return (
              <Stack key={serie.id} spacing={1} sx={{ minWidth: 0 }}>
                <FormControlLabel
                  disabled={adicionando}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque, m: 0 }}
                  control={
                    <Checkbox
                      checked={marcadas === ids.length}
                      indeterminate={marcadas > 0 && marcadas < ids.length}
                      disabled={adicionando}
                      slotProps={{ input: { "aria-label": `Toda a ${serie.nome}` } }}
                      onChange={(evento) => alternarTurmas(ids, evento.target.checked)}
                    />
                  }
                  label={serie.nome}
                />
                <Grid container spacing={1}>
                  {serie.turmas.map((turma) => (
                    <Grid key={turma.id} size={{ xs: 6, sm: 4 }}>
                      <FormControlLabel
                        disabled={adicionando}
                        sx={{
                          minHeight: TOKENS_LAYOUT.alvoToque,
                          m: 0,
                          paddingX: 1,
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          width: "100%",
                        }}
                        control={
                          <Checkbox
                            checked={turmaIds.includes(turma.id)}
                            disabled={adicionando}
                            onChange={(evento) => alternarTurmas([turma.id], evento.target.checked)}
                          />
                        }
                        label={turma.rotulo}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Stack>
            );
          })}
        </FormControl>
        {erro ? <AlertaCompacto variante="dados_invalidos" titulo={erro} tamanho="linha" /> : null}
        <Botao
          variante="secundario"
          type="submit"
          carregando={adicionando}
          disabled={adicionando}
          icone={<AddRoundedIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          {turmaIds.length > 1
            ? `Adicionar prova para ${contarTurmas(turmaIds.length)}`
            : "Adicionar prova"}
        </Botao>
      </Box>

      {erroLeitura ? (
        <AlertaCompacto variante="erro_interno" titulo={erroLeitura} tamanho="linha" />
      ) : null}
      {carregado && !erroLeitura && dias.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nenhuma prova cadastrada.
        </Typography>
      ) : null}
      {dias.length > 0 ? (
        <Cartao
          component="section"
          aria-label="Provas cadastradas"
          sx={{ padding: 0, overflow: "hidden" }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 2,
              py: 1.5,
              backgroundColor: "action.hover",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <EventNoteRoundedIcon fontSize="small" aria-hidden="true" />
            <Typography component="h2" variant="subtitle2">
              Provas cadastradas
            </Typography>
          </Stack>
          <List disablePadding>
            {dias.map((grupoDoDia) => (
              <ListItem key={grupoDoDia.dia} divider sx={{ display: "block", px: 2, py: 1.5 }}>
                <Typography component="h3" variant="subtitle2" sx={{ mb: 1 }}>
                  {rotuloDoDia(grupoDoDia.dia)}
                </Typography>
                <List disablePadding>
                  {agruparPorProva(grupoDoDia.provas).map((grupo) => (
                    <ListItem key={grupo.chave} disableGutters sx={{ gap: 2, py: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 500, overflowWrap: "anywhere" }}
                        >
                          {grupo.disciplina}
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              fontVariantNumeric: "tabular-nums",
                              fontWeight: 400,
                            }}
                          >
                            {" "}
                            · {grupo.inicio} às {grupo.fim}
                          </Typography>
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                        >
                          {grupo.provas
                            .map((prova) => rotuloDe.get(prova.turmaId) ?? "Turma")
                            .join(", ")}
                        </Typography>
                      </Box>
                      <Botao
                        variante="texto"
                        type="button"
                        aria-label={`Remover a prova de ${grupo.disciplina} de ${rotuloDataCurta(grupoDoDia.dia)}`}
                        icone={<DeleteOutlineRoundedIcon />}
                        onClick={() => setRemovendo({ dia: grupoDoDia.dia, grupo })}
                        sx={{ ...ESTILO_BOTAO_ICONE, color: "falta.texto" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </ListItem>
            ))}
          </List>
        </Cartao>
      ) : null}
      {dias.length > 0 ? (
        <Botao
          variante="contorno"
          type="button"
          icone={<EventBusyRoundedIcon />}
          onClick={() => setEncerrando(true)}
          sx={{ alignSelf: "flex-start", color: "falta.texto" }}
        >
          Encerrar período de provas
        </Botao>
      ) : null}

      <DialogoConfirmacao
        aberto={removendo !== null}
        titulo="Remover a prova?"
        descricao={
          removendo
            ? `${removendo.grupo.disciplina} em ${rotuloData(removendo.dia)}, das ${removendo.grupo.inicio} às ${removendo.grupo.fim}, sai do horário de ${contarTurmas(removendo.grupo.provas.length)}.`
            : ""
        }
        rotuloConfirmar="Remover prova"
        rotuloCancelar="Cancelar"
        destrutivo
        operacaoEmAndamento={removendoAgora}
        onCancelar={() => {
          if (!removendoAgora) setRemovendo(null);
        }}
        onConfirmar={() => void remover()}
      />
      <DialogoConfirmacao
        aberto={encerrando}
        titulo="Encerrar o período de provas?"
        descricao="O horário de provas de todas as turmas será apagado e deixa de aparecer na aba Horários. As aulas não mudam."
        rotuloConfirmar="Encerrar período"
        rotuloCancelar="Cancelar"
        destrutivo
        operacaoEmAndamento={encerrandoAgora}
        onCancelar={() => {
          if (!encerrandoAgora) setEncerrando(false);
        }}
        onConfirmar={() => void encerrar()}
      />
    </Stack>
  );
}
