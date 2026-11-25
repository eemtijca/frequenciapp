// Informações curtas de um registro em selos e pilha, com agrupamento acessível.
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";

export interface CaixasDeInfoProps {
  itens: ReadonlyArray<string | null | undefined | false>;
  rotulo?: string;
  sx?: SxProps<Theme>;
}

/** Lista de informações curtas em selos que quebram linha sem perder a leitura. */
export function CaixasDeInfo({ itens, rotulo, sx }: CaixasDeInfoProps) {
  const visiveis = itens.filter((item): item is string => Boolean(item));
  if (visiveis.length === 0) return null;

  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={0.5}
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      sx={[
        {
          flexWrap: "wrap",
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {visiveis.map((item, indice) => (
        <Chip
          key={indice}
          variant="outlined"
          size="small"
          label={item}
          sx={{
            height: "auto",
            maxWidth: "100%",
            "& .MuiChip-label": {
              paddingY: 0.5,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            },
          }}
        />
      ))}
    </Stack>
  );
}
