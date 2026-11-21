"use client";

// Registro do service worker e aviso de atualização. Também detecta
// perda de conexão para orientar enquanto o aplicativo está offline.
import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import { avisarErro, avisarSucesso } from "@/lib/avisos";

export default function RegistroPwa() {
  const [atualizacao, setAtualizacao] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let recarregando = false;
    // A primeira vez que o worker assume não recarrega a página: só uma
    // troca de versão depois de já haver controle pede recarga.
    let controladoAntes = false;
    async function registrar() {
      try {
        controladoAntes = Boolean(navigator.serviceWorker.controller);
        const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        registro.addEventListener("updatefound", () => {
          const novo = registro.installing;
          if (!novo) return;
          novo.addEventListener("statechange", () => {
            if (novo.state === "installed" && navigator.serviceWorker.controller) {
              setAtualizacao(novo);
            }
          });
        });
      } catch {
        // Sem service worker: o aplicativo segue funcionando online.
      }
    }

    function aoTrocarControlador() {
      if (recarregando || !controladoAntes || !navigator.serviceWorker.controller) return;
      recarregando = true;
      window.location.reload();
    }

    function aoFicarOnline() {
      avisarSucesso("Conexão de volta.", undefined, "pwa-online");
    }

    function aoFicarOffline() {
      avisarErro(new Error("Você está sem conexão."), {
        contexto: "Você está sem conexão.",
        descricao: "As marcações não salvas precisam de internet para sincronizar.",
        id: "pwa-offline",
      });
    }

    void registrar();
    navigator.serviceWorker.addEventListener("controllerchange", aoTrocarControlador);
    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarControlador);
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, []);

  function aplicarAtualizacao() {
    atualizacao?.postMessage({ tipo: "pular-espera" });
    setAtualizacao(null);
  }

  return (
    <Snackbar
      open={atualizacao !== null}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      onClose={() => setAtualizacao(null)}
    >
      <Alert
        severity="info"
        variant="standard"
        role="status"
        onClose={() => setAtualizacao(null)}
        action={
          <Button color="inherit" size="small" onClick={aplicarAtualizacao}>
            Atualizar
          </Button>
        }
        sx={{ width: "100%" }}
      >
        Versão nova do aplicativo disponível. Toque em Atualizar para recarregar.
      </Alert>
    </Snackbar>
  );
}
