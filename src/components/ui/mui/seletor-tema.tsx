"use client";

// Seletor de tema: preferência no next-themes e atributo de cor no Material UI.
import { useId, useState, useSyncExternalStore } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import MonitorRoundedIcon from "@mui/icons-material/MonitorRounded";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useColorScheme } from "@mui/material/styles";
import { useTheme } from "next-themes";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { normalizarModoTema, type ModoTema } from "./sincronizar-tema";

interface OpcaoTema {
  valor: ModoTema;
  rotulo: string;
  Icone: typeof MonitorRoundedIcon;
}

const OPCAO_SISTEMA: OpcaoTema = {
  valor: "system",
  rotulo: "Sistema",
  Icone: MonitorRoundedIcon,
};

const OPCOES: readonly OpcaoTema[] = [
  OPCAO_SISTEMA,
  { valor: "light", rotulo: "Claro", Icone: LightModeRoundedIcon },
  { valor: "dark", rotulo: "Escuro", Icone: DarkModeRoundedIcon },
];

const ALVO_TOQUE = {
  position: "relative",
  "&::after": {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    width: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    height: `max(100%, ${TOKENS_LAYOUT.alvoToque}px)`,
    transform: "translate(-50%, -50%)",
  },
} as const;

const assinarMontagem = () => () => undefined;
const obterMontado = () => true;
const obterNaoMontado = () => false;

/** Menu de três opções de tema, com o next-themes como fonte da preferência. */
export function SeletorTema() {
  const { theme, setTheme } = useTheme();
  const { mode } = useColorScheme();
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const idGatilho = useId();
  const idMenu = useId();
  const aberto = ancora !== null;
  // O tema só é conhecido depois da montagem: evita divergência de hidratação.
  const montado = useSyncExternalStore(assinarMontagem, obterMontado, obterNaoMontado);
  const preferencia = montado
    ? (normalizarModoTema(theme) ?? normalizarModoTema(mode) ?? "system")
    : "system";
  const atual = OPCOES.find((opcao) => opcao.valor === preferencia) ?? OPCAO_SISTEMA;
  const IconeAtual = atual.Icone;

  return (
    <>
      <IconButton
        id={idGatilho}
        aria-label={montado ? `Tema: ${atual.rotulo}. Alterar tema` : "Alterar tema"}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={(evento) => setAncora(evento.currentTarget)}
        sx={{ width: TOKENS_LAYOUT.botao.medio, height: TOKENS_LAYOUT.botao.medio, ...ALVO_TOQUE }}
      >
        <IconeAtual />
      </IconButton>
      <Menu
        id={idMenu}
        anchorEl={ancora}
        open={aberto}
        onClose={() => setAncora(null)}
        aria-labelledby={idGatilho}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: {
            role: "radiogroup",
            "aria-labelledby": idGatilho,
            sx: { minWidth: 180 },
          },
        }}
      >
        {OPCOES.map(({ valor, rotulo, Icone }) => {
          const ativo = preferencia === valor;
          return (
            <MenuItem
              key={valor}
              role="radio"
              aria-checked={ativo}
              selected={ativo}
              onClick={() => {
                setTheme(valor);
                setAncora(null);
              }}
              sx={{ minHeight: TOKENS_LAYOUT.lista.umaLinha }}
            >
              <ListItemIcon>
                <Icone fontSize="small" />
              </ListItemIcon>
              <ListItemText>{rotulo}</ListItemText>
              {ativo ? <CheckRoundedIcon fontSize="small" color="primary" /> : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
