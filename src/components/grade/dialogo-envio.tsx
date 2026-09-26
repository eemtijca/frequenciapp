"use client";

// Diálogo de envio: prévia obrigatória, opções aditivas marcadas e
// divergências só com o modo completo. Nada é gravado sem confirmação.
// Com "todas", envia o mês de cada turma de origem mapeada.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
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
  bloqueado: boolean;
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
  substituir: { celula: string; valor: string; anterior: string; campo?: "nome" | "turma" }[];
  candidatosRemocaoLinhas: { linha: number; nome: string }[];
  candidatosRemocaoColunas: { coluna: number; letra: string; rotulo: string }[];
}

interface Simulacao {
  modalidade: "conservador" | "completo";
  planoHashGeral: string;
  planos: PlanoResumo[];
}

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  /** Ausente quando o envio é de todas as turmas mapeadas. */
  turmaOriginalId?: string;
  rotulo: string;
  de: string;
  ate: string;
  modoCompleto: boolean;
  todas?: boolean;
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

export default function DialogoEnvio({
  aberto,
  onAbrir,
  turmaOriginalId,
  rotulo,
  de,
  ate,
  modoCompleto,
  todas = false,
  aoConcluir,
}: Props) {
  const online = useOnline();
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [criarColunas, setCriarColunas] = useState(true);
  const [novosAlunos, setNovosAlunos] = useState(true);
  const [substituir, setSubstituir] = useState(false);
  const [removerMarcadas, setRemoverMarcadas] = useState<number[]>([]);
  const [removerColunasMarcadas, setRemoverColunasMarcadas] = useState<number[]>([]);

  const entradas = useCallback(
    () => ({
      ...(todas ? { todas: true } : { turmaOriginalId }),
      de,
      ate,
      permitirInserirColunas: criarColunas,
      permitirNovosAlunos: novosAlunos,
      substituirDivergencias: modoCompleto && substituir,
      removerLinhas: !todas && modoCompleto ? removerMarcadas : undefined,
      removerColunas: !todas && modoCompleto ? removerColunasMarcadas : undefined,
    }),
    [
      todas,
      turmaOriginalId,
      de,
      ate,
      criarColunas,
      novosAlunos,
      modoCompleto,
      substituir,
      removerMarcadas,
      removerColunasMarcadas,
    ],
  );

  const { executando: carregando, executar: simular } = useAcaoUnica(async () => {
    setErro("");
    try {
      const dados = await pedir<Simulacao>("/api/planilha/simular", corpoJson(entradas()));
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
        resumo: { turmas: number; falhas: number; parciais: number; sucesso: number };
      }>(
        "/api/planilha/aplicar",
        corpoJson({ ...entradas(), planoHashGeral: simulacao.planoHashGeral }),
      );
      toast.success(
        dados.resumo.falhas + dados.resumo.parciais === 0
          ? `${dados.resumo.sucesso} ${
              dados.resumo.sucesso === 1 ? "turma enviada" : "turmas enviadas"
            }.`
          : `${dados.resumo.sucesso} de ${dados.resumo.turmas} turmas enviadas.`,
      );
      onAbrir(false);
      aoConcluir();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível enviar.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, {
        contexto: "Não foi possível enviar.",
        descricao: "Nada foi alterado na planilha. Tente de novo em instantes.",
      });
    }
  });

  const bloqueado = simulacao?.planos.some((item) => item.bloqueado) ?? false;
  const plano = simulacao?.planos[0];
  const detalhado = !todas && plano;

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

          {!online && (
            <p className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-xs">
              Sem conexão. O envio fica indisponível até a internet voltar.
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
                Atualizar divergências, nomes e turma atual
              </label>
            )}
            {detalhado &&
              plano?.candidatosRemocaoLinhas.map((item) => (
                <label key={item.linha} className="flex items-center gap-2">
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
                  Remover {item.nome} (linha {item.linha})
                </label>
              ))}
            {detalhado &&
              plano?.candidatosRemocaoColunas.map((item) => (
                <label key={`coluna-${item.coluna}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={removerColunasMarcadas.includes(item.coluna)}
                    onChange={(evento) =>
                      setRemoverColunasMarcadas((atuais) =>
                        evento.target.checked
                          ? [...atuais, item.coluna]
                          : atuais.filter((coluna) => coluna !== item.coluna),
                      )
                    }
                    className="size-4 accent-[var(--primary)]"
                  />
                  Remover coluna {item.rotulo} ({item.letra})
                </label>
              ))}
          </div>

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
                simulacao?.planos.find((item) => item.avisos.length > 0)?.avisos[0] ??
                "A estrutura da planilha impede a escrita. Ajuste o cabeçalho."
              }
              tamanho="linha"
            />
          )}

          {simulacao && !carregando && !bloqueado && todas && (
            <ul className="bg-secondary/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs">
              {simulacao.planos.map((item) => (
                <li key={item.turmaOriginalId}>
                  <span className="font-medium">{item.rotulo}</span> · {item.resumo.preencher} a
                  preencher · {item.resumo.novasColunas} colunas · {item.resumo.novosAlunos} alunos
                  {modoCompleto && item.resumo.substituir > 0
                    ? ` · ${item.resumo.substituir} substituições`
                    : ""}
                </li>
              ))}
            </ul>
          )}

          {detalhado && !bloqueado && (
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
                    .map(
                      (item) =>
                        `${item.celula} ${item.anterior || "vazia"} para ${item.valor}${
                          item.campo === "nome"
                            ? " (nome)"
                            : item.campo === "turma"
                              ? " (turma)"
                              : ""
                        }`,
                    )
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
