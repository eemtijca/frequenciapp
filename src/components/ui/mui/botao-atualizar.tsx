"use client";

// Botão de atualização ligado ao contexto da visão ativa, com estado ocupado e ajuda.
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import type { SxProps, Theme } from "@mui/material/styles";
import { useContextoAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { BotaoIcone, type TamanhoBotao, type VarianteBotao } from "./botao";

export interface BotaoAtualizarProps {
  onAtualizar?: () => Promise<void> | void;
  ocupado?: boolean;
  disponivel?: boolean;
  rotulo?: string;
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  sx?: SxProps<Theme>;
}

/** Atualização da tela atual, desabilitada quando a visão não registra recarga. */
export function BotaoAtualizar({
  onAtualizar,
  ocupado,
  disponivel,
  rotulo = "Atualizar tela",
  variante = "contorno",
  tamanho = "medio",
  sx,
}: BotaoAtualizarProps) {
  const contexto = useContextoAtualizacao();
  const executar = onAtualizar ?? contexto?.atualizar;
  const carregando = ocupado ?? contexto?.ocupado ?? false;
  const ativo = disponivel ?? (onAtualizar !== undefined || contexto?.disponivel === true);
  const ajuda = carregando
    ? "Atualizando os dados da tela"
    : ativo
      ? rotulo
      : "Atualização indisponível nesta tela";

  return (
    <Tooltip title={ajuda} describeChild>
      <Box component="span" sx={{ display: "inline-flex", flexShrink: 0 }}>
        <BotaoIcone
          rotulo={rotulo}
          icone={<RefreshRoundedIcon />}
          variante={variante}
          tamanho={tamanho}
          carregando={carregando}
          disabled={!ativo || carregando}
          onClick={() => void executar?.()}
          sx={[
            (theme) => ({
              width: TOKENS_LAYOUT.alvoToque,
              height: TOKENS_LAYOUT.alvoToque,
              ...(variante === "contorno" ? { color: theme.vars.palette.text.secondary } : {}),
            }),
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        />
      </Box>
    </Tooltip>
  );
}
