"use client";

// Conexão OAuth e seleção explícita da planilha pelo Google Picker.
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";

interface DocumentoEscolhido {
  id?: string;
}

interface RespostaPicker {
  action?: string;
  docs?: DocumentoEscolhido[];
}

interface JanelaPicker {
  setVisible(visivel: boolean): void;
}

interface ConstrutorPicker {
  setOAuthToken(token: string): ConstrutorPicker;
  setDeveloperKey(chave: string): ConstrutorPicker;
  setAppId(id: string): ConstrutorPicker;
  setOrigin(origem: string): ConstrutorPicker;
  addView(vista: VistaPicker): ConstrutorPicker;
  setCallback(callback: (resposta: RespostaPicker) => void): ConstrutorPicker;
  build(): JanelaPicker;
}

interface VistaPicker {
  setMode(modo: string): VistaPicker;
}

interface ApiPicker {
  PickerBuilder: new () => ConstrutorPicker;
  DocsView: new (id: string) => VistaPicker;
  DocsViewMode: { LIST: string };
  ViewId: { SPREADSHEETS: string };
  Action: { PICKED: string };
}

declare global {
  interface Window {
    gapi?: { load(nome: string, pronto: () => void): void };
    google?: { picker: ApiPicker };
  }
}

let carregamento: Promise<void> | null = null;

function carregarPicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (carregamento) return carregamento;
  carregamento = new Promise<void>((resolver, rejeitar) => {
    const carregarApi = () => {
      if (!window.gapi) {
        rejeitar(new Error("Biblioteca Google indisponível."));
        return;
      }
      window.gapi.load("picker", () => {
        if (window.google?.picker) resolver();
        else rejeitar(new Error("Seletor Google indisponível."));
      });
    };
    if (window.gapi) {
      carregarApi();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = carregarApi;
    script.onerror = () => rejeitar(new Error("Biblioteca Google indisponível."));
    document.head.append(script);
  }).catch((erro: unknown) => {
    carregamento = null;
    throw erro;
  });
  return carregamento;
}

export function SeletorPlanilhaGoogle({
  finalidade = "FREQUENCIA",
  conectado,
  planilha,
  mes,
  onAtualizar,
}: {
  finalidade?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  conectado: boolean;
  planilha: { id: string; nome: string | null } | null;
  mes?: string;
  onAtualizar: () => Promise<void> | void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const emAndamento = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const estado = url.searchParams.get("google");
    if (!estado) return;
    const finalidadeDoRetorno = url.searchParams.get("googleFinalidade");
    if (finalidadeDoRetorno && finalidadeDoRetorno !== finalidade) return;
    url.searchParams.delete("google");
    url.searchParams.delete("googleFinalidade");
    window.history.replaceState(null, "", url);
    if (estado === "conectado") toast.success("Conta Google conectada. Escolha a planilha.");
    else if (estado === "reconectado") toast.success("Conta Google reconectada.");
    else if (estado === "erro_reconexao")
      toast.error("Não foi possível reconectar. Confira a conta e o acesso à planilha.");
    else if (estado === "cancelado") toast.info("Conexão Google cancelada.");
    else if (estado === "sessao") toast.error("Entre novamente para conectar a conta Google.");
    else toast.error("Não foi possível conectar a conta Google.");
  }, [finalidade]);

  async function conectar(reconectar = false) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setOcupado(true);
    try {
      const dados = await pedir<{ url: string }>(
        "/api/planilha/google/iniciar",
        corpoJson({ finalidade, reconectar, ...(reconectar && mes ? { mes } : {}) }),
      );
      window.location.assign(dados.url);
    } catch (erro) {
      toast.error(erro instanceof ErroApi ? erro.message : "Não foi possível conectar ao Google.");
      setOcupado(false);
      emAndamento.current = false;
    }
  }

  async function escolher() {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setOcupado(true);
    try {
      const dados = await pedir<{
        acesso: string;
        pickerApiKey: string;
        projectNumber: string;
      }>(`/api/planilha/google/acesso?finalidade=${finalidade}`);
      await carregarPicker();
      const api = window.google?.picker;
      if (!api) throw new Error("Seletor Google indisponível.");
      const vista = new api.DocsView(api.ViewId.SPREADSHEETS).setMode(api.DocsViewMode.LIST);
      const picker = new api.PickerBuilder()
        .setOAuthToken(dados.acesso)
        .setDeveloperKey(dados.pickerApiKey)
        .setAppId(dados.projectNumber)
        .setOrigin(window.location.origin)
        .addView(vista)
        .setCallback((resposta) => {
          if (resposta.action !== api.Action.PICKED) {
            setOcupado(false);
            emAndamento.current = false;
            return;
          }
          const id = resposta.docs?.[0]?.id;
          if (!id) {
            setOcupado(false);
            emAndamento.current = false;
            toast.error("Nenhuma planilha foi escolhida.");
            return;
          }
          void (async () => {
            try {
              await pedir("/api/planilha/google/selecionar", corpoJson({ id, finalidade }));
              toast.success("Planilha escolhida. Confira a estrutura antes de enviar.");
              await onAtualizar();
            } catch (erro) {
              toast.error(
                erro instanceof ErroApi ? erro.message : "Não foi possível salvar a planilha.",
              );
            } finally {
              setOcupado(false);
              emAndamento.current = false;
            }
          })();
        })
        .build();
      picker.setVisible(true);
    } catch (erro) {
      toast.error(erro instanceof ErroApi ? erro.message : "Não foi possível abrir o seletor.");
      setOcupado(false);
      emAndamento.current = false;
    }
  }

  return (
    <div className="superficie-vidro flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">Conta Google</p>
      <p className="text-muted-foreground text-xs">
        Autorize a conta da escola e escolha a planilha. O acesso é limitado aos arquivos
        escolhidos.
      </p>
      {planilha && <p className="text-xs">Planilha escolhida: {planilha.nome ?? planilha.id}</p>}
      <div className="flex flex-wrap gap-2">
        {conectado && planilha && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void conectar(true)}
            disabled={ocupado}
          >
            {ocupado && <LoaderCircle size={14} className="animate-spin" />}
            Reconectar conta Google
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => void conectar()} disabled={ocupado}>
          {ocupado && <LoaderCircle size={14} className="animate-spin" />}
          {conectado ? "Trocar conta Google" : "Conectar conta Google"}
        </Button>
        {conectado && (
          <Button type="button" onClick={() => void escolher()} disabled={ocupado}>
            Escolher planilha
          </Button>
        )}
      </div>
    </div>
  );
}
