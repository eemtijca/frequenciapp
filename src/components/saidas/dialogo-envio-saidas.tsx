"use client";

// Envio das saídas para a planilha: mês, prévia obrigatória, remoções marcadas
// no modo completo e confirmação. Nada é gravado sem revisão.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { diasDoMes, rotuloMes } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export default function DialogoEnvioSaidas({
  aberto,
  onAbrir,
  mes,
  onMes,
  modoCompleto,
  aoConcluir,
}: Props) {
  const online = useOnline();
  const [simulacao, setSimulacao] = useState<SimulacaoSaidas | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [removerMarcadas, setRemoverMarcadas] = useState<number[]>([]);

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

  const { executando: carregando, executar: simular } = useAcaoUnica(async () => {
    setErro("");
    try {
      const dados = await pedir<SimulacaoSaidas>(
        "/api/planilha-saidas/simular",
        corpoJson(entradas()),
      );
      setSimulacao(dados);
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar a prévia.");
      setErroVariante(estadoDeErro(excecao));
    }
  });

  useEffect(() => {
    if (aberto) void simular();
  }, [aberto, simular]);

  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (!simulacao) return;
    setErro("");
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
        toast.success(
          `${criadas} ${criadas === 1 ? "linha criada" : "linhas criadas"} · ${corrigidas} ${
            corrigidas === 1 ? "corrigida" : "corrigidas"
          } · ${removidas} ${removidas === 1 ? "removida" : "removidas"}.`,
        );
        onAbrir(false);
        aoConcluir();
        return;
      }
      setErro(dados.erro ?? "Não foi possível enviar as saídas.");
      setErroVariante(dados.resultado === "parcial" ? "indisponivel" : "dados_invalidos");
      toast.error(
        dados.resultado === "parcial"
          ? "O envio ficou parcial. Confira a planilha antes de tentar de novo."
          : "Não foi possível enviar as saídas.",
      );
      aoConcluir();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível enviar.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, {
        contexto: "Não foi possível enviar.",
        descricao: "Confira a planilha antes de tentar de novo.",
      });
    }
  });

  const bloqueado = simulacao?.bloqueado ?? false;

  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar saídas · {rotuloMes(mes)}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="w-full sm:w-56">
            <SeletorPeriodo
              id="saidas-mes-envio"
              modo="mes"
              valor={mes}
              max={mes}
              rotuloAcessivel="Mês do envio das saídas"
              rotulo={rotuloMes(mes)}
              onValor={onMes}
            />
          </div>

          {modoCompleto && (
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs">
              Modo completo ativo. A planilha guarda cópia antes de corrigir ou remover.
            </p>
          )}

          {!online && (
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs">
              Sem conexão. O envio fica indisponível até a internet voltar.
            </p>
          )}

          {carregando && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" />
              Lendo a planilha e montando a prévia...
            </p>
          )}

          {bloqueado && (
            <AvisoCompacto
              variante="dados_invalidos"
              descricao={
                simulacao?.avisos[0] ??
                "A estrutura da planilha impede a escrita. Ajuste o cabeçalho."
              }
              tamanho="linha"
            />
          )}

          {simulacao && !carregando && !bloqueado && (
            <div className="bg-secondary/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs">
              <span className="font-medium">Aba {simulacao.aba}</span>
              <span>
                {simulacao.resumo.criar} linhas novas · {simulacao.resumo.preencher} células a
                preencher · {simulacao.resumo.puladasOcupadas} ocupadas ignoradas ·{" "}
                {simulacao.resumo.puladasFormula} fórmulas protegidas
              </span>
              {modoCompleto && (
                <span>
                  {simulacao.resumo.substituir} correções · {simulacao.resumo.remover} remoções
                  marcadas · {simulacao.resumo.ambiguidades} ambiguidades
                </span>
              )}
              {simulacao.criar.length > 0 && (
                <span className="text-muted-foreground">
                  Novas:{" "}
                  {simulacao.criar
                    .slice(0, 5)
                    .map((item) => `${item.nome} (${item.dia})`)
                    .join(", ")}
                  {simulacao.criar.length > 5 ? " ..." : ""}
                </span>
              )}
              {simulacao.substituir.length > 0 && (
                <span className="text-falta-texto">
                  Correções:{" "}
                  {simulacao.substituir
                    .slice(0, 5)
                    .map((item) => `${item.celula} ${item.anterior || "vazia"} para ${item.valor}`)
                    .join(", ")}
                  {simulacao.substituir.length > 5 ? " ..." : ""}
                </span>
              )}
              {simulacao.avisos.slice(0, 3).map((aviso) => (
                <span key={aviso} className="text-muted-foreground">
                  {aviso}
                </span>
              ))}
            </div>
          )}

          {modoCompleto &&
            !carregando &&
            simulacao?.candidatosRemocao.map((item) => (
              <label key={item.linha} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={removerMarcadas.includes(item.linha)}
                  onChange={(evento) =>
                    setRemoverMarcadas((atuais) =>
                      evento.target.checked
                        ? [...atuais, item.linha]
                        : atuais.filter((linha) => linha !== item.linha),
                    )
                  }
                  className="size-4 accent-[var(--primary)]"
                />
                Remover {item.nome} ({item.dia}, linha {item.linha})
              </label>
            ))}

          {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbrir(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || carregando || !simulacao || bloqueado || !online}
          >
            {enviando ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
