// Indicador visual compartilhado para feriados nos cartões do Painel.
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";

interface Props {
  nome: string;
}

export function IndicadorFeriado({ nome }: Props) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Box
        sx={(theme) => ({
          display: "flex",
          width: { xs: 48, sm: 56 },
          height: { xs: 48, sm: 56 },
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: "50%",
          color: theme.vars.palette.text.secondary,
        })}
      >
        <EventBusyRoundedIcon aria-hidden="true" />
      </Box>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", overflowWrap: "anywhere", minWidth: 0 }}
      >
        {nome}
      </Typography>
    </Box>
  );
}
