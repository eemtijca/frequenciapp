"use client";

// Aba de turmas: criar, renomear, mover de série e excluir, sempre
// agrupadas por série para leitura rápida.
import { useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import type { Serie, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { DialogoOrdenarTurmas } from "@/components/gestao/cadastros/dialogo-ordenar-turmas";
import DialogoAulas from "@/components/gestao/cadastros/dialogo-aulas";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  series: Serie[];
  turmas: Turma[];
  onMudanca: () => Promise<void>;
  onOrdenacao: () => Promise<void>;
}

interface Formulario {
  serieId: string;
  nome: string;
}

const ESPACO_ACOES = 0.5;
const ALVO_ACAO = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
} as const;

export default function AbaTurmas({ series, turmas, onMudanca, onOrdenacao }: Props) {
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Turma | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({ serieId: "", nome: "" });
  const { chaveAtiva, executar } = useAcoesPorChave();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [turmaDasAulas, setTurmaDasAulas] = useState<Turma | null>(null);
  const [aulasAberto, setAulasAberto] = useState(false);
  const [excluirAlvo, setExcluirAlvo] = useState<Turma | null>(null);
  const turmaDasAulasAtual = turmas.find((item) => item.id === turmaDasAulas?.id) ?? turmaDasAulas;

  const opcoesSerie = useMemo(
    () => series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
    [series],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, { serie: Serie | undefined; turmas: Turma[] }>();
    for (const turma of turmas) {
      const item = mapa.get(turma.serieId) ?? {
        serie: series.find((s) => s.id === turma.serieId),
        turmas: [],
      };
      item.turmas.push(turma);
      mapa.set(turma.serieId, item);
    }
    return [...mapa.entries()].sort((a, b) => (a[1].serie?.ordem ?? 0) - (b[1].serie?.ordem ?? 0));
  }, [turmas, series]);

  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);
  const gruposFiltrados = grupos
    .map(
      ([serieId, grupo]) =>
        [
          serieId,
          {
            ...grupo,
            turmas: grupo.turmas.filter(
              (turma) => termo === "" || normalizar(turma.rotulo).includes(termo),
            ),
          },
        ] as const,
    )
    .filter(([, grupo]) => grupo.turmas.length > 0);

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario({ serieId: series[0]?.id ?? "", nome: "" });
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(turma: Turma) {
    setEmEdicao(turma);
    setFormulario({ serieId: turma.serieId, nome: turma.nome });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const dados = { serieId: formulario.serieId, nome: formulario.nome };
    try {
      if (emEdicao) {
        await pedir<{ turma: Turma }>(`/api/turmas/${emEdicao.id}`, corpoAlteracao("PATCH", dados));
        avisarSucesso("Turma atualizada.", "A mudança vale para a Chamada e os Relatórios.");
      } else {
        await pedir<{ turma: Turma }>("/api/turmas", corpoJson(dados));
        avisarSucesso("Turma criada.", "Ela já aparece na Chamada, nos Relatórios e na Gestão.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a turma.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a turma." });
    } finally {
      setEnviando(false);
    }
  }

  function excluir(turma: Turma) {
    void executar(turma.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/turmas/${turma.id}`, corpoAlteracao("DELETE"));
        avisarSucesso(`Turma ${turma.rotulo} excluída.`);
        await onMudanca();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível excluir a turma." });
      }
    });
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        useFlexGap
        sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {turmas.length} {turmas.length === 1 ? "turma" : "turmas"}
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
          <DialogoOrdenarTurmas
            disabled={turmas.length === 0 || enviando || chaveAtiva !== null}
            onMudanca={onOrdenacao}
          />
          <Botao
            variante="secundario"
            icone={<AddRoundedIcon />}
            onClick={abrirNovo}
            disabled={series.length === 0}
          >
            Nova turma
          </Botao>
        </Stack>
      </Stack>

      {series.length === 0 ? (
        <EstadoVazio
          icone={<GroupsRoundedIcon />}
          titulo="Crie uma série primeiro"
          descricao="Toda turma pertence a uma série, como 1º ano A."
        />
      ) : turmas.length === 0 ? (
        <EstadoVazio
          icone={<GroupsRoundedIcon />}
          titulo="Nenhuma turma cadastrada"
          descricao="Crie a primeira turma da série para começar a cadastrar alunos."
          acao={
            <Botao variante="contorno" icone={<AddRoundedIcon />} onClick={abrirNovo}>
              Criar turma
            </Botao>
          }
        />
      ) : (
        <Stack spacing={2}>
          <BarraBusca
            id="busca-turmas"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar turma"
          />
          {gruposFiltrados.length === 0 ? (
            <EstadoVazio
              icone={<GroupsRoundedIcon />}
              titulo="Nenhuma turma encontrada"
              descricao="Tente outro termo de busca."
            />
          ) : (
            gruposFiltrados.map(([serieId, grupo]) => (
              <Stack
                key={serieId}
                component="section"
                spacing={1}
                sx={{ "& caption": { overflowWrap: "anywhere" } }}
              >
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                >
                  <Typography
                    component="h2"
                    variant="subtitle1"
                    sx={{ minWidth: 0, overflowWrap: "anywhere" }}
                  >
                    {grupo.serie?.nome ?? "Série"}
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
                    {grupo.turmas.length} {grupo.turmas.length === 1 ? "turma" : "turmas"}
                  </Typography>
                </Stack>
                <TabelaPadrao caption={`Turmas de ${grupo.serie?.nome ?? "série"}.`}>
                  <TableHead>
                    <TableRow>
                      <TableCell scope="col">Turma</TableCell>
                      <TableCell scope="col">Aulas</TableCell>
                      <TableCell
                        scope="col"
                        align="right"
                        sx={(tema) => ({
                          width: {
                            sm: `calc(${3 * TOKENS_LAYOUT.alvoToque + 2 * TOKENS_LAYOUT.tabela.padding}px + ${tema.spacing(2 * ESPACO_ACOES)})`,
                          },
                        })}
                      >
                        Ações
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {grupo.turmas.map((turma) => {
                      const aulasAtivas = turma.horarios.filter((aula) => aula.ativo).length;
                      return (
                        <TableRow key={turma.id}>
                          <TableCell component="th" scope="row" sx={{ overflowWrap: "anywhere" }}>
                            {turma.rotulo}
                          </TableCell>
                          <TableCell sx={{ whiteSpace: aulasAtivas ? "nowrap" : { sm: "nowrap" } }}>
                            {aulasAtivas ? (
                              `${aulasAtivas} ${aulasAtivas === 1 ? "aula" : "aulas"}`
                            ) : (
                              <>
                                sem{" "}
                                <Box component="span" sx={{ whiteSpace: "nowrap" }}>
                                  aulas ativas
                                </Box>
                              </>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Stack
                              direction="row"
                              spacing={ESPACO_ACOES}
                              useFlexGap
                              sx={{
                                justifyContent: "flex-end",
                                flexWrap: { xs: "wrap", sm: "nowrap" },
                              }}
                            >
                              <BotaoIcone
                                rotulo={`Horários de ${turma.rotulo}`}
                                icone={<ScheduleRoundedIcon fontSize="small" />}
                                variante="texto"
                                sx={ALVO_ACAO}
                                onClick={() => {
                                  setTurmaDasAulas(turma);
                                  setAulasAberto(true);
                                }}
                              />
                              <BotaoIcone
                                rotulo={`Editar turma ${turma.rotulo}`}
                                icone={<EditRoundedIcon fontSize="small" />}
                                variante="texto"
                                sx={ALVO_ACAO}
                                onClick={() => abrirEdicao(turma)}
                              />
                              <BotaoIcone
                                rotulo={`Excluir turma ${turma.rotulo}`}
                                icone={<DeleteRoundedIcon fontSize="small" />}
                                variante="texto"
                                sx={[
                                  ALVO_ACAO,
                                  (tema) => ({ color: tema.vars.palette.falta.texto }),
                                ]}
                                disabled={chaveAtiva === turma.id}
                                onClick={() => setExcluirAlvo(turma)}
                              />
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </TabelaPadrao>
              </Stack>
            ))
          )}
        </Stack>
      )}

      <Dialogo
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        titulo={emEdicao ? `Editar turma ${emEdicao.rotulo}` : "Nova turma"}
        quebrarTitulo
        acoes={
          <>
            <Botao variante="texto" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="secundario" carregando={enviando} onClick={() => void submeter()}>
              {emEdicao ? "Salvar" : "Criar"}
            </Botao>
          </>
        }
      >
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            void submeter();
          }}
          noValidate
        >
          <Stack spacing={2}>
            <Campo id="serie-turma" rotulo="Série">
              <Selecionar
                valor={formulario.serieId}
                onValor={(serieId) => setFormulario((atual) => ({ ...atual, serieId }))}
                opcoes={opcoesSerie}
                quebrarRotuloSelecionado
                quebrarRotulosDasOpcoes
              />
            </Campo>
            <Campo
              id="nome-turma"
              rotulo="Turma (letra ou nome)"
              descricao="O rótulo completo aparece como série + turma, por exemplo 1º ano A."
            >
              <CampoTexto
                valor={formulario.nome}
                onValor={(nome) => setFormulario((atual) => ({ ...atual, nome }))}
                required
                maxLength={40}
                autoComplete="off"
                placeholder="Por exemplo: A"
              />
            </Campo>
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </form>
      </Dialogo>

      <DialogoConfirmacao
        aberto={excluirAlvo !== null}
        titulo={`Excluir a turma ${excluirAlvo?.rotulo ?? ""}?`}
        quebrarTitulo
        descricao="A exclusão só é possível quando a turma não tem alunos nem frequências."
        rotuloConfirmar="Excluir"
        destrutivo
        operacaoEmAndamento={excluirAlvo !== null && chaveAtiva === excluirAlvo.id}
        onConfirmar={() => {
          const alvo = excluirAlvo;
          setExcluirAlvo(null);
          if (alvo) excluir(alvo);
        }}
        onCancelar={() => setExcluirAlvo(null)}
      />

      <DialogoAulas
        turma={turmaDasAulasAtual}
        turmas={turmas}
        aberto={aulasAberto}
        onAbrir={setAulasAberto}
        onMudanca={onMudanca}
      />
    </Stack>
  );
}
