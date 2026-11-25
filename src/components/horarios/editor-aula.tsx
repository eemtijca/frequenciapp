"use client";

// Rascunho de uma aula na grade, com campos acessíveis e gravação solicitada pelo formulário.
import { useEffect, useRef } from "react";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { SeletorHorario } from "@/components/ui/mui/seletor-horario";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";

export interface RascunhoAula {
  aulaId: string;
  turmaId: string;
  turmaRotulo: string;
  ordem: number;
  dia: number | null;
  disciplina: string;
  disciplinaInicial: string;
  inicio: string;
  inicioInicial: string;
  fim: string;
  fimInicial: string;
}

interface Props {
  rascunho: RascunhoAula;
  identificador: string;
  rotuloDia: string;
  ocupado: boolean;
  somenteLeitura?: boolean;
  alterado: boolean;
  erro: string;
  erroVariante: VarianteEstado;
  onAlterar: (rascunho: RascunhoAula) => void;
  onSalvar: () => void;
  onCancelar: () => void;
}

export function EditorAula({
  rascunho,
  identificador,
  rotuloDia,
  ocupado,
  somenteLeitura = false,
  alterado,
  erro,
  erroVariante,
  onAlterar,
  onSalvar,
  onCancelar,
}: Props) {
  const formulario = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    // A grade e a lista compartilham o rascunho; apenas a versão visível recebe o foco.
    if (!formulario.current?.getClientRects().length) return;
    const texto = formulario.current.querySelector<HTMLInputElement>(
      "input.MuiOutlinedInput-input:not(:disabled)",
    );
    const horario = formulario.current.querySelector<HTMLElement>("[role='spinbutton']");
    const botao = formulario.current.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (texto ?? horario ?? botao)?.focus({ preventScroll: true });
  }, []);

  return (
    <Box
      component="form"
      ref={formulario}
      aria-label={`Editar ${rascunho.ordem}ª aula${rascunho.dia ? ` de ${rotuloDia}` : ""}`}
      aria-busy={ocupado}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!ocupado && !somenteLeitura && alterado) onSalvar();
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
        backgroundColor: "action.hover",
      }}
    >
      <Typography component="h3" variant="subtitle2">
        {rascunho.ordem}ª aula{rascunho.dia ? ` · ${rotuloDia}` : " · Horário"}
      </Typography>
      <Grid container spacing={2}>
        {rascunho.dia !== null ? (
          <Grid size={12}>
            <Campo id={`${identificador}-disciplina`} rotulo="Disciplina">
              <CampoTexto
                valor={rascunho.disciplina}
                onValor={(disciplina) => onAlterar({ ...rascunho, disciplina })}
                maxLength={80}
                disabled={ocupado || somenteLeitura}
                placeholder="Sem disciplina"
                autoComplete="off"
              />
            </Campo>
          </Grid>
        ) : null}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Campo id={`${identificador}-inicio`} rotulo="Início">
            <SeletorHorario
              valor={rascunho.inicio}
              disabled={ocupado || somenteLeitura}
              rotuloAcessivel="Início da aula"
              onValor={(inicio) => onAlterar({ ...rascunho, inicio })}
            />
          </Campo>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Campo id={`${identificador}-fim`} rotulo="Fim">
            <SeletorHorario
              valor={rascunho.fim}
              disabled={ocupado || somenteLeitura}
              rotuloAcessivel="Fim da aula"
              onValor={(fim) => onAlterar({ ...rascunho, fim })}
            />
          </Campo>
        </Grid>
      </Grid>
      {erro ? (
        <AlertaCompacto
          variante={erroVariante}
          titulo={erro}
          descricao="As alterações continuam no formulário."
          tamanho="linha"
        />
      ) : null}
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}
      >
        <Botao variante="contorno" type="button" disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </Botao>
        <Botao
          variante="secundario"
          type="submit"
          carregando={ocupado}
          disabled={somenteLeitura || !alterado}
          icone={<SaveRoundedIcon />}
        >
          Salvar alterações
        </Botao>
      </Stack>
    </Box>
  );
}
