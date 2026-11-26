"use client";

// Prepara as abas mensais das turmas em sequência, com confirmação e resultado por turma.
import { useState } from "react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { rotuloMes } from "@/domain/frequencia";
import { nomeAbaMensal } from "@/domain/planilha-mensal";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { mensagemAmigavel, useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface ResultadoTurma {
  turmaOriginalId: string;
  rotulo: string;
  estado: "preparada" | "pendente" | "erro";
  aba?: string;
  criada?: boolean;
  atualizada?: boolean;
  erro?: string;
}

interface Interrupcao {
  mensagem: string;
  reconectar: boolean;
}

function interrupcaoDoPreparo(erro: unknown): Interrupcao | null {
  if (!(erro instanceof ErroApi)) return null;
  const corpo = erro.corpo;
  const codigo =
    typeof corpo === "object" && corpo !== null && "codigo" in corpo ? corpo.codigo : null;
  if (
    codigo === "GOOGLE_RECONECTAR" ||
    codigo === "GOOGLE_ACESSO" ||
    codigo === "GOOGLE_CONFIGURACAO" ||
    codigo === "GOOGLE_TEMPORARIO" ||
    erro.status === 401
  ) {
    return {
      mensagem: erro.message,
      reconectar: codigo === "GOOGLE_RECONECTAR" || codigo === "GOOGLE_ACESSO",
    };
  }
  return null;
}

export function DialogoPrepararMes({
  turmas,
  mes,
  onMes,
  mesMaximo,
  disabled,
  onAtualizar,
}: {
  turmas: { id: string; rotulo: string }[];
  mes: string;
  onMes: (mes: string) => void;
  mesMaximo: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const { avisarInfo, avisarSucesso } = useAvisosDaSessao();
  const [aberto, setAberto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoTurma[] | null>(null);
  const [turmaAtual, setTurmaAtual] = useState("");
  const [interrupcao, setInterrupcao] = useState<Interrupcao | null>(null);

  const reconexao = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ url: string }>(
        "/api/planilha/google/iniciar",
        corpoJson({ finalidade: "FREQUENCIA", reconectar: true, mes }),
      );
      window.location.assign(dados.url);
    } catch (erro) {
      setInterrupcao({
        mensagem: mensagemAmigavel(erro, "Não foi possível conectar ao Google. Tente novamente."),
        reconectar: true,
      });
    }
  });

  const { executando, executar } = useAcaoUnica(async () => {
    if (turmas.length === 0 || reconexao.executando) return;
    const saida: ResultadoTurma[] = turmas.map((turma) => {
      const anterior = resultados?.find((item) => item.turmaOriginalId === turma.id);
      return anterior?.estado === "preparada"
        ? anterior
        : { turmaOriginalId: turma.id, rotulo: turma.rotulo, estado: "pendente" };
    });
    setResultados([...saida]);
    setInterrupcao(null);
    let interrompida = false;
    try {
      for (const [indice, turma] of turmas.entries()) {
        if (saida[indice]?.estado === "preparada") continue;
        setTurmaAtual(turma.rotulo);
        try {
          const dados = await pedir<{
            aba: string;
            mes: string;
            criada: boolean;
            atualizada: boolean;
          }>("/api/planilha/mensal", corpoJson({ turmaOriginalId: turma.id, mes }));
          saida[indice] = {
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            estado: "preparada",
            aba: dados.aba,
            criada: dados.criada,
            atualizada: dados.atualizada,
          };
        } catch (erro) {
          const falhaComum = interrupcaoDoPreparo(erro);
          if (falhaComum) {
            // As demais turmas usam a mesma conexão; repetir só multiplicaria a falha.
            setInterrupcao(falhaComum);
            interrompida = true;
            setResultados([...saida]);
            break;
          }
          saida[indice] = {
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            estado: "erro",
            erro: mensagemAmigavel(erro, "Não foi possível preparar a aba. Tente novamente."),
          };
        }
        setResultados([...saida]);
      }
      if (saida.every((item) => item.estado === "preparada")) {
        let avisoIndice: string | undefined;
        try {
          const acesso = await pedir<{ avisoIndice?: string }>(
            "/api/planilha/mensal/visibilidade",
            corpoJson({ mes }),
          );
          avisoIndice = acesso.avisoIndice;
        } catch (erro) {
          setInterrupcao({
            mensagem: mensagemAmigavel(
              erro,
              "As abas estão preparadas, mas o acesso não foi confirmado. Use Meses da frequência para conferir.",
            ),
            reconectar: interrupcaoDoPreparo(erro)?.reconectar ?? false,
          });
          await onAtualizar();
          return;
        }
        if (avisoIndice) avisarInfo("Chamadas preparadas.", avisoIndice);
        else avisarSucesso(`Abas de ${rotuloMes(mes).toLowerCase()} preparadas.`);
      } else if (!interrompida) {
        avisarInfo("Há turmas pendentes.", "Confira o resultado de cada turma.");
      }
      await onAtualizar();
    } finally {
      setTurmaAtual("");
    }
  });
  const concluidas = resultados?.filter((item) => item.estado === "preparada").length ?? 0;
  const ocupada = executando || reconexao.executando;

  function fechar() {
    if (ocupada) return;
    setAberto(false);
  }

  return (
    <>
      <Botao
        type="button"
        variante="contorno"
        disabled={disabled || ocupada || turmas.length === 0}
        icone={<CalendarMonthRoundedIcon />}
        sx={{ minWidth: 0, whiteSpace: "normal" }}
        onClick={() => {
          setResultados(null);
          setInterrupcao(null);
          setAberto(true);
        }}
      >
        Preparar mês
      </Botao>
      <Dialogo
        aberto={aberto}
        onFechar={fechar}
        titulo={resultados === null ? "Preparar mês para todas as turmas" : "Abas do mês"}
        descricao={
          resultados === null
            ? "Organiza as abas do mês, preservando dias úteis e sábados com chamada salva. Retira Turma atual, domingos e sábados sem chamada. Os meses mais recentes ficam primeiro."
            : `${concluidas} de ${turmas.length} turmas prontas para ${rotuloMes(mes).toLowerCase()}.`
        }
        tamanho="grande"
      >
        <Stack spacing={2}>
          {interrupcao ? (
            <AlertaCompacto
              variante="dados_invalidos"
              titulo="Interrupção na preparação"
              descricao={interrupcao.mensagem}
              tamanho="linha"
              acao={
                interrupcao.reconectar
                  ? {
                      rotulo: reconexao.executando ? "Reconectando..." : "Reconectar conta Google",
                      onClick: () => void reconexao.executar(),
                    }
                  : undefined
              }
            />
          ) : null}
          {resultados === null ? (
            <>
              <SeletorPeriodo
                id="planilha-mes-preparar"
                modo="mes"
                valor={mes}
                max={mesMaximo}
                rotuloAcessivel="Mês das novas abas"
                rotulo={rotuloMes(mes)}
                onValor={onMes}
              />
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Exemplo: {nomeAbaMensal(turmas[0]?.rotulo ?? "1º A", mes)}. Para incluir chamadas já
                salvas, use o envio com prévia.
              </Typography>
            </>
          ) : (
            <Box
              component="ul"
              aria-label="Resultado da preparação por turma"
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                margin: 0,
                padding: 0,
                listStyle: "none",
              }}
            >
              {resultados.map((item) => (
                <Box
                  component="li"
                  key={item.turmaOriginalId}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 2, padding: 2 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, display: "block" }}>
                    {item.aba ?? item.rotulo}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: item.erro ? "error" : "text.secondary" }}
                  >
                    {item.estado === "pendente"
                      ? "Não preparada"
                      : (item.erro ??
                        (item.criada ? "Criada" : item.atualizada ? "Atualizada" : "Reutilizada"))}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          {executando ? (
            <Stack role="status" direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2">Preparando {turmaAtual}</Typography>
            </Stack>
          ) : null}
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao type="button" variante="contorno" disabled={ocupada} onClick={fechar}>
              {resultados === null ? "Cancelar" : "Fechar"}
            </Botao>
            {resultados === null || concluidas < turmas.length ? (
              <Botao
                type="button"
                variante="secundario"
                disabled={disabled || ocupada || turmas.length === 0}
                carregando={executando}
                icone={<RestartAltRoundedIcon />}
                onClick={() => void executar()}
              >
                {resultados === null ? `Preparar ${turmas.length} turmas` : "Tentar pendentes"}
              </Botao>
            ) : null}
          </Stack>
        </Stack>
      </Dialogo>
    </>
  );
}
