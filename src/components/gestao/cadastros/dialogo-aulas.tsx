"use client";

// Horários da turma: janelas das aulas e disciplinas por dia, com preservação do histórico.
import { useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import type { Horario, Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Selo } from "@/components/ui/mui/selo";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Formulario {
  id?: string;
  ordem: string;
  inicio: string;
  fim: string;
  diasSemana: number[];
  disciplinas: Record<string, string>;
  ativo: boolean;
}

interface Props {
  turma: Turma | null;
  turmas: Turma[];
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onMudanca: () => Promise<void>;
}

interface ConfirmacaoAula {
  tipo: "ativar" | "excluir";
  aula: Horario;
}

const ESTILO_BOTAO_ICONE = {
  minWidth: TOKENS_LAYOUT.alvoToque,
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
  padding: 0,
  "&.MuiButton-root": {
    minWidth: TOKENS_LAYOUT.alvoToque,
    width: TOKENS_LAYOUT.alvoToque,
    height: TOKENS_LAYOUT.alvoToque,
    padding: 0,
  },
  "& .MuiButton-startIcon": { margin: 0 },
} as const;

interface CopiarGradeProps {
  destino: Turma;
  turmas: Turma[];
  disabled: boolean;
  onOcupado: (ocupado: boolean) => void;
  onMudanca: () => Promise<void>;
}

function CopiarGrade({ destino, turmas, disabled, onOcupado, onMudanca }: CopiarGradeProps) {
  const [aberto, setAberto] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const opcoes = useMemo(
    () =>
      turmas
        .filter((turma) => turma.id !== destino.id)
        .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    [destino.id, turmas],
  );
  const origem = turmas.find((turma) => turma.id === origemId);
  const aulas = useMemo(
    () => [...(origem?.horarios ?? [])].sort((a, b) => a.ordem - b.ordem),
    [origem],
  );

  const { executando, executar } = useAcaoUnica(async () => {
    if (!origem || aulas.length === 0 || disabled) return;
    setErro("");
    onOcupado(true);
    try {
      await pedir<{ horarios: Horario[] }>(
        "/api/horarios/copiar",
        corpoJson({ turmaOrigemId: origem.id, turmaDestinoId: destino.id }),
      );
      setConfirmando(false);
      setAberto(false);
      setOrigemId("");
      avisarSucesso("Grade copiada.");
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Grade copiada.",
          "Recarregue a página para visualizar os horários atualizados.",
        );
      }
    } catch (excecao) {
      setConfirmando(false);
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível copiar a grade.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível copiar a grade." });
    } finally {
      onOcupado(false);
    }
  });

  if (!aberto) {
    return (
      <Botao
        variante="contorno"
        type="button"
        disabled={disabled || opcoes.length === 0}
        onClick={() => setAberto(true)}
        icone={<ContentCopyRoundedIcon />}
      >
        Copiar de outra turma
      </Botao>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Copiar grade"
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
        padding: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Campo id="horarios-turma-origem" rotulo="Turma de origem">
        <Selecionar
          valor={origemId}
          onValor={(valor) => {
            setOrigemId(valor);
            setErro("");
          }}
          opcoes={opcoes}
          buscavel
          placeholder="Selecionar turma"
          disabled={disabled || executando}
        />
      </Campo>
      <Typography variant="body2">
        Destino:{" "}
        <Box component="span" sx={{ fontWeight: 500 }}>
          {destino.rotulo}
        </Box>
      </Typography>
      {origem ? (
        aulas.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            A turma de origem não tem horários.
          </Typography>
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {aulas.length} {aulas.length === 1 ? "aula" : "aulas"} de {origem.rotulo}
            </Typography>
            <List
              aria-label="Prévia da grade"
              sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
            >
              {aulas.map((aula) => (
                <ListItem key={aula.id} divider sx={{ display: "block", px: 2, py: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      Aula {aula.ordem}: {aula.inicio} às {aula.fim}
                    </Box>
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ display: "block", color: "text.secondary", overflowWrap: "anywhere" }}
                  >
                    {aula.diasSemana
                      .map((dia) => {
                        const rotulo =
                          DIAS_DA_SEMANA.find((opcao) => opcao.valor === dia)?.abreviacao ?? dia;
                        return `${rotulo}: ${aula.disciplinas?.[String(dia)] || "sem disciplina"}`;
                      })
                      .join(" · ")}
                  </Typography>
                  {!aula.ativo ? <Selo rotulo="Desativada" /> : null}
                </ListItem>
              ))}
            </List>
          </Stack>
        )
      ) : null}
      {erro ? <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" /> : null}
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "flex-end" }}
      >
        <Botao
          variante="contorno"
          type="button"
          disabled={disabled || executando}
          onClick={() => {
            setAberto(false);
            setErro("");
          }}
        >
          Cancelar cópia
        </Botao>
        <Botao
          variante="secundario"
          type="button"
          disabled={!origem || aulas.length === 0 || disabled || executando}
          onClick={() => setConfirmando(true)}
        >
          Copiar grade
        </Botao>
      </Stack>
      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Copiar grade?"
        descricao={
          origem
            ? `Copia ${aulas.length} ${aulas.length === 1 ? "aula" : "aulas"} de ${origem.rotulo} para ${destino.rotulo}, incluindo ordem, horários, dias, disciplinas e estado de ativação. Aulas existentes e faltas são preservadas. Ordens repetidas impedem a cópia inteira.`
            : ""
        }
        rotuloConfirmar="Confirmar cópia"
        rotuloCancelar="Cancelar"
        operacaoEmAndamento={executando}
        onCancelar={() => {
          if (!executando) setConfirmando(false);
        }}
        onConfirmar={() => void executar()}
      />
    </Box>
  );
}

export default function DialogoAulas(props: Props) {
  return (
    <ConteudoDialogoAulas key={`${props.turma?.id ?? "nenhuma"}-${props.aberto}`} {...props} />
  );
}

function ConteudoDialogoAulas({ turma, turmas, aberto, onAbrir, onMudanca }: Props) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [copiando, setCopiando] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoAula | null>(null);

  const aulas = turma?.horarios ?? [];

  async function atualizarGradeAposGravacao() {
    try {
      await onMudanca();
    } catch {
      avisarInfo(
        "Alteração salva.",
        "Recarregue a página para visualizar os horários atualizados.",
      );
    }
  }

  function abrirNova() {
    const proxima = aulas.length > 0 ? Math.max(...aulas.map((aula) => aula.ordem)) + 1 : 1;
    setFormulario({
      ordem: String(proxima),
      inicio: "07:00",
      fim: "07:50",
      diasSemana: [1, 2, 3, 4, 5],
      disciplinas: {},
      ativo: true,
    });
    setErro("");
  }

  function abrirEdicao(aula: Horario) {
    setFormulario({
      id: aula.id,
      ordem: String(aula.ordem),
      inicio: aula.inicio,
      fim: aula.fim,
      // Domingo não tem aula: grades antigas com "dom" abrem sem ele.
      diasSemana: aula.diasSemana.filter((dia) => dia !== 7),
      disciplinas: { ...aula.disciplinas },
      ativo: aula.ativo,
    });
    setErro("");
  }

  function alternarDia(dia: number) {
    setFormulario((atual) => {
      if (!atual) return atual;
      const dias = atual.diasSemana.includes(dia)
        ? atual.diasSemana.filter((valor) => valor !== dia)
        : [...atual.diasSemana, dia].sort((a, b) => a - b);
      return { ...atual, diasSemana: dias };
    });
  }

  const { executando: enviando, executar: submeter } = useAcaoUnica(async () => {
    if (!turma || !formulario || chaveAtiva !== null || copiando) return;
    setErro("");
    const corpo = {
      ordem: Number(formulario.ordem),
      inicio: formulario.inicio,
      fim: formulario.fim,
      diasSemana: formulario.diasSemana,
      disciplinas: Object.fromEntries(
        formulario.diasSemana.map((dia) => [
          String(dia),
          formulario.disciplinas[String(dia)]?.trim() ?? "",
        ]),
      ),
      ativo: formulario.ativo,
    };
    try {
      if (formulario.id) {
        await pedir<{ horario: Horario }>(
          `/api/horarios/${formulario.id}`,
          corpoAlteracao("PATCH", corpo),
        );
      } else {
        await pedir<{ horario: Horario }>(
          "/api/horarios",
          corpoJson({ turmaId: turma.id, ...corpo }),
        );
      }
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a aula.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a aula." });
      return;
    }
    avisarSucesso(formulario.id ? "Horário atualizado." : "Horário criado.");
    setFormulario(null);
    await atualizarGradeAposGravacao();
  });

  const ocupado = enviando || chaveAtiva !== null || copiando;

  function alternarAtiva(aula: Horario) {
    if (ocupado) return;
    void executarPorChave(aula.id, async () => {
      try {
        await pedir<{ horario: Horario }>(
          `/api/horarios/${aula.id}`,
          corpoAlteracao("PATCH", { ativo: !aula.ativo }),
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a aula." });
        return;
      }
      avisarSucesso(
        aula.ativo ? "Aula desativada." : "Aula reativada.",
        aula.ativo
          ? "As faltas já registradas continuam guardadas."
          : "Ela volta a aparecer na grade da turma.",
      );
      await atualizarGradeAposGravacao();
    });
  }

  function excluir(aula: Horario) {
    if (ocupado) return;
    void executarPorChave(aula.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/horarios/${aula.id}`, corpoAlteracao("DELETE"));
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível excluir a aula." });
        return;
      }
      avisarSucesso("Aula excluída.");
      await atualizarGradeAposGravacao();
    });
  }

  function confirmarAcao() {
    const alvo = confirmacao;
    setConfirmacao(null);
    if (!alvo) return;
    if (alvo.tipo === "excluir") void excluir(alvo.aula);
    else void alternarAtiva(alvo.aula);
  }

  return (
    <Dialogo
      aberto={aberto}
      onFechar={() => {
        if (!ocupado) onAbrir(false);
      }}
      titulo={`Horários de ${turma?.rotulo ?? "turma"}`}
      tamanho="grande"
    >
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        {aulas.length === 0 ? (
          <Box
            sx={{
              px: 2,
              py: 3,
              textAlign: "center",
              border: 1,
              borderStyle: "dashed",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhum horário configurado.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
            <List disablePadding>
              {[...aulas]
                .sort((a, b) => a.ordem - b.ordem)
                .map((aula) => (
                  <ListItem
                    key={aula.id}
                    divider
                    sx={{ gap: 1, px: 2, py: 1, opacity: aula.ativo ? 1 : 0.6 }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        width: 24,
                        flexShrink: 0,
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {String(aula.ordem).padStart(2, "0")}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}
                      >
                        {aula.inicio} às {aula.fim}
                      </Typography>
                      <Typography variant="caption" noWrap sx={{ color: "text.secondary" }}>
                        {aula.diasSemana
                          .filter((dia) => dia !== 7)
                          .map(
                            (dia) =>
                              DIAS_DA_SEMANA.find((opcao) => opcao.valor === dia)?.abreviacao ??
                              dia,
                          )
                          .join(" ")}
                        {aula.ativo ? "" : " · desativada"}
                      </Typography>
                    </Box>
                    <Botao
                      variante="texto"
                      type="button"
                      aria-label={`Editar aula ${aula.ordem}`}
                      onClick={() => abrirEdicao(aula)}
                      disabled={ocupado}
                      icone={<EditRoundedIcon />}
                      sx={ESTILO_BOTAO_ICONE}
                    />
                    <Botao
                      variante="texto"
                      type="button"
                      aria-label={
                        aula.ativo ? `Desativar aula ${aula.ordem}` : `Ativar aula ${aula.ordem}`
                      }
                      disabled={ocupado}
                      icone={<PowerSettingsNewRoundedIcon />}
                      onClick={() => setConfirmacao({ tipo: "ativar", aula })}
                      sx={ESTILO_BOTAO_ICONE}
                    />
                    <Botao
                      variante="texto"
                      type="button"
                      aria-label={`Excluir aula ${aula.ordem}`}
                      disabled={ocupado}
                      icone={<DeleteOutlineRoundedIcon />}
                      onClick={() => setConfirmacao({ tipo: "excluir", aula })}
                      sx={{
                        ...ESTILO_BOTAO_ICONE,
                        color: "falta.texto",
                        "&.MuiButton-root": {
                          ...ESTILO_BOTAO_ICONE["&.MuiButton-root"],
                          color: "falta.texto",
                        },
                      }}
                    />
                  </ListItem>
                ))}
            </List>
          </Box>
        )}

        {!formulario ? (
          <Stack spacing={2}>
            <Botao
              variante="secundario"
              type="button"
              onClick={abrirNova}
              disabled={aulas.length >= 99 || ocupado}
              icone={<AddRoundedIcon />}
              sx={{
                alignSelf: "flex-start",
                minHeight: TOKENS_LAYOUT.alvoToque,
                height: TOKENS_LAYOUT.alvoToque,
                border: "1px solid currentColor",
                "&.MuiButton-root": {
                  minHeight: TOKENS_LAYOUT.alvoToque,
                  height: TOKENS_LAYOUT.alvoToque,
                  border: "1px solid currentColor",
                  "&:focus-visible": { outline: "3px solid currentColor", outlineOffset: 2 },
                },
                "&:focus-visible": { outline: "3px solid currentColor", outlineOffset: 2 },
              }}
            >
              Nova aula
            </Botao>
            {turma ? (
              <CopiarGrade
                destino={turma}
                turmas={turmas}
                disabled={ocupado}
                onOcupado={setCopiando}
                onMudanca={onMudanca}
              />
            ) : null}
          </Stack>
        ) : (
          <Box
            component="form"
            aria-busy={ocupado}
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 0,
              padding: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Typography variant="subtitle2">
              {formulario.id ? "Editar aula" : "Nova aula"}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={12}>
                <Campo id="aula-ordem" rotulo="Ordem">
                  <CampoTexto
                    valor={formulario.ordem}
                    onValor={(valor) =>
                      setFormulario((atual) => (atual ? { ...atual, ordem: valor } : atual))
                    }
                    maxLength={2}
                    inputMode="numeric"
                    disabled={ocupado}
                  />
                </Campo>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Campo id="aula-inicio" rotulo="Início">
                  <SeletorHorario
                    valor={formulario.inicio}
                    disabled={ocupado}
                    rotuloAcessivel="Início da aula"
                    onValor={(valor) =>
                      setFormulario((atual) => (atual ? { ...atual, inicio: valor } : atual))
                    }
                  />
                </Campo>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Campo id="aula-fim" rotulo="Fim">
                  <SeletorHorario
                    valor={formulario.fim}
                    disabled={ocupado}
                    rotuloAcessivel="Fim da aula"
                    onValor={(valor) =>
                      setFormulario((atual) => (atual ? { ...atual, fim: valor } : atual))
                    }
                  />
                </Campo>
              </Grid>
            </Grid>
            <FormControl component="fieldset" disabled={ocupado} sx={{ minWidth: 0 }}>
              <FormLabel component="legend">Dias da semana</FormLabel>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                {DIAS_DA_SEMANA.filter((dia) => dia.valor !== 7).map((dia) => {
                  const marcado = formulario.diasSemana.includes(dia.valor);
                  return (
                    <ToggleButton
                      key={dia.valor}
                      value={String(dia.valor)}
                      selected={marcado}
                      aria-label={dia.rotulo}
                      disabled={ocupado}
                      onChange={() => alternarDia(dia.valor)}
                      sx={{ minWidth: TOKENS_LAYOUT.alvoToque, minHeight: TOKENS_LAYOUT.alvoToque }}
                    >
                      {dia.abreviacao}
                    </ToggleButton>
                  );
                })}
              </Stack>
            </FormControl>
            {formulario.diasSemana.length > 0 ? (
              <FormControl component="fieldset" disabled={ocupado} sx={{ minWidth: 0 }}>
                <FormLabel component="legend">Disciplinas</FormLabel>
                <Grid container spacing={2} sx={{ mt: 0 }}>
                  {DIAS_DA_SEMANA.filter((dia) => formulario.diasSemana.includes(dia.valor)).map(
                    (dia) => (
                      <Grid key={dia.valor} size={{ xs: 12, sm: 6 }}>
                        <Campo
                          id={`disciplina-dia-${dia.valor}`}
                          rotulo={dia.rotulo.charAt(0).toUpperCase() + dia.rotulo.slice(1)}
                        >
                          <CampoTexto
                            valor={formulario.disciplinas[String(dia.valor)] ?? ""}
                            onValor={(valor) =>
                              setFormulario((atual) =>
                                atual
                                  ? {
                                      ...atual,
                                      disciplinas: {
                                        ...atual.disciplinas,
                                        [String(dia.valor)]: valor,
                                      },
                                    }
                                  : atual,
                              )
                            }
                            ariaLabel={`Disciplina de ${dia.rotulo}`}
                            maxLength={80}
                            autoComplete="off"
                            placeholder="Disciplina"
                            disabled={ocupado}
                          />
                        </Campo>
                      </Grid>
                    ),
                  )}
                </Grid>
              </FormControl>
            ) : null}
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={2}
              sx={{ justifyContent: "flex-end" }}
            >
              <Botao
                variante="contorno"
                type="button"
                onClick={() => setFormulario(null)}
                disabled={ocupado}
              >
                Cancelar
              </Botao>
              <Botao variante="secundario" type="submit" carregando={enviando} disabled={ocupado}>
                {formulario.id ? "Salvar" : "Criar"}
              </Botao>
            </Stack>
          </Box>
        )}
        {erro && !formulario ? (
          <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
        ) : null}
      </Stack>
      <DialogoConfirmacao
        aberto={confirmacao !== null}
        titulo={
          confirmacao?.tipo === "excluir"
            ? `Excluir a aula ${confirmacao.aula.ordem} das ${confirmacao.aula.inicio}?`
            : `${confirmacao?.aula.ativo ? "Desativar" : "Ativar"} a aula ${confirmacao?.aula.ordem ?? ""}?`
        }
        descricao={
          confirmacao?.tipo === "excluir"
            ? "A exclusão só é possível quando não há faltas registradas nesta aula. Com histórico, o caminho é desativar."
            : confirmacao?.aula.ativo
              ? "A aula deixa de aparecer na grade da turma. Faltas já registradas continuam guardadas."
              : "A aula volta a aparecer na grade da turma. Faltas já registradas continuam guardadas."
        }
        rotuloConfirmar={
          confirmacao?.tipo === "excluir"
            ? "Excluir"
            : confirmacao?.aula.ativo
              ? "Desativar"
              : "Ativar"
        }
        rotuloCancelar="Cancelar"
        destrutivo={confirmacao?.tipo === "excluir"}
        operacaoEmAndamento={confirmacao !== null && chaveAtiva === confirmacao.aula.id}
        onCancelar={() => setConfirmacao(null)}
        onConfirmar={confirmarAcao}
      />
    </Dialogo>
  );
}
