"use client";

// Localiza diferenças entre abas e registra escolhas locais para uma nova conferência, sem escrever.
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { rotuloData } from "@/domain/frequencia";
import {
  chaveResolucaoAntiga,
  type PendenciaAntiga,
  type ResolucaoAntiga,
} from "@/domain/planilha-legado";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Selecionar } from "@/components/ui/mui/selecionar";

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
    <Acordeao
      titulo={`Resolver ${total === 1 ? "1 pendência" : `${total} pendências`}`}
      nivelTitulo="h4"
      resumo={
        <Typography component="span" variant="body2" sx={{ color: "error" }}>
          Escolhas aplicadas em uma nova conferência
        </Typography>
      }
    >
      <Stack spacing={2}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          As escolhas só serão aplicadas após nova conferência e confirmação.
        </Typography>
        {divergencias.length > 1 ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {(["mensal", "antiga"] as const).map((manter) => (
              <Botao
                key={manter}
                type="button"
                tamanho="pequeno"
                variante="contorno"
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
              </Botao>
            ))}
          </Stack>
        ) : null}
        {pendencias.map((item) => {
          const escolha = escolhas.get(item.id);
          return (
            <Box
              key={item.id}
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                padding: 2,
                minWidth: 0,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                {item.aluno}
              </Typography>
              {item.tipo === "frequencia" ? (
                <Typography variant="body2">
                  {rotuloData(item.dia)} · Antiga: <strong>{item.antiga}</strong> · Mensal:{" "}
                  <strong>{item.mensal}</strong>
                </Typography>
              ) : null}
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {item.mensagem}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                <Link
                  href={item.origem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: "inline-flex", alignItems: "center", minHeight: 48 }}
                >
                  Antiga: {item.origem.celula}
                </Link>
                <Link
                  href={item.destino.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="hover"
                  sx={{ display: "inline-flex", alignItems: "center", minHeight: 48 }}
                >
                  Mensal: {item.destino.celula}
                </Link>
              </Stack>
              {item.tipo === "frequencia" ? (
                <Selecionar
                  ariaLabel={`Marca para ${item.aluno}, ${item.origem.celula}, ${item.mes}`}
                  valor={escolha?.tipo === "frequencia" ? escolha.manter : "conferir"}
                  disabled={disabled}
                  onValor={(valor) => {
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
                    valor={escolha?.tipo === "aluno" ? String(escolha.linhaMensal) : "conferir"}
                    disabled={disabled}
                    onValor={(valor) => {
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
                  <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
                    {item.opcoes.map((opcao) => (
                      <Link
                        key={opcao.linha}
                        href={opcao.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        sx={{ display: "inline-flex", alignItems: "center", minHeight: 48 }}
                      >
                        Conferir linha {opcao.linha}
                      </Link>
                    ))}
                  </Stack>
                </>
              ) : (
                <>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Se o aluno pertencer a este histórico, inclua uma linha no mês para preservar
                    suas marcas. O cadastro escolar não será alterado.
                  </Typography>
                  <Selecionar
                    ariaLabel={`Inclusão de ${item.aluno}, linha ${item.linhaAntiga}, ${item.mes}`}
                    valor={escolha?.tipo === "adicionar-aluno" ? "adicionar" : "conferir"}
                    disabled={disabled}
                    onValor={(valor) => {
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
            </Box>
          );
        })}
        {total > pendencias.length ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Exibidas as primeiras {pendencias.length} pendências. Após conferir as escolhas, a
            próxima parte será exibida.
          </Typography>
        ) : null}
      </Stack>
    </Acordeao>
  );
}
