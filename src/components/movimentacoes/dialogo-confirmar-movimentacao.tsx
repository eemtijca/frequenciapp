"use client";

// Confirmação explícita de um registro de saída ou entrada antes de gravar.
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";

interface Item {
  rotulo: string;
  valor: string;
}

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  itens: Item[];
  onConfirmar: () => void;
}

export function DialogoConfirmarMovimentacao({
  aberto,
  onAbrir,
  titulo,
  descricao,
  rotuloConfirmar,
  itens,
  onConfirmar,
}: Props) {
  const visiveis = itens.filter((item) => item.valor);

  return (
    <DialogoConfirmacao
      aberto={aberto}
      titulo={titulo}
      descricao={
        <Stack spacing={2}>
          <Typography component="p" variant="body2">
            {descricao}
          </Typography>
          {visiveis.length > 0 ? (
            <Box component="dl" sx={{ m: 0 }}>
              <Stack spacing={1}>
                {visiveis.map((item) => (
                  <Stack
                    key={item.rotulo}
                    component="div"
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "flex-start" }}
                  >
                    <Typography
                      component="dt"
                      variant="body2"
                      sx={{ width: 112, flexShrink: 0, color: "text.secondary" }}
                    >
                      {item.rotulo}
                    </Typography>
                    <Typography
                      component="dd"
                      variant="body2"
                      sx={{ m: 0, minWidth: 0, color: "text.primary", overflowWrap: "anywhere" }}
                    >
                      {item.valor}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      }
      onConfirmar={onConfirmar}
      onCancelar={() => onAbrir(false)}
      rotuloCancelar="Revisar"
      rotuloConfirmar={rotuloConfirmar}
    />
  );
}
