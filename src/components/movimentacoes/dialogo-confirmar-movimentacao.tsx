"use client";

// Confirmação explícita de um registro de saída ou entrada antes de gravar.

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
            <Stack component="dl" spacing={1} useFlexGap sx={{ m: 0 }}>
              {visiveis.map((item) => (
                <Stack
                  key={item.rotulo}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={{ xs: 0.5, sm: 1 }}
                  useFlexGap
                >
                  <Typography
                    component="dt"
                    variant="body2"
                    sx={{ width: { sm: 112 }, flexShrink: 0, color: "text.secondary" }}
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
