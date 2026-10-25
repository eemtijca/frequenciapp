"use client";

// Localiza diferenças entre abas e registra escolhas locais para uma nova conferência, sem escrever.
import { rotuloData } from "@/domain/frequencia";
import {
  chaveResolucaoAntiga,
  type PendenciaAntiga,
  type ResolucaoAntiga,
} from "@/domain/planilha-legado";
import { Button } from "@/components/ui/button";
import { Selecionar } from "@/components/ui/selecionar";

export function PendenciasAbaAntiga({
  pendencias,
  total,
  resolucoes,
  disabled,
  onEscolher,
}: {
  pendencias: PendenciaAntiga[];
  total: number;
  resolucoes: ResolucaoAntiga[];
  disabled: boolean;
  onEscolher: (escolhas: ResolucaoAntiga[], remover?: string) => void;
}) {
  const escolhas = new Map(resolucoes.map((item) => [chaveResolucaoAntiga(item), item]));
  const divergencias = pendencias.filter((item) => item.tipo === "frequencia");
  return (
    <details className="mt-2 rounded-xl border p-3">
      <summary className="text-falta-texto cursor-pointer font-medium">
        Resolver {total === 1 ? "1 pendência" : `${total} pendências`}
      </summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        <p className="text-muted-foreground">
          As escolhas só serão aplicadas após nova conferência e confirmação.
        </p>
        {divergencias.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {(["mensal", "antiga"] as const).map((manter) => (
              <Button
                key={manter}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  onEscolher(
                    divergencias.map((item) => ({
                      tipo: "frequencia",
                      mes: item.mes,
                      celulaAntiga: item.origem.celula,
                      manter,
                    })),
                  )
                }
              >
                Usar marcas {manter === "mensal" ? "mensais" : "antigas"} exibidas
              </Button>
            ))}
          </div>
        )}
        {pendencias.map((item) => {
          const escolha = escolhas.get(item.id);
          return (
            <div key={item.id} className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
              <p className="font-medium wrap-anywhere">{item.aluno}</p>
              {item.tipo === "frequencia" && (
                <p>
                  {rotuloData(item.dia)} · Antiga: <strong>{item.antiga}</strong> · Mensal:{" "}
                  <strong>{item.mensal}</strong>
                </p>
              )}
              <p className="text-muted-foreground">{item.mensagem}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={item.origem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex min-h-11 items-center underline"
                >
                  Antiga: {item.origem.celula}
                </a>
                <a
                  href={item.destino.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex min-h-11 items-center underline"
                >
                  Mensal: {item.destino.celula}
                </a>
              </div>
              {item.tipo === "frequencia" ? (
                <Selecionar
                  ariaLabel={`Marca para ${item.aluno}, ${item.origem.celula}, ${item.mes}`}
                  value={escolha?.tipo === "frequencia" ? escolha.manter : "conferir"}
                  disabled={disabled}
                  onValueChange={(valor) => {
                    if (valor === "mensal" || valor === "antiga")
                      onEscolher([
                        {
                          tipo: "frequencia",
                          mes: item.mes,
                          celulaAntiga: item.origem.celula,
                          manter: valor,
                        },
                      ]);
                    else onEscolher([], item.id);
                  }}
                  opcoes={[
                    { valor: "conferir", rotulo: "Escolher marca" },
                    { valor: "mensal", rotulo: `Manter mensal: ${item.mensal}` },
                    { valor: "antiga", rotulo: `Usar antiga: ${item.antiga}` },
                  ]}
                />
              ) : item.opcoes.length > 0 ? (
                <>
                  <Selecionar
                    ariaLabel={`Destino de ${item.aluno}, linha ${item.linhaAntiga}, ${item.mes}`}
                    value={escolha?.tipo === "aluno" ? String(escolha.linhaMensal) : "conferir"}
                    disabled={disabled}
                    onValueChange={(valor) => {
                      if (valor !== "conferir")
                        onEscolher([
                          {
                            tipo: "aluno",
                            mes: item.mes,
                            linhaAntiga: item.linhaAntiga,
                            linhaMensal: Number(valor),
                          },
                        ]);
                      else onEscolher([], item.id);
                    }}
                    opcoes={[
                      { valor: "conferir", rotulo: "Escolher linha do aluno" },
                      ...item.opcoes.map((opcao) => ({
                        valor: String(opcao.linha),
                        rotulo: `Linha ${opcao.linha}: ${opcao.nome}`,
                      })),
                    ]}
                  />
                  <div className="flex flex-wrap gap-3">
                    {item.opcoes.map((opcao) => (
                      <a
                        key={opcao.linha}
                        href={opcao.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex min-h-11 items-center underline"
                      >
                        Conferir linha {opcao.linha}
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    Se o aluno pertencer a este histórico, inclua uma linha no mês para preservar
                    suas marcas. O cadastro escolar não será alterado.
                  </p>
                  <Selecionar
                    ariaLabel={`Inclusão de ${item.aluno}, linha ${item.linhaAntiga}, ${item.mes}`}
                    value={escolha?.tipo === "adicionar-aluno" ? "adicionar" : "conferir"}
                    disabled={disabled}
                    onValueChange={(valor) => {
                      if (valor === "adicionar")
                        onEscolher([
                          { tipo: "adicionar-aluno", mes: item.mes, linhaAntiga: item.linhaAntiga },
                        ]);
                      else onEscolher([], item.id);
                    }}
                    opcoes={[
                      { valor: "conferir", rotulo: "Conferir o aluno nas duas abas" },
                      { valor: "adicionar", rotulo: "Incluir aluno neste mês" },
                    ]}
                  />
                </>
              )}
            </div>
          );
        })}
        {total > pendencias.length && (
          <p className="text-muted-foreground">
            Exibidas as primeiras {pendencias.length} pendências. Após conferir as escolhas, a
            próxima parte será exibida.
          </p>
        )}
      </div>
    </details>
  );
}
