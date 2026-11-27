"use client";

// Menu flutuante da conta: perfil, notificações, senha, Sobre e saída.
import { useId, useRef, useState, type ReactNode } from "react";
import useMediaQuery from "@mui/material/useMediaQuery";
import ArrowDropUpRoundedIcon from "@mui/icons-material/ArrowDropUpRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import type { Identidade } from "@/domain/usuarios";
import { rotuloDePapel, temCapacidade } from "@/domain/usuarios";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { OpcoesAnimacoes } from "./seletor-animacoes";

export type AcaoConta = "notificacoes" | "senha" | "sobre" | "sair";

interface Props {
  usuario: Identidade;
  movel: boolean;
  saindo: boolean;
  onAcao: (acao: AcaoConta, gatilho: HTMLElement | null) => void;
}

interface ItemProps {
  icone: ReactNode;
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
}

const ALTURA_CURTA = "(max-height: 400px)";

const sxItemFocado = (tema: Theme) => ({
  // O teclado marca :focus-visible mesmo quando o MUI não aplica Mui-focusVisible.
  "&.Mui-focusVisible, &:focus-visible": {
    backgroundColor: tema.vars.palette.action.hover,
    boxShadow: `inset 0 0 0 2px ${tema.vars.palette.primary.main}`,
  },
});

const sxItemCompacto = {
  minHeight: TOKENS_LAYOUT.alvoToque,
  [`@media ${ALTURA_CURTA}`]: { minHeight: 44, py: 0 },
};

function Item({ icone, rotulo, onClick, disabled }: ItemProps) {
  return (
    <MenuItem
      onClick={onClick}
      disabled={disabled}
      sx={[{ gap: 1.5, px: 1.5 }, sxItemCompacto, sxItemFocado]}
    >
      <ListItemIcon sx={{ minWidth: 0, color: "text.secondary" }}>{icone}</ListItemIcon>
      <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {rotulo}
      </Box>
    </MenuItem>
  );
}

export function MenuConta({ usuario, movel, saindo, onAcao }: Props) {
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);
  const gatilhoRef = useRef<HTMLButtonElement | null>(null);
  const idMenu = useId();
  const aberto = ancora !== null;
  const alturaCurta = useMediaQuery(ALTURA_CURTA);

  function acionar(acao: AcaoConta) {
    setAncora(null);
    onAcao(acao, gatilhoRef.current);
  }

  return (
    <>
      <ListItemButton
        ref={gatilhoRef}
        component="button"
        type="button"
        aria-haspopup="menu"
        aria-label={`Conta de ${usuario.nome}`}
        aria-expanded={aberto}
        aria-controls={aberto ? idMenu : undefined}
        onClick={(evento) => setAncora(evento.currentTarget)}
        sx={{
          width: "100%",
          minHeight: TOKENS_LAYOUT.alvoToque,
          px: 1,
          py: 0.75,
          gap: 1.25,
          borderRadius: 2,
          textAlign: "left",
        }}
      >
        <Avatar
          aria-hidden="true"
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            bgcolor: "secondary.main",
            color: "secondary.contrastText",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {usuario.nome.slice(0, 1).toUpperCase()}
        </Avatar>
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {usuario.nome}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: "text.secondary" }}>
            {rotuloDePapel(usuario.papel)}
          </Typography>
        </Box>
        <ArrowDropUpRoundedIcon
          fontSize="small"
          aria-hidden="true"
          sx={{ flexShrink: 0, color: "text.secondary" }}
        />
      </ListItemButton>
      <Menu
        variant="menu"
        anchorEl={ancora}
        open={aberto}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        marginThreshold={alturaCurta ? 4 : 8}
        slotProps={{
          list: {
            id: idMenu,
            "aria-label": "Conta",
            sx: alturaCurta ? { py: 0.25 } : undefined,
          },
          paper: {
            sx: {
              width: 272,
              maxWidth: "calc(100vw - 24px)",
              ...(alturaCurta ? { maxHeight: "calc(100dvh - 8px)" } : {}),
            },
          },
        }}
      >
        <Box
          sx={{
            px: 1.5,
            py: alturaCurta ? 0.25 : 1,
            borderBottom: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
        >
          <Typography variant="caption" noWrap component="p">
            {movel ? "Conta" : usuario.email}
          </Typography>
        </Box>
        {temCapacidade(usuario.papel, "receberNotificacoes") ? (
          <Item
            icone={<NotificationsRoundedIcon fontSize="small" aria-hidden="true" />}
            rotulo="Notificações"
            onClick={() => acionar("notificacoes")}
          />
        ) : null}
        <Item
          icone={<KeyRoundedIcon fontSize="small" aria-hidden="true" />}
          rotulo="Trocar senha"
          onClick={() => acionar("senha")}
        />
        <Item
          icone={<InfoRoundedIcon fontSize="small" aria-hidden="true" />}
          rotulo="Sobre"
          onClick={() => acionar("sobre")}
        />
        <Divider component="li" role="separator" sx={{ my: alturaCurta ? 0.25 : 0.75 }} />
        <OpcoesAnimacoes compacto={alturaCurta} />
        <Divider component="li" role="separator" sx={{ my: alturaCurta ? 0.25 : 0.75 }} />
        <Item
          icone={<LogoutRoundedIcon fontSize="small" aria-hidden="true" />}
          rotulo="Sair da conta"
          onClick={() => acionar("sair")}
          disabled={saindo}
        />
      </Menu>
    </>
  );
}
