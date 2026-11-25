// Monta o relatório real com o tema e a moldura da amostra, sem shell ou banco.
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";
import { ProvedorTema } from "@/theme/provedor-tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
const longo = new URLSearchParams(location.search).has("longo");
const turmaB = "Ano QA B";
createRoot(raiz).render(
  <ProvedorTema>
    <Box
      component="main"
      sx={{
        ml: { xs: 2, sm: 4, md: "303px" },
        mr: { xs: 2, sm: 4, md: "47px" },
        pt: { xs: "106px", md: "130px" },
      }}
    >
      <VistaMovimentacoes
        ativa
        hoje="2026-11-23"
        turmas={[
          {
            id: "a",
            nome: "A atual",
            rotulo: "Ano QA A atual",
            serieId: "qa",
            serieNome: "Ano QA",
            horarios: [],
          },
          { id: "b", nome: "B", rotulo: turmaB, serieId: "qa", serieNome: "Ano QA", horarios: [] },
        ]}
        alunos={[
          {
            id: "aurora",
            nome: longo ? `Estudante ${"Aurora".repeat(15)}` : "Estudante QA Aurora",
            turmaId: "b",
            turmaOriginalId: "a",
            ordem: 1,
            ativo: true,
          },
          {
            id: "horizonte",
            nome: "Estudante QA Horizonte",
            turmaId: "b",
            turmaOriginalId: "b",
            ordem: 2,
            ativo: true,
          },
        ]}
      />
    </Box>
  </ProvedorTema>,
);
