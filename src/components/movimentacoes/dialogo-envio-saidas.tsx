"use client";

// Envio das saídas e das entradas para a planilha em um só passo: mês, prévia
// obrigatória das duas abas, remoções marcadas no modo completo (saídas) e
// confirmação. Nada é gravado sem revisão.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { useAvisosDaSessao } from "@/lib/avisos";
import { Alerta } from "@/components/ui/mui/alerta";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { Selo } from "@/components/ui/mui/selo";
import { diasDoMes, rotuloMes } from "@/domain/frequencia";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface ResumoEnvioSaidas {
  criar: number;
  preencher: number;
  substituir: number;
  remover: number;
  puladasOcupadas: number;
  puladasFormula: number;
  ambiguidades: number;
}

interface CelulaPrevia {
  celula: string;
  valor: string;
  anterior: string;
  alunoNome: string;
  dia: string;
  campo: string;
}

interface SimulacaoSaidas {
  modalidade: "conservador" | "completo";
  planoHash: string;
  aba: string;
  bloqueado: boolean;
  resumo: ResumoEnvioSaidas;
  avisos: string[];
  criar: { nome: string; dia: string; linha: number }[];
  preencher: CelulaPrevia[];
  substituir: CelulaPrevia[];
  candidatosRemocao: { linha: number; nome: string; dia: string }[];
}

interface PreviaEntradas {
  planoHash: string;
  novas: number;
  existentes: number;
  bloqueado: boolean;
  avisos: string[];
  criar: { nome: string; linha: number }[];
}

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  mes: string;
  onMes: (mes: string) => void;
  modoCompleto: boolean;
  aoConcluir: () => void;
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (ouvinte) => {
      window.addEventListener("online", ouvinte);
      window.addEventListener("offline", ouvinte);
      return () => {
        window.removeEventListener("online", ouvinte);
        window.removeEventListener("offline", ouvinte);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function IndicadorLeitura() {
  return (
    <Stack
      direction="row"
      spacing={1}
      role="status"
      sx={{ alignItems: "center", color: "text.secondary" }}
    >
      <CircularProgress size={16} aria-hidden="true" />
      <TextoDeCarregamento>Lendo a planilha e montando a prévia...</TextoDeCarregamento>
    </Stack>
  );
}

export default function DialogoEnvioSaidas({
  aberto,
  onAbrir,
  mes,
  onMes,
  modoCompleto,
  aoConcluir,
}: Props) {
  const { avisarSucesso, publicarAviso } = useAvisosDaSessao();
  const online = useOnline();
  const [simulacao, setSimulacao] = useState<SimulacaoSaidas | null>(null);
  const [previaEntradas, setPreviaEntradas] = useState<PreviaEntradas | null>(null);
  const [avisoEntradas, setAvisoEntradas] = useState("");
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [removerMarcadas, setRemoverMarcadas] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(true);

  const dias = diasDoMes(mes);
  const de = dias[0] ?? mes;
  const ate = dias[dias.length - 1] ?? mes;

  const entradas = useCallback(
    () => ({
      de,
      ate,
      ...(modoCompleto && removerMarcadas.length > 0 ? { removerLinhas: removerMarcadas } : {}),
    }),
    [de, ate, modoCompleto, removerMarcadas],
  );

  const chavePrevia = JSON.stringify([aberto, modoCompleto, entradas()]);
  const [chaveAnterior, setChaveAnterior] = useState(chavePrevia);
  // Invalida a prévia no mesmo render da troca, antes de permitir outro envio.
  if (chaveAnterior !== chavePrevia) {
    setChaveAnterior(chavePrevia);
    setCarregando(true);
    setSimulacao(null);
    setPreviaEntradas(null);
    setErro("");
    setAvisoEntradas("");
  }

  useEffect(() => {
    if (!aberto) return;
    const controle = new AbortController();
    const { signal } = controle;
    async function simular() {
      const [saidas, entradasPrevia] = await Promise.allSettled([
        pedir<SimulacaoSaidas>("/api/planilha-saidas/simular", {
          ...corpoJson(entradas()),
          signal,
        }),
        pedir<PreviaEntradas>("/api/planilha-entradas/simular", {
          ...corpoJson({ de, ate }),
          signal,
        }),
      ]);
      // A troca do período cancela a leitura anterior, inclusive suas mensagens e resultados.
      if (signal.aborted) return;
      if (saidas.status === "fulfilled") setSimulacao(saidas.value);
      else {
        setSimulacao(null);
        const excecao = saidas.reason;
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar a prévia.",
        );
        setErroVariante(estadoDeErro(excecao));
      }
      // As entradas dependem da aba Entradas preparada; sem ela, só as saídas seguem.
      if (entradasPrevia.status === "fulfilled") setPreviaEntradas(entradasPrevia.value);
      else {
        setPreviaEntradas(null);
        const excecao = entradasPrevia.reason;
        setAvisoEntradas(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar as entradas.",
        );
      }
      setCarregando(false);
    }
    void simular();
    return () => controle.abort();
  }, [aberto, entradas, de, ate]);

  function trocarMes(novo: string) {
    setRemoverMarcadas([]);
    onMes(novo);
  }

  const podeSaidas = Boolean(simulacao && !simulacao.bloqueado);
  const podeEntradas = Boolean(previaEntradas && !previaEntradas.bloqueado);

  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (carregando || (!podeSaidas && !podeEntradas)) return;
    setErro("");
    const feitos: string[] = [];
    const problemas: string[] = [];
    let parcial = false;

    if (simulacao && podeSaidas) {
      try {
        const dados = await pedir<{
          resultado: "sucesso" | "parcial" | "falha";
          contagens?: Record<string, number>;
          erro?: string;
        }>(
          "/api/planilha-saidas/aplicar",
          corpoJson({ ...entradas(), planoHash: simulacao.planoHash }),
        );
        if (dados.resultado === "sucesso") {
          const criadas = dados.contagens?.linhasCriadas ?? simulacao.resumo.criar;
          const corrigidas = dados.contagens?.substituidas ?? simulacao.resumo.substituir;
          const removidas = dados.contagens?.removidasLinhas ?? simulacao.resumo.remover;
          feitos.push(
            `Saídas: ${criadas} ${criadas === 1 ? "linha criada" : "linhas criadas"} · ${corrigidas} ${
              corrigidas === 1 ? "corrigida" : "corrigidas"
            } · ${removidas} ${removidas === 1 ? "removida" : "removidas"}`,
          );
        } else {
          parcial = parcial || dados.resultado === "parcial";
          problemas.push(`Saídas: ${dados.erro ?? "não foi possível enviar."}`);
        }
      } catch (excecao) {
        problemas.push(
          `Saídas: ${excecao instanceof ErroApi ? excecao.message : "não foi possível enviar."}`,
        );
        setErroVariante(estadoDeErro(excecao));
      }
    }

    if (previaEntradas && podeEntradas) {
      try {
        const dados = await pedir<{ resultado: string; linhasCriadas?: number }>(
          "/api/planilha-entradas/enviar",
          corpoJson({ de, ate, planoHash: previaEntradas.planoHash }),
        );
        const criadas = dados.linhasCriadas ?? previaEntradas.novas;
        feitos.push(`Entradas: ${criadas} ${criadas === 1 ? "linha criada" : "linhas criadas"}`);
      } catch (excecao) {
        problemas.push(
          `Entradas: ${excecao instanceof ErroApi ? excecao.message : "não foi possível enviar."}`,
        );
        setErroVariante(estadoDeErro(excecao));
      }
    }

    if (problemas.length === 0) {
      avisarSucesso(`${feitos.join(". ")}.`);
      onAbrir(false);
      aoConcluir();
      return;
    }
    setErro(problemas.join(" "));
    if (feitos.length > 0) avisarSucesso(`${feitos.join(". ")}.`);
    publicarAviso({
      severidade: "error",
      titulo: parcial
        ? "O envio ficou parcial. Confira a planilha antes de tentar de novo."
        : "Parte do envio não foi concluída. Confira a planilha antes de tentar de novo.",
    });
    aoConcluir();
  });

  const bloqueado = simulacao?.bloqueado ?? false;

  return (
    <Dialogo
      aberto={aberto}
      onFechar={() => onAbrir(false)}
      titulo={`Enviar saídas e entradas · ${rotuloMes(mes)}`}
      tamanho="medio"
      acoes={
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Botao type="button" variante="contorno" onClick={() => onAbrir(false)}>
            Cancelar
          </Botao>
          <Botao
            type="button"
            variante="secundario"
            onClick={() => void enviar()}
            disabled={carregando || (!podeSaidas && !podeEntradas) || !online}
            carregando={enviando}
            icone={<SendRoundedIcon />}
          >
            Enviar
          </Botao>
        </Stack>
      }
    >
      <Stack spacing={2}>
        <Box sx={{ width: { xs: "100%", sm: 224 } }}>
          <SeletorPeriodo
            id="envio-mes"
            modo="mes"
            valor={mes}
            max={mes}
            disabled={enviando}
            rotuloAcessivel="Mês do envio das saídas e entradas"
            rotulo={rotuloMes(mes)}
            onValor={trocarMes}
          />
        </Box>

        {modoCompleto && (
          <Alerta severity="warning">
            Modo completo ativo. A planilha guarda cópia antes de corrigir ou remover.
          </Alerta>
        )}

        {!online && (
          <Alerta severity="error">
            Sem conexão. O envio fica indisponível até a internet voltar.
          </Alerta>
        )}

        {carregando && <IndicadorLeitura />}

        {!carregando && bloqueado && (
          <AlertaCompacto
            variante="dados_invalidos"
            descricao={
              simulacao?.avisos[0] ??
              "A estrutura da planilha impede a escrita. Ajuste o cabeçalho."
            }
            tamanho="linha"
          />
        )}

        {simulacao && !carregando && !bloqueado && (
          <Paper variant="outlined" sx={{ p: 1.5, boxShadow: "none" }}>
            <Stack spacing={0.5}>
              <Box>
                <Selo rotulo={`Aba ${simulacao.aba}`} tom="sucesso" />
              </Box>
              <Typography variant="caption" component="p">
                {simulacao.resumo.criar}{" "}
                {simulacao.resumo.criar === 1 ? "linha nova" : "linhas novas"} ·{" "}
                {simulacao.resumo.preencher}{" "}
                {simulacao.resumo.preencher === 1 ? "célula a preencher" : "células a preencher"} ·{" "}
                {simulacao.resumo.puladasOcupadas} ocupadas ignoradas ·{" "}
                {simulacao.resumo.puladasFormula} fórmulas protegidas
              </Typography>
              {modoCompleto && (
                <Typography variant="caption" component="p">
                  {simulacao.resumo.substituir} correções · {simulacao.resumo.remover} remoções
                  marcadas · {simulacao.resumo.ambiguidades} ambiguidades
                </Typography>
              )}
              {simulacao.criar.length > 0 && (
                <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                  Novas:{" "}
                  {simulacao.criar
                    .slice(0, 5)
                    .map((item) => `${item.nome} (${item.dia})`)
                    .join(", ")}
                  {simulacao.criar.length > 5 ? " ..." : ""}
                </Typography>
              )}
              {simulacao.substituir.length > 0 && (
                <Typography variant="caption" component="p" sx={{ color: "falta.texto" }}>
                  Correções:{" "}
                  {simulacao.substituir
                    .slice(0, 5)
                    .map((item) => `${item.celula} ${item.anterior || "vazia"} para ${item.valor}`)
                    .join(", ")}
                  {simulacao.substituir.length > 5 ? " ..." : ""}
                </Typography>
              )}
              {simulacao.avisos.slice(0, 3).map((aviso) => (
                <Typography
                  key={aviso}
                  variant="caption"
                  component="p"
                  sx={{ color: "text.secondary" }}
                >
                  {aviso}
                </Typography>
              ))}
            </Stack>
          </Paper>
        )}

        {!carregando && previaEntradas && (
          <Paper variant="outlined" sx={{ p: 1.5, boxShadow: "none" }}>
            <Stack spacing={0.5}>
              <Typography component="p" variant="subtitle2">
                Aba Entradas
              </Typography>
              {previaEntradas.bloqueado ? (
                <Typography variant="caption" component="p" sx={{ color: "falta.texto" }}>
                  {previaEntradas.avisos[0] ?? "A aba Entradas precisa de conferência."}
                </Typography>
              ) : (
                <Typography variant="caption" component="p">
                  {previaEntradas.novas}{" "}
                  {previaEntradas.novas === 1 ? "linha nova" : "linhas novas"} ·{" "}
                  {previaEntradas.existentes}{" "}
                  {previaEntradas.existentes === 1 ? "já está na planilha" : "já estão na planilha"}
                </Typography>
              )}
            </Stack>
          </Paper>
        )}

        {!carregando && !previaEntradas && avisoEntradas && (
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            Entradas: {avisoEntradas}
          </Typography>
        )}

        {modoCompleto &&
          !carregando &&
          simulacao?.candidatosRemocao.map((item) => (
            <FormControlLabel
              key={item.linha}
              control={
                <Checkbox
                  checked={removerMarcadas.includes(item.linha)}
                  onChange={(evento) =>
                    setRemoverMarcadas((atuais) =>
                      evento.target.checked
                        ? [...atuais, item.linha]
                        : atuais.filter((linha) => linha !== item.linha),
                    )
                  }
                />
              }
              label={`Remover ${item.nome} (${item.dia}, linha ${item.linha})`}
            />
          ))}

        {erro && <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
      </Stack>
    </Dialogo>
  );
}

/** Estado público da integração de saídas, para o botão da vista Saídas. */
export function useEstadoPlanilhaSaidas() {
  const [estado, setEstado] = useState<{
    ativa: boolean;
    modo: "conservador" | "completo";
    modoCompletoAte: string | null;
    podeEnviar: boolean;
    configurada: boolean;
  } | null>(null);
  const recarregar = useCallback(async () => {
    try {
      const dados = await pedir<{ estado: typeof estado }>("/api/planilha-saidas/estado");
      setEstado(dados.estado);
    } catch {
      setEstado(null);
    }
  }, []);
  useEffect(() => {
    let viva = true;
    pedir<{ estado: typeof estado }>("/api/planilha-saidas/estado")
      .then((dados) => {
        if (viva) setEstado(dados.estado);
      })
      .catch(() => {
        if (viva) setEstado(null);
      });
    return () => {
      viva = false;
    };
  }, []);
  return { estado, recarregar };
}
