// Monta os componentes reais para testes isolados no navegador.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { tema } from "@/theme/tema";

function Aplicacao() {
  const [folha, setFolha] = useState(false);
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aberto, setAberto] = useState(false);
  return (
    <Box sx={{ p: 2 }}>
      <Botao type="button" onClick={() => setFolha(true)}>
        Abrir folha
      </Botao>
      <Dialogo
        aberto={folha}
        onFechar={() => setFolha(false)}
        titulo="Folha de teste"
        tamanho="grande"
      >
        <button type="button">Primeira ação</button>
      </Dialogo>
      <Botao type="button" onClick={() => setModal(true)}>
        Abrir modal
      </Botao>
      <Dialogo aberto={modal} onFechar={() => setModal(false)} titulo="Modal de teste">
        <p>Conteúdo modal</p>
      </Dialogo>
      <Botao type="button" onClick={() => setMenu(true)}>
        Abrir menu
      </Botao>
      <Dialogo aberto={menu} onFechar={() => setMenu(false)} titulo="Menu de teste">
        <p>Conteúdo do menu</p>
      </Dialogo>
      <Acordeao titulo="Configurações" aberto={aberto} onChange={setAberto}>
        <button type="button">Ação interna</button>
      </Acordeao>
      <button type="button">Ação externa</button>
    </Box>
  );
}

const raiz = document.getElementById("root");
if (raiz)
  createRoot(raiz).render(
    <ThemeProvider theme={tema}>
      <CssBaseline enableColorScheme />
      <Aplicacao />
    </ThemeProvider>,
  );
