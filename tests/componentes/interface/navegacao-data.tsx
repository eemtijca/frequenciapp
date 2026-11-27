// Visões reais, com dados sintéticos e rede controlada pelo teste.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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
import {
  DestinoSessao,
  ProvedorTransicaoSessao,
  useSaidaSessao,
} from "@/components/entrada/transicao-sessao";
import VistaFrequenciaParcial from "@/components/chamada-parcial/vista-frequencia-parcial";
import VistaEntradas from "@/components/movimentacoes/vista-entradas";
import VistaSaidas from "@/components/movimentacoes/vista-saidas";
import PorAluno from "@/components/relatorios/por-aluno";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import VistaMinhasTurmas from "@/components/diretor/vista-minhas-turmas";
import DialogoSobre from "@/components/dialogo-sobre";
import RegistroPwa from "@/components/pwa/registro-pwa";
import { EscopoAvisosDaSessao, ProvedorAvisos } from "@/components/ui/mui/avisos";
import { useAvisosDaSessao } from "@/lib/avisos";
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

function AvisosESobre() {
  const { publicarAviso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Sobre
      </button>
      <button
        type="button"
        onClick={() => publicarAviso({ titulo: "Entrada confirmada.", severidade: "success" })}
      >
        Mostrar aviso
      </button>
      <button
        type="button"
        onClick={() =>
          publicarAviso({
            titulo: "Não foi possível carregar os registros.",
            descricao: "As informações na tela podem estar desatualizadas.",
            severidade: "error",
            tentarDeNovo: () => publicarAviso({ titulo: "Carregado.", severidade: "info" }),
          })
        }
      >
        Mostrar erro
      </button>
      <ProvedorAvisos />
      <DialogoSobre aberto={aberto} onAbrir={setAberto} />
    </>
  );
}

const alvoHistorico = { dia: "2026-11-24", turmaId: turma.id };

function ChamadaComMarcas({
  aoSalvar = vazio,
  historica = false,
  ativo = true,
}: {
  aoSalvar?: typeof vazio;
  historica?: boolean;
  ativo?: boolean;
}) {
  return (
    <VistaFrequencia
      {...comum}
      diaCorrente="2026-11-25"
      turmas={[turma]}
      alunos={[
        {
          id: "aluno",
          nome: "Aluno teste",
          turmaId: turma.id,
          turmaOriginalId: turma.id,
          ordem: 1,
          ativo: true,
        },
      ]}
      usuario={{
        id: "teste",
        nome: "Teste",
        email: "teste@example.org",
        papel: "ADMIN",
        ativo: true,
      }}
      ativo={ativo}
      alvo={historica ? alvoHistorico : null}
      configuracoes={CONFIGURACOES_PADRAO}
      catalogoJustificativas={[{ codigo: "At", rotulo: "Atestado", ativo: true }]}
      versaoFrequencias={0}
      onFrequenciasMudaram={aoSalvar}
      onPendencia={() => {}}
    />
  );
}

function ChamadaComTrocaDeAtividade() {
  const [ativa, setAtiva] = useState(true);
  return (
    <DestinoSessao usuarioId="teste" referenciaSessao={"R".repeat(43)}>
      <button type="button" onClick={() => setAtiva(!ativa)}>
        {ativa ? "Sair da Chamada" : "Voltar à Chamada"}
      </button>
      <ChamadaComMarcas ativo={ativa} />
      <ProvedorAvisos />
    </DestinoSessao>
  );
}

function AcaoDeSaida() {
  const { sair, saindo } = useSaidaSessao();
  return (
    <button type="button" disabled={saindo} onClick={() => void sair()}>
      Sair da conta
    </button>
  );
}

function ChamadaComRetomadaDeSessao() {
  const navegacaoInesperada = () => {
    throw new Error("A confirmação da mesma sessão não deve navegar.");
  };
  return (
    <AppRouterContext.Provider
      value={{
        bfcacheId: "fixture-chamada",
        back: navegacaoInesperada,
        forward: navegacaoInesperada,
        push: navegacaoInesperada,
        replace: navegacaoInesperada,
        prefetch: navegacaoInesperada,
        refresh: navegacaoInesperada,
      }}
    >
      <ProvedorTransicaoSessao>
        <DestinoSessao usuarioId="teste" referenciaSessao={"R".repeat(43)}>
          <AcaoDeSaida />
          <ChamadaComMarcas />
        </DestinoSessao>
      </ProvedorTransicaoSessao>
      <ProvedorAvisos />
    </AppRouterContext.Provider>
  );
}

function ChamadaComTrocaDeSessao() {
  const [geracao, setGeracao] = useState(1);
  const [concluidos, setConcluidos] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setGeracao((atual) => atual + 1)}>
        Iniciar outra sessão da mesma conta
      </button>
      <output aria-label="Sessão da fixture">{geracao}</output>
      <output aria-label="Salvamentos concluídos">{concluidos}</output>
      <EscopoAvisosDaSessao autenticado key={geracao}>
        <ChamadaComMarcas aoSalvar={async () => setConcluidos((total) => total + 1)} />
      </EscopoAvisosDaSessao>
      <ProvedorAvisos />
    </>
  );
}

const telas = {
  "avisos-sobre": (
    <EscopoAvisosDaSessao autenticado>
      <AvisosESobre />
    </EscopoAvisosDaSessao>
  ),
  "aviso-pwa": <RegistroPwa />,
  "chamada-marcas": <ChamadaComMarcas />,
  "chamada-historica": <ChamadaComMarcas historica />,
  "chamada-avisos": <ChamadaComTrocaDeSessao />,
  "chamada-troca-atividade": <ChamadaComTrocaDeAtividade />,
  "chamada-retomada-sessao": <ChamadaComRetomadaDeSessao />,
  "calendario-limitado": (
    <SeletorPeriodo
      id="limitado"
      modo="dia"
      valor="2026-10-30"
      min="2026-11-01"
      max="2026-11-25"
      atual="2026-11-26"
      semDomingo
      rotuloAcessivel="Data limitada"
      rotulo="30/10"
      onValor={() => {}}
    />
  ),
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
      podeOperar
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
      leituraMensal={{ mes: "2026-11", estado: "pronto" }}
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
