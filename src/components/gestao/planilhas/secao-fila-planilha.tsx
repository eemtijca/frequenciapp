"use client";

// Fila FIFO dos envios automáticos às planilhas: contagens por estado, os envios ainda
// pendentes e as ações da administração (processar agora, reenfileirar e descartar).
import { useCallback, useEffect, useState } from "react";
import { ListOrdered, LoaderCircle, Play, RefreshCw, RotateCcw, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { CaixasDeInfo } from "@/components/ui/caixas-de-info";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo, type VarianteSelo } from "@/components/ui/selo";

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

const VARIANTE_ESTADO: Record<EstadoItemFila, VarianteSelo> = {
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
    <SecaoRecolhivel
      dataSecao="planilha-fila"
      titulo="Fila de envios automáticos"
      icone={ListOrdered}
      aberto={aberto}
      onAbertoChange={setAberto}
      resumo={
        <>
          <Selo
            variante={
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
          {conferencias > 0 && <Selo variante="atencao">{conferencias} para conferir</Selo>}
          {falhos > 0 && <Selo variante="perigo">{falhos} com falha</Selo>}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erro && (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={chaveAtiva === "processar"}
            onClick={processarAgora}
          >
            {chaveAtiva === "processar" ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            Processar agora
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={carregar}>
            <RefreshCw size={16} aria-hidden="true" />
            Atualizar fila
          </Button>
        </div>
        <details className="text-muted-foreground text-xs">
          <summary className="min-h-11 cursor-pointer content-center font-medium">
            Detalhes da fila
          </summary>
          <p className="mb-3">
            Envios processados por ordem de chegada, com até cinco tentativas automáticas. A lista
            mostra os pendentes, as falhas de preparo, as origens não processadas e as conferências
            de escrita incerta. Os resolvidos entram nas contagens.
          </p>
          {estado && (
            <CaixasDeInfo
              rotulo="Itens por estado"
              partes={(Object.keys(ROTULO_ESTADO) as EstadoItemFila[]).map(
                (chave) => `${ROTULO_ESTADO[chave]}: ${estado.contagens[chave]}`,
              )}
            />
          )}
        </details>
        {estado && estado.itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum envio pendente na fila.</p>
        ) : (
          <ul aria-label="Itens da fila" className="divide-y rounded-lg border">
            {estado?.itens.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div>
                    <Selo variante={VARIANTE_ESTADO[item.estado]}>
                      {item.requerConferencia
                        ? item.podeResolver
                          ? "Conferência necessária"
                          : "Ação necessária"
                        : ROTULO_ESTADO[item.estado]}
                    </Selo>
                  </div>
                  <p className="text-muted-foreground text-xs wrap-anywhere">
                    {partesDoItem(item).join(" · ")}
                    {item.escopos.map((alvo, indice) => (
                      <span key={indice} className="block">
                        Origem {alvo.origemRotulo ?? alvo.origemId ?? "movimentação"} ·{" "}
                        {alvo.destino ?? "Destino desconhecido"}
                      </span>
                    ))}
                  </p>
                </div>
                <div className="flex gap-2">
                  {item.podeResolver && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={chaveAtiva === `resolver:${item.id}`}
                      onClick={() => agir(item, "resolver")}
                    >
                      Registrar conferência
                    </Button>
                  )}
                  {item.podeReprocessar && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={chaveAtiva === `reenfileirar:${item.id}`}
                      onClick={() => agir(item, "reenfileirar")}
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      Tentar novamente
                    </Button>
                  )}
                  {item.estado === "AGUARDANDO" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11"
                      disabled={chaveAtiva === `descartar:${item.id}`}
                      onClick={() => agir(item, "descartar")}
                    >
                      <X size={16} aria-hidden="true" />
                      Descartar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SecaoRecolhivel>
  );
}
