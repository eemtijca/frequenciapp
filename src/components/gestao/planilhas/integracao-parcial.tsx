"use client";

// Configuração do terceiro arquivo Google para chamadas parciais e conferência Seduc.
import { useCallback, useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import PreferenciasPlanilha from "./preferencias-planilha";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useRascunhoConfiguracoes } from "@/components/gestao/configuracoes/rascunho-configuracoes";
import { Abas } from "@/components/ui/mui/abas";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPlanilhaGoogle } from "./seletor-planilha-google";

interface IntegracaoParcialAdmin {
  ativa: boolean;
  contaGoogle: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  aba: string;
  preparada: boolean;
  podeEnviar: boolean;
}

type PainelParcial = "envio" | "configuracao";

export default function IntegracaoParcial({
  onAbrirParcial,
  abertoInicial = false,
}: {
  onAbrirParcial?: () => void;
  abertoInicial?: boolean;
}) {
  const [integracao, setIntegracao] = useState<IntegracaoParcialAdmin | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(abertoInicial);
  const [painel, setPainel] = useState<PainelParcial | null>(abertoInicial ? "configuracao" : null);
  const [confirmacao, setConfirmacao] = useState(false);
  const { chaveAtiva, executar } = useAcoesPorChave();
  const { base, rascunho, mutarPlanilha } = useRascunhoConfiguracoes();
  const ativaServidor = base?.planilhas.parcial.ativa ?? integracao?.ativa ?? false;
  const ativaRascunho = rascunho?.planilhas.parcial.ativa ?? ativaServidor;
  const ocupado = chaveAtiva !== null;
  const painelAtivo =
    painel ??
    (integracao?.preparada && integracao.contaGoogle && integracao.googlePlanilha
      ? "envio"
      : "configuracao");

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoParcialAdmin }>("/api/planilha-parcial");
      setIntegracao(dados.integracao);
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // O carregamento é assíncrono e só toca no estado depois do await. A regra
    // set-state-in-effect não distingue o caso, registrado no ADR 047.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento assíncrono (ADR 047)
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const recarregar = () => void carregar();
    window.addEventListener("configuracoes-salvas", recarregar);
    return () => window.removeEventListener("configuracoes-salvas", recarregar);
  }, [carregar]);

  function alternarAtiva(ativa: boolean) {
    mutarPlanilha("parcial", { ativa });
    avisarSucesso("Integração alterada no rascunho.", "Salve as configurações para aplicar.");
  }

  async function preparar() {
    await executar("parcial-preparar", async () => {
      try {
        const dados = await pedir<{ criada: boolean; integracao: IntegracaoParcialAdmin }>(
          "/api/planilha-parcial/preparar",
          corpoJson({ confirmacao: true }),
        );
        setIntegracao(dados.integracao);
        setConfirmacao(false);
        avisarSucesso(
          dados.criada ? "Aba Chamada Parcial criada." : "Aba Chamada Parcial conferida.",
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível preparar a aba." });
      }
    });
  }

  async function desconectar() {
    await executar("parcial-desconectar", async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoParcialAdmin }>("/api/planilha-parcial", {
          method: "DELETE",
        });
        setIntegracao(dados.integracao);
        avisarSucesso("Integração parcial desconectada.");
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível desconectar." });
      }
    });
  }

  const conteudoEnvio = (
    <Stack spacing={2}>
      {onAbrirParcial ? (
        <Botao
          type="button"
          variante="primario"
          onClick={onAbrirParcial}
          icone={<AssignmentRoundedIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          Abrir Chamada Parcial
        </Botao>
      ) : null}
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Confira a prévia e confirme o registro na Seduc pela Chamada Parcial.
      </Typography>
      {!integracao?.podeEnviar ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Configure e ative a planilha para enviar.
        </Typography>
      ) : null}
    </Stack>
  );

  const conteudoConfiguracao = (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Use um arquivo separado da frequência e das saídas.
      </Typography>
      <SeletorPlanilhaGoogle
        finalidade="PARCIAL"
        conectado={integracao?.contaGoogle ?? false}
        planilha={integracao?.googlePlanilha ?? null}
        onAtualizar={carregar}
      />
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <Botao
          type="button"
          variante="contorno"
          disabled={ocupado || !integracao?.googlePlanilha}
          onClick={() => setConfirmacao(true)}
          icone={integracao?.preparada ? <RestartAltRoundedIcon /> : <AddRoundedIcon />}
        >
          {integracao?.preparada ? "Conferir aba parcial" : "Preparar aba parcial"}
        </Botao>
        {integracao?.googlePlanilha ? (
          <Botao
            type="button"
            variante="texto"
            disabled={ocupado}
            onClick={() => void desconectar()}
            icone={<LinkOffRoundedIcon />}
          >
            Desconectar
          </Botao>
        ) : null}
      </Stack>
    </Stack>
  );

  return (
    <>
      <Box data-secao="planilha-parcial">
        <Acordeao
          titulo="Planilha de chamada parcial"
          resumo={
            <>
              <Selo tom={ativaRascunho ? "sucesso" : "neutro"}>
                {ativaRascunho ? "Ligada" : "Desligada"}
              </Selo>
              <Selo
                tom={
                  integracao?.preparada && integracao.contaGoogle && integracao.googlePlanilha
                    ? "sucesso"
                    : "atencao"
                }
              >
                {!integracao?.contaGoogle || !integracao.googlePlanilha
                  ? "Sem conexão"
                  : integracao.preparada
                    ? "Configurada"
                    : "Preparar aba"}
              </Selo>
            </>
          }
          aberto={aberto}
          onChange={setAberto}
        >
          <Stack spacing={2}>
            <PreferenciasPlanilha>
              <Interruptor
                id="planilha-parcial-ativa"
                rotulo="Integração de chamada parcial ativa"
                checked={ativaRascunho}
                disabled={ocupado || !integracao?.preparada}
                onChange={(valor) => void alternarAtiva(valor)}
              />
            </PreferenciasPlanilha>
            <Stack spacing={1} useFlexGap>
              <Typography component="h4" variant="subtitle2">
                Operações da planilha
              </Typography>
              <Typography variant="body2" color="text.secondary">
                As ações confirmadas aqui não dependem de Salvar configurações.
              </Typography>
            </Stack>
            {carregando ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Conferindo a integração...
              </Typography>
            ) : (
              <Abas<PainelParcial>
                itens={[
                  {
                    valor: "envio",
                    rotulo: "Enviar",
                    icone: <SendRoundedIcon />,
                    conteudo: conteudoEnvio,
                  },
                  {
                    valor: "configuracao",
                    rotulo: "Configurar",
                    icone: <SettingsRoundedIcon />,
                    conteudo: conteudoConfiguracao,
                  },
                ]}
                ativo={painelAtivo}
                onChange={setPainel}
                rotuloAcessivel="Ações da planilha de chamada parcial"
                variant="scrollable"
              />
            )}
            {erro ? (
              <AlertaCompacto variante="indisponivel" descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </Acordeao>
      </Box>
      <Dialogo
        aberto={confirmacao}
        onFechar={() => {
          if (!ocupado) setConfirmacao(false);
        }}
        titulo="Preparar Chamada Parcial"
        descricao={`A aba Chamada Parcial será criada com as colunas padrão em ${
          integracao?.googlePlanilha?.nome ?? "a planilha escolhida"
        }. Se já existir, o cabeçalho será conferido e o conteúdo será preservado.`}
      >
        <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <Botao
            type="button"
            variante="contorno"
            disabled={ocupado}
            onClick={() => setConfirmacao(false)}
          >
            Cancelar
          </Botao>
          <Botao
            type="button"
            variante="secundario"
            disabled={ocupado}
            carregando={ocupado}
            onClick={() => void preparar()}
          >
            Confirmar preparação
          </Botao>
        </Stack>
      </Dialogo>
    </>
  );
}
