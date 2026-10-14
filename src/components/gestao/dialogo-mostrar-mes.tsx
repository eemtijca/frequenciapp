"use client";

// Acesso direto aos meses preparados e transferência conferida das abas antigas.
import { useState } from "react";
import { CalendarDays, ExternalLink, LoaderCircle } from "lucide-react";
import { rotuloMes } from "@/domain/frequencia";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Catalogo {
  abas: { aba: string; mes: string; url: string; oculta: boolean }[];
  legadas: { aba: string }[];
}
interface Previa {
  aba: string;
  planoHash: string;
  preenchidas: number;
  conferidas: number;
  destinos: { aba: string; mes: string }[];
}
interface Conferencia {
  aba: string;
  previa?: Previa;
  erro?: string;
  concluida?: boolean;
}

export function DialogoMostrarMes({
  mesAtual,
  disabled,
  onAtualizar,
}: {
  mesAtual: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [mes, setMes] = useState(mesAtual);
  const [mensagem, setMensagem] = useState("");
  const [conferencias, setConferencias] = useState<Conferencia[] | null>(null);
  const [andamento, setAndamento] = useState("");
  const acoes = useAcoesPorChave();
  const ocupado = acoes.chaveAtiva !== null;
  async function executar(tipo: "abrir" | "liberar" | "conferir" | "aplicar") {
    return acoes.executar("meses", async () => {
      setMensagem("");
      try {
        if (tipo === "abrir") {
          setCatalogo(null);
          setConferencias(null);
          setAberto(true);
          const dados = await pedir<Catalogo>("/api/planilha/mensal/visibilidade");
          setCatalogo(dados);
          setMes(
            dados.abas.some((aba) => aba.mes === mesAtual)
              ? mesAtual
              : (dados.abas[0]?.mes ?? mesAtual),
          );
        }
        if (tipo === "liberar") {
          await pedir("/api/planilha/mensal/visibilidade", corpoJson({ mes }));
          setCatalogo(await pedir<Catalogo>("/api/planilha/mensal/visibilidade"));
          setMensagem("Todos os meses preparados estão acessíveis.");
          await onAtualizar();
        }
        if (tipo === "conferir") {
          const resultados: Conferencia[] = [];
          for (const antiga of catalogo?.legadas ?? []) {
            setAndamento(antiga.aba);
            try {
              const dados = await pedir<{ previa: Previa }>(
                "/api/planilha/mensal/legado",
                corpoJson({ aba: antiga.aba }),
              );
              resultados.push({ aba: antiga.aba, previa: dados.previa });
            } catch (erro) {
              resultados.push({
                aba: antiga.aba,
                erro: mensagemAmigavel(erro, "Não foi possível conferir esta aba."),
              });
            }
            setConferencias([...resultados]);
          }
        }
        if (tipo === "aplicar") {
          const resultados = [...(conferencias ?? [])];
          for (const [indice, item] of resultados.entries()) {
            if (!item.previa || item.concluida || item.erro) continue;
            setAndamento(item.aba);
            try {
              await pedir(
                "/api/planilha/mensal/legado",
                corpoJson({ aba: item.aba, planoHash: item.previa.planoHash }),
              );
              resultados[indice] = { ...item, concluida: true };
            } catch (erro) {
              resultados[indice] = {
                ...item,
                previa: undefined,
                erro: mensagemAmigavel(
                  erro,
                  "Resultado não confirmado. Confira a planilha antes de tentar novamente.",
                ),
              };
            }
            setConferencias([...resultados]);
          }
          setCatalogo(await pedir<Catalogo>("/api/planilha/mensal/visibilidade"));
          await onAtualizar();
        }
      } catch (erro) {
        setMensagem(mensagemAmigavel(erro, "Não foi possível conferir os meses agora."));
      } finally {
        setAndamento("");
      }
    });
  }
  const meses = [...new Set(catalogo?.abas.map((aba) => aba.mes) ?? [])];
  const prontas =
    conferencias?.filter((item) => item.previa && !item.erro && !item.concluida).length ?? 0;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={disabled || ocupado}
        onClick={() => void executar("abrir")}
      >
        <CalendarDays size={16} /> Meses da frequência
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!ocupado) setAberto(valor);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Meses da frequência</DialogTitle>
            <DialogDescription>Escolha o mês e abra a turma no Google Planilhas.</DialogDescription>
          </DialogHeader>
          {!catalogo && ocupado && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" /> Carregando meses...
            </p>
          )}
          {catalogo && (
            <>
              {meses.length > 0 ? (
                <>
                  <Selecionar
                    id="planilha-mes-acesso"
                    value={mes}
                    onValueChange={setMes}
                    ariaLabel="Mês das frequências"
                    disabled={ocupado}
                    opcoes={meses.map((valor) => ({ valor, rotulo: rotuloMes(valor) }))}
                  />
                  <div className="grid gap-2 sm:grid-cols-2" aria-label="Turmas do mês">
                    {catalogo.abas
                      .filter((aba) => aba.mes === mes)
                      .map((aba) => (
                        <a
                          key={aba.url}
                          href={aba.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Abrir ${aba.aba}`}
                          aria-disabled={aba.oculta}
                          onClick={(evento) => {
                            if (aba.oculta) {
                              evento.preventDefault();
                              setMensagem("Use Liberar meses para acessar as abas ocultas.");
                            }
                          }}
                          className="controle-vidro flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate">{aba.aba}</span>
                          <ExternalLink size={16} className="shrink-0" aria-hidden="true" />
                        </a>
                      ))}
                  </div>
                  <Button
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => void executar("liberar")}
                  >
                    Liberar meses
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Prepare um mês para criar as abas das turmas.
                </p>
              )}
              {(catalogo.legadas.length > 0 || conferencias) && (
                <details className="rounded-xl border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Abas sem mês</summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-muted-foreground text-sm">
                      Move as frequências para os meses preparados e retira as abas antigas após a
                      conferência.
                    </p>
                    <Button
                      variant="outline"
                      disabled={ocupado || !catalogo.legadas.length}
                      onClick={() => void executar("conferir")}
                    >
                      Conferir abas antigas
                    </Button>
                    {conferencias?.map((item) => (
                      <div key={item.aba} className="rounded-lg border p-3 text-sm">
                        <p className="font-medium">{item.aba}</p>
                        {item.concluida ? (
                          <p className="text-primary">Transferida e retirada</p>
                        ) : item.erro ? (
                          <p className="text-falta-texto">{item.erro}</p>
                        ) : (
                          item.previa && (
                            <>
                              <p>
                                {item.previa.preenchidas}{" "}
                                {item.previa.preenchidas === 1 ? "marca a mover" : "marcas a mover"}{" "}
                                · {item.previa.conferidas}{" "}
                                {item.previa.conferidas === 1 ? "já preservada" : "já preservadas"}
                              </p>
                              <p className="text-muted-foreground">
                                {item.previa.destinos.map((destino) => destino.aba).join(", ")}
                              </p>
                            </>
                          )
                        )}
                      </div>
                    ))}
                    {prontas > 0 && (
                      <Button disabled={ocupado} onClick={() => void executar("aplicar")}>
                        Transferir e retirar {prontas === 1 ? "1 aba" : `${prontas} abas`}
                      </Button>
                    )}
                  </div>
                </details>
              )}
            </>
          )}
          {andamento && (
            <p role="status" className="text-sm">
              Conferindo {andamento}...
            </p>
          )}
          {mensagem && (
            <p role="status" className="text-sm">
              {mensagem}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
