// Exercita os mesmos componentes de Conta e Notificações sem shell, login ou banco.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import { BotaoIcone } from "@/components/ui/mui/botao";
import { MenuConta } from "@/components/conta/menu-conta";
import DialogoNotificacoes from "@/components/conta/dialogo-notificacoes";
import { ProvedorTema } from "@/theme/provedor-tema";

function ContaSintetica() {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLElement | null>(null);
  const diretor = location.pathname === "/diretor";

  function abrir(origem: HTMLElement | null) {
    gatilho.current = origem;
    setAberto(true);
  }

  return (
    <ProvedorTema>
      <Box
        component="header"
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          p: 1,
          minHeight: 56,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {diretor && (
          <BotaoIcone
            rotulo="Configurar notificações"
            icone={<NotificationsRoundedIcon />}
            variante="texto"
            onClick={(evento) => abrir(evento.currentTarget)}
          />
        )}
      </Box>
      {!diretor && (
        <Box sx={{ position: "absolute", left: 8, bottom: 8, width: 240 }}>
          <MenuConta
            usuario={{
              id: "qa",
              nome: "Pessoa sintética",
              email: "pessoa@escola.test",
              papel: "COORDENACAO",
              ativo: true,
            }}
            movel={window.innerWidth < 905}
            saindo={false}
            onAcao={(acao, origem) => {
              if (acao === "notificacoes") abrir(origem);
            }}
          />
        </Box>
      )}
      <DialogoNotificacoes
        aberto={aberto}
        onAbrir={setAberto}
        onDevolverFoco={diretor ? undefined : () => gatilho.current?.focus()}
      />
    </ProvedorTema>
  );
}

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
createRoot(raiz).render(<ContaSintetica />);
