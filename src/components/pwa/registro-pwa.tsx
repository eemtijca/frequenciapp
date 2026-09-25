"use client";

// Registro do service worker e aviso de atualização. Também detecta
// perda de conexão para orientar enquanto o aplicativo está offline.
import { useEffect } from "react";
import { toast } from "sonner";

export default function RegistroPwa() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let recarregando = false;
    async function registrar() {
      try {
        const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        registro.addEventListener("updatefound", () => {
          const novo = registro.installing;
          if (!novo) return;
          novo.addEventListener("statechange", () => {
            if (novo.state === "installed" && navigator.serviceWorker.controller) {
              toast("Versão nova do aplicativo disponível.", {
                description: "Toque em Atualizar para recarregar.",
                action: {
                  label: "Atualizar",
                  onClick: () => {
                    novo.postMessage({ tipo: "pular-espera" });
                  },
                },
              });
            }
          });
        });
      } catch {
        // Sem service worker: o aplicativo segue funcionando online.
      }
    }

    function aoTrocarControlador() {
      if (recarregando || !navigator.serviceWorker.controller) return;
      recarregando = true;
      window.location.reload();
    }

    function aoFicarOnline() {
      toast.success("Conexão de volta.");
    }

    function aoFicarOffline() {
      toast.warning(
        "Você está sem conexão. As marcações não salvas precisam de internet para sincronizar.",
      );
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

  return null;
}
