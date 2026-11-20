// Monta botões, campos e diálogo reais para verificar foco por teclado e ponteiro.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { Botao } from "@/components/ui/mui/botao";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { tema } from "@/theme/tema";

function Aplicacao() {
  const [nome, setNome] = useState("");
  const [nomeCurto, setNomeCurto] = useState("");
  const [dialogo, setDialogo] = useState(false);
  const [campoDialogo, setCampoDialogo] = useState("");
  return (
    <Box
      component="main"
      data-pronto="sim"
      sx={{ display: "flex", maxWidth: 480, flexDirection: "column", gap: 2, p: 2 }}
    >
      <Botao type="button">Primeira ação</Botao>
      <CampoTexto ariaLabel="Nome" valor={nome} onValor={setNome} />
      <CampoTexto
        ariaLabel="Nome curto"
        valor={nomeCurto}
        onValor={setNomeCurto}
        tamanho="pequeno"
      />
      <Botao type="button" onClick={() => setDialogo(true)}>
        Abrir diálogo
      </Botao>
      <Botao type="button" variante="contorno">
        Controle externo
      </Botao>
      <Dialogo
        aberto={dialogo}
        onFechar={() => setDialogo(false)}
        titulo="Diálogo de teste"
        descricao="Conteúdo de teste"
        acoes={
          <Botao type="button" onClick={() => setDialogo(false)}>
            Concluir
          </Botao>
        }
      >
        <CampoTexto ariaLabel="Campo do diálogo" valor={campoDialogo} onValor={setCampoDialogo} />
      </Dialogo>
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
