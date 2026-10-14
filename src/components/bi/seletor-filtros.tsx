"use client";

// Filtros globais com aplicação explícita do período e controles acessíveis no celular.
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { textoBi, type DadosBi, type FiltrosBi } from "@/domain/bi-analise";
import { periodoRapidoBi, PERIODOS_RAPIDOS_BI, type PeriodoRapidoBi } from "@/domain/bi-periodos";
const PERIODOS: Record<PeriodoRapidoBi, string> = {
  hoje: "Hoje",
  semana: "Esta semana",
  mes: "Este mês",
  ano: "Este ano",
};
const CAMPOS_ADICIONAIS = [
  "alunoId",
  "justificativa",
  "tipo",
  "turno",
  "situacao",
  "busca",
] as const;
export function SeletorFiltrosBi({
  filtros,
  onAlterar,
  dados,
  fuso,
  completo = false,
}: {
  filtros: FiltrosBi;
  onAlterar: (f: FiltrosBi) => void;
  dados: DadosBi;
  fuso: string;
  completo?: boolean;
}) {
  const id = useId();
  const [ano, setAno] = useState(filtros.inicio.slice(0, 4));
  const [inicio, setInicio] = useState(filtros.inicio);
  const [fim, setFim] = useState(filtros.fim);
  const adicionais = CAMPOS_ADICIONAIS.filter((campo) => Boolean(filtros[campo])).length;
  const temRecorte = Boolean(adicionais || filtros.serieId || filtros.turmaId);
  const catalogos = useMemo(() => {
    const campos = ["justificativa", "tipo", "turno"] as const;
    const valores = {
      justificativa: new Set<string>(),
      tipo: new Set<string>(),
      turno: new Set<string>(),
    };
    for (const linhas of Object.values(dados)) {
      for (const linha of linhas ?? []) {
        for (const campo of campos) {
          const valor = linha[campo];
          if (typeof valor === "string" && valor) valores[campo].add(valor);
        }
      }
    }
    return Object.fromEntries(
      campos.map((campo) => [
        campo,
        [...valores[campo]]
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((v) => ({ valor: v, rotulo: v })),
      ]),
    );
  }, [dados]);
  const turmasDaSerie = useMemo(
    () =>
      new Set((dados.turmas ?? []).filter((t) => t.serieId === filtros.serieId).map((t) => t.id)),
    [dados.turmas, filtros.serieId],
  );
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
  return (
    <section className="superficie-vidro p-4 print:hidden" aria-label="Filtros da análise">
      <div role="group" aria-label="Aplicar período rápido" className="mb-4 flex flex-wrap gap-2">
        {PERIODOS_RAPIDOS_BI.map((periodo) => (
          <Button
            key={periodo}
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              const datas = periodoRapidoBi(periodo, new Date(), fuso);
              setAno(datas.inicio.slice(0, 4));
              setInicio(datas.inicio);
              setFim(datas.fim);
              onAlterar({ ...filtros, ...datas });
            }}
          >
            {PERIODOS[periodo]}
          </Button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (inicio && fim && inicio <= fim) onAlterar({ ...filtros, inicio, fim });
        }}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="col-span-2 min-w-0 sm:col-span-1">
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
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <Label htmlFor={`${id}-inicio`} className="mb-1 block text-xs">
              De
            </Label>
            <Input
              id={`${id}-inicio`}
              aria-label="Início da análise"
              type="date"
              className="max-w-full"
              value={inicio}
              max={fim || undefined}
              onChange={(e) => setInicio(e.target.value)}
              required
            />
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <Label htmlFor={`${id}-fim`} className="mb-1 block text-xs">
              Até
            </Label>
            <Input
              id={`${id}-fim`}
              aria-label="Fim da análise"
              type="date"
              className="max-w-full"
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
            disabled={!temRecorte}
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
          <summary className="cursor-pointer py-2 text-sm">
            <span>Mais filtros</span>
            {adicionais > 0 && (
              <span
                className="bg-primary/15 text-primary ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums"
                aria-label={`${adicionais} filtros adicionais ativos`}
              >
                {adicionais}
              </span>
            )}
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {selecionar(
              "alunoId",
              "Aluno",
              (dados.alunos ?? [])
                .filter(
                  (l) =>
                    (!filtros.serieId ||
                      l.serieId === filtros.serieId ||
                      (typeof l.turmaId === "string" && turmasDaSerie.has(l.turmaId))) &&
                    (!filtros.turmaId || l.turmaId === filtros.turmaId),
                )
                .map((l) => ({ valor: l.id, rotulo: textoBi(l.aluno ?? l.nome) })),
            )}
            {selecionar("justificativa", "Justificativa", catalogos.justificativa ?? [])}
            {selecionar("tipo", "Tipo", catalogos.tipo ?? [])}
            {selecionar("turno", "Turno", catalogos.turno ?? [])}
            {Boolean(dados.alunos) &&
              selecionar("situacao", "Situação do aluno", [
                { valor: "ativo", rotulo: "Ativo" },
                { valor: "inativo", rotulo: "Inativo" },
                { valor: "desistente", rotulo: "Desistente" },
              ])}
            <div className="min-w-0">
              <Label htmlFor={`${id}-busca`} className="mb-1 block text-xs">
                Busca por nome
              </Label>
              <Input
                id={`${id}-busca`}
                value={filtros.busca}
                maxLength={200}
                onChange={(e) => onAlterar({ ...filtros, busca: e.target.value })}
              />
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
