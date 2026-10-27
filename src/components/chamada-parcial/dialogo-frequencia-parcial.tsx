"use client";

// Presenças personalizadas e justificativas por intervalo, com conferência das datas.
import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Aluno, Turma, JustificativaConfigurada } from "@/domain/frequencia";
import type { FrequenciaParcial, TipoFrequenciaParcial } from "@/domain/frequencia-parcial";
import {
  limiteAgendamentoParcial,
  LIMITE_AULAS_PARCIAL,
  LIMITE_OBSERVACAO_PARCIAL,
  normalizarAulas,
} from "@/domain/frequencia-parcial";
import { diasEntre, ehDiaValido, ehDomingo, JUSTIFICATIVA_OUTROS } from "@/domain/frequencia";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
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
  tipo: TipoFrequenciaParcial;
  turno: "MANHA" | "TARDE";
  aulas: number[];
  observacao: string;
  justificativa: string;
  de: string;
  ate: string;
}

export function edicaoDoRegistro(registro?: FrequenciaParcial): EdicaoParcial {
  return {
    alunoId: registro?.alunoId ?? "",
    tipo: registro?.tipo ?? "TURNO",
    turno: registro?.turno ?? "MANHA",
    aulas: registro?.aulas ?? [],
    observacao: registro?.observacao ?? "",
    justificativa: registro?.justificativa ?? "",
    de: registro?.dia ?? "",
    ate: registro?.dia ?? "",
  };
}

export function assinaturaDaEdicao(edicao: EdicaoParcial): string {
  return JSON.stringify({
    alunoId: edicao.alunoId,
    tipo: edicao.tipo,
    turno: edicao.tipo === "TURNO" ? edicao.turno : null,
    aulas: edicao.tipo === "AULAS" ? normalizarAulas(edicao.aulas) : [],
    observacao: edicao.observacao.trim(),
    justificativa: edicao.tipo === "JUSTIFICADA" ? edicao.justificativa : null,
    de: edicao.tipo === "JUSTIFICADA" ? edicao.de : null,
    ate: edicao.tipo === "JUSTIFICADA" ? edicao.ate : null,
  });
}

interface Props {
  aberto: boolean;
  edicao: EdicaoParcial;
  registro: FrequenciaParcial | null;
  turma: Turma | undefined;
  alunos: Aluno[];
  dia: string;
  hoje: string;
  justificativas: JustificativaConfigurada[];
  feriados: Feriado[];
  sujo: boolean;
  salvando: boolean;
  bloqueado?: boolean;
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
  hoje,
  justificativas,
  feriados,
  sujo,
  salvando,
  bloqueado = false,
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
  const [confirmando, setConfirmando] = useState(false);
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (!aberto) setConfirmando(false);
  }
  const aulasVisiveis = useMemo(() => {
    const maiorOrdem = Math.max(0, ...(turma?.horarios ?? []).map((aula) => aula.ordem));
    const maiorSelecionada = Math.max(0, ...edicao.aulas);
    const total = Math.min(
      LIMITE_AULAS_PARCIAL,
      Math.max(9, limiteAulas, maiorOrdem, maiorSelecionada),
    );
    return Array.from({ length: total }, (_, indice) => indice + 1);
  }, [edicao.aulas, limiteAulas, turma]);

  const justificando = edicao.tipo === "JUSTIFICADA";
  const intervaloValido =
    ehDiaValido(edicao.de) &&
    ehDiaValido(edicao.ate) &&
    edicao.ate >= edicao.de &&
    (Date.parse(edicao.ate) - Date.parse(edicao.de)) / 86_400_000 <= 30;
  const dias = intervaloValido
    ? diasEntre(edicao.de, edicao.ate).filter((d) => !ehDomingo(d) && !feriadoNaData(feriados, d))
    : [];
  const futuro = dia > hoje;
  const limite = limiteAgendamentoParcial(hoje);
  const podeSalvar =
    !salvando &&
    !bloqueado &&
    Boolean(edicao.alunoId) &&
    !(justificando && (!edicao.justificativa || !intervaloValido || !dias.length)) &&
    !(edicao.tipo === "AULAS" && edicao.aulas.length === 0) &&
    !conflito &&
    !(registro !== null && !sujo);
  const alunoSelecionado = alunos.find((aluno) => aluno.id === edicao.alunoId);
  const justificativaSelecionada =
    justificativas.find((item) => item.codigo === edicao.justificativa)?.rotulo ??
    edicao.justificativa;
  const tipoRotulo =
    edicao.tipo === "DIA_INTEIRO"
      ? "Dia inteiro"
      : edicao.tipo === "TURNO"
        ? "Turno inteiro"
        : edicao.tipo === "AULAS"
          ? "Por aulas"
          : "Justificativa";
  const turnoRotulo = edicao.turno === "TARDE" ? "Tarde" : "Manhã";

  function fechar() {
    if (salvando) return;
    setConfirmando(false);
    onFechar();
  }

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
    <Dialog open={aberto} onOpenChange={(valor) => !valor && fechar()}>
      <DialogContent folha showCloseButton={!salvando}>
        <DialogHeader>
          <DialogTitle>
            {confirmando
              ? justificando
                ? "Confirmar justificativa"
                : "Confirmar frequência parcial"
              : registro
                ? "Editar frequência parcial"
                : "Registrar frequência parcial"}
          </DialogTitle>
          <DialogDescription>
            {turma?.rotulo} · {dia.split("-").reverse().join("/")}
          </DialogDescription>
        </DialogHeader>
        {confirmando ? (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              Confira os dados antes de salvar. A alteração passa a valer imediatamente.
            </p>
            <dl className="flex flex-col gap-2 text-sm">
              <ItemResumo rotulo="Aluno" valor={alunoSelecionado?.nome ?? ""} />
              <ItemResumo rotulo="Turma" valor={turma?.rotulo ?? ""} />
              <ItemResumo rotulo="Dia" valor={dia.split("-").reverse().join("/")} />
              {justificando ? (
                <>
                  <ItemResumo
                    rotulo="Período"
                    valor={`${edicao.de.split("-").reverse().join("/")} a ${edicao.ate.split("-").reverse().join("/")}`}
                  />
                  <ItemResumo rotulo="Justificativa" valor={justificativaSelecionada} />
                </>
              ) : (
                <>
                  <ItemResumo rotulo="Tipo" valor={tipoRotulo} />
                  {edicao.tipo === "TURNO" && <ItemResumo rotulo="Turno" valor={turnoRotulo} />}
                  {edicao.tipo === "AULAS" && (
                    <ItemResumo rotulo="Aulas" valor={edicao.aulas.join(", ")} />
                  )}
                </>
              )}
              {edicao.observacao.trim() && (
                <ItemResumo rotulo="Observação" valor={edicao.observacao.trim()} />
              )}
            </dl>
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmando(false)}
                disabled={salvando}
                className="h-11"
              >
                Voltar
              </Button>
              <Button type="button" onClick={onSalvar} disabled={!podeSalvar} className="h-11">
                {salvando && <LoaderCircle size={16} className="animate-spin" />}
                {justificando
                  ? "Confirmar e salvar justificativa"
                  : "Confirmar e salvar frequência"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (podeSalvar) setConfirmando(true);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Aluno</p>
              <p
                id="parcial-aluno"
                className="bg-secondary rounded-lg px-3 py-2 text-sm break-words"
              >
                {alunos.find((aluno) => aluno.id === edicao.alunoId)?.nome}
              </p>
            </div>
            <fieldset disabled={salvando} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Registro da frequência</legend>
              <div
                role="radiogroup"
                aria-label="Forma da frequência parcial"
                className="grid grid-cols-2 gap-2"
              >
                {(
                  [
                    ["DIA_INTEIRO", "Dia inteiro"],
                    ["TURNO", "Turno inteiro"],
                    ["AULAS", "Por aulas"],
                    ["JUSTIFICADA", "Justificativa"],
                  ] as const
                ).map(([tipo, rotulo]) => (
                  <button
                    key={tipo}
                    type="button"
                    role="radio"
                    aria-checked={edicao.tipo === tipo}
                    disabled={futuro && tipo !== "JUSTIFICADA"}
                    onClick={() => onEdicao({ ...edicao, tipo })}
                    className="controle pressionavel flex h-11 flex-1 items-center justify-center px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </fieldset>
            {justificando ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Data inicial</Label>
                    <SeletorPeriodo
                      id="parcial-justificativa-de"
                      modo="dia"
                      valor={edicao.de || dia}
                      max={limite}
                      atual={hoje}
                      semDomingo
                      mostrarSelo={false}
                      rotulo={(edicao.de || dia).split("-").reverse().join("/")}
                      rotuloAcessivel="Data inicial da justificativa"
                      onValor={(de) =>
                        onEdicao({ ...edicao, de, ate: edicao.ate < de ? de : edicao.ate })
                      }
                      disabled={salvando || registro !== null}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Data final</Label>
                    <SeletorPeriodo
                      id="parcial-justificativa-ate"
                      modo="dia"
                      valor={edicao.ate || dia}
                      max={limite}
                      atual={hoje}
                      semDomingo
                      mostrarSelo={false}
                      rotulo={(edicao.ate || dia).split("-").reverse().join("/")}
                      rotuloAcessivel="Data final da justificativa"
                      onValor={(ate) => onEdicao({ ...edicao, ate })}
                      disabled={salvando || registro !== null}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="parcial-justificativa">Justificativa</Label>
                  <Selecionar
                    id="parcial-justificativa"
                    value={edicao.justificativa}
                    onValueChange={(justificativa) =>
                      onEdicao({
                        ...edicao,
                        justificativa,
                        observacao: justificativa === JUSTIFICATIVA_OUTROS ? edicao.observacao : "",
                      })
                    }
                    opcoes={justificativas
                      .filter((j) => j.ativo || j.codigo === edicao.justificativa)
                      .map((j) => ({ valor: j.codigo, rotulo: j.rotulo }))}
                    disabled={salvando}
                    placeholder="Selecione"
                  />
                </div>
                <p className="text-muted-foreground text-sm" role="status">
                  {intervaloValido
                    ? `${dias.length} ${dias.length === 1 ? "dia incluído" : "dias incluídos"}. Domingos e feriados ficam fora.`
                    : "Escolha um período de até 31 dias, em ordem de data."}
                </p>
                <p className="text-muted-foreground text-xs">
                  Dia inteiro. Em chamadas salvas, altera apenas a justificativa deste aluno.
                </p>
              </div>
            ) : edicao.tipo === "TURNO" ? (
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
            ) : edicao.tipo === "AULAS" ? (
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
                      className="controle pressionavel flex h-11 items-center justify-center text-sm font-medium"
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
            ) : (
              <p className="text-muted-foreground text-sm">Presença em todas as aulas do dia.</p>
            )}
            {(!justificando || edicao.justificativa === JUSTIFICATIVA_OUTROS) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="parcial-observacao">Observação</Label>
                <Input
                  id="parcial-observacao"
                  value={edicao.observacao}
                  onChange={(evento) => onEdicao({ ...edicao, observacao: evento.target.value })}
                  maxLength={justificando ? 200 : LIMITE_OBSERVACAO_PARCIAL}
                  disabled={salvando}
                  placeholder="Opcional"
                  className="h-11"
                />
              </div>
            )}
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
                onClick={fechar}
                disabled={salvando}
                className="h-11"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!podeSalvar} className="h-11">
                {salvando && <LoaderCircle size={16} className="animate-spin" />}
                {justificando ? "Salvar justificativa" : "Salvar frequência parcial"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words">{valor}</dd>
    </div>
  );
}
