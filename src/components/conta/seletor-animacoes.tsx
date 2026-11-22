"use client";

// Opções de animação no menu da conta e acionador de Minhas turmas.
import { useId, useState } from "react";
import AnimationRoundedIcon from "@mui/icons-material/AnimationRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import Box from "@mui/material/Box";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import { TOKENS_LAYOUT } from "@/theme/layout";
import type { ModoAnimacoes } from "@/theme/preferencia-animacoes";

const ROTULO = "Animações da interface";
const OPCOES = [
  { valor: "sistema", rotulo: "Sistema" },
  { valor: "ativadas", rotulo: "Ativadas" },
  { valor: "desativadas", rotulo: "Desativadas" },
] as const satisfies readonly { valor: ModoAnimacoes; rotulo: string }[];

export function OpcoesAnimacoes() {
  const { modo, definirModo } = useAnimacoesDaInterface();
  const idRotulo = useId();

  return (
    <Box component="li" role="presentation">
      <Typography
        id={idRotulo}
        component="p"
        variant="caption"
        sx={{ px: 1.5, py: 0.5, color: "text.secondary" }}
      >
        {ROTULO}
      </Typography>
      <Box
        component="ul"
        role="group"
        aria-labelledby={idRotulo}
        sx={{ listStyle: "none", p: 0, m: 0 }}
      >
        {OPCOES.map(({ valor, rotulo }) => (
          <MenuItem
            key={valor}
            role="menuitemradio"
            aria-checked={modo === valor}
            selected={modo === valor}
            onClick={() => definirModo(valor)}
            sx={{
              px: 1.5,
              minHeight: TOKENS_LAYOUT.alvoToque,
              "&.Mui-focusVisible": {
                boxShadow: (tema) => `inset 0 0 0 2px ${tema.vars.palette.primary.main}`,
              },
            }}
          >
            <ListItemText>{rotulo}</ListItemText>
            {modo === valor ? <CheckRoundedIcon fontSize="small" color="primary" /> : null}
          </MenuItem>
        ))}
      </Box>
    </Box>
  );
}

export function SeletorAnimacoes() {
  const id = useId();
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const { modo } = useAnimacoesDaInterface();
  const atual = OPCOES.find(({ valor }) => valor === modo)?.rotulo;
  const aberto = ancora !== null;

  return (
    <>
      <BotaoIcone
        rotulo={`${ROTULO}: ${atual}`}
        title={ROTULO}
        icone={<AnimationRoundedIcon />}
        variante="texto"
        onClick={(evento) => setAncora(evento.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        sx={{ width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque }}
      />
      <Menu
        anchorEl={ancora}
        open={aberto}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ list: { id, "aria-label": ROTULO, sx: { minWidth: 192 } } }}
      >
        <OpcoesAnimacoes />
      </Menu>
    </>
  );
}
