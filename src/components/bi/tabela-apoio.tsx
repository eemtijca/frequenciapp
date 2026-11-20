"use client";

// Consulta completa dos catálogos e do contexto, com busca, ordenação e exportação confirmada.
import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao } from "@/components/ui/mui/botao";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
import { ROTULOS_RECURSOS_BI } from "@/domain/bi";
import { csvBi, textoBi } from "@/domain/bi-analise";
import { baixarBi } from "@/lib/bi-exportacao";
import { paginaTabelaBi } from "@/lib/bi-visualizacao";
import type { ConfirmarExportacaoBi } from "./cartao-grafico";
const APENAS_LEITOR = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
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
    <Box component="section" aria-label="Dados de apoio" sx={{ mt: 2 }}>
      <SecaoConteudo titulo={ROTULOS_RECURSOS_BI[recurso]}>
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          data-acoes-grafico
          sx={{ flexWrap: "wrap", "@media print": { display: "none" } }}
        >
          <BarraBusca
            id={`apoio-${recurso}-busca`}
            valor={busca}
            onValor={(valor) => {
              setBusca(valor);
              setPagina(0);
            }}
            placeholder="Buscar"
            rotulo="Buscar nos dados de apoio"
            sx={{ width: { xs: "100%", sm: 360 } }}
          />
          <Botao
            variante="contorno"
            tamanho="pequeno"
            sx={{ height: 48 }}
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
          </Botao>
        </Stack>
        {filtradas.length === 0 && (
          <Typography role="status" variant="body2" sx={{ p: 2, color: "text.secondary" }}>
            Nenhum registro corresponde à busca.
          </Typography>
        )}
        <Box
          role="region"
          aria-label={`Tabela de ${ROTULOS_RECURSOS_BI[recurso]}`}
          tabIndex={0}
          sx={{
            maxHeight: 384,
            overflow: "auto",
            "@media print": { maxHeight: "none", overflow: "visible" },
          }}
        >
          <Table
            size="small"
            sx={{
              width: "100%",
              "& .MuiTableCell-root": { p: 1, fontSize: "0.75rem" },
              "@media print": { tableLayout: "fixed" },
            }}
          >
            <Box component="caption" sx={APENAS_LEITOR}>
              Dados escolares de apoio
            </Box>
            <TableHead>
              <TableRow>
                {colunas.map((c) => (
                  <TableCell
                    key={c}
                    component="th"
                    scope="col"
                    aria-sort={ordem === c ? (desc ? "descending" : "ascending") : "none"}
                    sx={{
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      backgroundColor: "background.paper",
                      "@media print": { position: "static" },
                    }}
                  >
                    <Botao
                      variante="texto"
                      tamanho="pequeno"
                      aria-label={`Ordenar por ${c}`}
                      onClick={() => {
                        setOrdem(c);
                        setDesc(ordem === c ? !desc : false);
                      }}
                      sx={{
                        minHeight: 44,
                        height: "auto",
                        p: 0,
                        justifyContent: "flex-start",
                        fontWeight: 600,
                        color: "text.primary",
                      }}
                    >
                      {c}
                    </Botao>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtradas.slice(atual * 50, (atual + 1) * 50).map((l) => (
                <TableRow key={l.id}>
                  {colunas.map((c) => (
                    <TableCell key={c} sx={{ maxWidth: 320, overflowWrap: "anywhere" }}>
                      {textoBi(l[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography
          variant="caption"
          sx={{ display: "none", "@media print": { display: "block" } }}
        >
          Página {atual + 1} de {Math.max(1, Math.ceil(filtradas.length / 50))}. Exibidos{" "}
          {Math.min(50, Math.max(0, filtradas.length - atual * 50))} de {filtradas.length}{" "}
          registros.
          {filtradas.length > 50 && " O CSV inclui todos os registros filtrados."}
        </Typography>
        <Stack
          direction="row"
          data-acoes-grafico
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            "@media print": { display: "none" },
          }}
        >
          <Botao
            variante="secundario"
            tamanho="pequeno"
            sx={{ height: 48 }}
            disabled={!atual}
            onClick={() => setPagina(atual - 1)}
          >
            Anterior
          </Botao>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {filtradas.length} registros | {atual + 1}/
            {Math.max(1, Math.ceil(filtradas.length / 50))}
          </Typography>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            sx={{ height: 48 }}
            disabled={(atual + 1) * 50 >= filtradas.length}
            onClick={() => setPagina(atual + 1)}
          >
            Próxima
          </Botao>
        </Stack>
      </SecaoConteudo>
    </Box>
  );
}
