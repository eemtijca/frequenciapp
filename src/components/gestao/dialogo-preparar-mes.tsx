"use client";

// Prepara as abas mensais das turmas em sequência, com confirmação e resultado por turma.
import { useEffect, useState } from "react";
import { CalendarPlus, LoaderCircle, RotateCcw } from "lucide-react";
import { rotuloMes } from "@/domain/frequencia";
import { mesValido, nomeAbaMensal } from "@/domain/planilha-mensal";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarInfo, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ResultadoTurma {
  turmaOriginalId: string;
  rotulo: string;
  estado: "preparada" | "pendente" | "erro";
  aba?: string;
  criada?: boolean;
  atualizada?: boolean;
  erro?: string;
}

interface Interrupcao {
  mensagem: string;
  reconectar: boolean;
}

function interrupcaoDoPreparo(erro: unknown): Interrupcao | null {
  if (!(erro instanceof ErroApi)) return null;
  const corpo = erro.corpo;
  const codigo =
    typeof corpo === "object" && corpo !== null && "codigo" in corpo ? corpo.codigo : null;
  if (
    codigo === "GOOGLE_RECONECTAR" ||
    codigo === "GOOGLE_ACESSO" ||
    codigo === "GOOGLE_CONFIGURACAO" ||
    codigo === "GOOGLE_TEMPORARIO" ||
    erro.status === 401
  ) {
    return {
      mensagem: erro.message,
      reconectar: codigo === "GOOGLE_RECONECTAR" || codigo === "GOOGLE_ACESSO",
    };
  }
  return null;
}

export function DialogoPrepararMes({
  turmas,
  mes,
  onMes,
  mesMaximo,
  disabled,
  onAtualizar,
}: {
  turmas: { id: string; rotulo: string }[];
  mes: string;
  onMes: (mes: string) => void;
  mesMaximo: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoTurma[] | null>(null);
  const [turmaAtual, setTurmaAtual] = useState("");
  const [interrupcao, setInterrupcao] = useState<Interrupcao | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const mesDoRetorno = url.searchParams.get("googleMes");
    if (!mesDoRetorno) return;
    if (mesValido(mesDoRetorno) && mesDoRetorno <= mesMaximo) {
      onMes(mesDoRetorno);
    }
    // O retorno recupera o mês, mas qualquer nova escrita depende de outro clique.
    url.searchParams.delete("googleMes");
    window.history.replaceState(null, "", url);
  }, [mesMaximo, onMes]);

  const reconexao = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ url: string }>(
        "/api/planilha/google/iniciar",
        corpoJson({ finalidade: "FREQUENCIA", reconectar: true, mes }),
      );
      window.location.assign(dados.url);
    } catch (erro) {
      setInterrupcao({
        mensagem: mensagemAmigavel(erro, "Não foi possível conectar ao Google. Tente novamente."),
        reconectar: true,
      });
    }
  });

  const { executando, executar } = useAcaoUnica(async () => {
    if (turmas.length === 0 || reconexao.executando) return;
    const saida: ResultadoTurma[] = turmas.map((turma) => {
      const anterior = resultados?.find((item) => item.turmaOriginalId === turma.id);
      return anterior?.estado === "preparada"
        ? anterior
        : { turmaOriginalId: turma.id, rotulo: turma.rotulo, estado: "pendente" };
    });
    setResultados([...saida]);
    setInterrupcao(null);
    let interrompida = false;
    try {
      for (const [indice, turma] of turmas.entries()) {
        if (saida[indice]?.estado === "preparada") continue;
        setTurmaAtual(turma.rotulo);
        try {
          const dados = await pedir<{
            aba: string;
            mes: string;
            criada: boolean;
            atualizada: boolean;
          }>("/api/planilha/mensal", corpoJson({ turmaOriginalId: turma.id, mes }));
          saida[indice] = {
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            estado: "preparada",
            aba: dados.aba,
            criada: dados.criada,
            atualizada: dados.atualizada,
          };
        } catch (erro) {
          const falhaComum = interrupcaoDoPreparo(erro);
          if (falhaComum) {
            // As demais turmas usam a mesma conexão; repetir só multiplicaria a falha.
            setInterrupcao(falhaComum);
            interrompida = true;
            setResultados([...saida]);
            break;
          }
          saida[indice] = {
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            estado: "erro",
            erro: mensagemAmigavel(erro, "Não foi possível preparar a aba. Tente novamente."),
          };
        }
        setResultados([...saida]);
      }
      if (saida.every((item) => item.estado === "preparada")) {
        try {
          await pedir("/api/planilha/mensal/visibilidade", corpoJson({ mes }));
        } catch (erro) {
          setInterrupcao({
            mensagem: mensagemAmigavel(
              erro,
              "As abas estão preparadas, mas a exibição do mês não foi confirmada. Use Mostrar mês na planilha para conferir.",
            ),
            reconectar: interrupcaoDoPreparo(erro)?.reconectar ?? false,
          });
          await onAtualizar();
          return;
        }
        avisarSucesso(`Abas de ${rotuloMes(mes).toLowerCase()} preparadas.`);
      } else if (!interrompida) {
        avisarInfo("Há turmas pendentes.", "Confira o resultado de cada turma.");
      }
      await onAtualizar();
    } finally {
      setTurmaAtual("");
    }
  });
  const concluidas = resultados?.filter((item) => item.estado === "preparada").length ?? 0;
  const ocupada = executando || reconexao.executando;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={disabled || ocupada || turmas.length === 0}
        onClick={() => {
          setResultados(null);
          setInterrupcao(null);
          setAberto(true);
        }}
      >
        <CalendarPlus size={16} />
        Preparar mês
      </Button>
      <AlertDialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!ocupada) setAberto(valor);
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resultados === null ? "Preparar mês para todas as turmas" : "Abas do mês"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resultados === null
                ? "Organiza as abas do mês, preservando dias úteis e sábados com chamada salva. Retira Turma atual, domingos e sábados sem chamada. Ao concluir, mostra apenas este mês."
                : `${concluidas} de ${turmas.length} turmas prontas para ${rotuloMes(mes).toLowerCase()}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {interrupcao && (
            <div role="alert" className="superficie-vidro flex flex-col gap-3 p-3 text-sm">
              <p>{interrupcao.mensagem}</p>
              {interrupcao.reconectar && (
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  disabled={ocupada}
                  onClick={() => void reconexao.executar()}
                >
                  {reconexao.executando ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  Reconectar conta Google
                </Button>
              )}
            </div>
          )}
          {resultados === null ? (
            <>
              <SeletorPeriodo
                id="planilha-mes-preparar"
                modo="mes"
                valor={mes}
                max={mesMaximo}
                rotuloAcessivel="Mês das novas abas"
                rotulo={rotuloMes(mes)}
                onValor={onMes}
              />
              <p className="text-muted-foreground text-sm">
                Exemplo: {nomeAbaMensal(turmas[0]?.rotulo ?? "1º A", mes)}. Para incluir chamadas já
                salvas, use o envio com prévia.
              </p>
            </>
          ) : (
            <ul className="space-y-2 text-sm" aria-label="Resultado da preparação por turma">
              {resultados.map((item) => (
                <li key={item.turmaOriginalId} className="rounded-lg border p-3">
                  <strong className="block">{item.aba ?? item.rotulo}</strong>
                  <p className={item.erro ? "text-falta-texto" : "text-muted-foreground"}>
                    {item.estado === "pendente"
                      ? "Não preparada"
                      : (item.erro ??
                        (item.criada ? "Criada" : item.atualizada ? "Atualizada" : "Reutilizada"))}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {executando && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" />
              Preparando {turmaAtual}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupada}>
              {resultados === null ? "Cancelar" : "Fechar"}
            </AlertDialogCancel>
            {(resultados === null || concluidas < turmas.length) && (
              <AlertDialogAction
                disabled={disabled || ocupada || turmas.length === 0}
                onClick={(evento) => {
                  evento.preventDefault();
                  void executar();
                }}
              >
                {resultados === null ? `Preparar ${turmas.length} turmas` : "Tentar pendentes"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
