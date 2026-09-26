"use client";

// Diálogo de envio da Grade: prévia obrigatória, opções aditivas marcadas e
// divergências só com o modo completo. Nada é gravado sem confirmação.
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlanoResumo {
  turmaOriginalId: string;
  rotulo: string;
  aba: string;
  resumo: {
    preencher: number;
    substituir: number;
    limpar: number;
    novasColunas: number;
    novosAlunos: number;
    removerLinhas: number;
    removerColunas: number;
    puladasFormula: number;
    puladasOcupadas: number;
    ambiguidades: number;
  };
  avisos: string[];
  novasColunas: { dia: string; antesDe: string | null }[];
  novosAlunos: { nome: string }[];
  substituir: { celula: string; valor: string; anterior: string }[];
}

interface Simulacao {
  modalidade: "conservador" | "completo";
  planoHashGeral: string;
  planos: PlanoResumo[];
}

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  turmaOriginalId: string;
  rotulo: string;
  de: string;
  ate: string;
  modoCompleto: boolean;
  aoConcluir: () => void;
}

export default function DialogoEnvio({
  aberto,
  onAbrir,
  turmaOriginalId,
  rotulo,
  de,
  ate,
  modoCompleto,
  aoConcluir,
}: Props) {
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [criarColunas, setCriarColunas] = useState(true);
  const [novosAlunos, setNovosAlunos] = useState(true);
  const [substituir, setSubstituir] = useState(false);

  const entradas = useCallback(
    () => ({
      turmaOriginalId,
      de,
      ate,
      permitirInserirColunas: criarColunas,
      permitirNovosAlunos: novosAlunos,
      substituirDivergencias: modoCompleto && substituir,
    }),
    [turmaOriginalId, de, ate, criarColunas, novosAlunos, modoCompleto, substituir],
  );

  const simular = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const dados = await pedir<Simulacao>("/api/planilha/simular", corpoJson(entradas()));
      setSimulacao(dados);
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar a prévia.");
    } finally {
      setCarregando(false);
    }
  }, [entradas]);

  useEffect(() => {
    if (aberto) void simular();
  }, [aberto, simular]);

  async function enviar() {
    if (!simulacao) return;
    setEnviando(true);
    setErro("");
    try {
      const dados = await pedir<{ resumo: { turmas: number; falhas: number; sucesso: number } }>(
        "/api/planilha/aplicar",
        corpoJson({ ...entradas(), planoHashGeral: simulacao.planoHashGeral }),
      );
      toast.success(
        dados.resumo.falhas === 0
          ? `${dados.resumo.sucesso} ${dados.resumo.sucesso === 1 ? "turma enviada" : "turmas enviadas"}.`
          : `${dados.resumo.sucesso} de ${dados.resumo.turmas} turmas enviadas.`,
      );
      onAbrir(false);
      aoConcluir();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const plano = simulacao?.planos[0];

  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Enviar {rotulo} · {de === ate ? de : `${de} a ${ate}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {modoCompleto && (
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs">
              Modo completo ativo. As opções destrutivas vêm desmarcadas.
            </p>
          )}

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={criarColunas}
                onChange={(evento) => setCriarColunas(evento.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Criar colunas para dias sem coluna
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={novosAlunos}
                onChange={(evento) => setNovosAlunos(evento.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Acrescentar alunos sem linha
            </label>
            {modoCompleto && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={substituir}
                  onChange={(evento) => setSubstituir(evento.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Atualizar células divergentes
              </label>
            )}
          </div>

          {carregando && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" />
              Lendo a planilha e montando a prévia...
            </p>
          )}

          {plano && !carregando && (
            <div className="bg-secondary/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs">
              <span className="font-medium">Aba {plano.aba}</span>
              <span>
                {plano.resumo.preencher} a preencher · {plano.resumo.puladasOcupadas} ocupadas
                ignoradas · {plano.resumo.puladasFormula} fórmulas protegidas
              </span>
              <span>
                {plano.resumo.novasColunas} colunas novas · {plano.resumo.novosAlunos} alunos novos
                {modoCompleto && plano.resumo.substituir > 0
                  ? ` · ${plano.resumo.substituir} substituições`
                  : ""}
              </span>
              {plano.novasColunas.length > 0 && (
                <span className="text-muted-foreground">
                  Dias novos: {plano.novasColunas.map((coluna) => coluna.dia).join(", ")}
                </span>
              )}
              {plano.substituir.length > 0 && (
                <span className="text-falta-texto">
                  Divergências:{" "}
                  {plano.substituir
                    .slice(0, 5)
                    .map((item) => `${item.celula} ${item.anterior} para ${item.valor}`)
                    .join(", ")}
                  {plano.substituir.length > 5 ? " ..." : ""}
                </span>
              )}
              {plano.avisos.slice(0, 3).map((aviso) => (
                <span key={aviso} className="text-muted-foreground">
                  {aviso}
                </span>
              ))}
            </div>
          )}

          {erro && (
            <p
              role="alert"
              className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm"
            >
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbrir(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || carregando || !plano}
          >
            {enviando ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useEstadoPlanilha() {
  const [estado, setEstado] = useState<{
    ativa: boolean;
    modo: "conservador" | "completo";
    modoCompletoAte: string | null;
    podeEnviar: boolean;
    alteradasDepois: number;
  } | null>(null);
  const recarregar = useCallback(async () => {
    try {
      const dados = await pedir<{ estado: typeof estado }>("/api/planilha/estado");
      setEstado(dados.estado);
    } catch {
      setEstado(null);
    }
  }, []);
  useEffect(() => {
    let viva = true;
    pedir<{ estado: typeof estado }>("/api/planilha/estado")
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
