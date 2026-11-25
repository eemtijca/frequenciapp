"use client";

// Fila FIFO dos envios automáticos às planilhas: contagens por estado, os envios ainda
// pendentes e as ações da administração (processar agora, reenfileirar e descartar).
import { useCallback, useEffect, useState } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { rotuloData } from "@/domain/frequencia";
import type {
  EstadoDaFila,
  EstadoItemFila,
  ItemDaFila,
  ResumoDoProcessamento,
  TipoItemFila,
} from "@/domain/fila-planilha";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { Selo, type TomSelo } from "@/components/ui/mui/selo";

const ATUALIZAR_A_CADA_MS = 15_000;

const ROTULO_TIPO: Record<TipoItemFila, string> = {
  FREQUENCIA: "Chamada",
  SAIDAS: "Saída",
  ENTRADAS: "Entrada",
};

const ROTULO_ESTADO: Record<EstadoItemFila, string> = {
  AGUARDANDO: "Aguardando",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  FALHOU: "Falhou",
  DESCARTADO: "Descartado",
};

const TOM_ESTADO: Record<EstadoItemFila, TomSelo> = {
  AGUARDANDO: "neutro",
  EM_ANDAMENTO: "neutro",
  CONCLUIDO: "sucesso",
  FALHOU: "perigo",
  DESCARTADO: "neutro",
};

const ROTULO_RESULTADO: Record<string, string> = {
  enviado: "Enviado",
  sem_trabalho: "Sem participantes para envio",
  desligado: "Envio automático desligado",
  sem_mapa: "Sem aba vinculada",
  pendente_manual: "Conferir no envio manual",
  sem_confirmacao: "Sem confirmação do Google",
  falha_preparo: "Falha no preparo do envio",
  nao_processado: "Origem não processada",
  limite: "Limite do Google, nova tentativa",
  falhou: "Falha no envio",
  sem_autor: "Autor removido",
};

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function partesDoItem(item: ItemDaFila): string[] {
  return [
    ROTULO_TIPO[item.tipo],
    rotuloData(item.dia),
    item.turmaRotulo ?? "",
    item.tentativas > 0
      ? `${item.tentativas} ${item.tentativas === 1 ? "tentativa" : "tentativas"}`
      : "",
    item.resultado ? (ROTULO_RESULTADO[item.resultado] ?? item.resultado) : "",
    item.falhaPreparo ? `Preparo: ${item.falhaPreparo}` : "",
    item.estado === "AGUARDANDO" && item.proximaTentativaEm
      ? `Nova tentativa às ${horaLocal(item.proximaTentativaEm)}`
      : "",
  ].filter(Boolean);
}

export default function SecaoFilaPlanilha() {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoDaFila | null>(null);
  const [erro, setErro] = useState("");
  const { chaveAtiva, executar } = useAcoesPorChave();

  const [recarga, setRecarga] = useState(0);
  const carregar = useCallback(() => setRecarga((valor) => valor + 1), []);

  useEffect(() => {
    const controlador = new AbortController();
    pedir<EstadoDaFila>("/api/planilha/fila", { signal: controlador.signal })
      .then((dados) => {
        if (controlador.signal.aborted) return;
        setEstado(dados);
        setErro("");
      })
      .catch(() => {
        if (!controlador.signal.aborted) setErro("Não foi possível ler a fila de envios.");
      });
    return () => controlador.abort();
  }, [recarga]);

  useEffect(() => {
    if (!aberto) return;
    const intervalo = setInterval(carregar, ATUALIZAR_A_CADA_MS);
    return () => clearInterval(intervalo);
  }, [aberto, carregar]);

  const abertos = (estado?.contagens.AGUARDANDO ?? 0) + (estado?.contagens.EM_ANDAMENTO ?? 0);
  const falhos = estado?.contagens.FALHOU ?? 0;
  const conferencias = estado?.conferenciasPendentes ?? 0;

  function processarAgora() {
    void executar("processar", async () => {
      try {
        const resumo = await pedir<ResumoDoProcessamento>(
          "/api/planilha/fila/processar",
          corpoJson({}),
        );
        if (resumo.processados === 0) avisarInfo("Nada a processar agora.");
        else
          avisarSucesso(
            "Fila processada.",
            `${resumo.processados} ${resumo.processados === 1 ? "envio processado" : "envios processados"}.`,
          );
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível processar a fila." });
      }
    });
  }

  function agir(item: ItemDaFila, acao: "reenfileirar" | "descartar" | "resolver") {
    void executar(`${acao}:${item.id}`, async () => {
      try {
        await pedir(
          `/api/planilha/fila/${item.id}/${acao}`,
          corpoJson(acao === "resolver" ? { confirmado: true } : {}),
        );
        avisarSucesso(
          acao === "reenfileirar"
            ? "Item voltou ao fim da fila."
            : acao === "resolver"
              ? "Conferência registrada para este item."
              : "Item descartado.",
        );
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível concluir a ação." });
      }
    });
  }

  return (
    <Box data-secao="planilha-fila">
      <Acordeao
        titulo="Fila de envios automáticos"
        resumo={
          <>
            <Selo
              tom={
                erro
                  ? "perigo"
                  : !estado
                    ? "neutro"
                    : abertos + conferencias > 0
                      ? "atencao"
                      : "sucesso"
              }
            >
              {erro
                ? "Falha ao consultar"
                : !estado
                  ? "Conferindo..."
                  : abertos > 0
                    ? `${abertos} na fila`
                    : conferencias > 0
                      ? `${conferencias} para conferir`
                      : "Fila vazia"}
            </Selo>
            {conferencias > 0 ? <Selo tom="atencao">{conferencias} para conferir</Selo> : null}
            {falhos > 0 ? <Selo tom="perigo">{falhos} com falha</Selo> : null}
          </>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          {erro ? (
            <AlertaCompacto variante="indisponivel" descricao={erro} tamanho="linha" />
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              disabled={chaveAtiva === "processar"}
              carregando={chaveAtiva === "processar"}
              icone={<PlayArrowRoundedIcon />}
              onClick={processarAgora}
            >
              Processar agora
            </Botao>
            <Botao type="button" variante="texto" icone={<RefreshRoundedIcon />} onClick={carregar}>
              Atualizar fila
            </Botao>
          </Stack>
          <Acordeao
            titulo="Detalhes da fila"
            nivelTitulo="h4"
            resumo={
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Contagens por estado
              </Typography>
            }
          >
            <Stack spacing={2}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Envios processados por ordem de chegada, com até cinco tentativas automáticas. A
                lista mostra os pendentes, as falhas de preparo, as origens não processadas e as
                conferências de escrita incerta. Os resolvidos entram nas contagens.
              </Typography>
              {estado ? (
                <CaixasDeInfo
                  rotulo="Itens por estado"
                  itens={(Object.keys(ROTULO_ESTADO) as EstadoItemFila[]).map(
                    (chave) => `${ROTULO_ESTADO[chave]}: ${estado.contagens[chave]}`,
                  )}
                />
              ) : null}
            </Stack>
          </Acordeao>
          {estado && estado.itens.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhum envio pendente na fila.
            </Typography>
          ) : (
            <Box
              component="ul"
              aria-label="Itens da fila"
              sx={{
                display: "flex",
                flexDirection: "column",
                margin: 0,
                padding: 0,
                listStyle: "none",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              {estado?.itens.map((item) => (
                <Stack
                  component="li"
                  key={item.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" },
                    padding: 2,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Selo tom={TOM_ESTADO[item.estado]}>
                      {item.requerConferencia
                        ? item.podeResolver
                          ? "Conferência necessária"
                          : "Ação necessária"
                        : ROTULO_ESTADO[item.estado]}
                    </Selo>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        marginTop: 0.5,
                        color: "text.secondary",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {partesDoItem(item).join(" · ")}
                      {item.escopos.map((alvo, indice) => (
                        <Box component="span" key={indice} sx={{ display: "block" }}>
                          Origem {alvo.origemRotulo ?? alvo.origemId ?? "movimentação"} ·{" "}
                          {alvo.destino ?? "Destino desconhecido"}
                        </Box>
                      ))}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                    {item.podeResolver ? (
                      <Botao
                        type="button"
                        variante="contorno"
                        disabled={chaveAtiva === `resolver:${item.id}`}
                        onClick={() => agir(item, "resolver")}
                      >
                        Registrar conferência
                      </Botao>
                    ) : null}
                    {item.podeReprocessar ? (
                      <Botao
                        type="button"
                        variante="contorno"
                        disabled={chaveAtiva === `reenfileirar:${item.id}`}
                        icone={<ReplayRoundedIcon />}
                        onClick={() => agir(item, "reenfileirar")}
                      >
                        Tentar novamente
                      </Botao>
                    ) : null}
                    {item.estado === "AGUARDANDO" ? (
                      <Botao
                        type="button"
                        variante="texto"
                        disabled={chaveAtiva === `descartar:${item.id}`}
                        icone={<CloseRoundedIcon />}
                        onClick={() => agir(item, "descartar")}
                      >
                        Descartar
                      </Botao>
                    ) : null}
                  </Stack>
                </Stack>
              ))}
            </Box>
          )}
        </Stack>
      </Acordeao>
    </Box>
  );
}
