"use client";

// Consulta completa dos catálogos e do contexto, com busca, ordenação e exportação confirmada.
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
import { ROTULOS_RECURSOS_BI } from "@/domain/bi";
import { csvBi, textoBi } from "@/domain/bi-analise";
import { baixarBi } from "@/lib/bi-exportacao";
import { paginaTabelaBi } from "@/lib/bi-visualizacao";
import type { ConfirmarExportacaoBi } from "./cartao-grafico";
export function TabelaApoioBi({
  recurso,
  linhas,
  confirmar,
}: {
  recurso: RecursoBi;
  linhas: LinhaBi[];
  confirmar: ConfirmarExportacaoBi;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("id");
  const [desc, setDesc] = useState(false);
  const [pagina, setPagina] = useState(0);
  const filtradas = useMemo(
    () =>
      linhas
        .filter((l) =>
          Object.values(l).some((v) => textoBi(v).toLowerCase().includes(busca.toLowerCase())),
        )
        .sort((a, b) => {
          const n = textoBi(a[ordem]).localeCompare(textoBi(b[ordem]), "pt-BR", { numeric: true });
          return desc ? -n : n;
        }),
    [linhas, busca, ordem, desc],
  );
  const colunas = useMemo(() => [...new Set(linhas.flatMap((l) => Object.keys(l)))], [linhas]);
  const atual = paginaTabelaBi(pagina, filtradas.length);
  return (
    <section className="superficie mt-4 p-4">
      <h2 className="mb-3 font-semibold">{ROTULOS_RECURSOS_BI[recurso]}</h2>
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        <Input
          aria-label="Buscar nos dados de apoio"
          placeholder="Buscar"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
          className="max-w-sm"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-11"
          onClick={() =>
            confirmar(() =>
              baixarBi(
                new Blob([csvBi(filtradas)], { type: "text/csv;charset=utf-8" }),
                "frequencibi-tabela.csv",
              ),
            )
          }
        >
          Exportar CSV
        </Button>
      </div>
      {filtradas.length === 0 && (
        <p role="status" className="text-muted-foreground p-4 text-sm">
          Nenhum registro corresponde à busca.
        </p>
      )}
      <div
        className="max-h-96 overflow-auto print:max-h-none print:overflow-visible"
        role="region"
        aria-label={`Tabela de ${ROTULOS_RECURSOS_BI[recurso]}`}
        tabIndex={0}
      >
        <table className="w-full text-left text-xs print:table-fixed">
          <caption className="sr-only">Dados escolares de apoio</caption>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th
                  key={c}
                  scope="col"
                  aria-sort={ordem === c ? (desc ? "descending" : "ascending") : "none"}
                  className="bg-background sticky top-0 p-2 print:static print:wrap-anywhere"
                >
                  <button
                    className="min-h-11"
                    onClick={() => {
                      setOrdem(c);
                      setDesc(ordem === c ? !desc : false);
                    }}
                  >
                    {c}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(atual * 50, (atual + 1) * 50).map((l) => (
              <tr key={l.id} className="border-border border-b">
                {colunas.map((c) => (
                  <td key={c} className="max-w-80 p-2 break-words print:wrap-anywhere">
                    {textoBi(l[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 hidden text-xs print:block">
        Página {atual + 1} de {Math.max(1, Math.ceil(filtradas.length / 50))}. Exibidos{" "}
        {Math.min(50, Math.max(0, filtradas.length - atual * 50))} de {filtradas.length} registros.
        {filtradas.length > 50 && " O CSV inclui todos os registros filtrados."}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 print:hidden">
        <Button
          size="sm"
          className="h-11"
          variant="secondary"
          disabled={!atual}
          onClick={() => setPagina(atual - 1)}
        >
          Anterior
        </Button>
        <p className="text-muted-foreground text-xs">
          {filtradas.length} registros | {atual + 1}/{Math.max(1, Math.ceil(filtradas.length / 50))}
        </p>
        <Button
          size="sm"
          className="h-11"
          variant="secondary"
          disabled={(atual + 1) * 50 >= filtradas.length}
          onClick={() => setPagina(atual + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
}
