"use client";

// Conferência e cópia local do comunicado de uma saída já registrada.
import { useId, useRef, useState } from "react";
import { Copy, LoaderCircle } from "lucide-react";
import { gerarComunicadoSaida, type DadosComunicadoSaida } from "@/domain/comunicado-saida";
import { avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AvisoCompacto } from "@/components/ui/tela-estado";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DialogoComunicadoSaida({
  dados,
  onFechar,
}: {
  dados: DadosComunicadoSaida;
  onFechar: () => void;
}) {
  const campoId = useId();
  const campo = useRef<HTMLTextAreaElement>(null);
  const botaoCopiar = useRef<HTMLButtonElement>(null);
  const [texto, setTexto] = useState(() => gerarComunicadoSaida(dados));
  const [erro, setErro] = useState("");
  const { executando, executar: copiar } = useAcaoUnica(async () => {
    setErro("");
    try {
      await navigator.clipboard.writeText(texto);
      avisarSucesso("Comunicado copiado.");
    } catch {
      setErro("Não foi possível copiar. Selecione o texto para copiar manualmente.");
      campo.current?.focus();
      campo.current?.select();
    }
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          botaoCopiar.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Comunicado de saída</DialogTitle>
          <DialogDescription>
            Confira o texto antes de encaminhar aos responsáveis.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={campoId}>Mensagem</Label>
          <textarea
            id={campoId}
            ref={campo}
            rows={10}
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setErro("");
            }}
            className="controle-vidro focus-visible:ring-ring/50 focus-visible:border-ring max-h-[50dvh] min-h-48 w-full resize-y px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
          />
        </div>
        {erro && <AvisoCompacto variante="indisponivel" descricao={erro} tamanho="linha" />}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button
            ref={botaoCopiar}
            disabled={executando || !texto.trim()}
            onClick={() => void copiar()}
          >
            {executando ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            Copiar texto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
