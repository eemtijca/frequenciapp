// Visões reais, com dados sintéticos e rede controlada pelo teste.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import "dayjs/locale/pt-br";
import VistaGrade from "@/components/grade/vista-grade";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";
import VistaPainel from "@/components/painel/vista-painel";
import VistaFrequencia from "@/components/chamada/vista-frequencia";
import VistaFrequenciaParcial from "@/components/chamada-parcial/vista-frequencia-parcial";
import VistaEntradas from "@/components/movimentacoes/vista-entradas";
import VistaSaidas from "@/components/movimentacoes/vista-saidas";
import PorAluno from "@/components/relatorios/por-aluno";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import VistaMinhasTurmas from "@/components/diretor/vista-minhas-turmas";
import { CONFIGURACOES_PADRAO } from "@/domain/frequencia";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { tema } from "@/theme/tema";

const data = "2026-11-01"; // Domingo: resumo da semana.
const comum = { diaCorrente: data, fuso: "America/Sao_Paulo", turmas: [], alunos: [] };
const vazio = async () => {};
const turma = {
  id: "turma",
  serieId: "serie",
  nome: "A",
  rotulo: "1º ano A",
  serieNome: "1º ano",
  horarios: [],
};
function GradeFixture() {
  const [mes, setMes] = useState("2026-11");
  return (
    <VistaGrade
      alunos={[]}
      frequencias={[]}
      resumo={null}
      mes={mes}
      mesCorrente="2026-11"
      hoje={data}
      aberto={false}
      versao={0}
      origens={[]}
      onMes={setMes}
    />
  );
}
function MesFixture({ tela }: { tela: "por-aluno" | "resumo" | "historico" }) {
  const [mes, setMes] = useState("2026-11");
  const periodo = { mes, mesCorrente: "2026-11", onMes: setMes };
  const dados = { alunos: [], turmas: [], series: [], frequencias: [] };
  if (tela === "por-aluno") return <PorAluno {...periodo} {...dados} saidas={[]} resumo={null} />;
  if (tela === "historico")
    return (
      <VistaHistorico
        {...periodo}
        {...dados}
        fuso="America/Sao_Paulo"
        onAbrir={() => {}}
        bloqueado={false}
        rotuloTurma={() => ""}
      />
    );
  return (
    <ResumoRelatorios
      {...periodo}
      {...dados}
      diaCorrente={data}
      bloqueado={new URLSearchParams(location.search).has("bloqueado")}
      carregando={false}
      erro={null}
    />
  );
}
const telas = {
  grade: <GradeFixture />,
  "por-aluno": <MesFixture tela="por-aluno" />,
  resumo: <MesFixture tela="resumo" />,
  historico: <MesFixture tela="historico" />,
  diretor: (
    <VistaMinhasTurmas
      contexto={{
        trocaObrigatoria: false,
        turmas: [{ turmaId: "turma", turma: "1º ano A", inicio: "2026-01-01", fim: null }],
        categorias: [],
        limiteRiscoPercentual: 25,
        diaCorrente: data,
      }}
      onAtualizado={() => {}}
    />
  ),
  relatorio: <VistaMovimentacoes hoje={data} turmas={[]} alunos={[]} ativa={false} />,
  outros: (
    <div>
      <SeletorPeriodo
        id="outro"
        modo="mes"
        valor="2026-10"
        max="2026-11"
        rotuloAcessivel="Mês do relatório"
        rotulo="Outubro"
        onValor={() => {}}
      />
      <button type="button" aria-pressed="true">
        Filtro selecionado
      </button>
      <button type="button">Outro controle</button>
    </div>
  ),
  painel: (
    <VistaPainel
      {...comum}
      ativo
      mes="2026-11"
      series={[]}
      frequencias={[]}
      saidas={[]}
      configuracoes={CONFIGURACOES_PADRAO}
      onRecarregar={vazio}
      onRecarregarConfiguracoes={vazio}
    />
  ),
  chamada: (
    <VistaFrequencia
      {...comum}
      turmas={[turma]}
      usuario={{
        id: "teste",
        nome: "Teste",
        email: "teste@example.org",
        papel: "ADMIN",
        ativo: true,
      }}
      ativo
      alvo={null}
      configuracoes={CONFIGURACOES_PADRAO}
      catalogoJustificativas={[]}
      versaoFrequencias={0}
      onFrequenciasMudaram={vazio}
      onPendencia={() => {}}
    />
  ),
  parcial: (
    <VistaFrequenciaParcial
      series={[]}
      turmas={[]}
      alunos={[]}
      diaInicial={data}
      ativa
      fuso="America/Sao_Paulo"
      feriados={[]}
      mostrarSaidas={false}
      justificativas={[]}
    />
  ),
  entradas: <VistaEntradas {...comum} liberadores={[]} catalogoJustificativas={[]} />,
  saidas: (
    <VistaSaidas
      {...comum}
      mes="2026-11"
      liberadores={[]}
      catalogoJustificativas={[]}
      saidas={[]}
      onSaidasMudaram={vazio}
    />
  ),
};
const parametros = new URLSearchParams(location.search);
const tela = parametros.get("tela") as keyof typeof telas;
const temaInicial = parametros.get("tema") === "dark" ? "dark" : "light";
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
createRoot(raiz).render(
  <ThemeProvider
    theme={tema}
    defaultMode={temaInicial}
    modeStorageKey="theme"
    disableTransitionOnChange
  >
    <CssBaseline enableColorScheme />
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale="pt-br"
      localeText={ptBR.components.MuiLocalizationProvider.defaultProps.localeText}
    >
      <Box component="main" sx={{ p: 2 }}>
        {telas[tela] ?? telas.painel}
      </Box>
    </LocalizationProvider>
  </ThemeProvider>,
);
