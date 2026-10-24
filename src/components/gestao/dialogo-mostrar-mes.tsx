"use client";

// Acesso direto aos meses preparados e transferência conferida das abas antigas.
import { useState } from "react";
import { CalendarDays, ExternalLink, LoaderCircle } from "lucide-react";
import { rotuloMes } from "@/domain/frequencia";
import {
  chaveResolucaoAntiga,
  type PreviaAntiga,
  type ResolucaoAntiga,
} from "@/domain/planilha-legado";
import { PendenciasAbaAntiga } from "./pendencias-aba-antiga";
import { corpoJson, pedir, ErroApi } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
interface Previa extends PreviaAntiga {
  planoHash: string;
}
interface Conferencia {
  aba: string;
  previa?: Previa;
  erro?: string;
  concluida?: boolean;
  resolucoes?: ResolucaoAntiga[];
  alterada?: boolean;
}

function temComplementos(previa: Previa): boolean {
  return Boolean(
    previa.complementos &&
    previa.complementos.formulas + previa.complementos.notas + previa.complementos.totais > 0,
  );
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
  const [descartarComplementos, setDescartarComplementos] = useState(false);
  const [senha, setSenha] = useState("");
  const acoes = useAcoesPorChave();
  const ocupado = acoes.chaveAtiva !== null;
  async function executar(
    tipo: "abrir" | "liberar" | "conferir" | "rever" | "aplicar",
    aba?: string,
  ) {
    return acoes.executar("meses", async () => {
      setMensagem("");
      try {
        if (tipo === "abrir") {
          setDescartarComplementos(false);
          setSenha("");
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
        if (tipo === "conferir" || tipo === "rever") {
          setDescartarComplementos(false);
          setSenha("");
          const resultados: Conferencia[] =
            tipo === "rever"
              ? [...(conferencias ?? [])]
              : (catalogo?.legadas ?? []).map((antiga) => ({ aba: antiga.aba }));
          for (const [indice, antiga] of resultados.entries()) {
            if (tipo === "rever" && antiga.aba !== aba) continue;
            setAndamento(antiga.aba);
            try {
              const dados = await pedir<{ previa: Previa }>(
                "/api/planilha/mensal/legado",
                corpoJson({ aba: antiga.aba, resolucoes: antiga.resolucoes ?? [] }),
              );
              resultados[indice] = {
                aba: antiga.aba,
                previa: dados.previa,
                resolucoes: antiga.resolucoes,
              };
            } catch (erro) {
              resultados[indice] = {
                aba: antiga.aba,
                resolucoes: antiga.resolucoes,
                erro: mensagemAmigavel(erro, "Não foi possível conferir esta aba."),
              };
            }
            setConferencias([...resultados]);
          }
        }
        if (tipo === "aplicar") {
          const resultados = [...(conferencias ?? [])];
          for (const [indice, item] of resultados.entries()) {
            if (
              !item.previa ||
              item.concluida ||
              item.erro ||
              item.alterada ||
              item.previa.totalPendencias > 0
            )
              continue;
            const descartar = temComplementos(item.previa);
            if (descartar && (!descartarComplementos || !senha)) continue;
            if (item.previa.resolucoesAplicadas > 0 && !senha) continue;
            setAndamento(item.aba);
            try {
              await pedir(
                "/api/planilha/mensal/legado",
                corpoJson({
                  aba: item.aba,
                  planoHash: item.previa.planoHash,
                  resolucoes: item.resolucoes ?? [],
                  ...(descartar ? { descartarComplementos: true } : {}),
                  ...(descartar || item.previa.resolucoesAplicadas > 0 ? { senha } : {}),
                }),
              );
              resultados[indice] = { ...item, concluida: true };
            } catch (erro) {
              if (erro instanceof ErroApi && [400, 401, 403, 429].includes(erro.status)) {
                setMensagem(mensagemAmigavel(erro, "Não foi possível confirmar a retirada."));
                break;
              }
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
        if (tipo === "aplicar") setSenha("");
        setAndamento("");
      }
    });
  }
  const meses = [...new Set(catalogo?.abas.map((aba) => aba.mes) ?? [])];
  const prontas =
    conferencias?.filter(
      (item) =>
        item.previa &&
        !item.erro &&
        !item.concluida &&
        !item.alterada &&
        !(item.previa.totalPendencias > 0) &&
        (!temComplementos(item.previa) || (descartarComplementos && Boolean(senha))) &&
        (!item.previa.resolucoesAplicadas || Boolean(senha)),
    ).length ?? 0;
  const revisadas =
    conferencias?.filter(
      (item) =>
        item.previa &&
        !item.erro &&
        !item.concluida &&
        !item.alterada &&
        !(item.previa.totalPendencias > 0),
    ) ?? [];
  const comComplementos = revisadas.some((item) => item.previa && temComplementos(item.previa));
  const comEscolhas = revisadas.some((item) => (item.previa?.resolucoesAplicadas ?? 0) > 0);
  function escolher(aba: string, escolhas: ResolucaoAntiga[], remover?: string) {
    setSenha("");
    setDescartarComplementos(false);
    setConferencias(
      (anteriores) =>
        anteriores?.map((item) => {
          if (item.aba !== aba) return item;
          const mapa = new Map(
            (item.resolucoes ?? []).map((escolha) => [chaveResolucaoAntiga(escolha), escolha]),
          );
          if (remover) mapa.delete(remover);
          for (const escolha of escolhas) {
            if (escolha.tipo !== "frequencia") {
              for (const [id, anterior] of mapa)
                if (anterior.tipo === "frequencia" && anterior.mes === escolha.mes) mapa.delete(id);
            }
            mapa.set(chaveResolucaoAntiga(escolha), escolha);
          }
          return { ...item, resolucoes: [...mapa.values()], alterada: true };
        }) ?? null,
    );
  }
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
          if (!ocupado) {
            setAberto(valor);
            if (!valor) {
              setSenha("");
              setDescartarComplementos(false);
            }
          }
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
                          className="controle flex min-h-11 items-center justify-between gap-2 px-3 py-2 text-sm"
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
                              {(item.previa.substituidas > 0 || item.previa.mantidas > 0) && (
                                <p className="mt-2">
                                  Marcas mensais: {item.previa.substituidas} a substituir ·{" "}
                                  {item.previa.mantidas} a manter
                                </p>
                              )}
                              {item.previa.totalPendencias > 0 && (
                                <PendenciasAbaAntiga
                                  pendencias={item.previa.pendencias}
                                  total={item.previa.totalPendencias}
                                  resolucoes={item.resolucoes ?? []}
                                  disabled={ocupado}
                                  onEscolher={(escolhas, remover) =>
                                    escolher(item.aba, escolhas, remover)
                                  }
                                />
                              )}
                              {item.previa.alunosIncluidos > 0 && (
                                <p className="mt-2">
                                  Linhas de alunos a incluir: {item.previa.alunosIncluidos}
                                </p>
                              )}
                              {temComplementos(item.previa) && (
                                <>
                                  <p className="mt-2">
                                    Fórmulas: {item.previa.complementos.formulas} · Notas:{" "}
                                    {item.previa.complementos.notas} · Totais:{" "}
                                    {item.previa.complementos.totais}
                                  </p>
                                  <details className="mt-2">
                                    <summary className="cursor-pointer">
                                      Ver exemplos de células
                                    </summary>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {item.previa.complementos.amostras.map((celula) => (
                                        <a
                                          key={`${celula.celula}:${celula.tipo}`}
                                          href={`${item.previa?.urlAntiga}&range=${celula.celula}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary underline"
                                        >
                                          {celula.celula} ({celula.tipo})
                                        </a>
                                      ))}
                                    </div>
                                    {item.previa.complementos.formulas +
                                      item.previa.complementos.notas +
                                      item.previa.complementos.totais >
                                      item.previa.complementos.amostras.length && (
                                      <p className="text-muted-foreground mt-2">
                                        Amostra de até 18 ocorrências. Abra a aba antiga para
                                        conferir todas.
                                      </p>
                                    )}
                                    <a
                                      href={item.previa.urlAntiga}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary mt-2 inline-block underline"
                                    >
                                      Abrir aba antiga
                                    </a>
                                  </details>
                                </>
                              )}
                            </>
                          )
                        )}
                        {!item.concluida && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            disabled={ocupado}
                            onClick={() => void executar("rever", item.aba)}
                          >
                            {item.alterada ? "Conferir escolhas" : "Conferir esta aba novamente"}
                          </Button>
                        )}
                      </div>
                    ))}
                    {comComplementos && (
                      <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm">
                        <p>
                          As frequências serão preservadas nos meses. Os totais e as notas listados
                          serão apagados com as abas antigas.
                        </p>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="accent-primary mt-0.5 size-5 shrink-0"
                            checked={descartarComplementos}
                            disabled={ocupado}
                            onChange={(evento) => setDescartarComplementos(evento.target.checked)}
                          />
                          Autorizo descartar os totais e notas antigos listados
                        </label>
                      </div>
                    )}
                    {(comEscolhas || (comComplementos && descartarComplementos)) && (
                      <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                        {comEscolhas && (
                          <p>
                            As escolhas de alunos e marcas foram conferidas. Confirme a retirada com
                            a senha administrativa.
                          </p>
                        )}
                        <label htmlFor="senha-descarte-abas">Senha administrativa</label>
                        <Input
                          id="senha-descarte-abas"
                          type="password"
                          autoComplete="current-password"
                          value={senha}
                          disabled={ocupado}
                          onChange={(evento) => setSenha(evento.target.value)}
                        />
                      </div>
                    )}
                    {revisadas.length > 0 && (
                      <Button
                        disabled={ocupado || !prontas}
                        onClick={() => void executar("aplicar")}
                      >
                        Transferir e retirar{" "}
                        {prontas === 1 ? "1 aba" : prontas > 1 ? `${prontas} abas` : ""}
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
