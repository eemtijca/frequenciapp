// Próximas provas bimestrais da turma consultada em Horários, agrupadas por data.
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { rotuloDataCurta, rotuloDiaSemana } from "@/domain/frequencia";
import {
  provasPorDia,
  proximasProvasDaTurma,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";
import { Cartao } from "@/components/ui/mui/cartao";
import { Selo } from "@/components/ui/mui/selo";

interface Props {
  provas: readonly ProvaBimestral[];
  turmaId: string | undefined;
  turmaRotulo: string;
  diaCorrente: string;
}

function rotuloDoDia(dia: string): string {
  const nome = rotuloDiaSemana(dia);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${rotuloDataCurta(dia)}`;
}

/** Some quando a turma não tem prova de hoje em diante. */
export default function CartaoProvasBimestrais({
  provas,
  turmaId,
  turmaRotulo,
  diaCorrente,
}: Props) {
  const dias = provasPorDia(proximasProvasDaTurma(provas, turmaId, diaCorrente));
  if (dias.length === 0) return null;

  return (
    <Cartao
      component="section"
      aria-label={`Provas bimestrais de ${turmaRotulo}`}
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
          Provas bimestrais · {turmaRotulo}
        </Typography>
      </Stack>
      <List disablePadding>
        {dias.map((grupo) => (
          <ListItem key={grupo.dia} divider sx={{ display: "block", px: 2, py: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
              <Typography component="h3" variant="subtitle2">
                {rotuloDoDia(grupo.dia)}
              </Typography>
              {grupo.dia === diaCorrente ? <Selo rotulo="hoje" tom="sucesso" /> : null}
            </Stack>
            <List disablePadding>
              {grupo.provas.map((prova) => (
                <ListItem key={prova.id} disableGutters sx={{ gap: 2, py: 0.5 }}>
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    {prova.disciplina}
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
                    <ScheduleRoundedIcon
                      aria-hidden="true"
                      sx={{ fontSize: 14, color: "text.secondary" }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {prova.inicio} às {prova.fim}
                    </Typography>
                  </Stack>
                </ListItem>
              ))}
            </List>
          </ListItem>
        ))}
      </List>
    </Cartao>
  );
}
