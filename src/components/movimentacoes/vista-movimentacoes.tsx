"use client";

// Área compartilhada de saídas e entradas, em abas, com registros independentes.
// A aba ativa vai para a URL (?visao=saidas&aba=entradas) enquanto a área está aberta.
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import VistaSaidas from "./vista-saidas";
import VistaEntradas from "./vista-entradas";
import { Abas, type ItemAba } from "@/components/ui/mui/abas";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import DialogoEnvioSaidas, {
  useEstadoPlanilhaSaidas,
} from "@/components/movimentacoes/dialogo-envio-saidas";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

export type AbaMovimentacao = "saidas" | "entradas";

type Props = ComponentProps<typeof VistaSaidas> & {
  abaInicial?: AbaMovimentacao;
  onAbrirGestao?: () => void;
};

/** Grava a aba na URL sem criar entrada de histórico; sem argumento, limpa os parâmetros. */
function refletirNaUrl(aba: AbaMovimentacao | null) {
  try {
    const url = new URL(window.location.href);
    if (aba) {
      url.searchParams.set("visao", "saidas");
      url.searchParams.set("aba", aba);
    } else {
      url.searchParams.delete("visao");
      url.searchParams.delete("aba");
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Sem histórico disponível, a aba só deixa de constar no endereço.
  }
}

export default function VistaMovimentacoes({
  abaInicial = "saidas",
  onAbrirGestao,
  ...props
}: Props) {
  const [aba, setAba] = useState<AbaMovimentacao>(abaInicial);
  const { ativo } = props;

  useEffect(() => {
    if (!ativo) return;
    refletirNaUrl(aba);
    return () => refletirNaUrl(null);
  }, [ativo, aba]);

  const aoTrocar = useCallback((proxima: AbaMovimentacao) => setAba(proxima), []);

  // Um só botão ao lado das abas envia as saídas e as entradas do mês para a planilha.
  const [envioAberto, setEnvioAberto] = useState(false);
  const [mesEnvio, setMesEnvio] = useState(props.diaCorrente.slice(0, 7));
  const aoMesVisivel = useCallback(
    (novo: string) => {
      if (!envioAberto) setMesEnvio(novo);
    },
    [envioAberto],
  );
  const [atualizacao, setAtualizacao] = useState(0);
  const { estado: estadoPlanilha, recarregar: recarregarPlanilha } = useEstadoPlanilhaSaidas();
  useAtualizacaoTela("saidas", async () => {
    setAtualizacao((valor) => valor + 1);
    await Promise.all([recarregarPlanilha(), props.onSaidasMudaram(props.mes)]);
  });
  // A área é aquecida em segundo plano e pode montar antes de a planilha ser
  // configurada; ao ficar visível, o estado da integração é relido.
  useEffect(() => {
    if (ativo) void recarregarPlanilha();
  }, [ativo, recarregarPlanilha]);

  const itens: ItemAba<AbaMovimentacao>[] = [
    {
      valor: "saidas",
      rotulo: "Saídas",
      icone: <LogoutRoundedIcon fontSize="small" />,
      conteudo: (
        <VistaSaidas
          {...props}
          ativo={props.ativo && aba === "saidas"}
          atualizacao={atualizacao}
          onMesVisivel={aoMesVisivel}
        />
      ),
    },
    {
      valor: "entradas",
      rotulo: "Entradas",
      icone: <LoginRoundedIcon fontSize="small" />,
      conteudo: (
        <VistaEntradas
          diaCorrente={props.diaCorrente}
          fuso={props.fuso}
          ativo={props.ativo && aba === "entradas"}
          turmas={props.turmas}
          alunos={props.alunos}
          liberadores={props.liberadores}
          catalogoJustificativas={props.catalogoJustificativas}
          atualizacao={atualizacao}
        />
      ),
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
        <Botao
          type="button"
          variante="contorno"
          tamanho="pequeno"
          aria-label="Enviar saídas e entradas para a planilha"
          disabled={!estadoPlanilha?.podeEnviar}
          title={
            estadoPlanilha?.podeEnviar
              ? "Enviar as saídas e as entradas do mês para o Google Planilhas"
              : "Planilha não conectada. Configure em Gestão."
          }
          onClick={() => setEnvioAberto(true)}
          icone={<DescriptionRoundedIcon />}
        >
          <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
            Planilha
          </Box>
        </Botao>
      </Stack>
      <Abas
        rotuloAcessivel="Tipo de registro"
        itens={itens}
        ativo={aba}
        onChange={aoTrocar}
        variant="fullWidth"
        dataPager="movimentacoes"
      />
      <DialogoEnvioSaidas
        aberto={envioAberto}
        onAbrir={setEnvioAberto}
        mes={mesEnvio}
        onMes={setMesEnvio}
        modoCompleto={estadoPlanilha?.modo === "completo"}
        aoConcluir={() => void recarregarPlanilha()}
      />
      {estadoPlanilha && !estadoPlanilha.podeEnviar && (
        <AlertaCompacto
          variante="dados_invalidos"
          titulo="Planilha não conectada"
          descricao={onAbrirGestao ? undefined : "Configure na Gestão."}
          tamanho="linha"
          acao={
            onAbrirGestao ? { rotulo: "Configurar na Gestão", onClick: onAbrirGestao } : undefined
          }
        />
      )}
    </Stack>
  );
}
