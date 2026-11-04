"use client";

// Criação e acesso ao índice das chamadas em um documento do Google Docs.
import { useEffect, useState } from "react";
import { ExternalLink, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EstadoIndice {
  url: string | null;
  pendente: boolean;
}

export function IndiceChamadas({ disabled }: { disabled?: boolean }) {
  const [estado, setEstado] = useState<EstadoIndice | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [documentoUrl, setDocumentoUrl] = useState("");
  const [confirmarCriacao, setConfirmarCriacao] = useState(false);
  useEffect(() => {
    let ativo = true;
    void pedir<EstadoIndice>("/api/planilha/mensal/indice")
      .then((dados) => {
        if (ativo) setEstado(dados);
      })
      .catch((erro: unknown) => {
        if (ativo) setMensagem(mensagemAmigavel(erro, "Não foi possível consultar o índice."));
      });
    return () => {
      ativo = false;
    };
  }, []);
  const { executando, executar } = useAcaoUnica(async () => {
    setMensagem("");
    try {
      if (!estado) {
        setEstado(await pedir<EstadoIndice>("/api/planilha/mensal/indice"));
        return;
      }
      setEstado(
        await pedir<EstadoIndice>(
          "/api/planilha/mensal/indice",
          corpoJson(
            estado.pendente ? (confirmarCriacao ? { recriar: true } : { documentoUrl }) : {},
          ),
        ),
      );
      setDocumentoUrl("");
      setMensagem("Índice atualizado.");
    } catch (erro) {
      setMensagem(mensagemAmigavel(erro, "Não foi possível atualizar o índice."));
      try {
        setEstado(await pedir<EstadoIndice>("/api/planilha/mensal/indice"));
      } catch {
        /* Preserva a mensagem da operação que falhou. */
      }
    } finally {
      setConfirmarCriacao(false);
    }
  });
  const ocupado = disabled || executando;
  return (
    <section className="superficie flex flex-col gap-2 p-3" aria-label="Índice das chamadas">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText size={16} /> Índice das chamadas
      </div>
      <p className="text-muted-foreground text-xs">Google Docs com links por mês e turma.</p>
      <div className="flex flex-wrap gap-2">
        {estado?.url && (
          <a
            className="controle flex min-h-11 items-center gap-2 px-3 text-sm"
            href={estado.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} /> Abrir índice
          </a>
        )}
        {!estado?.pendente && (
          <Button
            type="button"
            variant="outline"
            disabled={ocupado || (!estado && !mensagem)}
            onClick={() => void executar()}
            aria-label={estado?.url ? "Atualizar índice" : undefined}
          >
            {executando ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {estado?.url
              ? "Atualizar índice"
              : !estado && mensagem
                ? "Tentar de novo"
                : "Criar índice"}
          </Button>
        )}
      </div>
      {estado?.pendente && (
        <div className="flex flex-col gap-2 text-sm">
          {confirmarCriacao ? (
            <>
              <p>Uma nova tentativa pode criar outro documento no Drive.</p>
              <Button type="button" disabled={ocupado} onClick={() => void executar()}>
                Criar outro índice
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={() => setConfirmarCriacao(false)}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <p>Localize o índice no Google Drive para recuperar a criação anterior.</p>
              <label htmlFor="indice-documento-url">Link do documento</label>
              <Input
                id="indice-documento-url"
                type="url"
                value={documentoUrl}
                disabled={ocupado}
                onChange={(evento) => setDocumentoUrl(evento.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={ocupado || !documentoUrl}
                onClick={() => void executar()}
              >
                Recuperar índice
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={ocupado}
                onClick={() => setConfirmarCriacao(true)}
              >
                Não encontrei o documento
              </Button>
            </>
          )}
        </div>
      )}
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </section>
  );
}
