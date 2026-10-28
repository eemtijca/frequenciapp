"use client";

// Leitura paginada independente da sessão, com retratos completos e cache separado por chave e escopo.
import { useCallback, useEffect, useRef, useState } from "react";
import { pedir, ErroApi } from "./api-cliente";
import {
  cacheBi,
  esquecerSegredoBi,
  guardarSegredoBi,
  identificadorCacheBi,
  lerSegredoBi,
  type RetratoBi,
} from "./bi-armazenamento";
import type { EscopoBi, PaginaBi, RecursoBi } from "@/domain/bi";
export interface ConsultaBi {
  inicio: string;
  fim: string;
}
interface AcessoBi {
  chave: string;
  id: string;
  pagina: PaginaBi;
}
export function useDadosBi() {
  const [acesso, setAcesso] = useState<AcessoBi | null>(null);
  const [retratos, setRetratos] = useState<Partial<Record<RecursoBi, RetratoBi>>>({});
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [offline, setOffline] = useState(false);
  const acessoRef = useRef<AcessoBi | null>(null);
  const controlador = useRef<AbortController | null>(null);
  const tarefas = useRef(new Map<string, Promise<RetratoBi>>());
  const rede = useCallback(
    async (chave: string, parametros: URLSearchParams, signal?: AbortSignal) =>
      pedir<PaginaBi>(`/api/bi?${parametros}`, {
        credentials: "omit",
        headers: { Authorization: `Bearer ${chave}` },
        signal,
      }),
    [],
  );
  const armazenamentoFalhou = useCallback(
    () =>
      setAviso(
        "O navegador bloqueou o armazenamento ou ficou sem espaço. O trabalho continua nesta aba; não há garantia de reabertura offline.",
      ),
    [],
  );
  const esquecer = useCallback(async () => {
    controlador.current?.abort();
    const anterior = acessoRef.current;
    acessoRef.current = null;
    setAcesso(null);
    setRetratos({});
    tarefas.current.clear();
    setProgresso("");
    try {
      esquecerSegredoBi();
      if (anterior) await cacheBi("limpar", `${anterior.id}:`);
    } catch {
      armazenamentoFalhou();
    }
  }, [armazenamentoFalhou]);
  const entrar = useCallback(
    async (chave: string) => {
      controlador.current?.abort();
      const ctrl = new AbortController();
      controlador.current = ctrl;
      setOcupado(true);
      setErro("");
      setProgresso("Conferindo a chave");
      try {
        const id = await identificadorCacheBi(chave);
        let pagina: PaginaBi;
        try {
          let tentativas = 0;
          for (;;) {
            try {
              pagina = await rede(chave, new URLSearchParams({ recurso: "acesso" }), ctrl.signal);
              break;
            } catch (e) {
              const falhaDeRede =
                e instanceof TypeError || (e instanceof ErroApi && e.status === 503);
              if (ctrl.signal.aborted || !navigator.onLine || !falhaDeRede || tentativas >= 2)
                throw e;
              tentativas++;
              await new Promise<void>((resolve, reject) => {
                const abortar = () => {
                  clearTimeout(timer);
                  reject(new DOMException("Consulta interrompida", "AbortError"));
                };
                const timer = setTimeout(() => {
                  ctrl.signal.removeEventListener("abort", abortar);
                  resolve();
                }, 500 * tentativas);
                if (ctrl.signal.aborted) abortar();
                else ctrl.signal.addEventListener("abort", abortar, { once: true });
              });
            }
          }
          setOffline(false);
          try {
            const antiga = await cacheBi<PaginaBi>("ler", `${id}:acesso`);
            if (antiga && JSON.stringify(antiga.escopo) !== JSON.stringify(pagina.escopo))
              await cacheBi("limpar", `${id}:`);
            await cacheBi("gravar", `${id}:acesso`, pagina);
          } catch {
            armazenamentoFalhou();
          }
        } catch (e) {
          if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) {
            try {
              await cacheBi("limpar", `${id}:`);
              esquecerSegredoBi();
            } catch {
              armazenamentoFalhou();
            }
            acessoRef.current = null;
            setAcesso(null);
            setRetratos({});
            throw new Error("A chave não autoriza o acesso. Peça uma nova chave à Gestão.");
          }
          if (ctrl.signal.aborted || (e instanceof ErroApi && e.status !== 503)) throw e;
          const antiga = await cacheBi<PaginaBi>("ler", `${id}:acesso`);
          if (!antiga) throw new Error("Sem conexão e sem consulta guardada neste navegador.");
          pagina = antiga;
          setOffline(true);
        }
        if (ctrl.signal.aborted) return;
        const novo = { chave, id, pagina };
        acessoRef.current = novo;
        setAcesso(novo);
        setRetratos({});
        tarefas.current.clear();
        try {
          guardarSegredoBi(chave);
        } catch {
          armazenamentoFalhou();
        }
      } catch (e) {
        if (!ctrl.signal.aborted)
          setErro(e instanceof Error ? e.message : "Não foi possível abrir o BI.");
      } finally {
        if (controlador.current === ctrl) {
          setOcupado(false);
          setProgresso("");
        }
      }
    },
    [rede, armazenamentoFalhou],
  );
  useEffect(() => {
    try {
      const chave = lerSegredoBi();
      // A abertura com a chave guardada é assíncrona e só toca no estado depois
      // do await; a regra set-state-in-effect não distingue o caso (ADR 047).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- abertura assíncrona (ADR 047)
      if (chave) void entrar(chave);
    } catch {
      armazenamentoFalhou();
    }
    const voltar = () => {
      const atual = acessoRef.current;
      if (atual) void entrar(atual.chave);
    };
    const perder = () => setOffline(true);
    window.addEventListener("online", voltar);
    window.addEventListener("offline", perder);
    return () => {
      controlador.current?.abort();
      window.removeEventListener("online", voltar);
      window.removeEventListener("offline", perder);
    };
  }, [entrar, armazenamentoFalhou]);
  const carregar = useCallback(
    (recurso: RecursoBi, consulta: ConsultaBi, atualizar = false): Promise<RetratoBi> => {
      const atual = acessoRef.current;
      if (!atual || !atual.pagina.recursos.includes(recurso))
        return Promise.reject(new Error("Este conjunto não está no escopo da chave."));
      const temporal = [
        "chamadas",
        "faltas",
        "lista",
        "saidas",
        "entradas",
        "parciais",
        "feriados",
        "contexto",
      ].includes(recurso);
      const escopo: EscopoBi = atual.pagina.escopo;
      const id = `${atual.id}:${JSON.stringify(escopo)}:${recurso}:${temporal ? `${consulta.inicio}:${consulta.fim}` : "cadastro"}`;
      const existente = tarefas.current.get(id);
      if (!atualizar && existente) return existente;
      const signal = controlador.current?.signal;
      const tarefa = (async () => {
        let antigo: RetratoBi | undefined;
        try {
          antigo = await cacheBi<RetratoBi>("ler", id);
          // Retratos anteriores não registravam as datas de todas as páginas.
          if (antigo && !antigo.datasCompletas) antigo = { ...antigo, consultadoEm: "" };
        } catch {
          armazenamentoFalhou();
        }
        if (!atualizar && antigo?.completo) return antigo;
        if (!navigator.onLine) {
          if (antigo?.completo) return atualizar ? { ...antigo, falhaAtualizacao: true } : antigo;
          throw new Error(
            "Este recorte ainda não foi baixado. Conecte à internet para consultá-lo.",
          );
        }
        const linhas = new Map<string, PaginaBi["linhas"][number]>();
        let pagina = 1;
        let consultadoEm: string | undefined;
        let dataInvalida = false;
        let ultima: PaginaBi;
        try {
          do {
            const parametros = new URLSearchParams({
              recurso,
              pagina: String(pagina),
              limite: "200",
            });
            if (temporal) {
              if (consulta.inicio) parametros.set("inicio", consulta.inicio);
              if (consulta.fim) parametros.set("fim", consulta.fim);
            }
            setProgresso(`Baixando ${recurso}: ${linhas.size} registros`);
            let tentativas = 0;
            for (;;) {
              try {
                ultima = await rede(atual.chave, parametros, signal);
                break;
              } catch (e) {
                if (!(e instanceof ErroApi) || e.status !== 429 || tentativas++ >= 2) throw e;
                setProgresso(
                  "Pausa de um minuto para respeitar o limite de consultas. O recorte só aparece quando completo.",
                );
                await new Promise<void>((resolve, reject) => {
                  const abortar = () => {
                    clearTimeout(timer);
                    reject(new DOMException("Consulta interrompida", "AbortError"));
                  };
                  const timer = setTimeout(() => {
                    signal?.removeEventListener("abort", abortar);
                    resolve();
                  }, 60_000);
                  if (signal?.aborted) abortar();
                  else signal?.addEventListener("abort", abortar, { once: true });
                });
              }
            }
            if (acessoRef.current !== atual || signal?.aborted)
              throw new DOMException("Consulta interrompida", "AbortError");
            if (JSON.stringify(ultima.escopo) !== JSON.stringify(escopo)) {
              await esquecer();
              setErro("O escopo mudou. Peça a chave atualizada à Gestão.");
              throw new Error(
                "O escopo da chave mudou. Confira a chave novamente para atualizar o acesso.",
              );
            }
            const instante = Date.parse(ultima.consultadoEm);
            if (!Number.isFinite(instante)) dataInvalida = true;
            else if (!consultadoEm || instante < Date.parse(consultadoEm))
              consultadoEm = ultima.consultadoEm;
            for (const linha of ultima.linhas) linhas.set(linha.id, linha);
            pagina = ultima.proximaPagina ?? 0;
          } while (pagina);
        } catch (e) {
          if (e instanceof ErroApi && (e.status === 401 || e.status === 403)) {
            await esquecer();
            setErro("O acesso foi encerrado. Peça uma chave à Gestão.");
            throw new Error("O acesso foi encerrado. Peça uma chave à Gestão.");
          }
          if (e instanceof ErroApi && e.status === 429)
            throw new Error(
              "Limite de consultas atingido. Aguarde um minuto e atualize o recorte; os totais parciais não serão usados.",
            );
          if (
            antigo?.completo &&
            !signal?.aborted &&
            acessoRef.current === atual &&
            (!(e instanceof ErroApi) || e.status === 503)
          ) {
            setOffline(true);
            return { ...antigo, falhaAtualizacao: true };
          }
          throw e;
        }
        const retrato: RetratoBi = {
          ...ultima,
          consultadoEm: dataInvalida ? "" : (consultadoEm ?? ""),
          linhas: [...linhas.values()],
          completo: true,
          datasCompletas: !dataInvalida && Boolean(consultadoEm),
        };
        try {
          await cacheBi("gravar", id, retrato);
        } catch {
          armazenamentoFalhou();
        }
        return retrato;
      })()
        .then((retrato) => {
          if (acessoRef.current === atual && !signal?.aborted)
            setRetratos((r) => ({ ...r, [recurso]: retrato }));
          return retrato;
        })
        .catch((e: unknown) => {
          if (tarefas.current.get(id) === tarefa) tarefas.current.delete(id);
          throw e;
        });
      tarefas.current.set(id, tarefa);
      return tarefa;
    },
    [rede, esquecer, armazenamentoFalhou],
  );
  return {
    acesso,
    retratos,
    ocupado,
    progresso,
    erro,
    aviso,
    offline,
    entrar,
    esquecer,
    carregar,
    armazenamentoFalhou,
    limparCache: async () => {
      const atual = acessoRef.current;
      if (atual) await cacheBi("limpar", `${atual.id}:`);
      tarefas.current.clear();
      setRetratos({});
    },
  };
}
