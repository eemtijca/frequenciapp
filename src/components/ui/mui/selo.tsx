// Selo compacto do Material UI para estados curtos de cadastros e resumos.
import type { ReactNode } from "react";
import Chip, { type ChipProps } from "@mui/material/Chip";

export type TomSelo = "neutro" | "sucesso" | "atencao" | "perigo";
export type TamanhoSelo = "pequeno" | "medio";

const TONS = {
  neutro: "default",
  sucesso: "success",
  atencao: "warning",
  perigo: "error",
} as const satisfies Record<TomSelo, ChipProps["color"]>;

export type SeloProps = Omit<ChipProps, "color" | "size" | "label" | "className"> & {
  /** Texto do selo, equivalente ao conteúdo enviado como children. */
  rotulo?: ReactNode;
  tom?: TomSelo;
  tamanho?: TamanhoSelo;
};

/** Selo em pílula com os tons neutro, sucesso, atenção e perigo do tema. */
export function Selo({
  rotulo,
  children,
  tom = "neutro",
  tamanho = "pequeno",
  sx,
  ...props
}: SeloProps) {
  return (
    <Chip
      label={rotulo ?? children}
      color={TONS[tom]}
      size={tamanho === "pequeno" ? "small" : "medium"}
      sx={[
        {
          maxWidth: "100%",
          "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    />
  );
}
