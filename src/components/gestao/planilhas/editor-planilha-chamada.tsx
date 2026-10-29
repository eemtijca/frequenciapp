"use client";

// Centraliza a revisão de linhas e valores da chamada por turma e mês na Gestão.
import { useState } from "react";
import {
  FileSpreadsheet,
  HelpCircle,
  LockKeyhole,
  PencilLine,
  Trash2,
  UserPlus,
} from "lucide-react";
import { diasDoMes, rotuloMes } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import DialogoEnvio, { type ObjetivoEdicaoPlanilha } from "@/components/grade/dialogo-envio";

export function EditorPlanilhaChamada({
  turmas,
  mapa,
  diaCorrente,
  modoCompleto,
  disponivel,
  aoConcluir,
}: {
  turmas: { id: string; rotulo: string }[];
  mapa: { turmaOriginalId: string; aba: string; mes?: string }[];
  diaCorrente: string;
  modoCompleto: boolean;
  disponivel: boolean;
  aoConcluir: () => void;
}) {
  const [turmaId, setTurmaId] = useState("");
  const [mes, setMes] = useState(diaCorrente.slice(0, 7));
  const [objetivo, setObjetivo] = useState<ObjetivoEdicaoPlanilha | null>(null);
  const turma = turmas.find((item) => item.id === turmaId);
  const vinculos = mapa.filter(
    (item) => item.turmaOriginalId === turmaId && (!item.mes || item.mes === mes),
  );
  const habilitado = disponivel && Boolean(turma) && vinculos.length > 0;
  const dias = diasDoMes(mes);
  return (
    <section
      aria-label="Editar planilhas de chamada"
      className="superficie flex flex-col gap-3 p-4"
    >
      <h3 className="font-medium">Editar chamada</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecionar
          id="editor-planilha-turma"
          buscavel
          value={turmaId}
          onValueChange={setTurmaId}
          placeholder="Escolha a turma"
          ariaLabel="Turma da planilha para editar"
          opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
        />
        <SeletorPeriodo
          id="editor-planilha-mes"
          modo="mes"
          valor={mes}
          max={diaCorrente.slice(0, 7)}
          rotuloAcessivel="Mês da planilha para editar"
          rotulo={rotuloMes(mes)}
          onValor={setMes}
        />
      </div>
      <p
        role="status"
        className="text-muted-foreground flex items-start gap-2 text-xs wrap-anywhere"
      >
        <FileSpreadsheet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          {!disponivel
            ? "Conecte e configure a planilha para editar."
            : !turma
              ? "Escolha a turma e o mês."
              : vinculos.length === 0
                ? "Sem aba neste mês. Prepare o mês ou revise a estrutura."
                : `Destino: ${vinculos.map((item) => item.aba).join(", ")}.`}
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["adicionar", "Adicionar alunos", UserPlus],
            ["corrigir", "Corrigir dados", PencilLine],
            ["remover", "Retirar linhas ou colunas", Trash2],
          ] as const
        ).map(([acao, titulo, Icone]) => {
          const protegida = acao !== "adicionar" && !modoCompleto;
          return (
            <Button
              key={acao}
              type="button"
              variant="outline"
              className="relative h-auto min-h-28 min-w-0 flex-col gap-2 rounded-xl px-2 py-3 whitespace-normal"
              disabled={!habilitado || protegida}
              onClick={() => setObjetivo(acao)}
            >
              <span
                className={`flex size-10 items-center justify-center rounded-full ${acao === "remover" ? "bg-falta-fraca text-falta-texto" : "bg-primary/10 text-primary"}`}
              >
                <Icone aria-hidden="true" className="size-5" />
              </span>
              <span className="text-center text-xs leading-4 sm:text-sm">{titulo}</span>
              {protegida && (
                <LockKeyhole
                  aria-hidden="true"
                  className="text-muted-foreground absolute top-2 right-2 size-3"
                />
              )}
            </Button>
          );
        })}
      </div>
      <details className="text-muted-foreground text-xs">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-medium">
          <HelpCircle aria-hidden="true" className="size-4" />
          Ajuda
        </summary>
        <ul className="mt-1 flex flex-col gap-2">
          <li>Adicionar alunos cria as linhas que faltam e preenche as chamadas do mês.</li>
          <li>Corrigir dados atualiza nomes, turmas e chamadas com os dados do aplicativo.</li>
          <li>Retirar linhas ou colunas abre a seleção de exclusões.</li>
          <li>
            Cada ação abre uma prévia antes de gravar. O cadastro e as chamadas no aplicativo são
            preservados.
          </li>
        </ul>
      </details>
      {objetivo && turma && (
        <DialogoEnvio
          key={`${turmaId}-${mes}-${objetivo}`}
          objetivo={objetivo}
          aberto
          onAbrir={(aberto) => {
            if (!aberto) setObjetivo(null);
          }}
          turmaOriginalId={turmaId}
          rotulo={turma.rotulo}
          de={dias[0] ?? diaCorrente}
          ate={dias[dias.length - 1] ?? diaCorrente}
          modoCompleto={modoCompleto}
          aoConcluir={aoConcluir}
        />
      )}
    </section>
  );
}
