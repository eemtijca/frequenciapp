"use client";

// Coordena a atualização da rota sem confundir a resposta da API com o destino exibido.
import {
  Activity,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { pedir } from "@/lib/api-cliente";
import { prepararExpurgoBiNoLogout } from "@/lib/bi-armazenamento";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { avisosPublicos, useAvisosDaSessao } from "@/lib/avisos";
import {
  EscopoAvisosDaSessao,
  encerrarAvisosDaSessao,
  pausarAvisosDaSessao,
  retomarAvisosDaSessao,
} from "@/components/ui/mui/avisos";
import { useAnimacoesDaInterface } from "@/theme/animacoes-da-interface";
import { EsqueletoAplicacao } from "./esqueleto-aplicacao";
import {
  IndicadorDeCarregamento,
  TextoDeCarregamento,
} from "@/components/ui/mui/texto-de-carregamento";

const ATRASO_ESQUELETO_SAIDA = 200;
const PRAZO_DESTINO = 10_000;

type Expurgo = ReturnType<typeof prepararExpurgoBiNoLogout>;
type SessaoConfirmada = { usuarioId: string; referenciaSessao: string };
type Encerramento = { tipo: "saida" | "expiracao" } | ({ tipo: "troca" } & SessaoConfirmada);
type Reconciliacao = {
  tipo: "reconciliar";
  referenciaOriginal?: string;
  notificarFalha: () => void;
};
type Operacao = { tipo: "entrada"; usuarioId: string } | Encerramento | Reconciliacao;
type Etapa =
  "limpando" | "falha-expurgo" | "espera" | "recuperacao" | "verificando" | "falha-sessao";
type Autenticacao = { tipo: "autenticacao" };
type Transicao =
  { operacao: Operacao; etapa: Etapa } | { operacao: Autenticacao; etapa: "autenticando" };

interface SessaoNaInterface {
  transicao: Transicao | null;
  iniciar: (operacao: Encerramento | Reconciliacao, expurgar?: Expurgo) => void;
  prepararEntrada: () => ((usuarioId?: string) => void) | undefined;
  confirmarDestino: (
    transicao: Transicao,
    avisarSucesso: ReturnType<typeof useAvisosDaSessao>["avisarSucesso"],
  ) => void;
}

const ContextoSessao = createContext<SessaoNaInterface | null>(null);
const ContextoReferenciaSessao = createContext<string | undefined>(undefined);

export function useReferenciaDaSessao() {
  return useContext(ContextoReferenciaSessao);
}

async function consultarSessao(signal: AbortSignal): Promise<SessaoConfirmada | null> {
  const { usuario, referenciaSessao } = await pedir<{
    usuario?: { id?: unknown } | null;
    referenciaSessao?: unknown;
  }>("/api/auth/sessao", { signal, headers: { "X-Frequenciapp-Referencia-Sessao": "1" } });
  if (usuario === null && referenciaSessao === undefined) return null;
  if (
    typeof usuario?.id === "string" &&
    usuario.id &&
    typeof referenciaSessao === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(referenciaSessao)
  ) {
    return { usuarioId: usuario.id, referenciaSessao };
  }
  throw new Error("Sessão não confirmada.");
}

export function ProvedorTransicaoSessao({ children }: { children: ReactNode }) {
  const router = useRouter();
  const operacaoAtiva = useRef<Operacao | Autenticacao | null>(null);
  const expurgoAtivo = useRef<Expurgo | undefined>(undefined);
  const tarefaAtiva = useRef<AbortController | null>(null);
  const [transicao, setTransicao] = useState<Transicao | null>(null);
  const [exibirEsqueleto, setExibirEsqueleto] = useState(false);

  useLayoutEffect(
    () => () => {
      operacaoAtiva.current = null;
      expurgoAtivo.current = undefined;
      tarefaAtiva.current?.abort();
    },
    [],
  );

  const executarComPrazo = useCallback(
    async <T,>(executar: (signal: AbortSignal) => Promise<T>) => {
      const controle = new AbortController();
      tarefaAtiva.current = controle;
      const prazo = window.setTimeout(() => controle.abort(), PRAZO_DESTINO);
      try {
        return await executar(controle.signal);
      } finally {
        window.clearTimeout(prazo);
        if (tarefaAtiva.current === controle) tarefaAtiva.current = null;
      }
    },
    [],
  );

  const concluir = useCallback(() => {
    operacaoAtiva.current = null;
    expurgoAtivo.current = undefined;
    setExibirEsqueleto(false);
    setTransicao(null);
  }, []);

  const atualizar = useCallback(
    (operacao: Operacao) => {
      setTransicao({ operacao, etapa: "espera" });
      router.refresh();
    },
    [router],
  );

  const limparEAtualizar = useCallback(
    async (operacao: Encerramento) => {
      setTransicao({ operacao, etapa: "limpando" });
      try {
        const expurgar = expurgoAtivo.current;
        if (expurgar) await executarComPrazo(expurgar);
      } catch {
        if (operacaoAtiva.current === operacao) setTransicao({ operacao, etapa: "falha-expurgo" });
        return;
      }
      if (operacaoAtiva.current === operacao) {
        expurgoAtivo.current = undefined;
        atualizar(operacao);
      }
    },
    [atualizar, executarComPrazo],
  );

  const reconciliar = useCallback(
    async (operacao: Reconciliacao) => {
      let sessao: SessaoConfirmada | null;
      try {
        sessao = await executarComPrazo(consultarSessao);
        if (sessao && !operacao.referenciaOriginal)
          throw new Error("Sessão de origem não confirmada.");
      } catch {
        if (operacaoAtiva.current === operacao) setTransicao({ operacao, etapa: "falha-sessao" });
        return;
      }
      if (operacaoAtiva.current !== operacao) return;
      if (sessao && sessao.referenciaSessao === operacao.referenciaOriginal) {
        retomarAvisosDaSessao();
        concluir();
        operacao.notificarFalha();
        return;
      }
      const encerramento: Encerramento = sessao ? { tipo: "troca", ...sessao } : { tipo: "saida" };
      encerrarAvisosDaSessao();
      operacaoAtiva.current = encerramento;
      await limparEAtualizar(encerramento);
    },
    [concluir, executarComPrazo, limparEAtualizar],
  );

  const iniciar = useCallback(
    (operacao: Encerramento | Reconciliacao, expurgar?: Expurgo) => {
      if (operacaoAtiva.current) return;
      operacaoAtiva.current = operacao;
      expurgoAtivo.current = expurgar;
      if (operacao.tipo === "reconciliar") {
        pausarAvisosDaSessao();
        setTransicao({ operacao, etapa: "verificando" });
        void reconciliar(operacao);
      } else {
        encerrarAvisosDaSessao();
        void limparEAtualizar(operacao);
      }
    },
    [limparEAtualizar, reconciliar],
  );

  const prepararEntrada = useCallback(() => {
    if (operacaoAtiva.current) return;
    const autenticacao: Autenticacao = { tipo: "autenticacao" };
    operacaoAtiva.current = autenticacao;
    setTransicao({ operacao: autenticacao, etapa: "autenticando" });
    return (usuarioId?: string) => {
      if (operacaoAtiva.current !== autenticacao) return;
      if (usuarioId === undefined) {
        concluir();
        return;
      }
      const entrada: Operacao = { tipo: "entrada", usuarioId };
      operacaoAtiva.current = entrada;
      encerrarAvisosDaSessao();
      atualizar(entrada);
    };
  }, [atualizar, concluir]);

  const confirmarDestino = useCallback<SessaoNaInterface["confirmarDestino"]>(
    ({ operacao }, avisarSucesso) => {
      if (operacaoAtiva.current !== operacao) return;
      concluir();
      if (operacao.tipo === "entrada") avisarSucesso("Entrada confirmada.");
      if (operacao.tipo === "saida") avisosPublicos.avisarSucesso("Sessão encerrada.");
    },
    [concluir],
  );

  // Os prazos apenas mudam a apresentação. Nunca confirmam a sessão.
  const usaEsperaDeSaida =
    transicao !== null &&
    transicao.operacao.tipo !== "autenticacao" &&
    transicao.operacao.tipo !== "entrada";
  useEffect(() => {
    if (!usaEsperaDeSaida) return;
    const atraso = window.setTimeout(() => setExibirEsqueleto(true), ATRASO_ESQUELETO_SAIDA);
    return () => window.clearTimeout(atraso);
  }, [usaEsperaDeSaida]);

  useEffect(() => {
    if (transicao?.etapa !== "espera") return;
    const prazo = window.setTimeout(() => {
      setTransicao((atual) => (atual === transicao ? { ...atual, etapa: "recuperacao" } : atual));
    }, PRAZO_DESTINO);
    return () => window.clearTimeout(prazo);
  }, [transicao]);

  const { executando: repetindo, executar: repetir } = useAcaoUnica(async () => {
    if (!transicao) return;
    if (transicao.operacao.tipo === "reconciliar") {
      if (transicao.etapa === "falha-sessao") await reconciliar(transicao.operacao);
    } else if (transicao.etapa === "falha-expurgo" && transicao.operacao.tipo !== "entrada") {
      await limparEAtualizar(transicao.operacao);
    } else if (transicao.etapa === "recuperacao") {
      atualizar(transicao.operacao);
    }
  });

  const abrindoApp = transicao?.operacao.tipo === "entrada" || transicao?.operacao.tipo === "troca";
  const etapa = transicao?.etapa;
  const esperandoEntrada = etapa === "autenticando" || transicao?.operacao.tipo === "entrada";
  const falhaExpurgo = etapa === "falha-expurgo";
  // Durante a reconciliação, recarregar perderia o alvo ainda pendente do expurgo.
  const podeReabrir = etapa === "recuperacao";
  const falha = falhaExpurgo || podeReabrir;
  const abrindo = abrindoApp ? "Abrindo o aplicativo..." : "Abrindo a entrada...";
  const mensagens: Record<Transicao["etapa"], string> = {
    autenticando: "Entrando...",
    verificando: "Verificando se a sessão foi encerrada...",
    "falha-sessao": "Não foi possível confirmar o encerramento",
    "falha-expurgo":
      "Não foi possível remover todos os dados locais do BI. Feche outras abas do BI e confira as permissões do navegador. Se o erro continuar, limpe os dados deste site pelo navegador antes de tentar novamente. A limpeza do site também remove preferências e rascunhos locais.",
    limpando: abrindo,
    espera: abrindo,
    recuperacao: abrindoApp
      ? "Não foi possível abrir o aplicativo."
      : "Não foi possível abrir a entrada.",
  };

  return (
    <ContextoSessao.Provider value={{ transicao, iniciar, prepararEntrada, confirmarDestino }}>
      {children}
      {etapa ? (
        <Box sx={{ bgcolor: "background.default", minHeight: "100dvh" }}>
          {etapa === "falha-sessao" ? (
            <Dialogo
              aberto
              // Dispensar não confirma a sessão nem autoriza abandonar o expurgo.
              onFechar={() => {}}
              fecharDesabilitado
              titulo={mensagens[etapa]}
              descricao="O painel fica oculto até ser possível verificar a sessão."
              tamanho="pequeno"
              acoes={
                <Botao
                  variante="contorno"
                  autoFocus
                  aria-disabled={repetindo || undefined}
                  onClick={() => void repetir()}
                >
                  Tentar novamente
                </Botao>
              }
            >
              {repetindo ? <IndicadorDeCarregamento texto={mensagens.verificando} /> : null}
            </Dialogo>
          ) : falha ? (
            <Stack spacing={1} sx={{ px: { xs: 2, sm: 3 }, pt: 2, alignItems: "flex-start" }}>
              <Box role="status">{mensagens[etapa]}</Box>
              <Botao variante="contorno" onClick={() => void repetir()}>
                Tentar novamente
              </Botao>
              {podeReabrir ? (
                <Botao variante="texto" onClick={() => window.location.reload()}>
                  Reabrir página
                </Botao>
              ) : null}
            </Stack>
          ) : esperandoEntrada || exibirEsqueleto ? (
            <TextoDeCarregamento anunciar>{mensagens[etapa]}</TextoDeCarregamento>
          ) : (
            <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
              <IndicadorDeCarregamento texto={mensagens[etapa]} />
            </Box>
          )}
          {!falha && etapa !== "falha-sessao" && (esperandoEntrada || exibirEsqueleto) ? (
            esperandoEntrada || abrindoApp ? (
              <EsqueletoAplicacao comNavegacao={esperandoEntrada} />
            ) : (
              <EsqueletoEntrada />
            )
          ) : null}
        </Box>
      ) : null}
    </ContextoSessao.Provider>
  );
}

function EsqueletoEntrada() {
  const { animacoesAtivas } = useAnimacoesDaInterface();
  const animacao = animacoesAtivas ? "pulse" : false;
  return (
    <Stack aria-busy="true" aria-hidden="true" sx={{ px: 2, pt: { xs: 8, sm: 12 } }}>
      <Stack spacing={2} sx={{ width: "100%", maxWidth: 448, mx: "auto", p: 3 }}>
        <Skeleton animation={animacao} variant="text" width={160} height={32} />
        <Skeleton animation={animacao} variant="rounded" height={48} />
        <Skeleton animation={animacao} variant="rounded" height={48} />
        <Skeleton animation={animacao} variant="rounded" height={48} />
      </Stack>
    </Stack>
  );
}

/** O shell chama sair somente após sua confirmação de rascunho, se necessária. */
export function useSaidaSessao() {
  const sessao = useContext(ContextoSessao);
  const referenciaOriginal = useReferenciaDaSessao();
  const { avisarErro } = useAvisosDaSessao();
  const router = useRouter();
  const iniciar = sessao?.iniciar;
  const montado = useRef(false);
  useLayoutEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!iniciar) return;
    const controle = new AbortController();
    let verificando = false;
    async function verificarSessao() {
      if (verificando) return;
      verificando = true;
      try {
        // O evento é compartilhado e uma resposta antiga pode chegar após nova entrada.
        const expurgar = prepararExpurgoBiNoLogout();
        const sessaoAtual = await consultarSessao(
          AbortSignal.any([controle.signal, AbortSignal.timeout(PRAZO_DESTINO)]),
        );
        if (!controle.signal.aborted && sessaoAtual === null) {
          iniciar?.({ tipo: "expiracao" }, expurgar);
        }
      } catch {
        // 401 sem confirmação da rota de sessão não autoriza presumir expiração.
      } finally {
        verificando = false;
      }
    }
    window.addEventListener("sessao-expirada", verificarSessao);
    return () => {
      controle.abort();
      window.removeEventListener("sessao-expirada", verificarSessao);
    };
  }, [iniciar]);

  const { executando: saindo, executar: sair } = useAcaoUnica(async () => {
    const expurgar = prepararExpurgoBiNoLogout();
    try {
      const { ok } = await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
      if (ok !== true) throw new Error("Saída não confirmada.");
    } catch (excecao) {
      if (!montado.current) return;
      const notificarFalha = () =>
        avisarErro(excecao, { contexto: "Não foi possível sair. Tente novamente." });
      if (iniciar) iniciar({ tipo: "reconciliar", referenciaOriginal, notificarFalha }, expurgar);
      else notificarFalha();
      return;
    }
    if (!montado.current) return;
    if (iniciar) {
      iniciar({ tipo: "saida" }, expurgar);
    } else {
      // Montagem isolada sem o layout da rota (fixtures de outras superfícies).
      await expurgar().catch(() => undefined);
      router.refresh();
    }
  });
  return { saindo, sair };
}

export function useTransicaoDeEntrada() {
  const sessao = useContext(ContextoSessao);
  return {
    prepararEntrada: sessao?.prepararEntrada,
    autenticando: sessao?.transicao?.etapa === "autenticando",
  };
}

export function useAvisoDeExpiracao() {
  return useContext(ContextoSessao)?.transicao?.operacao.tipo === "expiracao";
}

export function useAtualizacaoDeSessaoEmCurso() {
  return Boolean(useContext(ContextoSessao)?.transicao);
}

/** Envolve apenas um destino efetivamente escolhido pelo servidor. */
export function DestinoSessao({
  children,
  usuarioId,
  referenciaSessao,
}: {
  children: ReactNode;
  usuarioId?: string;
  referenciaSessao?: string;
}) {
  const sessao = useContext(ContextoSessao);
  const transicao = sessao?.transicao;
  const operacao = transicao?.operacao;
  const pronto =
    transicao &&
    operacao &&
    (transicao.etapa === "espera" || transicao.etapa === "recuperacao") &&
    (operacao.tipo === "troca"
      ? operacao.usuarioId === usuarioId && operacao.referenciaSessao === referenciaSessao
      : operacao.tipo === "entrada"
        ? operacao.usuarioId === usuarioId
        : operacao.tipo !== "reconciliar" && usuarioId === undefined);
  const preservar =
    operacao?.tipo === "reconciliar" &&
    referenciaSessao !== undefined &&
    operacao.referenciaOriginal === referenciaSessao;
  const formularioAguardando = transicao?.etapa === "autenticando" && usuarioId === undefined;
  if (transicao && !pronto && !preservar && !formularioAguardando) return null;
  return (
    <ContextoReferenciaSessao.Provider value={referenciaSessao}>
      <EscopoAvisosDaSessao
        autenticado={usuarioId !== undefined}
        key={referenciaSessao ?? usuarioId ?? "entrada"}
      >
        {pronto && transicao ? <ConfirmacaoDoDestino transicao={transicao} /> : null}
        <Activity mode={preservar ? "hidden" : "visible"}>{children}</Activity>
      </EscopoAvisosDaSessao>
    </ContextoReferenciaSessao.Provider>
  );
}

function ConfirmacaoDoDestino({ transicao }: { transicao: Transicao }) {
  const confirmar = useContext(ContextoSessao)?.confirmarDestino;
  const { avisarSucesso } = useAvisosDaSessao();
  useEffect(() => {
    // A primeira montagem pode ter seus efeitos repetidos no modo estrito.
    // Confirme apenas quando o destino e seu escopo permanecerem montados.
    const quadro = window.requestAnimationFrame(() => confirmar?.(transicao, avisarSucesso));
    return () => window.cancelAnimationFrame(quadro);
  }, [confirmar, transicao, avisarSucesso]);
  return null;
}
