"use client";

// Envio com prévia por aba e mês, processado em sequência com resultado individual.
// Divergências e remoções dependem do modo completo.
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
  mes?: string;
  dias: string[];
  semEnvio: boolean;
  planoHashTurma: string;
  bloqueado: boolean;
  resumo: {
    preencher: number;
    sinalizar: number;
    substituir: number;
    limpar: number;
    novasColunas: number;
    novosAlunos: number;
    vincular: number;
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
  sinalizar: { celula: string; valor: string; anterior: string }[];
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

type Andamento = "aguardando" | "enviando" | "enviado" | "sem_confirmacao" | "falhou";

const ROTULO_ANDAMENTO: Record<Andamento, string> = {
  aguardando: "aguardando",
  enviando: "enviando...",
  enviado: "enviado",
  sem_confirmacao: "sem confirmação, confira a aba",
  falhou: "não enviado",
};

/** Mensagem de quando a resposta não chegou: a planilha pode ter sido gravada. */
const SEM_CONFIRMACAO =
  "Não foi possível confirmar o resultado na planilha. Confira a aba antes de reenviar; o reenvio não sobrescreve o que já foi gravado.";

/** Dia AAAA-MM-DD como dd/mm, para a lista de dias do envio. */
function diaCurto(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
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
  const [remocoes, setRemocoes] = useState<Record<string, { linhas: number[]; colunas: number[] }>>(
    {},
  );
  const [somenteAlteradas, setSomenteAlteradas] = useState(true);
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const [detalhes, setDetalhes] = useState<Record<string, string>>({});
  const abaUnica = simulacao?.planos.length === 1 ? simulacao.planos[0]?.aba : undefined;
  const contextoRemocoes = JSON.stringify([turmaOriginalId, de, ate, somenteAlteradas, abaUnica]);
  const removerMarcadas = remocoes[contextoRemocoes]?.linhas;
  const removerColunasMarcadas = remocoes[contextoRemocoes]?.colunas;

  const entradas = useCallback(
    () => ({
      ...(todas ? { todas: true } : { turmaOriginalId }),
      de,
      ate,
      permitirInserirColunas: criarColunas,
      permitirNovosAlunos: novosAlunos,
      substituirDivergencias: modoCompleto && substituir,
      removerLinhas: !todas && modoCompleto && abaUnica ? removerMarcadas : undefined,
      removerColunas: !todas && modoCompleto && abaUnica ? removerColunasMarcadas : undefined,
      somenteAlteradas,
    }),
    [
      somenteAlteradas,
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
      abaUnica,
    ],
  );

  const { executando: carregando, executar: simular } = useAcaoUnica(async () => {
    setErro("");
    setSimulacao(null);
    setAndamento({});
    setDetalhes({});
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
  }, [aberto, simular, somenteAlteradas]);

  // Uma requisição por aba: a falha de um mês não impede os demais envios.
  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (!simulacao) return;
    setErro("");
    const pendentes = simulacao.planos.filter((item) => !item.semEnvio);
    setAndamento(Object.fromEntries(pendentes.map((item) => [item.aba, "aguardando"])));
    setDetalhes({});
    const finais: Andamento[] = [];
    for (const item of pendentes) {
      setAndamento((atual) => ({ ...atual, [item.aba]: "enviando" }));
      let final: Andamento = "enviado";
      let detalhe = "";
      try {
        const dados = await pedir<{
          resultados: { resultado: "sucesso" | "parcial" | "falha" | "sem_envio"; erro?: string }[];
        }>(
          "/api/planilha/aplicar",
          corpoJson({
            ...entradas(),
            todas: undefined,
            turmaOriginalId: item.turmaOriginalId,
            aba: item.aba,
            planoHashGeral: item.planoHashTurma,
          }),
        );
        const resultado = dados.resultados[0];
        if (resultado?.resultado === "parcial") {
          final = "sem_confirmacao";
          detalhe = resultado.erro ?? SEM_CONFIRMACAO;
        } else if (resultado?.resultado === "falha") {
          final = "falhou";
          detalhe = resultado.erro ?? "Não foi possível enviar para esta aba.";
        }
      } catch (excecao) {
        // Sem resposta do servidor (504, queda de rede): a planilha pode ter
        // sido gravada. Resposta com erro do aplicativo: nada foi enviado.
        const semResposta =
          !(excecao instanceof ErroApi) || [502, 503, 504].includes(excecao.status);
        final = semResposta ? "sem_confirmacao" : "falhou";
        detalhe = semResposta
          ? SEM_CONFIRMACAO
          : excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível enviar.";
      }
      finais.push(final);
      setAndamento((atual) => ({ ...atual, [item.aba]: final }));
      if (detalhe) setDetalhes((atual) => ({ ...atual, [item.aba]: detalhe }));
    }
    const enviados = finais.filter((item) => item === "enviado").length;
    const semConfirmacao = finais.filter((item) => item === "sem_confirmacao").length;
    aoConcluir();
    if (enviados === finais.length) {
      toast.success(`${enviados} ${enviados === 1 ? "aba enviada" : "abas enviadas"}.`);
      onAbrir(false);
      return;
    }
    avisarErro(new Error("envio incompleto"), {
      contexto: `${enviados} de ${finais.length} abas enviadas.`,
      descricao:
        semConfirmacao > 0
          ? "Algumas abas ficaram sem confirmação. Confira antes de reenviar."
          : "Veja no diálogo o que não foi enviado e tente de novo.",
    });
  });

  const bloqueado = simulacao?.planos.some((item) => item.bloqueado) ?? false;
  const plano = simulacao?.planos[0];
  const detalhado = !todas && simulacao?.planos.length === 1 && plano && !plano.semEnvio;
  const nadaAEnviar = simulacao !== null && simulacao.planos.every((item) => item.semEnvio);
  const enviou = Object.keys(andamento).length > 0 && !enviando;

  return (
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Enviar {rotulo}
            {somenteAlteradas ? " · o que mudou" : ` · ${de === ate ? de : `${de} a ${ate}`}`}
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

          <fieldset className="flex flex-col gap-1.5 text-sm" disabled={enviando}>
            <legend className="sr-only">O que enviar</legend>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="alcance-envio"
                checked={somenteAlteradas}
                onChange={() => setSomenteAlteradas(true)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                Só chamadas pendentes
                <span className="text-muted-foreground block text-xs">
                  Dias com chamadas ainda não confirmadas na planilha para cada turma de origem.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="alcance-envio"
                checked={!somenteAlteradas}
                onChange={() => setSomenteAlteradas(false)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>
                O período inteiro (
                {de === ate ? diaCurto(de) : `${diaCurto(de)} a ${diaCurto(ate)}`})
                <span className="text-muted-foreground block text-xs">
                  Para conferência ou recuperação; no modo conservador, só preenche o que está
                  vazio.
                </span>
              </span>
            </label>
          </fieldset>

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
                    checked={removerMarcadas?.includes(item.linha) ?? false}
                    onChange={(evento) => {
                      const marcado = evento.target.checked;
                      setRemocoes((atuais) => {
                        const anteriores = atuais[contextoRemocoes] ?? { linhas: [], colunas: [] };
                        return {
                          ...atuais,
                          [contextoRemocoes]: {
                            ...anteriores,
                            linhas: marcado
                              ? [...anteriores.linhas, item.linha]
                              : anteriores.linhas.filter((linha) => linha !== item.linha),
                          },
                        };
                      });
                    }}
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
                    checked={removerColunasMarcadas?.includes(item.coluna) ?? false}
                    onChange={(evento) => {
                      const marcado = evento.target.checked;
                      setRemocoes((atuais) => {
                        const anteriores = atuais[contextoRemocoes] ?? { linhas: [], colunas: [] };
                        return {
                          ...atuais,
                          [contextoRemocoes]: {
                            ...anteriores,
                            colunas: marcado
                              ? [...anteriores.colunas, item.coluna]
                              : anteriores.colunas.filter((coluna) => coluna !== item.coluna),
                          },
                        };
                      });
                    }}
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

          {simulacao && !carregando && nadaAEnviar && (
            <p className="bg-secondary/40 rounded-lg px-3 py-2 text-sm">
              Nenhuma chamada pendente{todas ? " em nenhuma turma" : ""}. Para conferir o período
              inteiro, escolha a segunda opção.
            </p>
          )}

          {simulacao && !carregando && !bloqueado && (!detalhado || enviou) && !nadaAEnviar && (
            <ul
              className="bg-secondary/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs"
              aria-label="Turmas do envio"
              aria-live="polite"
            >
              {simulacao.planos.map((item) => {
                const estado = andamento[item.aba];
                return (
                  <li key={item.aba} data-turma={item.rotulo} data-aba={item.aba}>
                    <span className="font-medium">{item.aba}</span>
                    {item.mes && (
                      <span>
                        {" "}
                        · {item.mes.slice(5)}/{item.mes.slice(0, 4)}
                      </span>
                    )}
                    {item.semEnvio ? (
                      ": sem alterações"
                    ) : (
                      <>
                        :{" "}
                        {estado ? ROTULO_ANDAMENTO[estado] : `${item.resumo.preencher} a preencher`}
                        {!estado &&
                          ` · dias ${item.dias.map(diaCurto).join(", ")} · ${item.resumo.novasColunas} colunas`}
                        {!estado && modoCompleto && item.resumo.substituir > 0
                          ? ` · ${item.resumo.substituir} substituições`
                          : ""}
                        {!estado && item.resumo.sinalizar > 0
                          ? ` · ${item.resumo.sinalizar} situações de aluno`
                          : ""}
                      </>
                    )}
                    {estado && detalhes[item.aba] && (
                      <span
                        className={`block ${estado === "sem_confirmacao" ? "text-falta-texto" : "text-muted-foreground"}`}
                      >
                        {detalhes[item.aba]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {detalhado && !bloqueado && (
            <div className="bg-secondary/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-xs">
              <span className="font-medium">Aba {plano.aba}</span>
              <span>Dias: {plano.dias.map(diaCurto).join(", ")}</span>
              <span>
                {plano.resumo.preencher} a preencher · {plano.resumo.puladasOcupadas} ocupadas
                ignoradas · {plano.resumo.puladasFormula} fórmulas protegidas
              </span>
              <span>
                {plano.resumo.novasColunas} colunas novas · {plano.resumo.novosAlunos} alunos novos
                {plano.resumo.sinalizar > 0
                  ? ` · ${plano.resumo.sinalizar} situações de aluno`
                  : ""}
                {plano.resumo.vincular > 0
                  ? ` · ${plano.resumo.vincular} linhas ganham o código do aluno`
                  : ""}
                {modoCompleto && plano.resumo.substituir > 0
                  ? ` · ${plano.resumo.substituir} substituições`
                  : ""}
              </span>
              {plano.sinalizar.length > 0 && (
                <span className="text-muted-foreground">
                  Nome na planilha:{" "}
                  {plano.sinalizar
                    .slice(0, 5)
                    .map((item) => `${item.celula} ${item.anterior} para ${item.valor}`)
                    .join(", ")}
                  {plano.sinalizar.length > 5 ? " ..." : ""}
                </span>
              )}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onAbrir(false)}
            disabled={enviando}
          >
            {enviou ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={() => void (enviou ? simular() : enviar())}
            disabled={
              enviando ||
              carregando ||
              !simulacao ||
              bloqueado ||
              !online ||
              (nadaAEnviar && !enviou)
            }
          >
            {enviando ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            {enviou ? "Nova prévia" : "Enviar"}
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
