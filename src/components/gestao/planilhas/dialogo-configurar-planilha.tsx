"use client";

// Conferência guiada por mês, somente de leitura, com acesso às etapas de correção.
import { useRef, useState } from "react";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import FindInPageRoundedIcon from "@mui/icons-material/FindInPageRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { DiagnosticoPlanilha } from "@/domain/planilha-diagnostico";
import { rotuloMes } from "@/domain/frequencia";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

export type EtapaConfiguracaoPlanilha = "conexao" | "estrutura" | "envio";

const CAIXA = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  minWidth: 0,
} as const;

export function DialogoConfigurarPlanilha({
  mes,
  mesMaximo,
  onMes,
  onEtapa,
}: {
  mes: string;
  mesMaximo: string;
  onMes: (mes: string) => void;
  onEtapa: (etapa: EtapaConfiguracaoPlanilha) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoPlanilha | null>(null);
  const [erro, setErro] = useState("");
  const versao = useRef(0);
  const { executar, executando } = useAcaoUnica(async () => {
    const atual = ++versao.current;
    setErro("");
    setDiagnostico(null);
    try {
      const dados = await pedir<{ diagnostico: DiagnosticoPlanilha }>(
        `/api/planilha/diagnostico?mes=${encodeURIComponent(mes)}`,
      );
      if (atual === versao.current) setDiagnostico(dados.diagnostico);
    } catch (excecao) {
      if (atual === versao.current)
        setErro(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível conferir a configuração.",
        );
    }
  });

  function fechar() {
    ++versao.current;
    setAberto(false);
    setDiagnostico(null);
    setErro("");
  }

  function irPara(etapa: EtapaConfiguracaoPlanilha) {
    fechar();
    onEtapa(etapa);
  }

  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        icone={<ShieldRoundedIcon />}
        onClick={() => setAberto(true)}
        sx={{ alignSelf: "flex-start" }}
      >
        Configuração assistida
      </Botao>
      <Dialogo
        aberto={aberto}
        onFechar={fechar}
        titulo="Configuração assistida"
        descricao="Confira o destino e as turmas antes de sincronizar."
        tamanho="grande"
      >
        <Stack spacing={2}>
          <SeletorPeriodo
            id="mes-diagnostico-planilha"
            modo="mes"
            valor={mes}
            max={mesMaximo}
            rotuloAcessivel="Mês da conferência"
            rotulo={rotuloMes(mes)}
            onValor={(valor) => {
              ++versao.current;
              setDiagnostico(null);
              setErro("");
              onMes(valor);
            }}
          />
          <Botao
            type="button"
            variante="primario"
            disabled={executando}
            carregando={executando}
            icone={<FindInPageRoundedIcon />}
            onClick={() => void executar()}
            sx={{ alignSelf: "flex-start" }}
          >
            {executando ? "Conferindo..." : "Conferir configuração"}
          </Botao>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Esta conferência apenas lê a planilha.
          </Typography>
        </Stack>
        {erro ? (
          <AlertaCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
        ) : null}
        {diagnostico ? (
          <Box aria-live="polite" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box component="section" aria-label="Conexão da planilha" sx={CAIXA}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="subtitle2">1. Arquivo e conexão</Typography>
                <Selo tom={diagnostico.conexao.verificada ? "sucesso" : "atencao"}>
                  {diagnostico.conexao.verificada ? "Acesso conferido" : "Conferir conexão"}
                </Selo>
              </Stack>
              {diagnostico.conexao.erro ? (
                <Typography variant="body2" color="error">
                  {diagnostico.conexao.erro}
                </Typography>
              ) : null}
              <Botao
                type="button"
                variante="contorno"
                onClick={() => irPara("conexao")}
                sx={{ alignSelf: "flex-start" }}
              >
                Revisar conexão
              </Botao>
            </Box>
            <Box component="section" aria-label="Turmas do mês" sx={CAIXA}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="subtitle2">2. Turmas e mês</Typography>
                <Selo tom={diagnostico.estruturaPronta ? "sucesso" : "atencao"}>
                  {diagnostico.resumo.prontas}/{diagnostico.resumo.total} conferidas
                </Selo>
              </Stack>
              <Box
                component="ul"
                aria-label="Conferência por turma"
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {diagnostico.turmas.map((turma) => (
                  <Stack
                    component="li"
                    key={turma.id}
                    direction="row"
                    spacing={1}
                    sx={{ minWidth: 0, borderTop: 1, borderColor: "divider", paddingTop: 1 }}
                  >
                    {turma.situacao === "pronta" ? (
                      <CheckCircleRoundedIcon
                        fontSize="small"
                        sx={{ marginTop: 0.25, flexShrink: 0 }}
                        color="primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <ErrorOutlineRoundedIcon
                        fontSize="small"
                        sx={{ marginTop: 0.25, flexShrink: 0 }}
                        color="error"
                        aria-hidden="true"
                      />
                    )}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {turma.rotulo}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ display: "block", color: "text.secondary", overflowWrap: "anywhere" }}
                      >
                        {turma.aba ?? "Sem aba para este mês"}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          color: turma.situacao === "pronta" ? "text.secondary" : "error",
                        }}
                      >
                        {turma.mensagem ?? "Estrutura conferida"}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Box>
              {diagnostico.resumo.total === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Cadastre as turmas na Gestão.
                </Typography>
              ) : null}
              <Botao
                type="button"
                variante="contorno"
                onClick={() => irPara("estrutura")}
                sx={{ alignSelf: "flex-start" }}
              >
                Revisar turmas e mês
              </Botao>
            </Box>
            <Box component="section" aria-label="Situação dos envios" sx={CAIXA}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="subtitle2">3. Sincronização</Typography>
                <Selo
                  tom={
                    diagnostico.envioAutomatico &&
                    diagnostico.ativa &&
                    diagnostico.modo === "conservador"
                      ? "sucesso"
                      : "neutro"
                  }
                >
                  {diagnostico.envioAutomatico &&
                  diagnostico.ativa &&
                  diagnostico.modo === "conservador"
                    ? "Automação ligada"
                    : "Automação pausada"}
                </Selo>
              </Stack>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {diagnostico.alteradasDepois} chamadas sem envio confirmado no arquivo.
              </Typography>
              {!diagnostico.ativa ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Ative a integração após conferir o arquivo.
                </Typography>
              ) : null}
              {diagnostico.modo === "completo" ? (
                <Typography variant="caption" color="error">
                  Modo completo ativo. Encerre a janela para retomar a automação.
                </Typography>
              ) : null}
              {diagnostico.ultimoErro ? (
                <Typography variant="body2" color="error">
                  {diagnostico.ultimoErro.erro ?? "Há envios que precisam de conferência manual."}
                </Typography>
              ) : null}
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                A prévia do envio confere os alunos, as marcas e as divergências antes de gravar.
              </Typography>
              <Botao
                type="button"
                variante="contorno"
                onClick={() => irPara("envio")}
                sx={{ alignSelf: "flex-start" }}
              >
                Revisar envio e automação
              </Botao>
            </Box>
          </Box>
        ) : null}
      </Dialogo>
    </>
  );
}
