"use client";

// Preferência de push do dispositivo atual. A permissão só é pedida após
// toque explícito; falhas de ativação desfazem a assinatura recém-criada.
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
}
interface Estado {
  configurada: boolean;
  chavePublica: string | null;
  ativa: boolean;
}

function chaveDoServidor(chave: string): Uint8Array<ArrayBuffer> {
  const texto = atob(chave.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(texto, (caractere) => caractere.charCodeAt(0));
}

async function registroPronto(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  let alarme: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolver, recusar) => {
        alarme = setTimeout(
          () => recusar(new Error("Não foi possível iniciar as notificações. Tente novamente.")),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(alarme);
  }
}

export default function DialogoNotificacoes({ aberto, onAbrir }: Props) {
  const [suportado, setSuportado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [assinatura, setAssinatura] = useState<PushSubscription | null>(null);
  const [permissao, setPermissao] = useState<NotificationPermission>("default");
  const [erro, setErro] = useState("");
  const acaoDesejada = useRef<"ativar" | "desativar" | "testar">("ativar");

  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    const suporta =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSuportado(suporta);
    setCarregando(true);
    setErro("");
    async function carregar() {
      try {
        const atual = suporta ? await (await registroPronto()).pushManager.getSubscription() : null;
        const dados = await pedir<Estado>(
          `/api/notificacoes/assinatura${atual ? `?endpoint=${encodeURIComponent(atual.endpoint)}` : ""}`,
        );
        if (cancelado) return;
        // Reassocia uma preferência já ativa à sessão atual, sem pedir permissão.
        if (dados.ativa && atual)
          await pedir("/api/notificacoes/assinatura", corpoJson(atual.toJSON()));
        if (cancelado) return;
        setAssinatura(atual);
        setEstado(dados);
        if (suporta) setPermissao(Notification.permission);
      } catch (excecao) {
        if (!cancelado)
          setErro(
            excecao instanceof Error
              ? excecao.message
              : "Não foi possível consultar as notificações.",
          );
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    void carregar();
    return () => {
      cancelado = true;
    };
  }, [aberto]);

  const { executando, executar } = useAcaoUnica(async () => {
    const acao = acaoDesejada.current;
    setErro("");
    try {
      if (acao === "ativar") {
        if (!estado?.chavePublica) return;
        // Safari exige a solicitação dentro da ação do usuário, antes de outras esperas.
        const autorizacao =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        setPermissao(autorizacao);
        if (autorizacao !== "granted") {
          setErro("A permissão não foi concedida. Os avisos continuam desativados.");
          return;
        }
        const registro = await registroPronto();
        let atual = await registro.pushManager.getSubscription();
        const chave = chaveDoServidor(estado.chavePublica);
        const anterior = atual?.options.applicationServerKey;
        if (
          atual &&
          anterior &&
          new Uint8Array(anterior).some((byte, indice) => byte !== chave[indice])
        ) {
          await atual.unsubscribe();
          atual = null;
        }
        const criada = !atual;
        atual ??= await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: chave,
        });
        try {
          await pedir("/api/notificacoes/assinatura", corpoJson(atual.toJSON()));
        } catch (excecao) {
          if (criada) await atual.unsubscribe().catch(() => false);
          throw excecao;
        }
        setAssinatura(atual);
        setEstado({ ...estado, ativa: true });
        avisarSucesso("Notificações ativadas neste dispositivo.");
      } else if (assinatura) {
        if (acao === "desativar") {
          await pedir("/api/notificacoes/assinatura", {
            ...corpoJson({ endpoint: assinatura.endpoint }),
            method: "DELETE",
          });
          setEstado((atual) => (atual ? { ...atual, ativa: false } : atual));
          await assinatura.unsubscribe();
          setAssinatura(null);
          avisarSucesso("Notificações desativadas neste dispositivo.");
        } else {
          await pedir("/api/notificacoes/teste", corpoJson({ endpoint: assinatura.endpoint }));
          avisarSucesso("Teste enviado. Confira as notificações do dispositivo.");
        }
      }
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "Não foi possível alterar as notificações.",
      );
      if (excecao instanceof ErroApi && excecao.status === 410)
        setEstado((atual) => (atual ? { ...atual, ativa: false } : atual));
      avisarErro(excecao, { contexto: "Não foi possível concluir a ação de notificações." });
    }
  });

  function executarAcao(acao: "ativar" | "desativar" | "testar") {
    if (executando) return;
    acaoDesejada.current = acao;
    void executar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        if (!executando) onAbrir(valor);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Notificações</DialogTitle>
          <DialogDescription>
            Um aviso diário quando há chamada nas turmas acompanhadas. A escolha vale somente para
            este dispositivo.
          </DialogDescription>
        </DialogHeader>
        {carregando ? (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="animate-spin" size={16} />
            Consultando notificações...
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {!suportado ? (
              <p className="text-muted-foreground text-sm">
                Este navegador não oferece notificações push. No iPhone ou iPad, adicione o
                aplicativo à Tela de Início pelo Safari e abra por esse ícone. É necessário iOS 16.4
                ou posterior.
              </p>
            ) : null}
            {estado && !estado.configurada ? (
              <p className="text-muted-foreground text-sm">
                As notificações ainda não foram configuradas pela administração.
              </p>
            ) : null}
            {suportado && permissao === "denied" ? (
              <p className="text-muted-foreground text-sm">
                As notificações estão bloqueadas. Libere a permissão nas configurações deste site no
                navegador e abra esta opção novamente.
              </p>
            ) : null}
            {estado?.ativa ? (
              <p role="status" className="text-sm">
                Notificações ativadas neste dispositivo.
              </p>
            ) : null}
            {suportado && estado?.configurada ? (
              <div className="flex flex-col gap-2">
                <Button
                  disabled={executando || (!estado.ativa && permissao === "denied")}
                  onClick={() => executarAcao(estado.ativa ? "desativar" : "ativar")}
                >
                  {executando ? <LoaderCircle className="animate-spin" size={16} /> : null}
                  {estado.ativa ? "Desativar notificações" : "Ativar notificações"}
                </Button>
                {estado.ativa ? (
                  <Button
                    variant="outline"
                    disabled={executando}
                    onClick={() => executarAcao("testar")}
                  >
                    Enviar notificação de teste
                  </Button>
                ) : null}
              </div>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Os avisos não mostram nomes de alunos. Ao sair da conta neste dispositivo, as
              notificações são desativadas.
            </p>
          </div>
        )}
        {erro ? (
          <p role="alert" className="text-falta-texto text-sm">
            {erro}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
