"use client";

// Centraliza a revisão de linhas e valores da chamada por turma e mês na Gestão.
import { useState } from "react";
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
      <div>
        <h3 className="font-medium">Editar planilhas de chamada</h3>
        <p className="text-muted-foreground text-sm">
          Escolha a turma e o mês, depois a alteração desejada. Cada ação abre uma prévia antes de
          gravar no Google.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Selecionar
          id="editor-planilha-turma"
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
      <p role="status" className="text-muted-foreground text-sm">
        {!disponivel
          ? "Conecte a planilha, ative a integração e salve a estrutura para editar."
          : !turma
            ? "Selecione uma turma para identificar a aba de destino."
            : vinculos.length === 0
              ? "Esta turma não tem aba vinculada para o mês. Prepare o mês ou revise a estrutura acima."
              : `Destino: ${vinculos.map((item) => item.aba).join(", ")}.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            [
              "adicionar",
              "Adicionar alunos",
              "Cria linhas para os alunos que ainda não aparecem na aba e preenche suas chamadas.",
            ],
            [
              "corrigir",
              "Corrigir dados",
              "Atualiza nomes, turma atual e valores divergentes com os dados do aplicativo.",
            ],
            [
              "remover",
              "Retirar linhas ou colunas",
              "Permite selecionar linhas de alunos que saíram da turma e colunas criadas pelo aplicativo.",
            ],
          ] as const
        ).map(([acao, titulo, descricao]) => (
          <div key={acao} className="flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-muted-foreground flex-1 text-sm">{descricao}</p>
            <Button
              type="button"
              className="h-auto min-h-11 whitespace-normal"
              variant="outline"
              disabled={!habilitado || (acao !== "adicionar" && !modoCompleto)}
              onClick={() => setObjetivo(acao)}
            >
              {titulo}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {modoCompleto
          ? "Edição completa liberada. Confira o destino e as exclusões na prévia."
          : "Adicionar alunos está disponível sem liberar a edição completa. Para corrigir dados ou excluir, libere o modo completo logo abaixo."}{" "}
        O cadastro dos alunos e as chamadas no aplicativo são preservados.
      </p>
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
