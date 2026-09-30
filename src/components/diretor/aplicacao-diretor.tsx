"use client";

// Tela do diretor de turma: só leitura das estatísticas das turmas do vínculo.
// No primeiro acesso, a troca da palavra-chave vem antes de qualquer dado.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, LoaderCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { pedir } from "@/lib/api-cliente";
import { avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { primeiroNome, rotuloDePapel, type Identidade } from "@/domain/usuarios";
import type { ContextoDiretor } from "@/domain/estatisticas-diretor";
import { Button } from "@/components/ui/button";
import { SeletorTema } from "@/components/ui/seletor-tema";
import DialogoSenha from "@/components/conta/dialogo-senha";
import DialogoNotificacoes from "@/components/conta/dialogo-notificacoes";
import RegistroPwa from "@/components/pwa/registro-pwa";
import VistaMinhasTurmas from "@/components/diretor/vista-minhas-turmas";

interface Props {
  usuario: Identidade;
  contexto: ContextoDiretor;
}

export default function AplicacaoDiretor({ usuario, contexto }: Props) {
  const router = useRouter();
  const [trocaAberta, setTrocaAberta] = useState(false);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);

  const { executando: saindo, executar: sair } = useAcaoUnica(async () => {
    try {
      await pedir<{ ok: boolean }>("/api/auth/sair", { method: "POST" });
    } catch {
      toast.error("Não foi possível sair. Tente novamente.");
      return;
    }
    avisarSucesso("Sessão encerrada.");
    router.refresh();
  });

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="bg-card/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0">
            <p className="truncate font-semibold tracking-tight">FrequenciApp</p>
            <p className="text-muted-foreground truncate text-xs">
              {primeiroNome(usuario.nome)} · {rotuloDePapel(usuario.papel)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <SeletorTema />
            {!contexto.trocaObrigatoria ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Configurar notificações"
                title="Configurar notificações"
                onClick={() => setNotificacoesAbertas(true)}
              >
                <Bell size={18} />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Trocar minha palavra-chave"
              title="Trocar minha palavra-chave"
              onClick={() => setTrocaAberta(true)}
            >
              <KeyRound size={18} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Sair da conta"
              title="Sair da conta"
              disabled={saindo}
              onClick={() => void sair()}
            >
              {saindo ? <LoaderCircle size={18} className="animate-spin" /> : <LogOut size={18} />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 sm:px-6" data-visao="diretor">
        {contexto.trocaObrigatoria ? (
          <div className="text-muted-foreground flex min-h-60 items-center justify-center text-center text-sm">
            Crie sua palavra-chave para ver as estatísticas.
          </div>
        ) : (
          <VistaMinhasTurmas contexto={contexto} />
        )}
      </main>

      <DialogoSenha
        palavraChave
        obrigatoria={contexto.trocaObrigatoria}
        aberto={contexto.trocaObrigatoria || trocaAberta}
        onAbrir={setTrocaAberta}
        onTrocada={() => {
          if (contexto.trocaObrigatoria) router.refresh();
        }}
      />
      <DialogoNotificacoes aberto={notificacoesAbertas} onAbrir={setNotificacoesAbertas} />
      <RegistroPwa />
    </div>
  );
}
