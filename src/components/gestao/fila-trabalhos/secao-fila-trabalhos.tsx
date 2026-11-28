"use client";

// Fila genérica de trabalhos: contagens, itens recentes e ações administrativas.
import { useCallback, useEffect, useState } from "react";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ContagensDeTrabalhos, TrabalhoResumo } from "@/application/fila-trabalhos";
import type { EstadoTrabalho, TipoTrabalho } from "@/domain/trabalho";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selo, type TomSelo } from "@/components/ui/mui/selo";

const ATUALIZAR_A_CADA_MS = 15_000;

const ROTULO_TIPO: Record<TipoTrabalho, string> = {
  INDICADORES_ATUALIZAR: "Indicadores",
  PLANILHA_MENSAL_PREPARAR: "Preparação mensal",
  EXPURGO_TRABALHOS: "Expurgo",
};

const ROTULO_ESTADO: Record<EstadoTrabalho, string> = {
  PENDENTE: "Pendente",
  DISPONIVEL: "Disponível",
  EM_EXECUCAO: "Em execução",
  AGUARDANDO: "Aguardando nova tentativa",
  CONCLUIDO: "Concluído",
  FALHOU: "Falhou",
  CONFERENCIA: "Conferência",
  CANCELADO: "Cancelado",
};

const TOM_ESTADO: Record<EstadoTrabalho, TomSelo> = {
  PENDENTE: "neutro",
  DISPONIVEL: "neutro",
  EM_EXECUCAO: "atencao",
  AGUARDANDO: "atencao",
  CONCLUIDO: "sucesso",
  FALHOU: "perigo",
  CONFERENCIA: "atencao",
  CANCELADO: "neutro",
};

const ESTADOS_ABERTOS: EstadoTrabalho[] = [
  "PENDENTE",
  "DISPONIVEL",
  "EM_EXECUCAO",
  "AGUARDANDO",
  "CONFERENCIA",
];

function horaLocal(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface Resposta {
  itens: TrabalhoResumo[];
  total: number;
  contagens: ContagensDeTrabalhos;
}

type DecisaoDeConferencia = "concluido" | "falhou";

export default function SecaoFilaTrabalhos() {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [resolucao, setResolucao] = useState<{
    item: TrabalhoResumo;
    decisao: DecisaoDeConferencia;
  } | null>(null);
  const { chaveAtiva, executar } = useAcoesPorChave();
  const [recarga, setRecarga] = useState(0);

  const carregar = useCallback(() => setRecarga((valor) => valor + 1), []);

  useEffect(() => {
    const controlador = new AbortController();
    pedir<Resposta>("/api/trabalhos?limite=20", { signal: controlador.signal })
      .then((resposta) => {
        if (controlador.signal.aborted) return;
        setDados(resposta);
        setErro("");
      })
      .catch(() => {
        if (!controlador.signal.aborted) setErro("Não foi possível ler a fila de processamento.");
      });
    return () => controlador.abort();
  }, [recarga]);

  useEffect(() => {
    if (!aberto) return;
    const intervalo = setInterval(carregar, ATUALIZAR_A_CADA_MS);
    return () => clearInterval(intervalo);
  }, [aberto, carregar]);

  const abertos = dados
    ? ESTADOS_ABERTOS.reduce((total, estado) => total + dados.contagens[estado], 0)
    : 0;
  const falhos = dados?.contagens.FALHOU ?? 0;
  const conferencias = dados?.contagens.CONFERENCIA ?? 0;

  function dispararIndicadores() {
    void executar("indicadores", async () => {
      try {
        await pedir("/api/trabalhos/indicadores", corpoJson({}));
        avisarSucesso("Indicadores enfileirados.", "O worker processa o trabalho em instantes.");
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível enfileirar os indicadores." });
      }
    });
  }

  function agir(item: TrabalhoResumo, acao: "reenfileirar" | "cancelar") {
    void executar(`${acao}:${item.id}`, async () => {
      try {
        await pedir(`/api/trabalhos/${item.id}/${acao}`, corpoJson({}));
        avisarSucesso(acao === "reenfileirar" ? "Trabalho reenfileirado." : "Trabalho cancelado.");
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível concluir a ação." });
      }
    });
  }

  function resolver(item: TrabalhoResumo, decisao: DecisaoDeConferencia) {
    void executar(`resolver:${item.id}`, async () => {
      try {
        await pedir(`/api/trabalhos/${item.id}/resolver`, corpoJson({ decisao }));
        setResolucao(null);
        avisarSucesso(
          decisao === "concluido" ? "Conferência concluída." : "Conferência encerrada com falha.",
        );
        carregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível resolver a conferência." });
      }
    });
  }

  return (
    <Box data-secao="fila-trabalhos">
      <Acordeao
        titulo="Fila de processamento"
        resumo={
          <>
            <Selo
              tom={
                erro
                  ? "perigo"
                  : !dados
                    ? "neutro"
                    : abertos + conferencias > 0
                      ? "atencao"
                      : "sucesso"
              }
            >
              {erro
                ? "Falha ao consultar"
                : !dados
                  ? "Conferindo..."
                  : abertos > 0
                    ? `${abertos} em aberto`
                    : "Fila vazia"}
            </Selo>
            {conferencias > 0 ? <Selo tom="atencao">{conferencias} para conferir</Selo> : null}
            {falhos > 0 ? <Selo tom="perigo">{falhos} com falha</Selo> : null}
          </>
        }
        aberto={aberto}
        onChange={setAberto}
      >
        <Stack spacing={2}>
          {erro ? (
            <AlertaCompacto variante="indisponivel" descricao={erro} tamanho="linha" />
          ) : null}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              disabled={chaveAtiva === "indicadores"}
              carregando={chaveAtiva === "indicadores"}
              icone={<PlayArrowRoundedIcon />}
              onClick={dispararIndicadores}
            >
              Atualizar indicadores
            </Botao>
            <Botao type="button" variante="texto" icone={<RefreshRoundedIcon />} onClick={carregar}>
              Atualizar fila
            </Botao>
          </Stack>
          {dados ? (
            <CaixasDeInfo
              rotulo="Trabalhos por estado"
              itens={(Object.keys(ROTULO_ESTADO) as EstadoTrabalho[]).map(
                (estado) => `${ROTULO_ESTADO[estado]}: ${dados.contagens[estado]}`,
              )}
            />
          ) : null}
          {dados && dados.itens.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Nenhum trabalho recente.
            </Typography>
          ) : (
            <Box
              component="ul"
              aria-label="Trabalhos recentes"
              sx={{
                display: "flex",
                flexDirection: "column",
                margin: 0,
                padding: 0,
                listStyle: "none",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              {dados?.itens.map((item) => (
                <Box
                  component="li"
                  key={item.id}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    gap: 1,
                    justifyContent: "space-between",
                    p: 1.5,
                    borderBottom: 1,
                    borderColor: "divider",
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", flexWrap: "wrap" }}
                    >
                      <Typography variant="subtitle2">{ROTULO_TIPO[item.tipo]}</Typography>
                      <Selo tom={TOM_ESTADO[item.estado]}>{ROTULO_ESTADO[item.estado]}</Selo>
                      {item.erroDespacho &&
                      (item.estado === "PENDENTE" || item.estado === "AGUARDANDO") ? (
                        <Selo tom="atencao">Aguardando publicação</Selo>
                      ) : null}
                    </Stack>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Criado em {horaLocal(item.criadoEm)}
                      {item.tentativas > 0
                        ? `, ${item.tentativas} de ${item.maxTentativas} tentativas`
                        : ""}
                      {item.resultado ? `, resultado ${item.resultado}` : ""}
                    </Typography>
                    {item.erroResumo ? (
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {item.erroResumo}
                      </Typography>
                    ) : null}
                    {item.erroDespacho ? (
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {item.erroDespacho}
                      </Typography>
                    ) : null}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "center" }}>
                    {item.estado === "CONFERENCIA" ? (
                      <>
                        <Botao
                          type="button"
                          variante="contorno"
                          icone={<CheckCircleOutlineRoundedIcon />}
                          disabled={chaveAtiva === `resolver:${item.id}`}
                          onClick={() => setResolucao({ item, decisao: "concluido" })}
                        >
                          Concluir
                        </Botao>
                        <Botao
                          type="button"
                          variante="texto"
                          icone={<StopCircleOutlinedIcon />}
                          disabled={chaveAtiva === `resolver:${item.id}`}
                          onClick={() => setResolucao({ item, decisao: "falhou" })}
                        >
                          Marcar falha
                        </Botao>
                      </>
                    ) : null}
                    {item.estado === "FALHOU" || item.estado === "CANCELADO" ? (
                      <Botao
                        type="button"
                        variante="texto"
                        icone={<ReplayRoundedIcon />}
                        disabled={chaveAtiva === `reenfileirar:${item.id}`}
                        onClick={() => agir(item, "reenfileirar")}
                      >
                        Reenfileirar
                      </Botao>
                    ) : null}
                    {["PENDENTE", "DISPONIVEL", "AGUARDANDO"].includes(item.estado) ? (
                      <Botao
                        type="button"
                        variante="texto"
                        icone={<StopCircleOutlinedIcon />}
                        disabled={chaveAtiva === `cancelar:${item.id}`}
                        onClick={() => agir(item, "cancelar")}
                      >
                        Cancelar
                      </Botao>
                    ) : null}
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            O PostgreSQL guarda a intenção e o resultado. O Redis apenas transporta o trabalho.
            Nenhum nome de aluno entra nesta fila.
          </Typography>
        </Stack>
      </Acordeao>
      <DialogoConfirmacao
        aberto={resolucao !== null}
        titulo={
          resolucao?.decisao === "concluido"
            ? "Concluir a conferência"
            : "Encerrar a conferência com falha"
        }
        descricao={
          resolucao?.decisao === "concluido"
            ? "Confirme apenas depois de verificar o destino. O trabalho não será reenviado."
            : "O trabalho será encerrado sem nova tentativa e a chave voltará a aceitar um pedido novo."
        }
        rotuloConfirmar={resolucao?.decisao === "concluido" ? "Concluir" : "Marcar falha"}
        destrutivo={resolucao?.decisao === "falhou"}
        operacaoEmAndamento={resolucao !== null && chaveAtiva === `resolver:${resolucao.item.id}`}
        onConfirmar={() => {
          if (resolucao) resolver(resolucao.item, resolucao.decisao);
        }}
        onCancelar={() => setResolucao(null)}
      />
    </Box>
  );
}
