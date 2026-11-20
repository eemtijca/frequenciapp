"use client";

// Alunos: consulta do professor por turma atual ou de origem, com busca e estados.
import { memo, useDeferredValue, useMemo, useState } from "react";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonOffRoundedIcon from "@mui/icons-material/PersonOffRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Aluno, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { Botao } from "@/components/ui/mui/botao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Selo } from "@/components/ui/mui/selo";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

interface Props {
  alunos: Aluno[];
  turmas: Turma[];
  fuso: string;
  onAtualizar: () => Promise<void>;
}

type Agrupamento = "atual" | "origem";

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: "atual", rotulo: "Turma atual" },
  { valor: "origem", rotulo: "Turma de origem" },
];

interface PropsGrupo {
  turma: Turma | undefined;
  lista: Aluno[];
  agrupamento: Agrupamento;
  rotuloDe: (id: string, fallback: string) => string;
}

const GrupoAlunos = memo(function GrupoAlunos({ turma, lista, agrupamento, rotuloDe }: PropsGrupo) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden", boxShadow: "none" }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "action.hover",
          px: 2,
          py: 1,
        }}
      >
        <Typography component="h2" variant="subtitle2">
          {turma?.rotulo ?? "Turma"}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
        >
          {lista.filter((aluno) => aluno.ativo).length} ativos
        </Typography>
      </Stack>
      <List disablePadding>
        {lista.map((aluno) => (
          <ListItem
            key={aluno.id}
            divider
            sx={{
              gap: 2,
              py: 1,
              opacity: aluno.ativo ? 1 : 0.55,
              "&:last-of-type": { borderBottom: 0 },
            }}
          >
            <Typography
              component="span"
              variant="body2"
              sx={{
                width: 28,
                flexShrink: 0,
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(aluno.ordem).padStart(2, "0")}
            </Typography>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontWeight: 500 }}>
                {aluno.nome}
              </Typography>
              {agrupamento === "atual" && aluno.turmaOriginalId !== aluno.turmaId ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Origem {rotuloDe(aluno.turmaOriginalId, "outra turma")}
                </Typography>
              ) : null}
              {agrupamento === "origem" && aluno.turmaId !== aluno.turmaOriginalId ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  Atual {rotuloDe(aluno.turmaId, "outra turma")}
                </Typography>
              ) : null}
            </Box>
            {aluno.desistenteEm ? (
              <Selo rotulo="Desistente" tom="atencao" />
            ) : !aluno.ativo ? (
              <Selo rotulo="desativado" />
            ) : null}
          </ListItem>
        ))}
      </List>
    </Paper>
  );
});

export default function VistaAlunos({ alunos, turmas, fuso, onAtualizar }: Props) {
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("atual");
  const [busca, setBusca] = useState("");
  const buscaAplicada = useDeferredValue(busca);
  useAtualizacaoTela("alunos", onAtualizar);

  const rotuloDe = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string, fallback: string) => mapa.get(id) ?? fallback;
  }, [turmas]);

  const grupos = useMemo(() => {
    const porTurma = agrupamento === "atual";
    const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma]));
    const mapa = new Map<string, { turma: Turma | undefined; alunos: Aluno[] }>();
    for (const aluno of alunos) {
      const chave = porTurma ? aluno.turmaId : aluno.turmaOriginalId;
      const item = mapa.get(chave) ?? {
        turma: turmasPorId.get(chave),
        alunos: [],
      };
      item.alunos.push(aluno);
      mapa.set(chave, item);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[1].turma?.rotulo ?? "").localeCompare(b[1].turma?.rotulo ?? "", "pt-BR"))
      .map(([id, item]) => {
        const lista = item.alunos
          .slice()
          .sort((a, b) =>
            porTurma
              ? a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR")
              : a.nome.localeCompare(b.nome, "pt-BR"),
          );
        return [id, item.turma, lista] as const;
      });
  }, [agrupamento, alunos, turmas]);

  const ativos = useMemo(() => alunos.filter((aluno) => aluno.ativo).length, [alunos]);
  const nomesParaBusca = useMemo(
    () => new Map(alunos.map((aluno) => [aluno.id, normalizar(aluno.nome)])),
    [alunos],
  );
  const gruposFiltrados = useMemo(() => {
    const termo = normalizar(buscaAplicada);
    return termo === ""
      ? grupos
      : grupos
          .map(
            ([id, turma, lista]) =>
              [
                id,
                turma,
                lista.filter((aluno) => (nomesParaBusca.get(aluno.id) ?? "").includes(termo)),
              ] as const,
          )
          .filter(([, , lista]) => lista.length > 0);
  }, [grupos, nomesParaBusca, buscaAplicada]);

  return (
    <Box
      component="section"
      aria-label="Lista de alunos"
      aria-busy={busca !== buscaAplicada}
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "flex-end", justifyContent: "space-between" }}
      >
        <Box>
          <Typography component="h1" variant="h4">
            Alunos
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {alunos.length} no total · {ativos} ativos
          </Typography>
        </Box>
        <GroupsRoundedIcon aria-hidden="true" sx={{ color: "text.secondary" }} />
      </Stack>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <AtualizadoDaVisao fuso={fuso} />
      </Box>

      <Typography
        variant="caption"
        sx={{
          bgcolor: "action.hover",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          px: 2,
          py: 1.5,
          lineHeight: 1.6,
        }}
      >
        Cadastros, transferências e desligamentos são feitos pelo administrador em Gestão.
      </Typography>

      <Box
        role="group"
        aria-label="Agrupamento da lista"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1,
          p: 1,
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        {AGRUPAMENTOS.map((opcao) => {
          const selecionado = agrupamento === opcao.valor;
          return (
            <Botao
              key={opcao.valor}
              variante="contorno"
              aria-pressed={selecionado}
              onClick={() => setAgrupamento(opcao.valor)}
              sx={{
                bgcolor: selecionado ? "action.selected" : "transparent",
                borderColor: selecionado ? "primary.main" : "divider",
              }}
            >
              {opcao.rotulo}
            </Botao>
          );
        })}
      </Box>

      {agrupamento === "origem" ? (
        <Typography variant="caption" sx={{ color: "text.secondary", mt: -1 }}>
          Turma da matrícula, usada na Grade e na planilha.
        </Typography>
      ) : null}

      {alunos.length > 0 ? (
        <BarraBusca id="busca-alunos" valor={busca} onValor={setBusca} placeholder="Buscar aluno" />
      ) : null}

      {alunos.length === 0 ? (
        <EstadoVazio
          icone={<PersonOffRoundedIcon />}
          titulo="Nenhum aluno nas suas turmas"
          descricao="Peça ao administrador para cadastrar os alunos e atribuir as turmas a você."
        />
      ) : gruposFiltrados.length === 0 ? (
        <EstadoVazio
          icone={<SearchOffRoundedIcon />}
          titulo="Nenhum aluno encontrado"
          descricao="Tente outro termo de busca."
        />
      ) : (
        gruposFiltrados.map(([id, turma, lista]) => (
          <GrupoAlunos
            key={id}
            turma={turma}
            lista={lista}
            agrupamento={agrupamento}
            rotuloDe={rotuloDe}
          />
        ))
      )}
    </Box>
  );
}
