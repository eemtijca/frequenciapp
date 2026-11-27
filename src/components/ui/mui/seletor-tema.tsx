"use client";

// Seletor de tema com as três opções do Material UI e hidratação segura.
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
import { TOKENS_LAYOUT } from "@/theme/layout";
import { ESTILO_ALVO_TOQUE } from "./alvo-toque";

type ModoTema = "light" | "dark" | "system";

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

const assinarMontagem = () => () => undefined;
const obterMontado = () => true;
const obterNaoMontado = () => false;

function normalizarModo(valor: string | undefined): ModoTema {
  return valor === "light" || valor === "dark" || valor === "system" ? valor : "system";
}

/** Menu de três opções de tema, com o modo de cor do Material UI como fonte única. */
export function SeletorTema() {
  const { mode, setMode } = useColorScheme();
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const idGatilho = useId();
  const idMenu = useId();
  const aberto = ancora !== null;
  // O tema só é conhecido depois da montagem: evita divergência de hidratação.
  const montado = useSyncExternalStore(assinarMontagem, obterMontado, obterNaoMontado);
  const preferencia = montado ? normalizarModo(mode) : "system";
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
        sx={{
          width: TOKENS_LAYOUT.botao.medio,
          height: TOKENS_LAYOUT.botao.medio,
          ...ESTILO_ALVO_TOQUE,
        }}
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
            "aria-label": "Tema do aplicativo",
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
                setMode(valor);
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
