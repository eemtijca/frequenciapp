"use client";

// Prévia do padrão visual de uma aba, com confirmação e ação única.
import { useState } from "react";
import type { ApresentacaoAba } from "@/domain/planilha-apresentacao";
import { CORES_PLANILHA } from "@/domain/planilha-apresentacao";
import { pedir, corpoJson } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
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

export function OrganizarPlanilha({
  rota,
  aba,
  disabled = false,
}: {
  rota: string;
  aba: string;
  disabled?: boolean;
}) {
  const [previa, setPrevia] = useState<(ApresentacaoAba & { planoHash: string }) | null>(null);
  const { executar, chaveAtiva } = useAcoesPorChave();
  const executando = chaveAtiva !== null;
  async function conferir() {
    await executar("apresentacao", async () => {
      try {
        const dados = await pedir<{ previa: ApresentacaoAba & { planoHash: string } }>(
          rota,
          corpoJson({ aba }),
        );
        setPrevia(dados.previa);
      } catch (erro) {
        avisarErro(erro, { contexto: "Não foi possível conferir a apresentação da planilha." });
      }
    });
  }
  async function aplicar() {
    if (!previa) return;
    await executar("apresentacao", async () => {
      try {
        await pedir(rota, corpoJson({ aba: previa.aba, planoHash: previa.planoHash }));
        setPrevia(null);
        avisarSucesso("Apresentação da planilha atualizada.");
      } catch (erro) {
        setPrevia(null);
        avisarErro(erro, {
          contexto: "Não foi possível organizar a planilha. Confira uma nova prévia.",
        });
      }
    });
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        aria-label={`Organizar apresentação de ${aba}`}
        disabled={disabled || executando || !aba}
        onClick={() => void conferir()}
      >
        {executando ? "Conferindo..." : "Organizar apresentação"}
      </Button>
      <AlertDialog
        open={previa !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !executando) setPrevia(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Organizar apresentação da aba {previa?.aba}?</AlertDialogTitle>
            <AlertDialogDescription>
              Cabeçalho verde com texto branco e negrito, linhas alternadas, colunas ajustadas e
              quebra de texto. O cabeçalho da linha {previa?.cabecalhoLinha} ficará fixo durante a
              rolagem. A aparência anterior dessas colunas será substituída; valores, fórmulas e
              rótulos serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-muted-foreground text-xs">
            Prévia com dados fictícios. Role para conferir as colunas.
          </p>
          <div
            className="max-h-48 min-w-0 overflow-auto rounded-lg border text-sm"
            role="region"
            tabIndex={0}
            aria-label="Prévia da apresentação"
          >
            <table
              style={{
                width: previa?.colunas.reduce((total, coluna) => total + coluna.largura, 0),
                tableLayout: "fixed",
                color: "#1f2937",
              }}
            >
              <caption className="sr-only">
                Colunas reconhecidas e exemplo da organização visual
              </caption>
              <colgroup>
                {previa?.colunas.map((coluna) => (
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
                  {previa?.colunas.map((coluna) => (
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
                    {previa?.colunas.map((coluna) => (
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(evento) => {
                evento.preventDefault();
                void aplicar();
              }}
            >
              {executando ? "Aplicando..." : "Aplicar apresentação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
