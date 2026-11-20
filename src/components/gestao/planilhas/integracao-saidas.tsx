"use client";

// Ações de envio, organização e configuração da planilha de entradas e saídas.
import { useCallback, useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DoorFrontRoundedIcon from "@mui/icons-material/DoorFrontRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ViewQuiltRoundedIcon from "@mui/icons-material/ViewQuiltRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useRascunhoConfiguracoes } from "@/components/gestao/configuracoes/rascunho-configuracoes";
import { CABECALHO_SAIDAS, type AbaSaidaEsquema } from "@/domain/planilha-saidas";
import { rotuloInstante } from "@/domain/planilha";
import { rotuloData } from "@/domain/frequencia";
import { Abas } from "@/components/ui/mui/abas";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Selo } from "@/components/ui/mui/selo";
import { EtapaPlanilha } from "@/components/gestao/planilhas/planilha-etapa";
import { SeletorPlanilhaGoogle } from "@/components/gestao/planilhas/seletor-planilha-google";
import { OrganizarPlanilha } from "@/components/gestao/planilhas/dialogo-organizar-planilha";
import {
  BlocoModoCompletoPlanilha,
  BlocoRiscoPlanilha,
} from "@/components/gestao/planilhas/planilha-blocos";

interface IntegracaoSaidasAdmin {
  ativa: boolean;
  contaGoogle: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  esquema: {
    planilha: { nome: string; url: string; fuso: string };
    abas: AbaSaidaEsquema[];
    aba: string;
  } | null;
  esquemaEm: string | null;
  modo: "conservador" | "completo";
  modoCompletoAte: string | null;
  envioAutomatico: boolean;
  atualizadoEm: string;
  fuso: string;
  ultimoErro: { erro: string | null; resultado: string; criadoEm: string } | null;
  sincronizacoes: {
    id: string;
    de: string;
    ate: string;
    modalidade: string;
    linhasCriadas: number;
    preenchidas: number;
    substituidas: number;
    removidasLinhas: number;
    resultado: string;
    criadoEm: string;
  }[];
}

type PainelSaidas = "envio" | "organizacao" | "configuracao";

const NOME_ABA_PADRAO = "Saiu mais cedo";

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

export default function IntegracaoSaidas({
  onAbrirSaidas,
  abertoInicial = false,
}: {
  onAbrirSaidas?: () => void;
  abertoInicial?: boolean;
}) {
  const [integracao, setIntegracao] = useState<IntegracaoSaidasAdmin | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(abertoInicial);
  const [painel, setPainel] = useState<PainelSaidas | null>(abertoInicial ? "configuracao" : null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [abas, setAbas] = useState<AbaSaidaEsquema[]>([]);
  const [planilha, setPlanilha] = useState<{
    nome: string;
    url: string;
    fuso: string;
  } | null>(null);
  const [abaSelecionada, setAbaSelecionada] = useState("");
  const [novaAba, setNovaAba] = useState(NOME_ABA_PADRAO);
  const [editandoEstrutura, setEditandoEstrutura] = useState(false);
  const [confirmarEntradas, setConfirmarEntradas] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const { base, rascunho, mutarPlanilha } = useRascunhoConfiguracoes();
  const ativaServidor = base?.planilhas.saidas.ativa ?? integracao?.ativa ?? false;
  const ativaRascunho = rascunho?.planilhas.saidas.ativa ?? ativaServidor;
  const envioRascunho =
    rascunho?.planilhas.saidas.envioAutomatico ?? integracao?.envioAutomatico ?? false;

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>("/api/planilha-saidas");
      setIntegracao(dados.integracao);
      if (dados.integracao.esquema) {
        setPlanilha({
          nome: dados.integracao.esquema.planilha.nome,
          url: dados.integracao.esquema.planilha.url,
          fuso: dados.integracao.esquema.planilha.fuso,
        });
        setAbas(dados.integracao.esquema.abas ?? []);
        setAbaSelecionada(dados.integracao.esquema.aba);
      } else {
        setPlanilha(null);
        setAbas([]);
        setAbaSelecionada("");
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
  const conectada = Boolean(integracao?.contaGoogle && integracao.googlePlanilha);
  const podeEnviar = Boolean(integracao?.ativa && conectada);
  const estruturaSalva = Boolean(integracao?.esquema);
  const estruturaEmEdicao = !estruturaSalva || editandoEstrutura;
  const abaEscolhida = abas.find((aba) => aba.nome === abaSelecionada) ?? null;
  const painelAtivo = painel ?? (conectada && estruturaSalva ? "envio" : "configuracao");

  function alternarAtiva(valor: boolean) {
    mutarPlanilha("saidas", { ativa: valor });
    avisarSucesso("Integração alterada no rascunho.", "Salve as configurações para aplicar.");
  }

  function alternarEnvioAutomatico(valor: boolean) {
    mutarPlanilha("saidas", { envioAutomatico: valor });
    avisarSucesso("Envio automático alterado no rascunho.", "Salve as configurações para aplicar.");
  }

  async function lerEstrutura() {
    const aviso = "planilha-saidas-estrutura";
    await executarPorChave(aviso, async () => {
      setLendo(true);
      try {
        const dados = await pedir<{
          planilha: { nome: string; url: string; fuso: string };
          abas: AbaSaidaEsquema[];
          sugestao: { aba: string; confianca: "alta" | "media" | "baixa" } | null;
        }>("/api/planilha-saidas/estrutura", corpoJson({}));
        setAbas(dados.abas);
        setPlanilha(dados.planilha);
        setAbaSelecionada((atual) => {
          const existe = dados.abas.some((aba) => aba.nome === atual);
          if (atual !== "" && existe) return atual;
          return dados.sugestao?.aba ?? "";
        });
        avisarSucesso(
          `${dados.abas.length} ${dados.abas.length === 1 ? "aba lida" : "abas lidas"}.`,
          "Confira a aba do registro antes de salvar.",
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
    if (!planilha) return;
    if (!abaEscolhida) {
      avisarErro(new Error("Escolha a aba do registro de saídas."), {
        contexto: "Escolha a aba do registro de saídas.",
      });
      return;
    }
    setSalvando(true);
    const aviso = "planilha-saidas-mapa";
    await executarPorChave(aviso, async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoSaidasAdmin }>(
          "/api/planilha-saidas/mapa",
          corpoJson({ planilha, abas, aba: abaEscolhida.nome }),
        );
        setIntegracao(dados.integracao);
        setEditandoEstrutura(false);
        avisarSucesso(
          "Estrutura salva.",
          "Agora a vista Saídas pode enviar os registros para esta planilha.",
          aviso,
        );
      } catch (excecao) {
        avisarErro(excecao, {
          contexto: "Não foi possível salvar a estrutura.",
          descricao: "Confira a aba escolhida e tente de novo em instantes.",
          id: aviso,
        });
      } finally {
        setSalvando(false);
      }
    });
  }

  async function criarAba() {
    await executarPorChave("criar-aba-saidas", async () => {
      try {
        await pedir(
          "/api/planilha-saidas/criar-aba",
          corpoJson({ nome: novaAba, cabecalho: CABECALHO_SAIDAS }),
        );
        avisarSucesso(
          "Aba criada. Use Conferir estrutura para escolher.",
          "A nova aba recebe as colunas padrão das saídas.",
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível criar a aba." });
      }
    });
  }

  async function prepararEntradas() {
    await executarPorChave("preparar-entradas", async () => {
      try {
        const resultado = await pedir<{
          criada: boolean;
          realinhada: boolean;
          sheet1: "ausente" | "removida" | "mantida";
        }>("/api/planilha-entradas/preparar", { method: "POST" });
        setConfirmarEntradas(false);
        avisarSucesso(
          `${
            resultado.criada
              ? "Aba Entradas criada e organizada."
              : resultado.realinhada
                ? "Aba Entradas atualizada e organizada."
                : "Aba Entradas organizada."
          }${
            resultado.sheet1 === "removida"
              ? " Sheet1 removida."
              : resultado.sheet1 === "mantida"
                ? " Sheet1 mantida para conferência."
                : ""
          }`,
        );
      } catch (excecao) {
        setConfirmarEntradas(false);
        avisarErro(excecao, { contexto: "Não foi possível preparar a aba Entradas." });
      }
    });
  }

  if (carregando) {
    return (
      <Box
        component="section"
        data-secao="planilha-saidas"
        aria-label="Planilha de entradas e saídas"
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <Typography component="h2" variant="subtitle1">
          Planilha de entradas e saídas
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Conferindo a integração...
        </Typography>
      </Box>
    );
  }

  const conteudoEnvio = (
    <Stack spacing={2}>
      {!estruturaSalva ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Configure a aba antes de enviar.
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {onAbrirSaidas ? (
          <Botao
            type="button"
            variante="primario"
            disabled={!estruturaSalva}
            title={estruturaSalva ? undefined : "Salve a estrutura antes de enviar."}
            onClick={onAbrirSaidas}
            icone={<DoorFrontRoundedIcon />}
          >
            Abrir a vista Saídas
          </Botao>
        ) : null}
      </Stack>
      <Box sx={CAIXA}>
        <Interruptor
          id="saidas-envio-automatico"
          rotulo="Enviar ao registrar saídas e entradas"
          descricao="Acrescenta os novos registros automaticamente."
          checked={envioRascunho}
          disabled={salvando || !ativaRascunho || !conectada || !estruturaSalva}
          onChange={(valor) => void alternarEnvioAutomatico(valor)}
        />
      </Box>
      <Stack spacing={1}>
        {integracao?.ultimoErro ? (
          <Typography variant="caption" color="error">
            {integracao.ultimoErro.resultado === "PARCIAL" ? "Envio parcial" : "Falha"}:{" "}
            {integracao.ultimoErro.erro ?? "sem detalhe"}
          </Typography>
        ) : null}
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
          {integracao && integracao.sincronizacoes.length > 0 ? (
            <Box
              component="ul"
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                margin: 0,
                paddingLeft: 2,
                color: "text.secondary",
              }}
            >
              {integracao.sincronizacoes.slice(0, 5).map((item) => (
                <Typography component="li" key={item.id} variant="caption">
                  {rotuloData(item.de)} a {rotuloData(item.ate)} · {item.modalidade.toLowerCase()} ·{" "}
                  {item.linhasCriadas} linhas criadas · {item.substituidas} corrigidas ·{" "}
                  {item.removidasLinhas} removidas · {item.resultado.toLowerCase()}
                </Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhum envio registrado.
            </Typography>
          )}
        </Acordeao>
      </Stack>
      <BlocoModoCompletoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        ativo={completoAtivo}
        ate={integracao?.modoCompletoAte ?? null}
        onMudou={carregar}
      />
    </Stack>
  );

  const conteudoOrganizacao = (
    <Stack spacing={2}>
      {!conectada ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Conecte uma planilha em Configurar.
        </Typography>
      ) : null}
      {abaSelecionada || integracao?.esquema?.aba ? (
        <Box sx={CAIXA}>
          <Typography component="h3" variant="subtitle2">
            Saídas
          </Typography>
          <Box>
            <OrganizarPlanilha
              rota="/api/planilha-saidas/organizar"
              aba={abaSelecionada || integracao?.esquema?.aba || ""}
              disabled={!podeEnviar}
            />
          </Box>
        </Box>
      ) : null}
      {conectada ? (
        <Box data-secao="planilha-entradas-preparo" sx={CAIXA}>
          <Typography component="h3" variant="subtitle2">
            Entradas
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              disabled={!podeEnviar || chaveAtiva === "preparar-entradas"}
              onClick={() => setConfirmarEntradas(true)}
              icone={<AddRoundedIcon />}
              sx={{ minWidth: 0, whiteSpace: "normal" }}
            >
              Preparar aba Entradas
            </Botao>
            <OrganizarPlanilha
              rota="/api/planilha-entradas/organizar"
              aba="Entradas"
              disabled={!podeEnviar}
            />
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );

  const conteudoConfiguracao = (
    <Stack spacing={2}>
      <EtapaPlanilha numero={1} titulo="Conexão" estado={conectada ? "concluida" : "atual"}>
        <SeletorPlanilhaGoogle
          finalidade="SAIDAS"
          conectado={integracao?.contaGoogle ?? false}
          planilha={integracao?.googlePlanilha ?? null}
          onAtualizar={carregar}
        />
      </EtapaPlanilha>
      <EtapaPlanilha
        numero={2}
        titulo="Aba do registro"
        estado={estruturaSalva ? "concluida" : podeEnviar ? "atual" : "pendente"}
        resumo={
          estruturaSalva && !estruturaEmEdicao
            ? `Salva em ${rotuloInstante(integracao?.esquemaEm, integracao?.fuso ?? "")}`
            : podeEnviar
              ? "Escolha a aba para as saídas."
              : "Conecte e ative a integração."
        }
        acoes={
          estruturaEmEdicao ? (
            <Botao
              type="button"
              variante="contorno"
              tamanho="pequeno"
              onClick={() => void lerEstrutura()}
              disabled={lendo || !podeEnviar}
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
            {abas.length > 0 ? (
              <Stack spacing={2}>
                <Box sx={{ width: { xs: "100%", sm: 288 } }}>
                  <Campo id="saidas-aba" rotulo="Aba do registro de saídas">
                    <Selecionar
                      id="saidas-aba"
                      buscavel
                      valor={abaSelecionada}
                      onValor={setAbaSelecionada}
                      placeholder="Escolha a aba"
                      ariaLabel="Aba do registro de saídas"
                      opcoes={abas
                        .filter((aba) => !aba.oculta)
                        .map((aba) => ({ valor: aba.nome, rotulo: aba.nome }))}
                    />
                  </Campo>
                </Box>
                {abaEscolhida ? (
                  <Stack spacing={1} sx={{ color: "text.secondary" }}>
                    <Typography variant="caption">Colunas reconhecidas:</Typography>
                    {abaEscolhida.colunas.some((coluna) => coluna.atributo) ? (
                      <CaixasDeInfo
                        rotulo="Colunas reconhecidas"
                        itens={abaEscolhida.colunas
                          .filter((coluna) => coluna.atributo)
                          .map((coluna) => coluna.rotulo || coluna.letra)}
                      />
                    ) : (
                      <Typography variant="caption">nenhuma</Typography>
                    )}
                    {abaEscolhida.bloqueio ? (
                      <Typography variant="caption" color="error">
                        {abaEscolhida.bloqueio}
                      </Typography>
                    ) : null}
                  </Stack>
                ) : null}
                <Botao
                  type="button"
                  variante="secundario"
                  onClick={() => void salvarMapa()}
                  disabled={salvando || !abaEscolhida || Boolean(abaEscolhida.bloqueio)}
                  carregando={salvando}
                  icone={<SaveRoundedIcon />}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Salvar estrutura
                </Botao>
              </Stack>
            ) : null}
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { sm: "flex-end" },
                gap: 2,
                borderTop: 1,
                borderColor: "divider",
                paddingTop: 2,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Campo id="saidas-nova-aba" rotulo="Nome da nova aba">
                  <CampoTexto
                    id="saidas-nova-aba"
                    valor={novaAba}
                    onValor={setNovaAba}
                    autoComplete="off"
                  />
                </Campo>
              </Box>
              <Botao
                type="button"
                variante="contorno"
                onClick={() => void criarAba()}
                disabled={chaveAtiva === "criar-aba-saidas" || novaAba.trim() === ""}
                carregando={chaveAtiva === "criar-aba-saidas"}
                icone={<AddRoundedIcon />}
              >
                Criar aba
              </Botao>
            </Box>
          </>
        ) : null}
      </EtapaPlanilha>
      <BlocoRiscoPlanilha
        idPrefixo="planilha-saidas"
        urlBase="/api/planilha-saidas"
        copiasDe={
          integracao?.esquema?.aba
            ? [integracao.esquema.aba]
            : abas.filter((aba) => !aba.oculta).map((aba) => aba.nome)
        }
        abasCriadas={abas.filter((aba) => aba.criada).map((aba) => aba.nome)}
        onMudou={carregar}
      />
    </Stack>
  );

  return (
    <Box data-secao="planilha-saidas">
      <Acordeao
        titulo="Planilha de entradas e saídas"
        resumo={
          <>
            <Selo tom={ativaRascunho ? "sucesso" : "neutro"}>
              {ativaRascunho ? "Ligada" : "Desligada"}
            </Selo>
            <Selo tom={conectada && estruturaSalva ? "sucesso" : "atencao"}>
              {!conectada ? "Sem conexão" : estruturaSalva ? "Configurada" : "Escolher aba"}
            </Selo>
            {completoAtivo ? <Selo tom="atencao">Modo completo</Selo> : null}
            {integracao?.ultimoErro ? <Selo tom="perigo">Último envio com erro</Selo> : null}
          </>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          <Interruptor
            id="planilha-saidas-ativa"
            rotulo="Integração de entradas e saídas ativa"
            checked={ativaRascunho}
            disabled={salvando || !conectada}
            onChange={(valor) => void alternarAtiva(valor)}
          />
          <Abas<PainelSaidas>
            itens={[
              {
                valor: "envio",
                rotulo: "Enviar",
                icone: <SendRoundedIcon />,
                conteudo: conteudoEnvio,
              },
              {
                valor: "organizacao",
                rotulo: "Organizar",
                icone: <ViewQuiltRoundedIcon />,
                conteudo: conteudoOrganizacao,
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
            rotuloAcessivel="Ações da planilha de entradas e saídas"
            variant="scrollable"
          />
          {erro ? (
            <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
          ) : null}
        </Stack>
      </Acordeao>

      <DialogoConfirmacao
        aberto={confirmarEntradas}
        titulo="Preparar aba Entradas?"
        descricao={`A aba Entradas da planilha ${planilha?.nome ?? "conectada"} terá as mesmas colunas e a mesma organização visual da aba de saídas. Se ela já existir no formato anterior, o cabeçalho é atualizado: o responsável passa para a coluna Responsável, Observação fica vazia e a coluna Código é descartada, mantendo as linhas já enviadas. A aba Sheet1 será removida somente se estiver vazia e a aba de saídas estiver configurada. Nenhum registro de aluno será enviado nesta etapa.`}
        rotuloConfirmar="Preparar aba"
        operacaoEmAndamento={chaveAtiva === "preparar-entradas"}
        onConfirmar={() => void prepararEntradas()}
        onCancelar={() => setConfirmarEntradas(false)}
      />
    </Box>
  );
}
