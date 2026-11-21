"use client";

// Seção de cadastro com lista sempre visível e editor de inclusão sob demanda.
import { useState, type ReactNode } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Botao } from "@/components/ui/mui/botao";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  id: string;
  titulo: string;
  resumo: string;
  acao: string;
  editor: ReactNode;
  children: ReactNode;
}

export default function SecaoCatalogo({ id, titulo, resumo, acao, editor, children }: Props) {
  const [adicionando, setAdicionando] = useState(false);

  return (
    <Stack component="section" aria-labelledby={`${id}-titulo`} data-secao={id} spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" id={`${id}-titulo`} variant="h6">
            {titulo}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {resumo}
          </Typography>
        </Box>
        <Botao
          type="button"
          variante="contorno"
          aria-expanded={adicionando}
          aria-controls={`${id}-editor`}
          icone={!adicionando ? <AddRoundedIcon /> : undefined}
          onClick={() => setAdicionando((aberto) => !aberto)}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          {adicionando ? "Recolher formulário" : acao}
        </Botao>
      </Stack>
      <Box id={`${id}-editor`} hidden={!adicionando} inert={!adicionando}>
        {editor}
      </Box>
      {children}
    </Stack>
  );
}
