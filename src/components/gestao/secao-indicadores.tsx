"use client";

// Configuração compacta das fontes agregadas e do acesso a painéis externos privados.
import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesCombined, ExternalLink, LoaderCircle } from "lucide-react";
import type { EstadoIndicadores } from "@/domain/indicadores";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";

export default function SecaoIndicadores() {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoIndicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ano, setAno] = useState("");
  const [relatorio, setRelatorio] = useState("");
  const [recuperacao, setRecuperacao] = useState("");
  const { chaveAtiva, executar } = useAcoesPorChave();
  const ocupado = chaveAtiva !== null;
  const carregar = useCallback(async () => {
    try {
      const resposta = await pedir<EstadoIndicadores>("/api/indicadores");
      setEstado(resposta);
      setAno(resposta.ano?.toString() ?? "");
      setRelatorio(resposta.urlRelatorio ?? "");
      setErro(null);
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : "Não foi possível carregar o painel externo.");
    }
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const controlador = new AbortController();
    pedir<EstadoIndicadores>("/api/indicadores", { signal: controlador.signal })
      .then((resposta) => {
        if (controlador.signal.aborted) return;
        setEstado(resposta);
        setAno(resposta.ano?.toString() ?? "");
        setRelatorio(resposta.urlRelatorio ?? "");
        setErro(null);
      })
      .catch((erro: unknown) => {
        if (!controlador.signal.aborted)
          setErro(
            erro instanceof Error ? erro.message : "Não foi possível carregar o painel externo.",
          );
      });
    return () => controlador.abort();
  }, [aberto]);

  function agir(tarefa: () => Promise<unknown>, mensagem: string) {
    void executar("indicadores", async () => {
      try {
        await tarefa();
        avisarSucesso(mensagem);
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível concluir a operação." });
      }
      await carregar();
    });
  }
  function enviar(acao: "preparar" | "atualizar") {
    agir(() => pedir(`/api/indicadores/${acao}`, corpoJson({})), "Indicadores atualizados.");
  }

  return (
    <SecaoRecolhivel
      dataSecao="indicadores"
      titulo="Painel externo"
      icone={ChartNoAxesCombined}
      aberto={aberto}
      onAbertoChange={setAberto}
    >
      {erro && (
        <p role="alert" className="text-falta-texto text-sm">
          {erro}
        </p>
      )}
      {!estado && (
        <Button variant="outline" onClick={() => void carregar()}>
          Recarregar
        </Button>
      )}
      {estado && (
        <>
          <p className="text-muted-foreground text-sm">
            Totais por data, série e turma, em uma planilha separada. Sem nomes de alunos ou
            observações.
          </p>
          {!estado.conectada && (
            <p role="alert" className="text-sm">
              Conecte a conta Google da frequência para preparar os indicadores.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="indicadores-ano">Ano dos indicadores</Label>
              <Input
                id="indicadores-ano"
                type="number"
                min={2000}
                max={2100}
                placeholder={`Ano atual (${estado.anoEfetivo})`}
                value={ano}
                disabled={ocupado}
                onChange={(evento) => setAno(evento.target.value)}
              />
              <p className="text-muted-foreground text-xs">Vazio acompanha o ano atual.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="indicadores-relatorio">Endereço do painel</Label>
              <Input
                id="indicadores-relatorio"
                type="url"
                placeholder="Cole o link do painel"
                value={relatorio}
                disabled={ocupado}
                onChange={(evento) => setRelatorio(evento.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={ocupado}
              onClick={() =>
                agir(
                  () =>
                    pedir("/api/indicadores", {
                      ...corpoJson({
                        ano: ano === "" ? null : Number(ano),
                        urlRelatorio: relatorio || null,
                      }),
                      method: "PATCH",
                    }),
                  "Opções salvas. Atualize os indicadores para aplicar o ano.",
                )
              }
            >
              Salvar opções
            </Button>
            <Button
              disabled={ocupado || !estado.conectada || estado.criacaoPendente}
              onClick={() => enviar(estado.planilhaUrl ? "atualizar" : "preparar")}
            >
              {ocupado && <LoaderCircle size={16} className="animate-spin" />}
              {estado.planilhaUrl ? "Atualizar indicadores" : "Preparar indicadores"}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="indicadores-automatico">Atualização automática</Label>
            <Switch
              id="indicadores-automatico"
              checked={estado.ativa}
              disabled={ocupado || !estado.planilhaUrl || !estado.conectada}
              onCheckedChange={(ativa) =>
                agir(
                  () => pedir("/api/indicadores", { ...corpoJson({ ativa }), method: "PATCH" }),
                  "Atualização automática configurada.",
                )
              }
            />
          </div>
          {!estado.agendaDisponivel && (
            <p className="text-muted-foreground text-sm">
              A agenda depende da configuração CRON_SECRET no aplicativo e no GitHub.
            </p>
          )}
          {estado.ultimoEnvioEm && (
            <p className="text-muted-foreground text-sm">
              Último envio: {new Date(estado.ultimoEnvioEm).toLocaleString("pt-BR")} ·{" "}
              {estado.linhas} linhas agregadas
            </p>
          )}
          {estado.erro && (
            <p role="alert" className="text-falta-texto text-sm">
              {estado.erro}
            </p>
          )}
          {estado.criacaoPendente && (
            <div className="space-y-3 rounded-2xl border p-3">
              <p className="text-sm">
                Confira no Google Drive se o arquivo FrequenciApp - Indicadores foi criado. O
                endereço permite recuperá-lo sem duplicar a planilha.
              </p>
              <Label htmlFor="indicadores-recuperacao">Endereço da planilha criada</Label>
              <Input
                id="indicadores-recuperacao"
                type="url"
                value={recuperacao}
                disabled={ocupado}
                onChange={(e) => setRecuperacao(e.target.value)}
              />
              <Button
                variant="outline"
                disabled={ocupado || !recuperacao}
                onClick={() =>
                  agir(
                    () => pedir("/api/indicadores/recuperar", corpoJson({ endereco: recuperacao })),
                    "Planilha recuperada. Atualize os indicadores.",
                  )
                }
              >
                Recuperar planilha
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {estado.planilhaUrl && (
              <Button variant="outline" asChild>
                <a href={estado.planilhaUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  Abrir planilha
                </a>
              </Button>
            )}
            {estado.urlRelatorio && (
              <Button variant="outline" asChild>
                <a href={estado.urlRelatorio} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={16} />
                  Abrir painel
                </a>
              </Button>
            )}
          </div>
          <details className="rounded-2xl border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Conectar painel externo</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>
                Prepare os indicadores e crie um painel no{" "}
                <a
                  className="text-primary underline"
                  href="https://www.zoho.com/analytics/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Zoho Analytics
                </a>{" "}
                ou no{" "}
                <a
                  className="text-primary underline"
                  href="https://lookerstudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Looker Studio
                </a>
                .
              </li>
              <li>
                Conecte a planilha FrequenciApp - Indicadores pelo conector Google Planilhas ou
                Google Drive. Importe as abas Frequencia, Movimentacoes, Parciais e Aulas_parciais.
              </li>
              <li>
                Inclua gráficos e filtros de data, série e turma. Compartilhe apenas com contas
                autorizadas da gestão e salve o link direto do painel acima.
              </li>
            </ol>
            <p className="text-muted-foreground mt-3">
              A agenda busca atualizar a planilha a cada cinco minutos. Configure a atualização da
              fonte também no serviço escolhido. Totais de grupos pequenos exigem acesso restrito.
            </p>
          </details>
        </>
      )}
    </SecaoRecolhivel>
  );
}
