"use client";

// Filtros globais com aplicação explícita do período e controles acessíveis no celular.
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { textoBi, type DadosBi, type FiltrosBi } from "@/domain/bi-analise";
export function SeletorFiltrosBi({
  filtros,
  onAlterar,
  dados,
  completo = false,
}: {
  filtros: FiltrosBi;
  onAlterar: (f: FiltrosBi) => void;
  dados: DadosBi;
  completo?: boolean;
}) {
  const id = useId();
  const [ano, setAno] = useState(filtros.inicio.slice(0, 4));
  const [inicio, setInicio] = useState(filtros.inicio);
  const [fim, setFim] = useState(filtros.fim);
  const selecionar = (
    campo: keyof FiltrosBi,
    nome: string,
    opcoes: { valor: string; rotulo: string }[],
  ) => (
    <div className="min-w-0">
      <Label htmlFor={`${id}-${campo}`} className="mb-1 block text-xs">
        {nome}
      </Label>
      <Selecionar
        id={`${id}-${campo}`}
        ariaLabel={nome}
        value={filtros[campo] || "__todos"}
        onValueChange={(v) =>
          onAlterar({
            ...filtros,
            [campo]: v === "__todos" ? "" : v,
            ...(campo === "serieId"
              ? { turmaId: "", alunoId: "" }
              : campo === "turmaId"
                ? { alunoId: "" }
                : {}),
          })
        }
        opcoes={[{ valor: "__todos", rotulo: "Todos" }, ...opcoes.filter((o) => o.valor)]}
        buscavel={opcoes.length > 15}
      />
    </div>
  );
  const catalogo = (campo: string) =>
    [
      ...new Set(
        Object.values(dados)
          .flatMap((ls) => ls ?? [])
          .map((l) => l[campo])
          .filter((v): v is string => typeof v === "string" && Boolean(v)),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .map((v) => ({ valor: v, rotulo: v }));
  return (
    <section className="superficie-vidro p-4 print:hidden" aria-label="Filtros da análise">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (inicio && fim && inicio <= fim) onAlterar({ ...filtros, inicio, fim });
        }}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div>
            <Label htmlFor={`${id}-ano`} className="mb-1 block text-xs">
              Ano
            </Label>
            <Input
              id={`${id}-ano`}
              aria-label="Ano da análise"
              type="number"
              min="1900"
              max="2200"
              value={ano}
              onChange={(e) => {
                const ano = e.target.value;
                setAno(ano);
                if (/^\d{4}$/.test(ano)) {
                  setInicio(`${ano}-01-01`);
                  setFim(`${ano}-12-31`);
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor={`${id}-inicio`} className="mb-1 block text-xs">
              De
            </Label>
            <Input
              id={`${id}-inicio`}
              aria-label="Início da análise"
              type="date"
              value={inicio}
              max={fim || undefined}
              onChange={(e) => setInicio(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${id}-fim`} className="mb-1 block text-xs">
              Até
            </Label>
            <Input
              id={`${id}-fim`}
              aria-label="Fim da análise"
              type="date"
              value={fim}
              min={inicio || undefined}
              onChange={(e) => setFim(e.target.value)}
              required
            />
          </div>
          {selecionar(
            "serieId",
            "Série",
            (dados.series ?? []).map((l) => ({ valor: l.id, rotulo: textoBi(l.nome) })),
          )}
          {selecionar(
            "turmaId",
            "Turma",
            (dados.turmas ?? [])
              .filter((l) => !filtros.serieId || l.serieId === filtros.serieId)
              .map((l) => ({ valor: l.id, rotulo: textoBi(l.turma ?? l.nome) })),
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={!inicio || !fim || inicio > fim}>
            Aplicar período
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onAlterar({
                ...filtros,
                serieId: "",
                turmaId: "",
                alunoId: "",
                busca: "",
                justificativa: "",
                tipo: "",
                turno: "",
                situacao: "",
              })
            }
          >
            Limpar recortes
          </Button>
          <span className="text-muted-foreground self-center text-xs">
            {filtros.inicio} a {filtros.fim}
          </span>
        </div>
      </form>
      {completo && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm">Mais filtros</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {selecionar(
              "alunoId",
              "Aluno",
              (dados.alunos ?? [])
                .filter((l) => !filtros.turmaId || l.turmaId === filtros.turmaId)
                .map((l) => ({ valor: l.id, rotulo: textoBi(l.aluno) })),
            )}
            {selecionar("justificativa", "Justificativa", catalogo("justificativa"))}
            {selecionar("tipo", "Tipo", catalogo("tipo"))}
            {selecionar("turno", "Turno", catalogo("turno"))}
            {Boolean(dados.alunos) &&
              selecionar("situacao", "Situação do aluno", [
                { valor: "ativo", rotulo: "Ativo" },
                { valor: "inativo", rotulo: "Inativo" },
                { valor: "desistente", rotulo: "Desistente" },
              ])}
            <div>
              <Label htmlFor={`${id}-busca`} className="mb-1 block text-xs">
                Busca por nome
              </Label>
              <Input
                id={`${id}-busca`}
                value={filtros.busca}
                onChange={(e) => onAlterar({ ...filtros, busca: e.target.value })}
              />
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
