"use client";

// Edição da presença por turno ou aulas exatas, separada da chamada diária.
import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Aluno, Turma } from "@/domain/frequencia";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import {
  LIMITE_AULAS_PARCIAL,
  LIMITE_OBSERVACAO_PARCIAL,
  normalizarAulas,
} from "@/domain/frequencia-parcial";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { AvisoCompacto } from "@/components/ui/tela-estado";

export interface EdicaoParcial {
  alunoId: string;
  tipo: "TURNO" | "AULAS";
  turno: "MANHA" | "TARDE";
  aulas: number[];
  observacao: string;
}

export function edicaoDoRegistro(registro?: FrequenciaParcial): EdicaoParcial {
  return {
    alunoId: registro?.alunoId ?? "",
    tipo: registro?.tipo ?? "TURNO",
    turno: registro?.turno ?? "MANHA",
    aulas: registro?.aulas ?? [],
    observacao: registro?.observacao ?? "",
  };
}

export function assinaturaDaEdicao(edicao: EdicaoParcial): string {
  return JSON.stringify({
    alunoId: edicao.alunoId,
    tipo: edicao.tipo,
    turno: edicao.tipo === "TURNO" ? edicao.turno : null,
    aulas: edicao.tipo === "AULAS" ? normalizarAulas(edicao.aulas) : [],
    observacao: edicao.observacao.trim(),
  });
}

interface Props {
  aberto: boolean;
  edicao: EdicaoParcial;
  registro: FrequenciaParcial | null;
  turma: Turma | undefined;
  alunos: Aluno[];
  dia: string;
  sujo: boolean;
  salvando: boolean;
  erro: string;
  conflito: boolean;
  onEdicao: (edicao: EdicaoParcial) => void;
  onFechar: () => void;
  onSalvar: () => void;
  onRecarregar: () => void;
}

export function DialogoFrequenciaParcial({
  aberto,
  edicao,
  registro,
  turma,
  alunos,
  dia,
  sujo,
  salvando,
  erro,
  conflito,
  onEdicao,
  onFechar,
  onSalvar,
  onRecarregar,
}: Props) {
  const [aulaInicial, setAulaInicial] = useState("1");
  const [aulaFinal, setAulaFinal] = useState("9");
  const [limiteAulas, setLimiteAulas] = useState(9);
  const aulasVisiveis = useMemo(() => {
    const maiorOrdem = Math.max(0, ...(turma?.horarios ?? []).map((aula) => aula.ordem));
    const maiorSelecionada = Math.max(0, ...edicao.aulas);
    const total = Math.min(
      LIMITE_AULAS_PARCIAL,
      Math.max(9, limiteAulas, maiorOrdem, maiorSelecionada),
    );
    return Array.from({ length: total }, (_, indice) => indice + 1);
  }, [edicao.aulas, limiteAulas, turma]);

  function alternarAula(aula: number) {
    const marcadas = edicao.aulas.includes(aula)
      ? edicao.aulas.filter((valor) => valor !== aula)
      : [...edicao.aulas, aula];
    onEdicao({ ...edicao, aulas: normalizarAulas(marcadas) });
  }

  function marcarAPartir() {
    const inicio = Number(aulaInicial);
    const fim = Number(aulaFinal);
    if (!Number.isInteger(inicio) || !Number.isInteger(fim) || inicio > fim) return;
    onEdicao({
      ...edicao,
      aulas: Array.from({ length: fim - inicio + 1 }, (_, indice) => inicio + indice),
    });
    setLimiteAulas((atual) => Math.max(atual, fim));
  }

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && !salvando && onFechar()}>
      <DialogContent folha showCloseButton={!salvando}>
        <DialogHeader>
          <DialogTitle>
            {registro ? "Editar frequência parcial" : "Registrar frequência parcial"}
          </DialogTitle>
          <DialogDescription>
            {turma?.rotulo} · {dia.split("-").reverse().join("/")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            onSalvar();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="parcial-aluno">Aluno</Label>
            <Selecionar
              id="parcial-aluno"
              value={edicao.alunoId}
              onValueChange={(alunoId) => onEdicao({ ...edicao, alunoId })}
              opcoes={alunos.map((aluno) => ({ valor: aluno.id, rotulo: aluno.nome }))}
              placeholder="Selecione o aluno"
              buscavel
              disabled={salvando || registro !== null}
            />
          </div>
          <fieldset disabled={salvando} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Presença registrada</legend>
            <div role="radiogroup" aria-label="Forma da frequência parcial" className="flex gap-2">
              {(
                [
                  ["TURNO", "Turno inteiro"],
                  ["AULAS", "Por aulas"],
                ] as const
              ).map(([tipo, rotulo]) => (
                <button
                  key={tipo}
                  type="button"
                  role="radio"
                  aria-checked={edicao.tipo === tipo}
                  onClick={() => onEdicao({ ...edicao, tipo })}
                  className="pressionavel aria-[checked=true]:bg-primary aria-[checked=true]:text-primary-foreground flex h-11 flex-1 items-center justify-center rounded-lg border px-3 text-sm font-medium"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </fieldset>
          {edicao.tipo === "TURNO" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="parcial-turno">Turno frequentado</Label>
              <Selecionar
                id="parcial-turno"
                value={edicao.turno}
                onValueChange={(valor) =>
                  onEdicao({ ...edicao, turno: valor === "TARDE" ? "TARDE" : "MANHA" })
                }
                opcoes={[
                  { valor: "MANHA", rotulo: "Manhã" },
                  { valor: "TARDE", rotulo: "Tarde" },
                ]}
                disabled={salvando}
              />
            </div>
          ) : (
            <fieldset disabled={salvando} className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">Aulas frequentadas</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {aulasVisiveis.map((aula) => (
                  <button
                    key={aula}
                    type="button"
                    role="checkbox"
                    aria-checked={edicao.aulas.includes(aula)}
                    aria-label={`${aula}ª aula frequentada`}
                    onClick={() => alternarAula(aula)}
                    className="pressionavel aria-[checked=true]:bg-primary aria-[checked=true]:text-primary-foreground flex h-11 items-center justify-center rounded-lg border text-sm font-medium"
                  >
                    {aula}ª aula
                  </button>
                ))}
              </div>
              {aulasVisiveis.length < LIMITE_AULAS_PARCIAL && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLimiteAulas(LIMITE_AULAS_PARCIAL)}
                  className="h-11"
                >
                  Mostrar mais aulas
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="parcial-aula-inicial">A partir da aula</Label>
                  <Selecionar
                    id="parcial-aula-inicial"
                    value={aulaInicial}
                    onValueChange={setAulaInicial}
                    opcoes={Array.from({ length: LIMITE_AULAS_PARCIAL }, (_, indice) => ({
                      valor: String(indice + 1),
                      rotulo: `${indice + 1}ª aula`,
                    }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="parcial-aula-final">Até a aula</Label>
                  <Selecionar
                    id="parcial-aula-final"
                    value={aulaFinal}
                    onValueChange={setAulaFinal}
                    opcoes={Array.from({ length: LIMITE_AULAS_PARCIAL }, (_, indice) => ({
                      valor: String(indice + 1),
                      rotulo: `${indice + 1}ª aula`,
                    }))}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={marcarAPartir}
                disabled={Number(aulaInicial) > Number(aulaFinal)}
                className="h-11"
              >
                Marcar intervalo de aulas
              </Button>
              <p className="text-muted-foreground text-xs">
                {edicao.aulas.length === 0
                  ? "Selecione as aulas em que houve presença."
                  : `${edicao.aulas.length} ${edicao.aulas.length === 1 ? "aula selecionada" : "aulas selecionadas"}.`}
              </p>
            </fieldset>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="parcial-observacao">Observação</Label>
            <Input
              id="parcial-observacao"
              value={edicao.observacao}
              onChange={(evento) => onEdicao({ ...edicao, observacao: evento.target.value })}
              maxLength={LIMITE_OBSERVACAO_PARCIAL}
              disabled={salvando}
              placeholder="Opcional"
              className="h-11"
            />
          </div>
          {registro?.registradoSeduc && sujo && (
            <p role="status" className="text-muted-foreground rounded-lg border p-3 text-sm">
              A alteração deixará este registro pendente de conferência na Seduc.
            </p>
          )}
          {erro && (
            <AvisoCompacto
              variante={conflito ? "conflito" : "indisponivel"}
              descricao={erro}
              tamanho="linha"
            />
          )}
          {conflito && (
            <Button type="button" variant="outline" onClick={onRecarregar} disabled={salvando}>
              Carregar versão salva
            </Button>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onFechar}
              disabled={salvando}
              className="h-11"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                salvando ||
                !edicao.alunoId ||
                (edicao.tipo === "AULAS" && edicao.aulas.length === 0) ||
                conflito ||
                (registro !== null && !sujo)
              }
              className="h-11"
            >
              {salvando && <LoaderCircle size={16} className="animate-spin" />}
              Salvar frequência parcial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
