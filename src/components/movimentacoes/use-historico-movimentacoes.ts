// Vincula a leitura diária à tentativa atual e identifica a leitura mensal compartilhada.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VarianteEstado } from "@/components/ui/mui/tela-estado";
import { useContextoAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { diasDoMes, type SaidaAntecipada } from "@/domain/frequencia";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";

export interface FalhaDeLeitura {
  mensagem: string;
  variante: VarianteEstado;
}

type Leitura<T> =
  | { estado: "carregando" }
  | { estado: "pronto"; registros: T[] }
  | { estado: "falha"; falha: FalhaDeLeitura };

export type LeituraMensalSaidas = { mes: string } & (
  { estado: "carregando" | "pronto" } | { estado: "falha"; falha: FalhaDeLeitura }
);

function falhaDeLeitura(erro: unknown, mensagemPadrao: string): FalhaDeLeitura {
  return {
    mensagem: erro instanceof ErroApi ? erro.message : mensagemPadrao,
    variante: estadoDeErro(erro),
  };
}

export function useHistoricoDiario<T>(
  url: string | null,
  ler: (url: string) => Promise<T[]>,
  atualizacao: number,
  mensagemPadrao: string,
) {
  const [tentativa, setTentativa] = useState(0);
  const reler = () => setTentativa((valor) => valor + 1);
  // Voltar à mesma URL não reaproveita a instância da tentativa anterior.
  const pedido = useMemo(() => ({ url, atualizacao, tentativa }), [url, atualizacao, tentativa]);
  const [resultado, setResultado] = useState<{
    pedido: typeof pedido;
    leitura: Leitura<T>;
  } | null>(null);
  const marcarAtualizado = useContextoAtualizacao()?.marcarAtualizado;

  useEffect(() => {
    if (pedido.url === null) return;
    let vigente = true;
    void ler(pedido.url)
      .then((registros) => {
        if (!vigente) return;
        setResultado({ pedido, leitura: { estado: "pronto", registros } });
        marcarAtualizado?.("saidas");
      })
      .catch((erro: unknown) => {
        if (!vigente) return;
        setResultado({
          pedido,
          leitura: { estado: "falha", falha: falhaDeLeitura(erro, mensagemPadrao) },
        });
      });
    return () => {
      vigente = false;
    };
  }, [pedido, ler, marcarAtualizado, mensagemPadrao]);

  const leitura: Leitura<T> =
    resultado?.pedido === pedido ? resultado.leitura : { estado: "carregando" };
  return { leitura, reler };
}

export function useSaidasMensais(mesInicial: string, saidasIniciais: SaidaAntecipada[]) {
  const { avisarErro } = useAvisosDaSessao();
  const [dados, setDados] = useState<{
    registros: SaidaAntecipada[];
    leitura: LeituraMensalSaidas;
  }>({
    registros: saidasIniciais,
    leitura: { mes: mesInicial, estado: "pronto" },
  });
  const ultimoPedido = useRef(0);
  const recarregar = useCallback(
    async (mes: string) => {
      const pedido = ++ultimoPedido.current;
      setDados((atuais) => ({ ...atuais, leitura: { mes, estado: "carregando" } }));
      const dias = diasDoMes(mes);
      const primeiro = dias[0] ?? `${mes}-01`;
      const ultimo = dias[dias.length - 1] ?? `${mes}-28`;
      try {
        const { saidas } = await pedir<{ saidas: SaidaAntecipada[] }>(
          `/api/saidas?de=${primeiro}&ate=${ultimo}`,
        );
        if (pedido !== ultimoPedido.current) return;
        setDados({ registros: saidas, leitura: { mes, estado: "pronto" } });
      } catch (erro) {
        if (pedido !== ultimoPedido.current) return;
        const falha = falhaDeLeitura(erro, "Não foi possível carregar as saídas deste mês.");
        // Relatórios e outras visões conservam o cache. O histórico diário recebe a falha.
        setDados((atuais) => ({ ...atuais, leitura: { mes, estado: "falha", falha } }));
        avisarErro(erro, {
          contexto: "Não foi possível atualizar as saídas.",
          descricao: "As informações na tela podem estar desatualizadas.",
        });
      }
    },
    [avisarErro],
  );
  return { ...dados, recarregar };
}
