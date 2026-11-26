// Monta os avisos reais em uma largura estreita, sem sessão, banco ou requisições.
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import Stack from "@mui/material/Stack";
import { ThemeProvider } from "@mui/material/styles";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { tema } from "@/theme/tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz dos avisos ausente");
const descricao = "Confira a integração antes de repetir a consulta dos registros.";

createRoot(raiz).render(
  <ThemeProvider theme={tema} defaultMode="light">
    <CssBaseline />
    <Stack spacing={2} sx={{ p: 2 }}>
      <AlertaCompacto
        variante="indisponivel"
        titulo="Envio dos dados da escola não confirmado nesta consulta"
        descricao={descricao}
        tamanho="linha"
      />
      <AlertaCompacto variante="offline" descricao={descricao} tamanho="linha" />
      <AlertaCompacto variante="dados_invalidos" descricao={descricao} />
    </Stack>
  </ThemeProvider>,
);
