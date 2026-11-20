// Os componentes de produção são montados sobre as duas superfícies do tema claro.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import OutlinedInput from "@mui/material/OutlinedInput";
import Stack from "@mui/material/Stack";
import { ThemeProvider } from "@mui/material/styles";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { tema } from "@/theme/tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");

function Campos({ superficie }: { superficie: string }) {
  const [valor, setValor] = useState("um");
  const [simples, setSimples] = useState("");
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [senha, setSenha] = useState("senha-teste");
  return (
    <Stack spacing={2} sx={{ p: 2 }} data-superficie={superficie}>
      <CampoTexto ariaLabel={`Texto ${superficie}`} valor={texto} onValor={setTexto} />
      <Selecionar
        ariaLabel={`Seletor ${superficie}`}
        valor={simples}
        onValor={setSimples}
        opcoes={[
          { valor: "um", rotulo: "Um" },
          { valor: "dois", rotulo: "Dois" },
        ]}
      />
      <BarraBusca
        id={`busca-${superficie}`}
        valor={busca}
        onValor={setBusca}
        placeholder={`Busca ${superficie}`}
      />
      <Selecionar
        ariaLabel={`Buscável ${superficie}`}
        valor={valor}
        onValor={setValor}
        opcoes={[
          { valor: "um", rotulo: "Um" },
          { valor: "dois", rotulo: "Dois" },
        ]}
        buscavel
      />
      <OutlinedInput
        aria-label={`Inválido ${superficie}`}
        aria-invalid="true"
        defaultValue="Inválido"
      />
      <OutlinedInput aria-label={`Desabilitado ${superficie}`} disabled defaultValue="Bloqueado" />
      <CampoSenha id={`senha-${superficie}`} valor={senha} onValor={setSenha} autoComplete="off" />
    </Stack>
  );
}

createRoot(raiz).render(
  <ThemeProvider theme={tema}>
    <CssBaseline enableColorScheme />
    <Box component="main" sx={{ p: 2 }}>
      <Campos superficie="pagina" />
      <Box sx={{ bgcolor: "background.paper", borderRadius: 2, p: 1 }}>
        <Campos superficie="cartao" />
      </Box>
    </Box>
  </ThemeProvider>,
);
