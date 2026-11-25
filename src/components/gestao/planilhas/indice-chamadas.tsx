"use client";

// Criação e acesso ao índice das chamadas em um documento do Google Docs.
import { useEffect, useState } from "react";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { TOKENS_LAYOUT } from "@/theme/layout";

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
    <Box
      component="section"
      aria-label="Índice das chamadas"
      sx={(tema) => ({
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: 2,
        border: `1px solid ${tema.vars.palette.divider}`,
        borderRadius: 2,
        minWidth: 0,
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <DescriptionRoundedIcon fontSize="small" aria-hidden="true" />
        <Typography variant="subtitle2">Índice das chamadas</Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        Google Docs com links por mês e turma.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
        {estado?.url ? (
          <Link
            href={estado.url}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            sx={{ display: "inline-flex", alignItems: "center", gap: 1, minHeight: 48 }}
          >
            <LaunchRoundedIcon fontSize="small" aria-hidden="true" />
            Abrir índice
          </Link>
        ) : null}
        {!estado?.pendente ? (
          <Botao
            type="button"
            variante="contorno"
            disabled={ocupado || (!estado && !mensagem)}
            onClick={() => void executar()}
            aria-label={estado?.url ? "Atualizar índice" : undefined}
            carregando={executando}
            icone={<RefreshRoundedIcon />}
          >
            {estado?.url
              ? "Atualizar índice"
              : !estado && mensagem
                ? "Tentar de novo"
                : "Criar índice"}
          </Botao>
        ) : null}
      </Stack>
      {estado?.pendente ? (
        <Stack spacing={1}>
          {confirmarCriacao ? (
            <>
              <Typography variant="body2">
                Uma nova tentativa pode criar outro documento no Drive.
              </Typography>
              <Botao
                type="button"
                variante="secundario"
                disabled={ocupado}
                onClick={() => void executar()}
                sx={{ alignSelf: "flex-start" }}
              >
                Criar outro índice
              </Botao>
              <Botao
                type="button"
                variante="contorno"
                disabled={ocupado}
                onClick={() => setConfirmarCriacao(false)}
                sx={{ alignSelf: "flex-start" }}
              >
                Cancelar
              </Botao>
            </>
          ) : (
            <>
              <Typography variant="body2">
                Localize o índice no Google Drive para recuperar a criação anterior.
              </Typography>
              <Campo id="indice-documento-url" rotulo="Link do documento">
                <CampoTexto
                  id="indice-documento-url"
                  tipo="url"
                  valor={documentoUrl}
                  onValor={setDocumentoUrl}
                  disabled={ocupado}
                />
              </Campo>
              <Botao
                type="button"
                variante="contorno"
                disabled={ocupado || !documentoUrl}
                onClick={() => void executar()}
                sx={{ alignSelf: "flex-start" }}
              >
                Recuperar índice
              </Botao>
              <Botao
                type="button"
                variante="texto"
                disabled={ocupado}
                onClick={() => setConfirmarCriacao(true)}
                sx={{ alignSelf: "flex-start", minHeight: TOKENS_LAYOUT.alvoToque }}
              >
                Não encontrei o documento
              </Botao>
            </>
          )}
        </Stack>
      ) : null}
      {mensagem ? (
        <Typography role="status" variant="body2">
          {mensagem}
        </Typography>
      ) : null}
    </Box>
  );
}
