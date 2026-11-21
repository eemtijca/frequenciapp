"use client";

// Filtros globais com aplicação explícita do período e controles acessíveis no celular.
import { useId, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorAno } from "@/components/ui/mui/seletor-ano";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
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

function dataBr(valor: string): string {
  const [ano, mes, dia] = valor.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
}
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
    <Grid size={1} sx={{ minWidth: 0 }}>
      <Campo id={`${id}-${campo}`} rotulo={nome}>
        <Selecionar
          valor={filtros[campo] || "__todos"}
          onValor={(v) =>
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
      </Campo>
    </Grid>
  );
  return (
    <Box
      component="section"
      aria-label="Filtros da análise"
      sx={{ "@media print": { display: "none" } }}
    >
      <SecaoConteudo>
        <Stack
          direction="row"
          useFlexGap
          spacing={1}
          role="group"
          aria-label="Aplicar período rápido"
          sx={{ flexWrap: "wrap" }}
        >
          {PERIODOS_RAPIDOS_BI.map((periodo) => (
            <Botao
              key={periodo}
              variante="contorno"
              tamanho="pequeno"
              type="button"
              sx={{ height: 48 }}
              onClick={() => {
                const datas = periodoRapidoBi(periodo, new Date(), fuso);
                setAno(datas.inicio.slice(0, 4));
                setInicio(datas.inicio);
                setFim(datas.fim);
                onAlterar({ ...filtros, ...datas });
              }}
            >
              {PERIODOS[periodo]}
            </Botao>
          ))}
        </Stack>
        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (inicio && fim && inicio <= fim) onAlterar({ ...filtros, inicio, fim });
          }}
        >
          <Grid container spacing={2} columns={{ xs: 1, sm: 2, lg: 5 }}>
            <Grid size={1} sx={{ minWidth: 0 }}>
              <Campo id={`${id}-ano`} rotulo="Ano">
                <SeletorAno
                  min={1900}
                  max={2199}
                  valor={ano}
                  rotuloAcessivel="Ano da análise"
                  onValor={(valor) => {
                    setAno(valor);
                    setInicio(`${valor}-01-01`);
                    setFim(`${valor}-12-31`);
                  }}
                />
              </Campo>
            </Grid>
            <Grid size={1} sx={{ minWidth: 0 }}>
              <Campo id={`${id}-inicio`} rotulo="De">
                <SeletorPeriodo
                  id={`${id}-inicio`}
                  modo="dia"
                  valor={inicio}
                  max={fim || `${ano}-12-31`}
                  rotulo={dataBr(inicio)}
                  rotuloAcessivel="Início da análise"
                  onValor={setInicio}
                />
              </Campo>
            </Grid>
            <Grid size={1} sx={{ minWidth: 0 }}>
              <Campo id={`${id}-fim`} rotulo="Até">
                <SeletorPeriodo
                  id={`${id}-fim`}
                  modo="dia"
                  valor={fim}
                  min={inicio}
                  max={`${ano}-12-31`}
                  rotulo={dataBr(fim)}
                  rotuloAcessivel="Fim da análise"
                  onValor={setFim}
                />
              </Campo>
            </Grid>
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
          </Grid>
          <Stack direction="row" useFlexGap spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
            <Botao
              type="submit"
              variante="secundario"
              tamanho="pequeno"
              sx={{ height: 48 }}
              disabled={!inicio || !fim || inicio > fim}
            >
              Aplicar período
            </Botao>
            <Botao
              type="button"
              variante="contorno"
              tamanho="pequeno"
              sx={{ height: 48 }}
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
            </Botao>
            <Typography variant="caption" sx={{ alignSelf: "center", color: "text.secondary" }}>
              {filtros.inicio} a {filtros.fim}
            </Typography>
          </Stack>
        </Box>
        {completo && (
          <Acordeao
            titulo="Mais filtros"
            resumo={
              adicionais > 0 ? `${adicionais} filtros adicionais ativos` : "Série, turma e busca"
            }
          >
            <Grid container spacing={2} columns={{ xs: 1, sm: 2, lg: 4 }}>
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
              <Grid size={1} sx={{ minWidth: 0 }}>
                <Campo id={`${id}-busca`} rotulo="Busca por nome">
                  <CampoTexto
                    valor={filtros.busca}
                    onValor={(valor) => onAlterar({ ...filtros, busca: valor })}
                    maxLength={200}
                  />
                </Campo>
              </Grid>
            </Grid>
          </Acordeao>
        )}
      </SecaoConteudo>
    </Box>
  );
}
