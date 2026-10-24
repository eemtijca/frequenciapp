"use client";

// Rascunho único de Configurações: carrega o conjunto completo, mantém uma
// cópia editável e só grava no servidor depois da confirmação.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ChaveBiDesejada,
  ConfiguracoesCompletas,
  FinalidadePlanilhaConfigurada,
  PreferenciaPlanilha,
  ResultadoLote,
  SecaoConfiguracao,
} from "@/domain/configuracoes";
import type { Configuracoes } from "@/domain/frequencia";
import type { ConfiguracaoNotificacoes } from "@/domain/notificacoes";
import type { ParametrosAcesso } from "@/domain/diretores";
import type { OrdemAlmocoDoDia } from "@/domain/ordem-almoco";
import type { RegraFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import type { Feriado } from "@/domain/calendario-letivo";
import type { JustificativaConfigurada, LiberadorConfigurado } from "@/domain/frequencia";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";

export interface SecaoAlterada {
  chave: SecaoConfiguracao;
  rotulo: string;
}

interface ContextoRascunho {
  base: ConfiguracoesCompletas | null;
  rascunho: ConfiguracoesCompletas | null;
  carregando: boolean;
  salvando: boolean;
  erro: string;
  erroStatus?: number;
  erroCodigo?: string;
  alterado: boolean;
  secoesAlteradas: SecaoAlterada[];
  precisaSenhaBi: boolean;
  recarregar: () => Promise<void>;
  descartar: () => void;
  salvar: (senhaBi?: string) => Promise<ResultadoLote>;
  aplicarFeriadosExternos: (dados: ConfiguracoesCompletas) => void;
  mutarConfiguracoes: (entrada: Partial<Configuracoes>) => void;
  mutarNotificacoes: (entrada: Partial<ConfiguracaoNotificacoes>) => void;
  mutarAcesso: (entrada: Partial<ParametrosAcesso>) => void;
  mutarOrdem: (dia: number, itens: OrdemAlmocoDoDia["itens"]) => void;
  mutarBeneficios: (lista: RegraFrequenciaBeneficio[]) => void;
  mutarJustificativas: (lista: JustificativaConfigurada[]) => void;
  mutarLiberadores: (lista: LiberadorConfigurado[]) => void;
  mutarFeriados: (lista: Feriado[]) => void;
  mutarChaves: (lista: ChaveBiDesejada[]) => void;
  mutarPlanilha: (
    finalidade: FinalidadePlanilhaConfigurada,
    entrada: Partial<PreferenciaPlanilha>,
  ) => void;
}

const Contexto = createContext<ContextoRascunho | null>(null);

const ROTULOS_SECOES: Record<SecaoConfiguracao, string> = {
  configuracao: "Recursos da escola",
  notificacoes: "Notificações",
  acesso: "Acesso dos diretores",
  ordemAlmoco: "Ordem do almoço",
  beneficios: "Benefícios",
  justificativas: "Justificativas",
  liberadores: "Responsáveis",
  feriados: "Calendário letivo",
  chavesBi: "Chaves do BI",
  planilhas: "Planilhas",
};

const ORDEM_SECOES: SecaoConfiguracao[] = [
  "configuracao",
  "notificacoes",
  "acesso",
  "ordemAlmoco",
  "beneficios",
  "justificativas",
  "liberadores",
  "feriados",
  "chavesBi",
  "planilhas",
];

function comFeriados(
  completo: ConfiguracoesCompletas,
  feriados: Feriado[],
): ConfiguracoesCompletas {
  return {
    ...completo,
    feriados,
    configuracoes: { ...completo.configuracoes, feriados },
  };
}

function normalizar(completo: ConfiguracoesCompletas): ConfiguracoesCompletas {
  return comFeriados(completo, completo.feriados ?? completo.configuracoes.feriados ?? []);
}

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function configuracoesComparaveis(
  configuracoes: Configuracoes,
): Omit<Configuracoes, "feriados" | "atualizadoEm"> {
  const { feriados: _feriados, atualizadoEm: _atualizadoEm, ...resto } = configuracoes;
  return resto;
}

export function ProvedorRascunhoConfiguracoes({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<ConfiguracoesCompletas | null>(null);
  const [rascunho, setRascunho] = useState<ConfiguracoesCompletas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroStatus, setErroStatus] = useState<number | undefined>();
  const [erroCodigo, setErroCodigo] = useState<string | undefined>();

  const limparErro = useCallback(() => {
    setErro("");
    setErroStatus(undefined);
    setErroCodigo(undefined);
  }, []);

  const registrarErro = useCallback((excecao: unknown, contexto: string) => {
    setErro(
      excecao instanceof ErroApi ? excecao.message : `${contexto} Tente de novo em instantes.`,
    );
    setErroStatus(excecao instanceof ErroApi ? excecao.status : 0);
    setErroCodigo(excecao instanceof ErroApi ? excecao.codigo : undefined);
  }, []);

  const aplicarDados = useCallback(
    (dados: ConfiguracoesCompletas) => {
      const normalizado = normalizar(dados);
      setBase(normalizado);
      setRascunho(structuredClone(normalizado));
      limparErro();
    },
    [limparErro],
  );

  const recarregar = useCallback(async () => {
    setCarregando(true);
    limparErro();
    try {
      aplicarDados(await pedir<ConfiguracoesCompletas>("/api/configuracoes/completo"));
    } catch (excecao) {
      registrarErro(excecao, "Não foi possível carregar as configurações.");
    } finally {
      setCarregando(false);
    }
  }, [aplicarDados, limparErro, registrarErro]);

  useEffect(() => {
    let viva = true;
    pedir<ConfiguracoesCompletas>("/api/configuracoes/completo")
      .then((dados) => {
        if (viva) aplicarDados(dados);
      })
      .catch((excecao: unknown) => {
        if (viva) registrarErro(excecao, "Não foi possível carregar as configurações.");
      })
      .finally(() => {
        if (viva) setCarregando(false);
      });
    return () => {
      viva = false;
    };
  }, [aplicarDados, registrarErro]);

  const mutar = useCallback(
    (alterar: (atual: ConfiguracoesCompletas) => ConfiguracoesCompletas) => {
      setRascunho((atual) => (atual ? alterar(structuredClone(atual)) : atual));
    },
    [],
  );

  const secoesAlteradas = useMemo<SecaoAlterada[]>(() => {
    if (!base || !rascunho) return [];
    const alteradas: SecaoConfiguracao[] = [];
    if (
      !igual(
        configuracoesComparaveis(base.configuracoes),
        configuracoesComparaveis(rascunho.configuracoes),
      )
    ) {
      alteradas.push("configuracao");
    }
    if (!igual(base.notificacoes, rascunho.notificacoes)) alteradas.push("notificacoes");
    if (!igual(base.acesso, rascunho.acesso)) alteradas.push("acesso");
    if (!igual(base.ordemAlmoco, rascunho.ordemAlmoco)) alteradas.push("ordemAlmoco");
    if (!igual(base.beneficios, rascunho.beneficios)) alteradas.push("beneficios");
    if (!igual(base.justificativas, rascunho.justificativas)) alteradas.push("justificativas");
    if (!igual(base.liberadores, rascunho.liberadores)) alteradas.push("liberadores");
    if (!igual(base.feriados, rascunho.feriados)) alteradas.push("feriados");
    if (!igual(base.chavesBi, rascunho.chavesBi)) alteradas.push("chavesBi");
    if (!igual(base.planilhas, rascunho.planilhas)) alteradas.push("planilhas");
    return ORDEM_SECOES.filter((chave) => alteradas.includes(chave)).map((chave) => ({
      chave,
      rotulo: ROTULOS_SECOES[chave],
    }));
  }, [base, rascunho]);

  const alterado = secoesAlteradas.length > 0;
  const precisaSenhaBi = secoesAlteradas.some((secao) => secao.chave === "chavesBi");

  const descartar = useCallback(() => {
    if (base) setRascunho(structuredClone(base));
    limparErro();
  }, [base, limparErro]);

  const aplicarFeriadosExternos = useCallback((dados: ConfiguracoesCompletas) => {
    setBase((atual) =>
      atual
        ? {
            ...comFeriados(atual, dados.feriados),
            revisoes: { ...atual.revisoes, feriados: dados.revisoes.feriados },
          }
        : atual,
    );
    setRascunho((atual) => (atual ? comFeriados(atual, dados.feriados) : atual));
  }, []);

  const salvar = useCallback(
    async (senhaBi?: string): Promise<ResultadoLote> => {
      if (!base || !rascunho) throw new Error("Configurações ainda não carregadas.");
      if (salvando) throw new Error("Salvamento em andamento.");
      setSalvando(true);
      limparErro();
      const desejado: Record<string, unknown> = {};
      if (
        !igual(
          configuracoesComparaveis(base.configuracoes),
          configuracoesComparaveis(rascunho.configuracoes),
        )
      ) {
        desejado.configuracoes = rascunho.configuracoes;
      }
      if (!igual(base.notificacoes, rascunho.notificacoes)) {
        desejado.notificacoes = rascunho.notificacoes;
      }
      if (!igual(base.acesso, rascunho.acesso)) desejado.acesso = rascunho.acesso;
      if (!igual(base.ordemAlmoco, rascunho.ordemAlmoco)) {
        desejado.ordemAlmoco = rascunho.ordemAlmoco;
      }
      if (!igual(base.beneficios, rascunho.beneficios)) desejado.beneficios = rascunho.beneficios;
      if (!igual(base.justificativas, rascunho.justificativas)) {
        desejado.justificativas = rascunho.justificativas;
      }
      if (!igual(base.liberadores, rascunho.liberadores))
        desejado.liberadores = rascunho.liberadores;
      if (!igual(base.feriados, rascunho.feriados)) desejado.feriados = rascunho.feriados;
      if (!igual(base.chavesBi, rascunho.chavesBi)) {
        desejado.chavesBi = rascunho.chavesBi;
        const idsNoRascunho = new Set(rascunho.chavesBi.map((chave) => chave.id));
        if (base.chavesBi.some((chave) => !idsNoRascunho.has(chave.id))) {
          desejado.limparChavesBi = true;
        }
      }
      if (!igual(base.planilhas, rascunho.planilhas)) desejado.planilhas = rascunho.planilhas;
      const precisaDeSenha =
        desejado.chavesBi !== undefined || desejado.limparChavesBi !== undefined;
      const senhaEfetiva = precisaDeSenha ? senhaBi : undefined;

      try {
        const resultado = await pedir<ResultadoLote>("/api/configuracoes/lote", {
          method: "POST",
          ...corpoJson({
            revisoes: base.revisoes,
            desejado,
            ...(senhaEfetiva ? { senhaBi: senhaEfetiva } : {}),
          }),
        });
        aplicarDados(resultado.completo);
        return resultado;
      } catch (excecao) {
        registrarErro(excecao, "Não foi possível salvar as configurações.");
        throw excecao;
      } finally {
        setSalvando(false);
      }
    },
    [aplicarDados, base, limparErro, rascunho, salvando, registrarErro],
  );

  const valor = useMemo<ContextoRascunho>(
    () => ({
      base,
      rascunho,
      carregando,
      salvando,
      erro,
      erroStatus,
      erroCodigo,
      alterado,
      secoesAlteradas,
      precisaSenhaBi,
      recarregar,
      descartar,
      salvar,
      aplicarFeriadosExternos,
      mutarConfiguracoes: (entrada) =>
        mutar((atual) => ({
          ...atual,
          configuracoes: { ...atual.configuracoes, ...entrada },
        })),
      mutarNotificacoes: (entrada) =>
        mutar((atual) => ({ ...atual, notificacoes: { ...atual.notificacoes, ...entrada } })),
      mutarAcesso: (entrada) =>
        mutar((atual) => ({ ...atual, acesso: { ...atual.acesso, ...entrada } })),
      mutarOrdem: (dia, itens) =>
        mutar((atual) => {
          const outros = atual.ordemAlmoco.filter((item) => item.diaSemana !== dia);
          return {
            ...atual,
            ordemAlmoco: [...outros, { diaSemana: dia, itens }].sort(
              (a, b) => a.diaSemana - b.diaSemana,
            ),
          };
        }),
      mutarBeneficios: (lista) => mutar((atual) => ({ ...atual, beneficios: lista })),
      mutarJustificativas: (lista) => mutar((atual) => ({ ...atual, justificativas: lista })),
      mutarLiberadores: (lista) => mutar((atual) => ({ ...atual, liberadores: lista })),
      mutarFeriados: (lista) => mutar((atual) => comFeriados(atual, lista)),
      mutarChaves: (lista) => mutar((atual) => ({ ...atual, chavesBi: lista })),
      mutarPlanilha: (finalidade, entrada) =>
        mutar((atual) => ({
          ...atual,
          planilhas: {
            ...atual.planilhas,
            [finalidade]: { ...atual.planilhas[finalidade], ...entrada },
          },
        })),
    }),
    [
      base,
      rascunho,
      carregando,
      salvando,
      erro,
      erroStatus,
      erroCodigo,
      alterado,
      secoesAlteradas,
      precisaSenhaBi,
      recarregar,
      descartar,
      salvar,
      aplicarFeriadosExternos,
      mutar,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useRascunhoConfiguracoes(): ContextoRascunho {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useRascunhoConfiguracoes precisa do provedor de configurações.");
  }
  return contexto;
}
