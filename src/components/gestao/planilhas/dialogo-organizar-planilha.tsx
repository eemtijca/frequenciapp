"use client";

// Prévia do padrão visual de uma aba, com confirmação e ação única.
import { useState } from "react";
import type { ApresentacaoAba } from "@/domain/planilha-apresentacao";
import { CORES_PLANILHA } from "@/domain/planilha-apresentacao";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso, avisarInfo, mensagemAmigavel } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PreviaAba = ApresentacaoAba & { planoHash: string };
type ConferenciaAba = { aba: string; previa?: PreviaAba; erro?: string };
type ResultadoAba = { aba: string; concluida: boolean; erro?: string };

function TabelaPrevia({
  previa,
  rotulo = "Prévia da apresentação",
}: {
  previa: PreviaAba;
  rotulo?: string;
}) {
  return (
    <div
      className="max-h-48 min-w-0 overflow-auto rounded-lg border text-sm"
      role="region"
      tabIndex={0}
      aria-label={rotulo}
    >
      <table
        style={{
          width: previa.colunas.reduce((total, coluna) => total + coluna.largura, 0),
          tableLayout: "fixed",
          color: "#1f2937",
        }}
      >
        <caption className="sr-only">Colunas reconhecidas e exemplo da organização visual</caption>
        <colgroup>
          {previa.colunas.map((coluna) => (
            <col key={coluna.indice} style={{ width: coluna.largura }} />
          ))}
        </colgroup>
        <thead
          style={{
            backgroundColor: CORES_PLANILHA.cabecalho,
            color: CORES_PLANILHA.textoCabecalho,
          }}
        >
          <tr>
            {previa.colunas.map((coluna) => (
              <th
                key={coluna.indice}
                className="h-11 px-3 py-2 break-words"
                style={{ textAlign: coluna.alinhamento === "CENTER" ? "center" : "left" }}
              >
                {coluna.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {["Exemplo A", "Exemplo B"].map((nome, indice) => (
            <tr
              key={nome}
              style={{
                backgroundColor:
                  indice === 0 ? CORES_PLANILHA.primeiraLinha : CORES_PLANILHA.segundaLinha,
              }}
            >
              {previa.colunas.map((coluna) => (
                <td
                  key={coluna.indice}
                  className="px-3 py-2 break-words"
                  style={{ textAlign: coluna.alinhamento === "CENTER" ? "center" : "left" }}
                >
                  {coluna.largura === 260 ? nome : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      {ajustarCabecalho && (
        <label className="flex items-center gap-2 text-sm">
          Ano das datas sem ano
          <Input
            type="number"
            min={2000}
            max={2100}
            className="w-24"
            value={anoReferencia}
            disabled={executando || conferencias !== null}
            onChange={(evento) => setAnoReferencia(Number(evento.target.value))}
          />
        </label>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-10"
        aria-label={`${ajustarCabecalho ? "Corrigir cabeçalho e datas de" : "Organizar apresentação de"} ${alvo}`}
        disabled={disabled || executando || (todasTurmas ? abas.length === 0 : !aba)}
        onClick={() => void conferir()}
      >
        {executando
          ? "Conferindo..."
          : ajustarCabecalho
            ? "Corrigir cabeçalho e datas"
            : "Organizar apresentação"}
      </Button>
      {andamento && !conferencias && (
        <p role="status" className="text-muted-foreground w-full text-sm">
          {andamento.fase} {andamento.atual} de {andamento.total}: {andamento.aba}
        </p>
      )}
      <AlertDialog
        open={conferencias !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !executando) fechar();
        }}
      >
        <AlertDialogContent className={todasTurmas ? "max-h-[90dvh] overflow-y-auto" : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resultados ? (
                "Resultado da organização"
              ) : todasTurmas ? (
                ajustarCabecalho ? (
                  "Corrigir cabeçalhos e datas de todas as turmas?"
                ) : (
                  "Organizar apresentação de todas as turmas?"
                )
              ) : (
                <>
                  {ajustarCabecalho
                    ? "Corrigir cabeçalho e datas da aba"
                    : "Organizar apresentação da aba"}{" "}
                  {previa?.aba}?
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resultados ? (
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
                  quebra de texto. O cabeçalho da linha {previa?.cabecalhoLinha} ficará fixo durante
                  a rolagem. A aparência anterior dessas colunas será substituída; valores, fórmulas
                  e rótulos serão preservados.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {andamento && (
            <p role="status" className="text-sm">
              {andamento.fase} {andamento.atual} de {andamento.total}: {andamento.aba}
            </p>
          )}
          {resultados ? (
            <ul className="space-y-3 text-sm" aria-label="Resultado por aba">
              {resultados.map((item) => (
                <li key={item.aba} className="rounded-lg border p-3">
                  <strong className="block">{item.aba}</strong>
                  {item.concluida ? (
                    "Concluída"
                  ) : (
                    <>
                      <span>Confira a aba</span>
                      <p className="text-muted-foreground">{item.erro}</p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">
                Prévia com dados fictícios. Role para conferir as colunas.
              </p>
              {todasTurmas ? (
                <div className="min-w-0 space-y-3">
                  {conferencias?.map((item, indice) => (
                    <details
                      key={item.aba}
                      open={indice === 0}
                      className="min-w-0 rounded-lg border p-3"
                    >
                      <summary className="cursor-pointer text-sm font-medium">
                        {item.aba}: {item.previa ? "Pronta" : "Não será alterada"}
                      </summary>
                      {item.previa ? (
                        <div className="mt-3 min-w-0 space-y-2">
                          <p className="text-muted-foreground text-xs">
                            {ajustarCabecalho
                              ? `Linhas a retirar: ${item.previa.ajusteCabecalho?.linhasRemover ?? 0}. Datas a corrigir: ${item.previa.ajusteCabecalho?.datas.length ?? 0}.`
                              : `Cabeçalho na linha ${item.previa.cabecalhoLinha}.`}
                          </p>
                          <TabelaPrevia
                            previa={item.previa}
                            rotulo={`Prévia da apresentação de ${item.aba}`}
                          />
                        </div>
                      ) : (
                        <p className="text-muted-foreground mt-2 text-sm">{item.erro}</p>
                      )}
                    </details>
                  ))}
                </div>
              ) : (
                previa && <TabelaPrevia previa={previa} />
              )}
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>
              {resultados ? "Fechar" : "Cancelar"}
            </AlertDialogCancel>
            {!resultados && (
              <AlertDialogAction
                disabled={executando || quantidadeProntas === 0}
                onClick={(evento) => {
                  evento.preventDefault();
                  void aplicar();
                }}
              >
                {executando
                  ? "Aplicando..."
                  : ajustarCabecalho
                    ? "Aplicar correção"
                    : "Aplicar apresentação"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
