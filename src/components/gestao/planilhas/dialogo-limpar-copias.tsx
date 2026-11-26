"use client";

// Limpeza das abas antigas de backup, com prévia, senha e proteção contra toque duplo.
import { useState } from "react";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { FRASE_MODO_COMPLETO } from "@/domain/planilha";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";

type Previa = { copias: string[]; planoHash: string };

export function LimparCopiasPlanilha({
  urlBase,
  onMudou,
  acoes,
}: {
  urlBase: string;
  onMudou: () => Promise<void> | void;
  acoes: ReturnType<typeof useAcoesPorChave>;
}) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [senha, setSenha] = useState("");
  const [frase, setFrase] = useState("");
  const ocupado = acoes.chaveAtiva !== null;
  function fechar() {
    setPrevia(null);
    setSenha("");
    setFrase("");
  }
  async function conferir() {
    await acoes.executar("limpar-copias", async () => {
      try {
        const dados = await pedir<{ previa: Previa }>(`${urlBase}/limpar-copias`, corpoJson({}));
        if (!dados.previa.copias.length) avisarInfo("Nenhuma aba de backup para remover.");
        else setPrevia(dados.previa);
      } catch (erro) {
        avisarErro(erro, { contexto: "Não foi possível conferir as abas de backup." });
      }
    });
  }
  async function remover() {
    if (!previa) return;
    await acoes.executar("limpar-copias", async () => {
      try {
        const dados = await pedir<{ removidas: number }>(
          `${urlBase}/limpar-copias`,
          corpoJson({ planoHash: previa.planoHash, senha, frase }),
        );
        fechar();
        avisarSucesso(`${dados.removidas} abas de backup removidas.`);
        await onMudou();
      } catch (erro) {
        fechar();
        avisarErro(erro, { contexto: "Confira a planilha antes de tentar a limpeza novamente." });
      }
    });
  }
  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        disabled={ocupado}
        carregando={acoes.chaveAtiva === "limpar-copias"}
        onClick={() => void conferir()}
      >
        Remover abas de backup
      </Botao>
      <Dialogo
        aberto={previa !== null}
        onFechar={() => {
          if (!ocupado) fechar();
        }}
        titulo="Remover abas de backup"
        tamanho="medio"
      >
        <Stack spacing={2}>
          <Typography variant="body2">
            {previa?.copias.length} cópias antigas serão apagadas definitivamente. As abas das
            turmas serão preservadas. Essas cópias deixarão de estar disponíveis para restauração.
          </Typography>
          <Box
            component="ul"
            aria-label="Abas de backup que serão removidas"
            sx={{
              maxHeight: 128,
              overflow: "auto",
              margin: 0,
              paddingLeft: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {previa?.copias.map((nome) => (
              <Typography
                component="li"
                key={nome}
                variant="caption"
                sx={{ overflowWrap: "anywhere" }}
              >
                {nome}
              </Typography>
            ))}
          </Box>
          <Campo id={`${urlBase}-limpar-frase`} rotulo={`Digite ${FRASE_MODO_COMPLETO}`}>
            <CampoTexto
              id={`${urlBase}-limpar-frase`}
              valor={frase}
              onValor={setFrase}
              disabled={ocupado}
              autoComplete="off"
            />
          </Campo>
          <Campo id={`${urlBase}-limpar-senha`} rotulo="Senha do administrador">
            <CampoSenha
              id={`${urlBase}-limpar-senha`}
              valor={senha}
              onValor={setSenha}
              disabled={ocupado}
              autoComplete="current-password"
            />
          </Campo>
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao type="button" variante="contorno" disabled={ocupado} onClick={fechar}>
              Cancelar
            </Botao>
            <Botao
              type="button"
              variante="destrutivo"
              disabled={ocupado || !senha || frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO}
              carregando={ocupado}
              onClick={() => void remover()}
            >
              Remover cópias
            </Botao>
          </Stack>
        </Stack>
      </Dialogo>
    </>
  );
}
