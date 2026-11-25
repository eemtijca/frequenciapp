"use client";

// Prévia do padrão visual de uma aba, com confirmação e ação única.
import { useId, useState } from "react";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ApresentacaoAba } from "@/domain/planilha-apresentacao";
import { CORES_PLANILHA } from "@/domain/planilha-apresentacao";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso, avisarInfo, mensagemAmigavel } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";

type PreviaAba = ApresentacaoAba & { planoHash: string };
type ConferenciaAba = { aba: string; previa?: PreviaAba; erro?: string };
type ResultadoAba = { aba: string; concluida: boolean; erro?: string };

const ESTILO_SOMENTE_LEITOR = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

function TabelaPrevia({
  previa,
  rotulo = "Prévia da apresentação",
}: {
  previa: PreviaAba;
  rotulo?: string;
}) {
  return (
    <TableContainer
      role="region"
      tabIndex={0}
      aria-label={rotulo}
      sx={(tema) => ({
        maxHeight: 192,
        overflow: "auto",
        border: `1px solid ${tema.vars.palette.divider}`,
        borderRadius: 2,
      })}
    >
      <Table
        size="small"
        sx={{
          width: previa.colunas.reduce((total, coluna) => total + coluna.largura, 0),
          tableLayout: "fixed",
          color: "#1f2937",
        }}
      >
        <caption style={ESTILO_SOMENTE_LEITOR}>
          Colunas reconhecidas e exemplo da organização visual
        </caption>
        <colgroup>
          {previa.colunas.map((coluna) => (
            <col key={coluna.indice} style={{ width: coluna.largura }} />
          ))}
        </colgroup>
        <TableHead
          sx={{
            backgroundColor: CORES_PLANILHA.cabecalho,
            color: CORES_PLANILHA.textoCabecalho,
          }}
        >
          <TableRow>
            {previa.colunas.map((coluna) => (
              <TableCell
                key={coluna.indice}
                component="th"
                scope="col"
                sx={{
                  height: 44,
                  paddingX: 1.5,
                  paddingY: 1,
                  color: "inherit",
                  fontWeight: 600,
                  textAlign: coluna.alinhamento === "CENTER" ? "center" : "left",
                  overflowWrap: "anywhere",
                  border: 0,
                }}
              >
                {coluna.rotulo}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {["Exemplo A", "Exemplo B"].map((nome, indice) => (
            <TableRow
              key={nome}
              sx={{
                backgroundColor:
                  indice === 0 ? CORES_PLANILHA.primeiraLinha : CORES_PLANILHA.segundaLinha,
              }}
            >
              {previa.colunas.map((coluna) => (
                <TableCell
                  key={coluna.indice}
                  sx={{
                    paddingX: 1.5,
                    paddingY: 1,
                    color: "inherit",
                    textAlign: coluna.alinhamento === "CENTER" ? "center" : "left",
                    overflowWrap: "anywhere",
                    border: 0,
                  }}
                >
                  {coluna.largura === 260 ? nome : "-"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function OrganizarPlanilha({
  rota,
  aba,
  disabled = false,
  ajustarCabecalho = false,
  onAtualizar,
  todasTurmas = false,
  abas = [],
  acoes,
}: {
  rota: string;
  aba: string;
  disabled?: boolean;
  ajustarCabecalho?: boolean;
  onAtualizar?: () => Promise<void>;
  todasTurmas?: boolean;
  abas?: string[];
  acoes?: ReturnType<typeof useAcoesPorChave>;
}) {
  const idAno = useId();
  const [anoReferencia, setAnoReferencia] = useState(new Date().getFullYear());
  const [conferencias, setConferencias] = useState<ConferenciaAba[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoAba[] | null>(null);
  const [andamento, setAndamento] = useState<{
    fase: string;
    atual: number;
    total: number;
    aba: string;
  } | null>(null);
  const acoesLocais = useAcoesPorChave();
  const { executar, chaveAtiva } = acoes ?? acoesLocais;
  const executando = chaveAtiva !== null;
  const previa = conferencias?.[0]?.previa;
  const alvo = todasTurmas ? "todas as turmas" : aba;
  const quantidadeProntas = conferencias?.filter((item) => item.previa).length ?? 0;
  const quantidadeConcluidas = resultados?.filter((item) => item.concluida).length ?? 0;
  function fechar() {
    setConferencias(null);
    setResultados(null);
  }
  function corpo(aba: string, planoHash?: string) {
    return {
      aba,
      ...(planoHash ? { planoHash } : {}),
      ...(ajustarCabecalho ? { ajustarCabecalho, anoReferencia } : {}),
      ...(todasTurmas ? { emLote: true } : {}),
    };
  }
  async function conferir() {
    await executar("apresentacao", async () => {
      const alvos = todasTurmas ? [...new Set(abas)] : [aba];
      const itens: ConferenciaAba[] = [];
      setResultados(null);
      try {
        for (const [indice, nome] of alvos.entries()) {
          setAndamento({ fase: "Conferindo", atual: indice + 1, total: alvos.length, aba: nome });
          try {
            const dados = await pedir<{ previa: PreviaAba }>(rota, corpoJson(corpo(nome)));
            itens.push({ aba: nome, previa: dados.previa });
          } catch (erro) {
            if (!todasTurmas) throw erro;
            itens.push({
              aba: nome,
              erro: mensagemAmigavel(erro, "Não foi possível conferir esta aba."),
            });
          }
        }
        setConferencias(itens);
      } catch (erro) {
        avisarErro(erro, { contexto: "Não foi possível conferir a apresentação da planilha." });
      } finally {
        setAndamento(null);
      }
    });
  }
  async function aplicar() {
    if (!conferencias || resultados) return;
    await executar("apresentacao", async () => {
      const saida: ResultadoAba[] = [];
      let atual = 0;
      try {
        for (const item of conferencias) {
          if (!item.previa) {
            saida.push({ aba: item.aba, concluida: false, erro: item.erro });
            continue;
          }
          atual += 1;
          setAndamento({ fase: "Aplicando", atual, total: quantidadeProntas, aba: item.aba });
          try {
            await pedir(rota, corpoJson(corpo(item.aba, item.previa.planoHash)));
            saida.push({ aba: item.aba, concluida: true });
          } catch (erro) {
            if (!todasTurmas) throw erro;
            saida.push({
              aba: item.aba,
              concluida: false,
              erro: mensagemAmigavel(
                erro,
                "Não foi possível confirmar o resultado. Confira a aba antes de tentar novamente.",
              ),
            });
          }
        }
        if (todasTurmas) {
          setResultados(saida);
          if (saida.every((item) => item.concluida))
            avisarSucesso(
              ajustarCabecalho
                ? "Cabeçalhos e datas das turmas corrigidos."
                : "Planilhas das turmas atualizadas.",
            );
          else
            avisarInfo(
              "Organização concluída com pendências.",
              "Confira o resultado de cada aba antes de outra tentativa.",
            );
        } else {
          fechar();
          avisarSucesso(
            ajustarCabecalho
              ? "Cabeçalho e datas corrigidos."
              : "Apresentação da planilha atualizada.",
          );
        }
        await onAtualizar?.();
      } catch (erro) {
        fechar();
        avisarErro(erro, {
          contexto: "Não foi possível organizar a planilha. Confira uma nova prévia.",
        });
      } finally {
        setAndamento(null);
      }
    });
  }
  return (
    <>
      {ajustarCabecalho ? (
        <Box sx={{ width: { xs: "100%", sm: 120 } }}>
          <Campo id={idAno} rotulo="Ano das datas sem ano">
            <CampoTexto
              id={idAno}
              valor={String(anoReferencia)}
              onValor={(valor) => setAnoReferencia(Number(valor))}
              inputMode="numeric"
              maxLength={4}
              disabled={executando || conferencias !== null}
              tamanho="pequeno"
            />
          </Campo>
        </Box>
      ) : null}
      <Botao
        type="button"
        variante="contorno"
        aria-label={`${ajustarCabecalho ? "Corrigir cabeçalho e datas de" : "Organizar apresentação de"} ${alvo}`}
        disabled={disabled || executando || (todasTurmas ? abas.length === 0 : !aba)}
        carregando={executando}
        onClick={() => void conferir()}
        sx={{ minWidth: 0, whiteSpace: "normal" }}
      >
        {executando
          ? "Conferindo..."
          : ajustarCabecalho
            ? "Corrigir cabeçalho e datas"
            : "Organizar apresentação"}
      </Botao>
      {andamento && !conferencias ? (
        <Typography role="status" variant="body2" sx={{ color: "text.secondary", width: "100%" }}>
          {andamento.fase} {andamento.atual} de {andamento.total}: {andamento.aba}
        </Typography>
      ) : null}
      <Dialogo
        aberto={conferencias !== null}
        onFechar={() => {
          if (!executando) fechar();
        }}
        titulo={
          resultados
            ? "Resultado da organização"
            : todasTurmas
              ? ajustarCabecalho
                ? "Corrigir cabeçalhos e datas de todas as turmas?"
                : "Organizar apresentação de todas as turmas?"
              : `${ajustarCabecalho ? "Corrigir cabeçalho e datas da aba" : "Organizar apresentação da aba"} ${previa?.aba ?? ""}?`
        }
        descricao={
          resultados ? (
            <>
              Concluídas: {quantidadeConcluidas} de {resultados.length}. Pendências:{" "}
              {resultados.length - quantidadeConcluidas}. As abas com pendências precisam de
              conferência antes de outra tentativa.
            </>
          ) : todasTurmas ? (
            <>
              Abas prontas: {quantidadeProntas} de {conferencias?.length ?? 0}. A confirmação
              processará cada aba em sequência.
              {ajustarCabecalho
                ? " Não haverá cópia automática; as chamadas e fórmulas da tabela serão preservadas."
                : " A aparência será substituída; valores, fórmulas e rótulos serão preservados."}{" "}
              As abas que não puderem ser conferidas ficarão fora da aplicação.
            </>
          ) : ajustarCabecalho ? (
            <>
              {(previa?.ajusteCabecalho?.linhasRemover ?? 0) === 1
                ? "Será retirada 1 linha"
                : `Serão retiradas ${previa?.ajusteCabecalho?.linhasRemover ?? 0} linhas`}{" "}
              de título, legenda ou espaço acima da tabela.
              {(previa?.ajusteCabecalho?.datas.length ?? 0) === 1
                ? "Será corrigida 1 data"
                : `Serão corrigidas ${previa?.ajusteCabecalho?.datas.length ?? 0} datas`}{" "}
              para dia/mês/ano. O cabeçalho Aluno e os dias permanecerão na primeira linha. Não
              haverá cópia automática. As chamadas e as fórmulas da tabela serão preservadas.
            </>
          ) : (
            <>
              Cabeçalho verde com texto branco e negrito, linhas alternadas, colunas ajustadas e
              quebra de texto. O cabeçalho da linha {previa?.cabecalhoLinha} ficará fixo durante a
              rolagem. A aparência anterior dessas colunas será substituída; valores, fórmulas e
              rótulos serão preservados.
            </>
          )
        }
        tamanho="grande"
      >
        <Stack spacing={2}>
          {andamento ? (
            <Typography role="status" variant="body2">
              {andamento.fase} {andamento.atual} de {andamento.total}: {andamento.aba}
            </Typography>
          ) : null}
          {resultados ? (
            <Box
              component="ul"
              aria-label="Resultado por aba"
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
                  key={item.aba}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 2, padding: 2 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, display: "block" }}>
                    {item.aba}
                  </Typography>
                  {item.concluida ? (
                    <Typography variant="caption">Concluída</Typography>
                  ) : (
                    <>
                      <Typography variant="caption">Confira a aba</Typography>
                      <Typography
                        variant="caption"
                        sx={{ display: "block", color: "text.secondary" }}
                      >
                        {item.erro}
                      </Typography>
                    </>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Prévia com dados fictícios. Role para conferir as colunas.
              </Typography>
              {todasTurmas ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  {conferencias?.map((item, indice) => (
                    <Box
                      key={item.aba}
                      sx={(tema) => ({
                        minWidth: 0,
                        padding: 2,
                        borderRadius: 2,
                        backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 5%, transparent)`,
                      })}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.aba}: {item.previa ? "Pronta" : "Não será alterada"}
                      </Typography>
                      {indice === 0 || item.previa ? (
                        item.previa ? (
                          <Box
                            sx={{ marginTop: 1, display: "flex", flexDirection: "column", gap: 1 }}
                          >
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              {ajustarCabecalho
                                ? `Linhas a retirar: ${item.previa.ajusteCabecalho?.linhasRemover ?? 0}. Datas a corrigir: ${item.previa.ajusteCabecalho?.datas.length ?? 0}.`
                                : `Cabeçalho na linha ${item.previa.cabecalhoLinha}.`}
                            </Typography>
                            <TabelaPrevia
                              previa={item.previa}
                              rotulo={`Prévia da apresentação de ${item.aba}`}
                            />
                          </Box>
                        ) : (
                          <Typography
                            variant="body2"
                            sx={{ marginTop: 1, color: "text.secondary" }}
                          >
                            {item.erro}
                          </Typography>
                        )
                      ) : null}
                    </Box>
                  ))}
                </Box>
              ) : previa ? (
                <TabelaPrevia previa={previa} />
              ) : null}
            </>
          )}
          <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <Botao
              type="button"
              variante="contorno"
              disabled={executando}
              onClick={() => {
                if (!executando) fechar();
              }}
            >
              {resultados ? "Fechar" : "Cancelar"}
            </Botao>
            {!resultados ? (
              <Botao
                type="button"
                variante="secundario"
                disabled={executando || quantidadeProntas === 0}
                carregando={executando}
                onClick={() => void aplicar()}
              >
                {executando
                  ? "Aplicando..."
                  : ajustarCabecalho
                    ? "Aplicar correção"
                    : "Aplicar apresentação"}
              </Botao>
            ) : null}
          </Stack>
        </Stack>
      </Dialogo>
    </>
  );
}
