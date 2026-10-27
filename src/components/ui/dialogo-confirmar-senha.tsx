"use client";

// Confirmação da própria senha em ações sensíveis, com erro inline e trava de envio.
import { useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Button } from "@/components/ui/button";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ErroApi } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  rotuloConfirmar?: string;
  onConfirmar: (senha: string) => Promise<void>;
}

export function DialogoConfirmarSenha({
  aberto,
  onAbrir,
  titulo,
  descricao,
  rotuloConfirmar = "Confirmar",
  onConfirmar,
}: Props) {
  const id = useId();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");

  const { executando, executar } = useAcaoUnica(async () => {
    if (!senha.trim()) {
      setErro("Informe a senha.");
      return;
    }
    setErro("");
    try {
      await onConfirmar(senha);
      setSenha("");
      setErro("");
      setErroVariante("indisponivel");
      onAbrir(false);
    } catch (excecao) {
      setErro(
        excecao instanceof ErroApi
          ? excecao.message
          : "Não foi possível confirmar a senha. Tente novamente.",
      );
      setErroVariante(estadoDeErro(excecao));
    }
  });

  function fechar() {
    if (executando) return;
    onAbrir(false);
    setSenha("");
    setErro("");
    setErroVariante("indisponivel");
  }

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && fechar()}>
      <DialogContent
        showCloseButton={!executando}
        onEscapeKeyDown={(evento) => {
          evento.preventDefault();
          fechar();
        }}
        onPointerDownOutside={(evento) => {
          evento.preventDefault();
          fechar();
        }}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            void executar();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-senha`}>Senha da sua conta</Label>
            <CampoSenha
              id={`${id}-senha`}
              value={senha}
              onChange={(evento) => {
                setSenha(evento.target.value);
                if (erro) setErro("");
              }}
              autoComplete="current-password"
              maxLength={200}
              disabled={executando}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${id}-erro` : undefined}
              className="h-11"
            />
          </div>
          {erro && (
            <div id={`${id}-erro`}>
              <AvisoCompacto
                variante={erroVariante}
                titulo="Confira a senha"
                descricao={erro}
                tamanho="linha"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={executando}
              onClick={fechar}
            >
              Cancelar
            </Button>
            <Button type="submit" className="h-11" disabled={executando || !senha.trim()}>
              {executando && (
                <LoaderCircle
                  size={16}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              {rotuloConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
