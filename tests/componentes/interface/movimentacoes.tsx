// Monta as abas reais de movimentações com cadastro sintético, sem sessão ou banco.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import "dayjs/locale/pt-br";
import {
  ProvedorAtualizacao,
  useContextoAtualizacao,
} from "@/components/atualizacao/contexto-atualizacao";
import { LayoutConteudo } from "@/components/layout/layout-conteudo";
import VistaMovimentacoes from "@/components/movimentacoes/vista-movimentacoes";
import { useSaidasMensais } from "@/components/movimentacoes/use-historico-movimentacoes";
import { DIA, NOME, RESPONSAVEL, SAIDAS, TURMA } from "./movimentacoes-dados";
import { tema } from "@/theme/tema";

function AtualizacaoFixture() {
  const contexto = useContextoAtualizacao();
  return (
    <button
      type="button"
      disabled={!contexto?.disponivel || contexto.ocupado}
      onClick={() => void contexto?.atualizar()}
    >
      Atualizar tela
    </button>
  );
}

function Fixture() {
  const parametros = new URLSearchParams(window.location.search);
  const mes = parametros.has("remoto") ? "2026-10" : "2026-11";
  const saidas = useSaidasMensais(mes, parametros.has("vazio") ? [] : SAIDAS);
  const alunos = SAIDAS.map(({ alunoId }, i) => ({
    id: alunoId,
    nome: i === 0 ? NOME : `Aluno de histórico ${i}`,
    turmaId: "turma-b",
    turmaOriginalId: "turma-b",
    ordem: i + 1,
    ativo: i === 0,
  }));
  return (
    <ThemeProvider theme={tema} defaultMode="system" disableTransitionOnChange>
      <CssBaseline enableColorScheme />
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="pt-br">
        <ProvedorAtualizacao ativo="saidas" atualizadoEmInicial="2026-11-19T12:10:00Z">
          <Box
            component="main"
            sx={{
              ml: { md: "256px" },
              pt: { xs: 7, md: 8 },
              maxWidth: parametros.has("estreito") ? 420 : undefined,
            }}
          >
            {parametros.has("atualizar") && <AtualizacaoFixture />}
            <LayoutConteudo largura="leitura">
              <VistaMovimentacoes
                ativo
                abaInicial={parametros.get("aba") === "entradas" ? "entradas" : "saidas"}
                diaCorrente={DIA}
                mes={mes}
                fuso="America/Fortaleza"
                turmas={[
                  {
                    id: "turma-b",
                    serieId: "serie",
                    nome: "B",
                    rotulo: TURMA,
                    serieNome: TURMA,
                    horarios: [],
                  },
                ]}
                alunos={alunos}
                catalogoJustificativas={[
                  { codigo: "TESTE", rotulo: "Motivo sintético", ativo: true },
                ]}
                liberadores={[{ codigo: "teste", rotulo: RESPONSAVEL, ativo: true }]}
                saidas={saidas.registros}
                leituraMensal={saidas.leitura}
                onSaidasMudaram={saidas.recarregar}
              />
            </LayoutConteudo>
          </Box>
        </ProvedorAtualizacao>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
createRoot(raiz).render(<Fixture />);
