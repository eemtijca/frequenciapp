"use client";

// Conferência guiada por mês, somente de leitura, com acesso às etapas de correção.
import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileSearch, LoaderCircle, ShieldCheck } from "lucide-react";
import type { DiagnosticoPlanilha } from "@/domain/planilha-diagnostico";
import { rotuloMes } from "@/domain/frequencia";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type EtapaConfiguracaoPlanilha = "conexao" | "estrutura" | "envio";

export function DialogoConfigurarPlanilha({
  mes,
  mesMaximo,
  onMes,
  onEtapa,
}: {
  mes: string;
  mesMaximo: string;
  onMes: (mes: string) => void;
  onEtapa: (etapa: EtapaConfiguracaoPlanilha) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [diagnostico, setDiagnostico] = useState<DiagnosticoPlanilha | null>(null);
  const [erro, setErro] = useState("");
  const versao = useRef(0);
  const proximaEtapa = useRef<EtapaConfiguracaoPlanilha | null>(null);
  const { executar, executando } = useAcaoUnica(async () => {
    const atual = ++versao.current;
    setErro("");
    setDiagnostico(null);
    try {
      const dados = await pedir<{ diagnostico: DiagnosticoPlanilha }>(
        `/api/planilha/diagnostico?mes=${encodeURIComponent(mes)}`,
      );
      if (atual === versao.current) setDiagnostico(dados.diagnostico);
    } catch (excecao) {
      if (atual === versao.current)
        setErro(
          excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível conferir a configuração.",
        );
    }
  });

  function irPara(etapa: EtapaConfiguracaoPlanilha) {
    proximaEtapa.current = etapa;
    setAberto(false);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        ++versao.current;
        setAberto(valor);
        setDiagnostico(null);
        setErro("");
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 self-start">
          <ShieldCheck size={18} aria-hidden="true" />
          Configuração assistida
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-xl"
        folha
        onCloseAutoFocus={(evento) => {
          if (proximaEtapa.current) {
            evento.preventDefault();
            const etapa = proximaEtapa.current;
            proximaEtapa.current = null;
            onEtapa(etapa);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Configuração assistida</DialogTitle>
          <DialogDescription>Confira o destino e as turmas antes de sincronizar.</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-3">
          <SeletorPeriodo
            id="mes-diagnostico-planilha"
            modo="mes"
            valor={mes}
            max={mesMaximo}
            rotuloAcessivel="Mês da conferência"
            rotulo={rotuloMes(mes)}
            onValor={(valor) => {
              ++versao.current;
              setDiagnostico(null);
              setErro("");
              onMes(valor);
            }}
          />
          <Button type="button" disabled={executando} onClick={() => void executar()}>
            {executando ? (
              <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <FileSearch size={18} aria-hidden="true" />
            )}
            {executando ? "Conferindo..." : "Conferir configuração"}
          </Button>
          <p className="text-muted-foreground text-xs">Esta conferência apenas lê a planilha.</p>
        </div>
        {erro && (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        )}
        {diagnostico && (
          <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
            <section
              className="superficie flex flex-col gap-2 p-3"
              aria-label="Conexão da planilha"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">1. Arquivo e conexão</h3>
                <Selo variante={diagnostico.conexao.verificada ? "sucesso" : "atencao"}>
                  {diagnostico.conexao.verificada ? "Acesso conferido" : "Conferir conexão"}
                </Selo>
              </div>
              {diagnostico.conexao.erro && (
                <p className="text-falta-texto text-sm">{diagnostico.conexao.erro}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => irPara("conexao")}
              >
                Revisar conexão
              </Button>
            </section>
            <section className="superficie flex flex-col gap-3 p-3" aria-label="Turmas do mês">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">2. Turmas e mês</h3>
                <Selo variante={diagnostico.estruturaPronta ? "sucesso" : "atencao"}>
                  {diagnostico.resumo.prontas}/{diagnostico.resumo.total} conferidas
                </Selo>
              </div>
              <ul className="flex flex-col gap-2" aria-label="Conferência por turma">
                {diagnostico.turmas.map((turma) => (
                  <li key={turma.id} className="flex min-w-0 gap-2 border-t pt-2">
                    {turma.situacao === "pronta" ? (
                      <CheckCircle2
                        size={18}
                        className="text-primary mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleAlert
                        size={18}
                        className="text-falta-texto mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium wrap-anywhere">{turma.rotulo}</p>
                      <p className="text-muted-foreground text-xs wrap-anywhere">
                        {turma.aba ?? "Sem aba para este mês"}
                      </p>
                      <p
                        className={
                          turma.situacao === "pronta"
                            ? "text-muted-foreground text-xs"
                            : "text-falta-texto text-xs"
                        }
                      >
                        {turma.mensagem ?? "Estrutura conferida"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {diagnostico.resumo.total === 0 && (
                <p className="text-muted-foreground text-sm">Cadastre as turmas na Gestão.</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => irPara("estrutura")}
              >
                Revisar turmas e mês
              </Button>
            </section>
            <section
              className="superficie flex flex-col gap-3 p-3"
              aria-label="Situação dos envios"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">3. Sincronização</h3>
                <Selo
                  variante={
                    diagnostico.envioAutomatico &&
                    diagnostico.ativa &&
                    diagnostico.modo === "conservador"
                      ? "sucesso"
                      : "neutro"
                  }
                >
                  {diagnostico.envioAutomatico &&
                  diagnostico.ativa &&
                  diagnostico.modo === "conservador"
                    ? "Automação ligada"
                    : "Automação pausada"}
                </Selo>
              </div>
              <p className="text-muted-foreground text-xs">
                {diagnostico.alteradasDepois} chamadas sem envio confirmado no arquivo.
              </p>
              {!diagnostico.ativa && (
                <p className="text-muted-foreground text-xs">
                  Ative a integração após conferir o arquivo.
                </p>
              )}
              {diagnostico.modo === "completo" && (
                <p className="text-falta-texto text-xs">
                  Modo completo ativo. Encerre a janela para retomar a automação.
                </p>
              )}
              {diagnostico.ultimoErro && (
                <p className="text-falta-texto text-sm">
                  {diagnostico.ultimoErro.erro ?? "Há envios que precisam de conferência manual."}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                A prévia do envio confere os alunos, as marcas e as divergências antes de gravar.
              </p>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => irPara("envio")}
              >
                Revisar envio e automação
              </Button>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
