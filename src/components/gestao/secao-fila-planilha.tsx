"use client";

// Fila FIFO dos envios automáticos às planilhas: contagens por estado, os itens mais
// recentes e as ações da administração (processar agora, reenfileirar e descartar).
import { useCallback, useEffect, useState } from "react";
import { ListOrdered, LoaderCircle } from "lucide-react";
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
  desligado: "Envio automático desligado",
  sem_mapa: "Sem aba vinculada",
  pendente_manual: "Conferir no envio manual",
  sem_confirmacao: "Sem confirmação do Google",
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

  function processarAgora() {
    void executar("processar", async () => {
      try {
        const resumo = await pedir<ResumoDoProcessamento>(
          "/api/planilha/fila/processar",
          corpoJson({}),
        );
        if (resumo.processados === 0) avisarInfo("Nada a processar agora.");
        else avisarSucesso("Fila processada.", `${resumo.processados} item(ns) tratado(s).`);
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível processar a fila." });
      }
    });
  }

  function agir(item: ItemDaFila, acao: "reenfileirar" | "descartar") {
    void executar(`${acao}:${item.id}`, async () => {
      try {
        await pedir(`/api/planilha/fila/${item.id}/${acao}`, corpoJson({}));
        avisarSucesso(acao === "reenfileirar" ? "Item voltou ao fim da fila." : "Item descartado.");
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
          <Selo variante={abertos > 0 ? "atencao" : "sucesso"}>
            {abertos > 0 ? `${abertos} na fila` : "Fila vazia"}
          </Selo>
          {falhos > 0 && <Selo variante="perigo">{falhos} com falha</Selo>}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Cada envio automático entra na fila e sai na ordem em que chegou, um de cada vez. Uma
          falha confirmada é tentada de novo, até cinco vezes, e depois fica marcada como falha, sem
          travar os envios seguintes.
        </p>
        {erro && (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        )}
        {estado && (
          <CaixasDeInfo
            rotulo="Itens por estado"
            partes={(Object.keys(ROTULO_ESTADO) as EstadoItemFila[]).map(
              (chave) => `${ROTULO_ESTADO[chave]}: ${estado.contagens[chave]}`,
            )}
          />
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={chaveAtiva === "processar"}
            onClick={processarAgora}
          >
            {chaveAtiva === "processar" && <LoaderCircle size={16} className="animate-spin" />}
            Processar agora
          </Button>
        </div>
        {estado && estado.itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum envio automático registrado.</p>
        ) : (
          <ul aria-label="Itens da fila" className="divide-y rounded-lg border">
            {estado?.itens.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div>
                    <Selo variante={VARIANTE_ESTADO[item.estado]}>
                      {ROTULO_ESTADO[item.estado]}
                    </Selo>
                  </div>
                  <CaixasDeInfo partes={partesDoItem(item)} />
                </div>
                <div className="flex gap-2">
                  {item.estado === "AGUARDANDO" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10"
                      disabled={chaveAtiva === `descartar:${item.id}`}
                      onClick={() => agir(item, "descartar")}
                    >
                      Descartar
                    </Button>
                  )}
                  {(item.estado === "FALHOU" || item.estado === "DESCARTADO") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10"
                      disabled={chaveAtiva === `reenfileirar:${item.id}`}
                      onClick={() => agir(item, "reenfileirar")}
                    >
                      Reenfileirar
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
