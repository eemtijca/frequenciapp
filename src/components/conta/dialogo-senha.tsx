"use client";

// Troca da própria senha: exige a atual, orienta a política e avisa
// que outros dispositivos serão desconectados.
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { avisarErro } from "@/lib/avisos";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
}

export default function DialogoSenha({ aberto, onAbrir }: Props) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function fechar(abertoNovo: boolean) {
    if (enviando) return;
    onAbrir(abertoNovo);
    if (!abertoNovo) {
      setSenhaAtual("");
      setSenhaNova("");
      setConfirmacao("");
      setErro("");
    }
  }

  async function submeter() {
    if (enviando) return;
    if (senhaNova !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ ok: boolean }>("/api/conta/senha", corpoJson({ senhaAtual, senhaNova }));
      toast.success("Senha trocada. Nos outros dispositivos, entre de novo.");
      fechar(false);
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível trocar a senha.");
      avisarErro(excecao, { contexto: "Não foi possível trocar a senha." });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Trocar minha senha</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            void submeter();
          }}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <CampoSenha
              id="senha-atual"
              value={senhaAtual}
              required
              autoComplete="current-password"
              onChange={(evento) => setSenhaAtual(evento.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <CampoSenha
              id="senha-nova"
              value={senhaNova}
              required
              minLength={8}
              autoComplete="new-password"
              onChange={(evento) => setSenhaNova(evento.target.value)}
              className="h-11 rounded-lg"
            />
            <p className="text-muted-foreground text-xs">
              Mínimo de 8 caracteres, com pelo menos uma letra e um número.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="senha-confirmacao">Confirmar nova senha</Label>
            <CampoSenha
              id="senha-confirmacao"
              value={confirmacao}
              required
              minLength={8}
              autoComplete="new-password"
              onChange={(evento) => setConfirmacao(evento.target.value)}
              className="h-11 rounded-lg"
            />
          </div>
          {erro && (
            <p
              role="alert"
              className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm"
            >
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <LoaderCircle size={16} className="animate-spin" />}
              Trocar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
