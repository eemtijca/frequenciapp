"use client";

// Seletor de horário em 24 horas com TimePicker, valor HH:mm, pt-BR e alvo de 48 dp.
import dayjs, { type Dayjs } from "dayjs";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { useCampo } from "./campo";

const FORMATO_HORARIO = "HH:mm";
const EXPRESSAO_HORARIO = /^(?<hora>[01]\d|2[0-3]):(?<minuto>[0-5]\d)$/;
const REFERENCIA = dayjs().hour(12).minute(0).second(0).millisecond(0);
const ROTULO_INVISIVEL = {
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

export function paraHorario(valor: string): Dayjs | null {
  const resultado = EXPRESSAO_HORARIO.exec(valor);
  const hora = Number(resultado?.groups?.hora);
  const minuto = Number(resultado?.groups?.minuto);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null;
  return dayjs().hour(hora).minute(minuto).second(0).millisecond(0);
}

export function deHorario(valor: Dayjs | null): string {
  if (!valor || !valor.isValid()) return "";
  return valor.format(FORMATO_HORARIO);
}

export interface SeletorHorarioProps {
  id?: string;
  valor: string;
  disabled?: boolean;
  rotuloAcessivel: string;
  /** Horário atual "HH:mm"; define a referência de abertura quando o campo está vazio. */
  agora?: string;
  onValor: (valor: string) => void;
}

export function SeletorHorario({
  id,
  valor,
  disabled,
  rotuloAcessivel,
  agora,
  onValor,
}: SeletorHorarioProps) {
  const campo = useCampo();
  const idFinal = campo?.id ?? id;
  const desabilitado = disabled ?? campo?.disabled ?? false;
  const referencia = paraHorario(agora ?? "") ?? REFERENCIA;

  return (
    <TimePicker
      value={paraHorario(valor)}
      onChange={(novo) => onValor(deHorario(novo))}
      format={FORMATO_HORARIO}
      ampm={false}
      views={["hours", "minutes"]}
      timeSteps={{ minutes: 1 }}
      minutesStep={1}
      referenceDate={referencia}
      disabled={desabilitado}
      label={rotuloAcessivel}
      slotProps={{
        textField: {
          id: idFinal,
          fullWidth: true,
          error: Boolean(campo?.erro),
          slotProps: {
            htmlInput: { "aria-describedby": campo?.descritoPor },
            ...(campo
              ? {
                  input: { notched: false },
                  inputLabel: { sx: ROTULO_INVISIVEL },
                }
              : {}),
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
              boxShadow: `0 0 0 ${TOKENS_LAYOUT.campo.foco}px color-mix(in srgb, ${tema.vars.palette.primary.main} 24%, transparent)`,
            },
          }),
        },
        openPickerButton: {
          sx: { width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque },
        },
        actionBar: {
          sx: { "& .MuiButton-root": { minHeight: TOKENS_LAYOUT.alvoToque } },
        },
        digitalClockItem: {
          sx: { minHeight: TOKENS_LAYOUT.alvoToque },
        },
        digitalClockSectionItem: {
          sx: { minHeight: TOKENS_LAYOUT.alvoToque },
        },
      }}
      sx={{ width: "100%" }}
    />
  );
}
