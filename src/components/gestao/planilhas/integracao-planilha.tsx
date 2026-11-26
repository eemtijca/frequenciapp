"use client";

// Ações da planilha de frequência organizadas por envio, edição e configuração.
import { useCallback, useEffect, useRef, useState } from "react";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ViewQuiltRoundedIcon from "@mui/icons-material/ViewQuiltRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import PreferenciasPlanilha from "./preferencias-planilha";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useRascunhoConfiguracoes } from "@/components/gestao/configuracoes/rascunho-configuracoes";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { rotuloInstante, type AbaEsquema } from "@/domain/planilha";
import { diasDoMes, rotuloData, rotuloMes } from "@/domain/frequencia";
import { mesValido } from "@/domain/planilha-mensal";
import { Abas } from "@/components/ui/mui/abas";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { EtapaPlanilha } from "@/components/gestao/planilhas/planilha-etapa";
import {
  BlocoModoCompletoPlanilha,
  BlocoRiscoPlanilha,
} from "@/components/gestao/planilhas/planilha-blocos";
import { EditorPlanilhaChamada } from "./editor-planilha-chamada";
import { DialogoConfigurarPlanilha } from "./dialogo-configurar-planilha";
import { DialogoMostrarMes } from "./dialogo-mostrar-mes";
import { DialogoPrepararMes } from "./dialogo-preparar-mes";
import { OrganizarPlanilha } from "./dialogo-organizar-planilha";
import { SeletorPlanilhaGoogle } from "./seletor-planilha-google";
import { IndicadorDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import DialogoEnvio from "@/components/grade/dialogo-envio";

interface Sugestao {
  aba: string;
  turmaOriginalId: string | null;
  mes?: string;
  destino?: string;
  confianca: "alta" | "media" | "baixa";
}

interface IntegracaoAdmin {
  ativa: boolean;
  envioAutomatico: boolean;
  googleConectado: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string };
    mapa: MapaAba[];
    abas: AbaEsquema[];
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  fuso: string;
  alteradasDepois: number;
  ultimoErro: {
    erro: string | null;
    resultado: string;
    criadoEm: string;
    turma: string | null;
  } | null;
  sincronizacoes: {
    id: string;
    de: string;
    ate: string;
    modalidade: string;
    preenchidas: number;
    puladasOcupadas: number;
    puladasFormula: number;
    resultado: string;
    criadoEm: string;
  }[];
}

function rotuloResultadoEnvio(item: IntegracaoAdmin["sincronizacoes"][number]): string {
  const puladas = item.puladasOcupadas + item.puladasFormula;
  if (item.resultado === "SUCESSO" && puladas > 0) return "sucesso, divergências pendentes";
  if (item.resultado === "SUCESSO" && item.preenchidas === 0)
    return "sucesso, já estava na planilha";
  return item.resultado.toLowerCase();
}

interface MapaAba {
  aba: string;
  turmaOriginalId: string;
  mes?: string;
  destino?: string;
}

type PainelFrequencia = "enviar" | "editar" | "organizar" | "configurar";

const CAIXA = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 2,
  border: 1,
  borderColor: "divider",
  borderRadius: 2,
  minWidth: 0,
} as const;

export default function IntegracaoPlanilha({
  turmas,
  diaCorrente,
  abertoInicial = false,
}: {
  turmas: { id: string; rotulo: string }[];
  diaCorrente: string;
  abertoInicial?: boolean;
}) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [integracao, setIntegracao] = useState<IntegracaoAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  useLeituraDaVisao(carregando);
  const [aberto, setAberto] = useState(abertoInicial);
  const [acao, setAcao] = useState<PainelFrequencia | null>(abertoInicial ? "configurar" : null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [conferenciaHash, setConferenciaHash] = useState("");
  const [problemas, setProblemas] = useState<{ aba: string; erro: string }[]>([]);
  const etapas = useRef<Partial<Record<"conexao" | "estrutura" | "envio", HTMLDivElement | null>>>(
    {},
  );
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [abas, setAbas] = useState<AbaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
  } | null>(null);
  const [mapa, setMapa] = useState<Record<string, MapaAba>>({});
  const [editandoEstrutura, setEditandoEstrutura] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const { base, rascunho, mutarPlanilha } = useRascunhoConfiguracoes();
  const ativaServidor = base?.planilhas.frequencia.ativa ?? integracao?.ativa ?? false;
  const ativaRascunho = rascunho?.planilhas.frequencia.ativa ?? ativaServidor;
  const envioRascunho =
    rascunho?.planilhas.frequencia.envioAutomatico ?? integracao?.envioAutomatico ?? false;
  // O retorno do OAuth traz o mês a retomar; o parâmetro não deve sobreviver à navegação.
  useEffect(() => {
    const url = new URL(window.location.href);
    const retorno = url.searchParams.get("googleMes");
    if (!retorno) return;
    if (mesValido(retorno) && retorno <= diaCorrente.slice(0, 7)) setMesEnvio(retorno);
    url.searchParams.delete("googleMes");
    window.history.replaceState(null, "", url);
  }, [diaCorrente]);

  const [mesEnvio, setMesEnvio] = useState(() => {
    if (typeof window === "undefined") return diaCorrente.slice(0, 7);
    const retorno = new URLSearchParams(window.location.search).get("googleMes");
    return retorno && mesValido(retorno) && retorno <= diaCorrente.slice(0, 7)
      ? retorno
      : diaCorrente.slice(0, 7);
  });
  const [envioAberto, setEnvioAberto] = useState(false);
  const [abaApresentacao, setAbaApresentacao] = useState("");
  const acoesOrganizacao = useAcoesPorChave();
  const abasMapeadas = [...new Set((integracao?.esquema?.mapa ?? []).map((item) => item.aba))];
  const todasTurmas = abaApresentacao === "todas";
  const abaOrganizar = abaApresentacao.startsWith("aba:") ? abaApresentacao.slice(4) : "";

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoAdmin }>("/api/planilha");
      setIntegracao(dados.integracao);
      setConferenciaHash("");
      setProblemas([]);
      if (dados.integracao.esquema) {
        setPlanilha({
          nome: dados.integracao.esquema.planilha.nome,
          url: dados.integracao.esquema.planilha.url,
          fuso: dados.integracao.esquema.planilha.fuso,
        });
        setAbas(dados.integracao.esquema.abas ?? []);
        setMapa(
          Object.fromEntries((dados.integracao.esquema.mapa ?? []).map((item) => [item.aba, item])),
        );
      } else {
        setPlanilha(null);
        setAbas([]);
        setMapa({});
        setEditandoEstrutura(true);
      }
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
      setErroVariante(estadoDeErro(excecao));
      setAberto(true);
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

  const completoAtivo =
    integracao?.modo === "completo" &&
    integracao.modoCompletoAte !== null &&
    new Date(integracao.modoCompletoAte).getTime() > Date.now();
  const conectada = Boolean(integracao?.googleConectado && integracao.googlePlanilha);
  const podeEnviar = Boolean(integracao?.ativa && conectada);
  const estruturaSalva = Boolean(integracao?.esquema);
  const estruturaEmEdicao = !estruturaSalva || editandoEstrutura;
  const temMapa = Object.values(mapa).some((item) => item.turmaOriginalId !== "");
  const turmasSemAba = turmas.filter(
    (turma) => !Object.values(mapa).some((item) => item.turmaOriginalId === turma.id),
  );
  const diasEnvio = diasDoMes(mesEnvio);
  const vinculosNaoLidos = Object.values(mapa).filter(
    (item) => item.turmaOriginalId && !abas.some((aba) => aba.nome === item.aba),
  );
  const painelAtivo = acao ?? (conectada && estruturaSalva ? "enviar" : "configurar");

  function irParaEtapa(etapa: "conexao" | "estrutura" | "envio") {
    setAcao(etapa === "envio" ? "enviar" : "configurar");
    if (etapa === "estrutura") setEditandoEstrutura(true);
    // O diálogo devolve o foco ao gatilho ao fechar; o atraso espera a transição.
    window.setTimeout(() => {
      etapas.current[etapa]?.focus({ preventScroll: true });
      etapas.current[etapa]?.scrollIntoView({ block: "start" });
    }, 300);
  }

  function alternarAtiva(valor: boolean) {
    mutarPlanilha("frequencia", { ativa: valor });
    avisarSucesso("Integração alterada no rascunho.", "Salve as configurações para aplicar.");
  }

  function alternarEnvioAutomatico(valor: boolean) {
    mutarPlanilha("frequencia", { envioAutomatico: valor });
    avisarSucesso("Envio automático alterado no rascunho.", "Salve as configurações para aplicar.");
  }

  async function lerEstrutura() {
    const aviso = "planilha-estrutura";
    await executarPorChave(aviso, async () => {
      setLendo(true);
      setConferenciaHash("");
      try {
        const dados = await pedir<{
          planilha: { nome: string; url: string; fuso: string };
          abas: AbaEsquema[];
          sugestoes: Sugestao[];
          conferenciaHash: string;
          problemas: { aba: string; erro: string }[];
        }>("/api/planilha/estrutura", corpoJson({ mes: mesEnvio }));
        setAbas(dados.abas);
        setConferenciaHash(dados.conferenciaHash);
        setProblemas(dados.problemas);
        setSugestoes(dados.sugestoes);
        setPlanilha(dados.planilha);
        const idsValidos = new Set(turmas.map((turma) => turma.id));
        setMapa((atual) => {
          const proximo = { ...atual };
          for (const sugestao of dados.sugestoes) {
            const atualDaAba = proximo[sugestao.aba];
            const invalido =
              atualDaAba !== undefined && !idsValidos.has(atualDaAba.turmaOriginalId);
            if (
              (atualDaAba === undefined || invalido || sugestao.mes) &&
              sugestao.turmaOriginalId
            ) {
              proximo[sugestao.aba] = {
                aba: sugestao.aba,
                turmaOriginalId: sugestao.turmaOriginalId,
                ...(sugestao.mes ? { mes: sugestao.mes } : {}),
                ...(sugestao.destino ? { destino: sugestao.destino } : {}),
              };
            }
          }
          for (const aba of dados.abas) {
            if (aba.mensal) proximo[aba.nome] = { aba: aba.nome, ...aba.mensal };
          }
          return proximo;
        });
        avisarSucesso(
          `${dados.abas.length} ${dados.abas.length === 1 ? "aba lida" : "abas lidas"}.`,
          dados.problemas.length
            ? "Há abas que precisam de conferência."
            : "Confira o mapa de turmas antes de salvar.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível ler a planilha.",
          descricao: "Confira a conexão Google, e tente de novo em instantes.",
          tentarDeNovo: () => void lerEstrutura(),
          id: aviso,
        });
      } finally {
        setLendo(false);
      }
    });
  }

  async function salvarMapa() {
    if (!planilha || !conferenciaHash || vinculosNaoLidos.length > 0) return;
    const itens = Object.values(mapa).filter((item) => item.turmaOriginalId !== "");
    if (itens.length === 0) {
      avisarErro(new Error("Escolha ao menos uma aba."), {
        contexto: "Escolha ao menos uma aba.",
      });
      return;
    }
    const aviso = "planilha-mapa";
    await executarPorChave(aviso, async () => {
      setSalvando(true);
      try {
        const dados = await pedir<{ integracao: IntegracaoAdmin }>(
          "/api/planilha/mapa",
          corpoJson({ planilha, abas, mapa: itens, conferenciaHash }),
        );
        setIntegracao(dados.integracao);
        setEditandoEstrutura(false);
        setConferenciaHash("");
        avisarSucesso(
          "Estrutura salva.",
          "Agora a Grade pode enviar as faltas para esta planilha.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível salvar o mapa.",
          descricao: "Confira o mapa de turmas e tente de novo em instantes.",
          id: aviso,
        });
      } finally {
        setSalvando(false);
      }
    });
  }

  async function criarAba(nome: string) {
    await executarPorChave(`criar-aba-${nome}`, async () => {
      try {
        await pedir("/api/planilha/criar-aba", corpoJson({ nome }));
        avisarSucesso(
          "Aba criada. Use Conferir estrutura para mapear.",
          "A nova aba recebe a estrutura no próximo envio.",
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível criar a aba." });
      }
    });
  }

  if (carregando) {
    return (
      <Box
        component="section"
        data-secao="planilha-frequencia"
        aria-label="Planilha de frequência"
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Typography component="h2" variant="subtitle1">
          Planilha de frequência
        </Typography>
        <IndicadorDeCarregamento texto="Conferindo a integração..." />
      </Box>
    );
  }

  const conteudoEnviar = (
    <Box
      ref={(elemento: HTMLDivElement | null) => {
        etapas.current.envio = elemento;
      }}
      tabIndex={-1}
      sx={{
        scrollMarginTop: 16,
        outline: "none",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <EtapaPlanilha
        titulo="Enviar chamadas"
        estado={estruturaSalva ? "atual" : "pendente"}
        resumo={
          estruturaSalva
            ? "Todas as turmas, com prévia antes de enviar."
            : "Salve a estrutura antes de enviar."
        }
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "flex-end" } }}
        >
          <Box sx={{ width: { xs: "100%", sm: 256 } }}>
            <SeletorPeriodo
              id="planilha-mes-envio"
              modo="mes"
              valor={mesEnvio}
              max={diaCorrente.slice(0, 7)}
              rotuloAcessivel="Mês do envio para a planilha"
              rotulo={rotuloMes(mesEnvio)}
              onValor={setMesEnvio}
            />
          </Box>
          <Botao
            type="button"
            variante="primario"
            disabled={!estruturaSalva || !podeEnviar}
            title={estruturaSalva ? undefined : "Salve a estrutura antes de enviar."}
            onClick={() => setEnvioAberto(true)}
            icone={<SendRoundedIcon />}
          >
            Enviar todas as turmas
          </Botao>
        </Stack>
        <Stack spacing={1}>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {integracao?.alteradasDepois ?? 0}{" "}
            {integracao?.alteradasDepois === 1
              ? "chamada pendente de envio"
              : "chamadas pendentes de envio"}
          </Typography>
          {integracao?.ultimoErro ? (
            <Typography variant="caption" color="error">
              {integracao.ultimoErro.resultado === "PARCIAL" ? "Envio parcial" : "Falha"}
              {integracao.ultimoErro.turma ? ` em ${integracao.ultimoErro.turma}` : ""}:{" "}
              {integracao.ultimoErro.erro ?? "sem detalhe"}
            </Typography>
          ) : null}
          {integracao && integracao.sincronizacoes.length > 0 ? (
            <Acordeao
              titulo="Histórico de envios"
              nivelTitulo="h4"
              resumo={
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <HistoryRoundedIcon fontSize="inherit" aria-hidden="true" />
                  Últimos cinco envios
                </Typography>
              }
            >
              <Box
                component="ul"
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  margin: 0,
                  paddingLeft: 2,
                  color: "text.secondary",
                }}
              >
                {integracao.sincronizacoes.slice(0, 5).map((item) => (
                  <Typography component="li" key={item.id} variant="caption">
                    {rotuloData(item.de)} a {rotuloData(item.ate)} · {item.modalidade.toLowerCase()}{" "}
                    · {item.preenchidas} células · {rotuloResultadoEnvio(item)}
                  </Typography>
                ))}
              </Box>
            </Acordeao>
          ) : null}
        </Stack>
      </EtapaPlanilha>
    </Box>
  );

  const conteudoEditar = (
    <Stack spacing={2}>
      <EditorPlanilhaChamada
        turmas={turmas}
        mapa={integracao?.esquema?.mapa ?? []}
        diaCorrente={diaCorrente}
        modoCompleto={completoAtivo}
        disponivel={podeEnviar && estruturaSalva}
        aoConcluir={() => void carregar()}
      />
      <BlocoModoCompletoPlanilha
        idPrefixo="planilha"
        urlBase="/api/planilha"
        ativo={completoAtivo}
        ate={integracao?.modoCompletoAte ?? null}
        onMudou={carregar}
      />
    </Stack>
  );

  const conteudoOrganizar = (
    <Stack spacing={2}>
      <Typography component="h3" variant="subtitle2">
        Meses da chamada
      </Typography>
      <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
        <DialogoPrepararMes
          turmas={turmas}
          mes={mesEnvio}
          onMes={setMesEnvio}
          mesMaximo={diaCorrente.slice(0, 7)}
          disabled={!podeEnviar || lendo || salvando || acoesOrganizacao.chaveAtiva !== null}
          onAtualizar={carregar}
        />
        <DialogoMostrarMes
          mesAtual={diaCorrente.slice(0, 7)}
          disabled={!podeEnviar || lendo || salvando || acoesOrganizacao.chaveAtiva !== null}
          onAtualizar={carregar}
        />
      </Box>
      {!podeEnviar ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Conecte e ative a planilha em Configurar.
        </Typography>
      ) : null}
      {conectada && abas.some((aba) => !aba.oculta) ? (
        <Box sx={CAIXA}>
          <Campo id="frequencia-apresentacao" rotulo="Aba para organizar a apresentação">
            <Selecionar
              buscavel
              id="frequencia-apresentacao"
              valor={abaApresentacao}
              onValor={setAbaApresentacao}
              placeholder="Escolha a aba para organizar"
              ariaLabel="Aba para organizar a apresentação"
              disabled={acoesOrganizacao.chaveAtiva !== null}
              opcoes={[
                ...(abasMapeadas.length ? [{ valor: "todas", rotulo: "Todas as turmas" }] : []),
                ...abas
                  .filter((aba) => !aba.oculta)
                  .map((aba) => ({ valor: `aba:${aba.nome}`, rotulo: aba.nome })),
              ]}
            />
          </Campo>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
            <OrganizarPlanilha
              rota="/api/planilha/organizar"
              aba={abaOrganizar}
              todasTurmas={todasTurmas}
              abas={abasMapeadas}
              acoes={acoesOrganizacao}
              disabled={!podeEnviar}
            />
            <OrganizarPlanilha
              rota="/api/planilha/organizar"
              aba={abaOrganizar}
              todasTurmas={todasTurmas}
              abas={abasMapeadas}
              acoes={acoesOrganizacao}
              disabled={!podeEnviar}
              ajustarCabecalho
              onAtualizar={carregar}
            />
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );

  const conteudoConfigurar = (
    <Stack spacing={2}>
      <DialogoConfigurarPlanilha
        mes={mesEnvio}
        mesMaximo={diaCorrente.slice(0, 7)}
        onMes={setMesEnvio}
        onEtapa={irParaEtapa}
      />
      <Box
        ref={(elemento: HTMLDivElement | null) => {
          etapas.current.conexao = elemento;
        }}
        tabIndex={-1}
        sx={{ scrollMarginTop: 16, outline: "none" }}
      >
        <EtapaPlanilha numero={1} titulo="Conexão" estado={conectada ? "concluida" : "atual"}>
          <SeletorPlanilhaGoogle
            conectado={integracao?.googleConectado ?? false}
            planilha={integracao?.googlePlanilha ?? null}
            mes={mesEnvio}
            onAtualizar={carregar}
          />
        </EtapaPlanilha>
      </Box>
      <Box
        ref={(elemento: HTMLDivElement | null) => {
          etapas.current.estrutura = elemento;
        }}
        tabIndex={-1}
        sx={{ scrollMarginTop: 16, outline: "none" }}
      >
        <EtapaPlanilha
          numero={2}
          titulo="Abas e turmas"
          estado={estruturaSalva ? "concluida" : podeEnviar ? "atual" : "pendente"}
          resumo={
            estruturaSalva && !estruturaEmEdicao
              ? `Salva em ${rotuloInstante(integracao?.esquemaEm, integracao?.fuso ?? "")}`
              : podeEnviar
                ? "Vincule cada aba a uma turma."
                : "Conecte e ative a integração."
          }
          acoes={
            estruturaEmEdicao ? (
              <Botao
                type="button"
                variante="contorno"
                tamanho="pequeno"
                onClick={() => void lerEstrutura()}
                disabled={lendo || salvando || !podeEnviar}
                carregando={lendo}
                icone={<RestartAltRoundedIcon />}
                title={podeEnviar ? undefined : "Conecte e ligue a integração antes de ler."}
              >
                Conferir estrutura
              </Botao>
            ) : (
              <Botao
                type="button"
                variante="contorno"
                tamanho="pequeno"
                onClick={() => setEditandoEstrutura(true)}
                icone={<SettingsRoundedIcon />}
              >
                Revisar estrutura
              </Botao>
            )
          }
        >
          {estruturaEmEdicao ? (
            <>
              {planilha ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {planilha.nome} · fuso {planilha.fuso}
                </Typography>
              ) : null}
              {problemas.length > 0 ? (
                <Box
                  component="ul"
                  aria-label="Problemas na leitura das abas"
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                  }}
                >
                  {problemas.map((item) => (
                    <Box
                      component="li"
                      key={item.aba}
                      sx={(tema) => ({
                        padding: 2,
                        border: `1px solid ${tema.vars.palette.error.main}`,
                        borderRadius: 2,
                        backgroundColor: `color-mix(in srgb, ${tema.vars.palette.error.main} 8%, transparent)`,
                      })}
                    >
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {item.aba}
                      </Typography>
                      <Typography variant="caption" color="error">
                        {item.erro}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : null}
              {vinculosNaoLidos.length > 0 ? (
                <AlertaCompacto
                  variante="dados_invalidos"
                  titulo="Vínculos fora da leitura atual"
                  descricao="Confira novamente antes de salvar. Ignorar retira o vínculo da configuração; a aba e seus dados permanecem no Google."
                  tamanho="bloco"
                />
              ) : null}
              {vinculosNaoLidos.length > 0 ? (
                <Stack spacing={1}>
                  {vinculosNaoLidos.map((item) => (
                    <Stack
                      key={item.aba}
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                        {item.aba}
                      </Typography>
                      {!item.mes ? (
                        <Botao
                          type="button"
                          variante="contorno"
                          tamanho="pequeno"
                          disabled={lendo || salvando}
                          onClick={() =>
                            setMapa((atual) => ({
                              ...atual,
                              [item.aba]: { ...item, turmaOriginalId: "" },
                            }))
                          }
                        >
                          Ignorar vínculo
                        </Botao>
                      ) : null}
                    </Stack>
                  ))}
                </Stack>
              ) : null}
              {abas.length > 0 ? (
                <Stack spacing={2}>
                  {abas.map((aba) => {
                    const vinculo = mapa[aba.nome];
                    const mensal = aba.mensal ?? (vinculo?.mes ? vinculo : undefined);
                    return (
                      <Box
                        key={aba.nome}
                        sx={{
                          display: "flex",
                          flexDirection: { xs: "column", sm: "row" },
                          alignItems: { sm: "center" },
                          gap: 1,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {aba.nome}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        >
                          cabeçalho {aba.cabecalho} ·{" "}
                          {aba.colunas.filter((coluna) => coluna.tipo === "dia").length} dias
                        </Typography>
                        <Box sx={{ width: { xs: "100%", sm: 224 } }}>
                          {mensal ? (
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              {turmas.find((turma) => turma.id === mensal.turmaOriginalId)
                                ?.rotulo ?? "Turma de origem"}
                              {" · "}
                              {rotuloMes(mensal.mes ?? "")}
                            </Typography>
                          ) : (
                            <Campo
                              id={`mapa-${aba.nome}`}
                              rotulo={`Turma de origem da aba ${aba.nome}`}
                            >
                              <Selecionar
                                buscavel
                                id={`mapa-${aba.nome}`}
                                valor={vinculo?.turmaOriginalId ?? ""}
                                onValor={(valor) =>
                                  setMapa((atual) => ({
                                    ...atual,
                                    [aba.nome]: { aba: aba.nome, turmaOriginalId: valor },
                                  }))
                                }
                                disabled={lendo || salvando}
                                placeholder="Ignorar aba"
                                ariaLabel={`Turma de origem da aba ${aba.nome}`}
                                opcoes={turmas.map((turma) => ({
                                  valor: turma.id,
                                  rotulo: turma.rotulo,
                                }))}
                              />
                            </Campo>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                  <Botao
                    type="button"
                    variante="secundario"
                    onClick={() => void salvarMapa()}
                    disabled={
                      salvando ||
                      lendo ||
                      !temMapa ||
                      !conferenciaHash ||
                      vinculosNaoLidos.length > 0
                    }
                    carregando={salvando}
                    icone={<SaveRoundedIcon />}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Salvar estrutura
                  </Botao>
                </Stack>
              ) : null}
              {planilha && turmasSemAba.length > 0 ? (
                <Stack spacing={1}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Turmas sem aba mapeada:
                  </Typography>
                  {turmasSemAba.map((turma) => (
                    <Stack
                      key={turma.id}
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {turma.rotulo}
                      </Typography>
                      <Botao
                        type="button"
                        variante="secundario"
                        tamanho="pequeno"
                        onClick={() => void criarAba(turma.rotulo)}
                        disabled={chaveAtiva === `criar-aba-${turma.rotulo}`}
                        carregando={chaveAtiva === `criar-aba-${turma.rotulo}`}
                      >
                        Criar aba
                      </Botao>
                    </Stack>
                  ))}
                </Stack>
              ) : null}
              {sugestoes.length > 0 ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Confira os vínculos sugeridos antes de salvar.
                </Typography>
              ) : null}
            </>
          ) : null}
        </EtapaPlanilha>
      </Box>
      <BlocoRiscoPlanilha
        idPrefixo="planilha"
        urlBase="/api/planilha"
        copiasDe={(integracao?.esquema?.mapa ?? []).map((item) => item.aba)}
        abasCriadas={(integracao?.esquema?.abas ?? [])
          .filter((aba) => aba.criada)
          .map((aba) => aba.nome)}
        onMudou={carregar}
      />
    </Stack>
  );

  return (
    <Box data-secao="planilha-frequencia">
      <Acordeao
        titulo="Planilha de frequência"
        resumo={
          <Stack component="span" direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Selo component="span" tom={ativaRascunho ? "sucesso" : "neutro"}>
              {ativaRascunho ? "Ligada" : "Desligada"}
            </Selo>
            <Selo component="span" tom={conectada && estruturaSalva ? "sucesso" : "atencao"}>
              {!conectada ? "Sem conexão" : estruturaSalva ? "Google conectado" : "Configurar abas"}
            </Selo>
            {completoAtivo ? (
              <Selo component="span" tom="atencao">
                Modo completo
              </Selo>
            ) : null}
            {(integracao?.alteradasDepois ?? 0) > 0 ? (
              <Selo component="span">{integracao?.alteradasDepois} chamadas alteradas</Selo>
            ) : null}
            {integracao?.ultimoErro ? (
              <Selo component="span" tom="perigo">
                Último envio com erro
              </Selo>
            ) : null}
          </Stack>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          <PreferenciasPlanilha>
            <Interruptor
              id="planilha-ativa"
              rotulo="Integração ativa"
              checked={ativaRascunho}
              disabled={salvando || !conectada}
              onChange={(valor) => void alternarAtiva(valor)}
            />
            <Interruptor
              id="planilha-envio-automatico"
              rotulo="Enviar ao salvar a chamada"
              descricao="Preenche somente células vazias."
              checked={envioRascunho}
              disabled={
                salvando ||
                (!envioRascunho &&
                  (!ativaRascunho || !conectada || !estruturaSalva || completoAtivo))
              }
              onChange={(valor) => void alternarEnvioAutomatico(valor)}
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
          <Abas<PainelFrequencia>
            itens={[
              {
                valor: "enviar",
                rotulo: "Enviar",
                icone: <SendRoundedIcon />,
                conteudo: conteudoEnviar,
              },
              {
                valor: "editar",
                rotulo: "Editar",
                icone: <EditNoteRoundedIcon />,
                conteudo: conteudoEditar,
              },
              {
                valor: "organizar",
                rotulo: "Organizar",
                icone: <ViewQuiltRoundedIcon />,
                conteudo: conteudoOrganizar,
              },
              {
                valor: "configurar",
                rotulo: "Configurar",
                icone: <SettingsRoundedIcon />,
                conteudo: conteudoConfigurar,
              },
            ]}
            ativo={painelAtivo}
            onChange={setAcao}
            rotuloAcessivel="Ações da planilha de frequência"
            variant="scrollable"
          />
          {erro ? (
            <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
          ) : null}
        </Stack>
      </Acordeao>

      <DialogoEnvio
        aberto={envioAberto}
        onAbrir={setEnvioAberto}
        rotulo="todas as turmas"
        de={diasEnvio[0] ?? diaCorrente}
        ate={diasEnvio[diasEnvio.length - 1] ?? diaCorrente}
        modoCompleto={completoAtivo}
        todas
        aoConcluir={() => {
          void carregar();
        }}
      />
    </Box>
  );
}
