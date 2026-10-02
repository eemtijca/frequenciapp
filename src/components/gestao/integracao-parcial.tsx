"use client";

// Configuração do terceiro arquivo Google para chamadas parciais e conferência Seduc.
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { corpoAlteracao, corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selo } from "@/components/ui/selo";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeletorPlanilhaGoogle } from "./seletor-planilha-google";

interface IntegracaoParcialAdmin {
  ativa: boolean;
  contaGoogle: boolean;
  googlePlanilha: { id: string; nome: string | null } | null;
  aba: string;
  preparada: boolean;
  podeEnviar: boolean;
}

export default function IntegracaoParcial({ onAbrirParcial }: { onAbrirParcial?: () => void }) {
  const [integracao, setIntegracao] = useState<IntegracaoParcialAdmin | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState(false);
  const { chaveAtiva, executar } = useAcoesPorChave();
  const ocupado = chaveAtiva !== null;

  const carregar = useCallback(async () => {
    try {
      const dados = await pedir<{ integracao: IntegracaoParcialAdmin }>("/api/planilha-parcial");
      setIntegracao(dados.integracao);
      setErro("");
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível ler a integração.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarAtiva(ativa: boolean) {
    await executar("parcial-ativa", async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoParcialAdmin }>(
          "/api/planilha-parcial",
          corpoAlteracao("PATCH", { ativa }),
        );
        setIntegracao(dados.integracao);
        toast.success(ativa ? "Planilha parcial ativada." : "Planilha parcial desativada.");
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar.");
      }
    });
  }

  async function preparar() {
    await executar("parcial-preparar", async () => {
      try {
        const dados = await pedir<{ criada: boolean; integracao: IntegracaoParcialAdmin }>(
          "/api/planilha-parcial/preparar",
          corpoJson({ confirmacao: true }),
        );
        setIntegracao(dados.integracao);
        setConfirmacao(false);
        toast.success(
          dados.criada ? "Aba Chamada Parcial criada." : "Aba Chamada Parcial conferida.",
        );
      } catch (excecao) {
        toast.error(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar a aba.",
        );
      }
    });
  }

  async function desconectar() {
    await executar("parcial-desconectar", async () => {
      try {
        const dados = await pedir<{ integracao: IntegracaoParcialAdmin }>("/api/planilha-parcial", {
          method: "DELETE",
        });
        setIntegracao(dados.integracao);
        toast.success("Integração parcial desconectada.");
      } catch (excecao) {
        toast.error(excecao instanceof ErroApi ? excecao.message : "Não foi possível desconectar.");
      }
    });
  }

  return (
    <>
      <SecaoRecolhivel
        dataSecao="planilha-parcial"
        titulo="Planilha de chamada parcial"
        icone={ClipboardList}
        aberto={aberto}
        onAbertoChange={setAberto}
        resumo={
          <>
            <Selo variante={integracao?.ativa ? "sucesso" : "neutro"}>
              {integracao?.ativa ? "Ligada" : "Desligada"}
            </Selo>
            <Selo variante={integracao?.preparada ? "sucesso" : "neutro"}>
              {integracao?.preparada ? "Aba preparada" : "Preparação pendente"}
            </Selo>
          </>
        }
        acoes={
          <Switch
            checked={integracao?.ativa ?? false}
            disabled={ocupado || !integracao?.preparada}
            onCheckedChange={(valor) => void alternarAtiva(valor)}
            aria-label="Integração de chamada parcial ativa"
          />
        }
      >
        {carregando ? (
          <p className="text-muted-foreground text-sm">Conferindo a integração...</p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Escolha um terceiro arquivo, separado da frequência e das saídas.
            </p>
            <SeletorPlanilhaGoogle
              finalidade="PARCIAL"
              conectado={integracao?.contaGoogle ?? false}
              planilha={integracao?.googlePlanilha ?? null}
              onAtualizar={carregar}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={ocupado || !integracao?.googlePlanilha}
                onClick={() => setConfirmacao(true)}
              >
                {integracao?.preparada ? "Conferir aba parcial" : "Preparar aba parcial"}
              </Button>
              {onAbrirParcial && (
                <Button type="button" onClick={onAbrirParcial}>
                  Abrir Chamada Parcial
                </Button>
              )}
              {integracao?.googlePlanilha && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={ocupado}
                  onClick={() => void desconectar()}
                >
                  Desconectar
                </Button>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              O envio exige prévia. O registro na Seduc é confirmado manualmente na Chamada Parcial.
            </p>
          </>
        )}
        {erro && <AvisoCompacto variante="indisponivel" descricao={erro} tamanho="linha" />}
      </SecaoRecolhivel>
      <Dialog
        open={confirmacao}
        onOpenChange={(valor) => {
          if (!ocupado) setConfirmacao(valor);
        }}
      >
        <DialogContent folha>
          <DialogHeader>
            <DialogTitle>Preparar Chamada Parcial</DialogTitle>
            <DialogDescription>
              A aba Chamada Parcial será criada com as colunas padrão em{" "}
              {integracao?.googlePlanilha?.nome ?? "a planilha escolhida"}. Se já existir, o
              cabeçalho será conferido e o conteúdo será preservado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado}
              onClick={() => setConfirmacao(false)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={ocupado} onClick={() => void preparar()}>
              {ocupado && <LoaderCircle size={16} className="animate-spin" />}
              Confirmar preparação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
