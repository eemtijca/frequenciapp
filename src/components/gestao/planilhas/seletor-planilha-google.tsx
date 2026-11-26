"use client";

// Conexão OAuth e seleção explícita da planilha pelo Google Picker.
import { useEffect, useRef, useState } from "react";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";

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
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
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
    if (estado === "conectado") avisarSucesso("Conta Google conectada. Escolha a planilha.");
    else if (estado === "reconectado") avisarSucesso("Conta Google reconectada.");
    else if (estado === "erro_reconexao")
      avisarErro(new Error("Não foi possível reconectar."), {
        contexto: "Não foi possível reconectar.",
        descricao: "Confira a conta e o acesso à planilha.",
      });
    else if (estado === "cancelado") avisarInfo("Conexão Google cancelada.");
    else if (estado === "sessao")
      avisarErro(new Error("Sessão expirada."), {
        contexto: "Entre novamente para conectar a conta Google.",
      });
    else
      avisarErro(new Error("Falha na conexão Google."), {
        contexto: "Não foi possível conectar a conta Google.",
      });
  }, [avisarErro, avisarInfo, avisarSucesso, finalidade]);

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
      avisarErro(erro, {
        contexto: erro instanceof ErroApi ? erro.message : "Não foi possível conectar ao Google.",
      });
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
            avisarErro(new Error("Nenhuma planilha escolhida."), {
              contexto: "Nenhuma planilha foi escolhida.",
            });
            return;
          }
          void (async () => {
            try {
              await pedir("/api/planilha/google/selecionar", corpoJson({ id, finalidade }));
              avisarSucesso("Planilha escolhida. Confira a estrutura antes de enviar.");
              await onAtualizar();
            } catch (erro) {
              avisarErro(erro, {
                contexto:
                  erro instanceof ErroApi ? erro.message : "Não foi possível salvar a planilha.",
              });
            } finally {
              setOcupado(false);
              emAndamento.current = false;
            }
          })();
        })
        .build();
      picker.setVisible(true);
    } catch (erro) {
      avisarErro(erro, {
        contexto: erro instanceof ErroApi ? erro.message : "Não foi possível abrir o seletor.",
      });
      setOcupado(false);
      emAndamento.current = false;
    }
  }

  return (
    <Box
      sx={(tema) => ({
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 2,
        border: `1px solid ${tema.vars.palette.divider}`,
        borderRadius: 2,
        minWidth: 0,
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <GridOnRoundedIcon color="primary" aria-hidden="true" />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
            {planilha ? (planilha.nome ?? "Planilha selecionada") : "Nenhuma planilha escolhida"}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {conectado ? "Conta Google conectada" : "Conecte a conta Google da escola."}
          </Typography>
        </Box>
        {planilha ? (
          <Link
            href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(planilha.id)}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            aria-label="Abrir planilha no Google"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              minHeight: 48,
              flexShrink: 0,
            }}
          >
            <LaunchRoundedIcon fontSize="small" aria-hidden="true" />
            Abrir
          </Link>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        {conectado ? (
          <Botao
            type="button"
            variante="primario"
            onClick={() => void escolher()}
            disabled={ocupado}
            carregando={ocupado}
            icone={<FolderOpenRoundedIcon />}
          >
            Escolher planilha
          </Botao>
        ) : (
          <Botao
            type="button"
            variante="primario"
            onClick={() => void conectar()}
            disabled={ocupado}
            carregando={ocupado}
            icone={<LinkRoundedIcon />}
          >
            Conectar conta Google
          </Botao>
        )}
        {conectado && planilha ? (
          <Botao
            type="button"
            variante="contorno"
            onClick={() => void conectar(true)}
            disabled={ocupado}
            icone={<RefreshRoundedIcon />}
          >
            Reconectar conta Google
          </Botao>
        ) : null}
      </Stack>
      <Acordeao
        titulo="Conta e acesso"
        nivelTitulo="h4"
        resumo={
          <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
            O acesso é limitado aos arquivos escolhidos.
          </Typography>
        }
      >
        <Stack spacing={1}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            O acesso é limitado aos arquivos escolhidos.
          </Typography>
          {conectado ? (
            <Botao
              type="button"
              variante="contorno"
              onClick={() => void conectar()}
              disabled={ocupado}
              icone={<AccountCircleRoundedIcon />}
              sx={{ alignSelf: "flex-start" }}
            >
              Trocar conta Google
            </Botao>
          ) : null}
        </Stack>
      </Acordeao>
    </Box>
  );
}
