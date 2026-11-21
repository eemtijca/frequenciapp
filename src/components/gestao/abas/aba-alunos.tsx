"use client";

// Aba de alunos: criar, editar, mover de turma, ativar, desativar e
// excluir, agrupados por turma com busca por nome.
import { Fragment, memo, useCallback, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckBoxOutlineBlankRoundedIcon from "@mui/icons-material/CheckBoxOutlineBlankRounded";
import CheckBoxRoundedIcon from "@mui/icons-material/CheckBoxRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonOffRoundedIcon from "@mui/icons-material/PersonOffRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import type { Aluno, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { relacaoParaCsv } from "@/domain/importacao-alunos";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import DialogoDownload from "@/components/conta/dialogo-download";
import DialogoImportarRelacao from "@/components/gestao/cadastros/dialogo-importar-relacao";
import DialogoRestaurarOrigens from "@/components/gestao/cadastros/dialogo-restaurar-origens";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  onMudanca: () => Promise<void>;
}

interface Formulario {
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
}

interface PropsLinhaAluno {
  aluno: Aluno;
  origem: string;
  modoSelecao: boolean;
  selecionado: boolean;
  ocupado: boolean;
  onSelecionar: (id: string) => void;
  onEditar: (aluno: Aluno) => void;
  onAlternarAtivo: (aluno: Aluno) => void;
  onExcluir: (aluno: Aluno) => void;
}

interface AcaoAluno {
  tipo: "ativo" | "excluir";
  aluno: Aluno;
}

const ALVO_ACAO = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
} as const;

const LinhaAluno = memo(function LinhaAluno({
  aluno,
  origem,
  modoSelecao,
  selecionado,
  ocupado,
  onSelecionar,
  onEditar,
  onAlternarAtivo,
  onExcluir,
}: PropsLinhaAluno) {
  return (
    <TableRow sx={{ opacity: aluno.ativo ? 1 : 0.55 }}>
      <TableCell sx={{ width: 64, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
        {String(aluno.ordem).padStart(2, "0")}
      </TableCell>
      <TableCell component="th" scope="row">
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          {modoSelecao ? (
            <BotaoIcone
              rotulo={`Selecionar ${aluno.nome}`}
              icone={
                selecionado ? (
                  <CheckBoxRoundedIcon fontSize="small" />
                ) : (
                  <CheckBoxOutlineBlankRoundedIcon fontSize="small" />
                )
              }
              variante="texto"
              aria-pressed={selecionado}
              sx={ALVO_ACAO}
              onClick={() => onSelecionar(aluno.id)}
            />
          ) : null}
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 500 }}>
              {aluno.nome}
            </Typography>
            {aluno.turmaOriginalId !== aluno.turmaId ? (
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                Origem {origem}
              </Typography>
            ) : null}
            {aluno.desistenteEm ? (
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                Desistente
              </Typography>
            ) : !aluno.ativo ? (
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                desativado
              </Typography>
            ) : null}
          </Box>
        </Stack>
      </TableCell>
      {!modoSelecao ? (
        <TableCell align="right">
          <Stack
            direction="row"
            spacing={0.5}
            sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}
          >
            <BotaoIcone
              rotulo={`Editar ${aluno.nome}`}
              icone={<EditRoundedIcon fontSize="small" />}
              variante="texto"
              sx={ALVO_ACAO}
              onClick={() => onEditar(aluno)}
            />
            <BotaoIcone
              rotulo={aluno.ativo ? `Desativar ${aluno.nome}` : `Reativar ${aluno.nome}`}
              icone={<PowerSettingsNewRoundedIcon fontSize="small" />}
              variante="texto"
              sx={ALVO_ACAO}
              disabled={ocupado || Boolean(aluno.desistenteEm)}
              onClick={() => onAlternarAtivo(aluno)}
            />
            <BotaoIcone
              rotulo={`Excluir ${aluno.nome}`}
              icone={<DeleteRoundedIcon fontSize="small" />}
              variante="texto"
              sx={[ALVO_ACAO, (tema) => ({ color: tema.vars.palette.falta.texto })]}
              disabled={ocupado}
              onClick={() => onExcluir(aluno)}
            />
          </Stack>
        </TableCell>
      ) : null}
    </TableRow>
  );
});

export default function AbaAlunos({ turmas, alunos, onMudanca }: Props) {
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Aluno | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({
    nome: "",
    turmaId: "",
    turmaOriginalId: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [busca, setBusca] = useState("");
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [origemEmMassa, setOrigemEmMassa] = useState("");
  const [downloadAberto, setDownloadAberto] = useState(false);
  const [importarAberto, setImportarAberto] = useState(false);
  const [acaoAluno, setAcaoAluno] = useState<AcaoAluno | null>(null);
  const [confirmarDesistencia, setConfirmarDesistencia] = useState(false);
  const [confirmarOrigem, setConfirmarOrigem] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  const opcoesTurma = useMemo(
    () => turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    [turmas],
  );

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const grupos = useMemo(() => {
    const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma]));
    const mapa = new Map<string, Aluno[]>();
    for (const aluno of alunos) {
      const lista = mapa.get(aluno.turmaId) ?? [];
      lista.push(aluno);
      mapa.set(aluno.turmaId, lista);
    }
    return [...mapa.entries()]
      .sort((a, b) =>
        (turmasPorId.get(a[0])?.rotulo ?? "").localeCompare(
          turmasPorId.get(b[0])?.rotulo ?? "",
          "pt-BR",
        ),
      )
      .map(
        ([id, lista]) =>
          [id, turmasPorId.get(id), lista.sort((a, b) => a.ordem - b.ordem)] as const,
      );
  }, [alunos, turmas]);
  const nomesParaBusca = useMemo(
    () => new Map(alunos.map((aluno) => [aluno.id, normalizar(aluno.nome)])),
    [alunos],
  );
  const gruposFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    return termo === ""
      ? grupos
      : grupos.map(
          ([id, turma, lista]) =>
            [
              id,
              turma,
              lista.filter((aluno) => (nomesParaBusca.get(aluno.id) ?? "").includes(termo)),
            ] as const,
        );
  }, [grupos, nomesParaBusca, busca]);

  const ativos = useMemo(() => alunos.filter((aluno) => aluno.ativo).length, [alunos]);
  const visiveis = useMemo(
    () => gruposFiltrados.flatMap(([, , lista]) => lista),
    [gruposFiltrados],
  );

  const alternarSelecao = useCallback((id: string) => {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }, []);

  function alternarTodos() {
    setSelecionados((atuais) => {
      const todos = visiveis.length > 0 && visiveis.every((aluno) => atuais.has(aluno.id));
      if (todos) return new Set();
      return new Set(visiveis.map((aluno) => aluno.id));
    });
  }

  function cancelarSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
    setOrigemEmMassa("");
    setConfirmarOrigem(false);
  }

  const { executando: aplicando, executar: aplicarOrigem } = useAcaoUnica(async () => {
    if (selecionados.size === 0 || origemEmMassa === "") return;
    try {
      const dados = await pedir<{ atualizados: number }>(
        "/api/alunos",
        corpoAlteracao("PATCH", {
          ids: [...selecionados],
          turmaOriginalId: origemEmMassa,
        }),
      );
      avisarSucesso(
        dados.atualizados === 1
          ? "Origem de 1 aluno atualizada."
          : `Origem de ${dados.atualizados} alunos atualizada.`,
        "As faltas antigas continuam contando na turma de origem anterior.",
      );
      cancelarSelecao();
      await onMudanca();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível atualizar a origem." });
    }
  });

  function abrirNovo() {
    setEmEdicao(null);
    const primeira = turmas[0]?.id ?? "";
    setFormulario({ nome: "", turmaId: primeira, turmaOriginalId: primeira });
    setErro("");
    setDialogoAberto(true);
  }

  const abrirEdicao = useCallback((aluno: Aluno) => {
    setEmEdicao(aluno);
    setFormulario({
      nome: aluno.nome,
      turmaId: aluno.turmaId,
      turmaOriginalId: aluno.turmaOriginalId,
    });
    setErro("");
    setDialogoAberto(true);
  }, []);

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const corpo = {
      nome: formulario.nome,
      turmaId: formulario.turmaId,
      // Na edição a origem vai sempre, para mudar de turma não mexer nela.
      ...(emEdicao || formulario.turmaOriginalId !== formulario.turmaId
        ? { turmaOriginalId: formulario.turmaOriginalId }
        : {}),
    };
    try {
      if (emEdicao) {
        await pedir<{ aluno: Aluno }>(`/api/alunos/${emEdicao.id}`, corpoAlteracao("PATCH", corpo));
        avisarSucesso(
          emEdicao.turmaId !== formulario.turmaId ? "Aluno movido de turma." : "Aluno atualizado.",
          "O histórico e a turma de origem foram preservados.",
        );
      } else {
        await pedir<{ aluno: Aluno }>("/api/alunos", corpoJson(corpo));
        avisarSucesso("Aluno cadastrado.", "O aluno entra na chamada de hoje e nos próximos dias.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o aluno.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar o aluno." });
    } finally {
      setEnviando(false);
    }
  }

  const alternarAtivo = useCallback(
    (aluno: Aluno) => {
      void executarPorChave(aluno.id, async () => {
        try {
          await pedir<{ aluno: Aluno }>(
            `/api/alunos/${aluno.id}`,
            corpoAlteracao("PATCH", { ativo: !aluno.ativo }),
          );
          avisarSucesso(aluno.ativo ? "Aluno desativado." : "Aluno reativado.");
          await onMudanca();
        } catch (excecao) {
          avisarErro(excecao, { contexto: "Não foi possível alterar o aluno." });
        }
      });
    },
    [executarPorChave, onMudanca],
  );

  function alternarDesistencia(aluno: Aluno) {
    void executarPorChave(aluno.id, async () => {
      try {
        await pedir<{ aluno: Aluno }>(
          `/api/alunos/${aluno.id}`,
          corpoAlteracao("PATCH", { desistente: !aluno.desistenteEm }),
        );
        avisarSucesso(
          aluno.desistenteEm ? "Desistência desfeita." : "Aluno marcado como desistente.",
        );
        setDialogoAberto(false);
        await onMudanca();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação." });
      }
    });
  }

  const excluir = useCallback(
    (aluno: Aluno) => {
      void executarPorChave(aluno.id, async () => {
        try {
          await pedir<{ ok: boolean }>(`/api/alunos/${aluno.id}`, corpoAlteracao("DELETE"));
          avisarSucesso("Aluno excluído.");
          await onMudanca();
        } catch (excecao) {
          avisarErro(excecao, { contexto: "Não foi possível excluir o aluno." });
        }
      });
    },
    [executarPorChave, onMudanca],
  );

  // A relação sai no mesmo schema da importação: turmas na ordem do cadastro e
  // alunos ativos na ordem da chamada.
  function prepararRelacao() {
    const posicao = new Map(turmas.map((turma, indice) => [turma.id, indice]));
    const linhas = alunos
      .filter((aluno) => aluno.ativo)
      .sort(
        (a, b) =>
          (posicao.get(a.turmaId) ?? 0) - (posicao.get(b.turmaId) ?? 0) ||
          a.ordem - b.ordem ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      )
      .map((aluno) => ({
        turmaAtual: rotulo(aluno.turmaId),
        ordem: aluno.ordem,
        nome: aluno.nome,
        turmaOriginal: rotulo(aluno.turmaOriginalId),
      }));
    const blob = new Blob([relacaoParaCsv(linhas)], { type: "text/csv;charset=utf-8" });
    return {
      blob,
      nome: "frequenciapp-relacao-alunos.csv",
      nomeNoZip: "relacao-alunos.csv",
      nomeZip: "frequenciapp-relacao-alunos.zip",
      registro: "relacao" as const,
    };
  }

  function confirmarAcaoAluno() {
    const acao = acaoAluno;
    setAcaoAluno(null);
    if (!acao) return;
    if (acao.tipo === "excluir") excluir(acao.aluno);
    else alternarAtivo(acao.aluno);
  }

  const alunoConfirmado = acaoAluno?.aluno;
  const tituloAcao =
    acaoAluno?.tipo === "excluir"
      ? `Excluir ${alunoConfirmado?.nome ?? ""}?`
      : alunoConfirmado?.ativo
        ? `Desativar ${alunoConfirmado.nome}?`
        : `Reativar ${alunoConfirmado?.nome ?? ""}?`;
  const descricaoAcao =
    acaoAluno?.tipo === "excluir"
      ? "A exclusão é definitiva e apaga também faltas, saídas e entradas do aluno. Para preservar o histórico, desative em vez de excluir."
      : alunoConfirmado?.ativo
        ? "O aluno sai das chamadas futuras, mas o histórico existente é preservado. Para apagar os dados, use a exclusão."
        : "O aluno volta a aparecer nas chamadas futuras. O histórico existente é preservado.";

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        useFlexGap
        sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between" }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {modoSelecao
            ? `${selecionados.size} ${
                selecionados.size === 1 ? "aluno selecionado" : "alunos selecionados"
              }`
            : `${alunos.length} no total · ${ativos} ativos`}
        </Typography>
        {modoSelecao ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Botao
              variante="contorno"
              icone={<CheckRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={alternarTodos}
            >
              Selecionar todos
            </Botao>
            <Botao variante="texto" sx={{ whiteSpace: "nowrap" }} onClick={cancelarSelecao}>
              Cancelar
            </Botao>
          </Stack>
        ) : (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap", justifyContent: { xs: "flex-start", sm: "flex-end" } }}
          >
            <Botao
              variante="contorno"
              icone={<FileUploadRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={() => setImportarAberto(true)}
              disabled={turmas.length === 0}
            >
              Importar relação
            </Botao>
            <Botao
              variante="contorno"
              icone={<FileDownloadRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={() => setDownloadAberto(true)}
              disabled={ativos === 0}
            >
              Exportar relação
            </Botao>
            <Botao
              variante="contorno"
              icone={<CheckRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={() => setModoSelecao(true)}
              disabled={turmas.length === 0 || alunos.length === 0}
            >
              Definir origem
            </Botao>
            <DialogoRestaurarOrigens turmas={turmas} alunos={alunos} onMudanca={onMudanca} />
            <Botao
              variante="secundario"
              icone={<AddRoundedIcon />}
              sx={{ whiteSpace: "nowrap" }}
              onClick={abrirNovo}
              disabled={turmas.length === 0}
            >
              Novo aluno
            </Botao>
          </Stack>
        )}
      </Stack>

      {modoSelecao ? (
        <SecaoConteudo descricao="Mudar a turma de origem não move o aluno. A Grade e a planilha passam a agrupar o histórico pela origem escolhida.">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "stretch", sm: "flex-end" } }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Campo id="origem-em-massa" rotulo="Turma de origem">
                <Selecionar
                  valor={origemEmMassa}
                  buscavel
                  onValor={setOrigemEmMassa}
                  placeholder="Escolha a turma"
                  opcoes={opcoesTurma}
                />
              </Campo>
            </Box>
            <Botao
              variante="secundario"
              icone={<CheckRoundedIcon />}
              carregando={aplicando}
              disabled={selecionados.size === 0 || origemEmMassa === ""}
              onClick={() => setConfirmarOrigem(true)}
            >
              Aplicar origem
            </Botao>
          </Stack>
        </SecaoConteudo>
      ) : null}

      <BarraBusca
        id="busca-gestao-aluno"
        valor={busca}
        onValor={setBusca}
        placeholder="Buscar aluno"
      />

      {turmas.length === 0 ? (
        <EstadoVazio
          icone={<PersonAddRoundedIcon />}
          titulo="Nenhuma turma cadastrada"
          descricao="Crie séries e turmas antes de cadastrar alunos."
        />
      ) : gruposFiltrados.length === 0 ||
        gruposFiltrados.every(([, , lista]) => lista.length === 0) ? (
        <EstadoVazio
          icone={<SearchOffRoundedIcon />}
          titulo="Nenhum aluno encontrado"
          descricao={
            busca === "" ? "Cadastre o primeiro aluno da turma." : "Nenhum aluno com esse nome."
          }
        />
      ) : (
        <TabelaPadrao caption="Alunos por turma, com a origem quando ela difere da turma atual.">
          <TableHead>
            <TableRow>
              <TableCell scope="col">Ordem</TableCell>
              <TableCell scope="col">Aluno</TableCell>
              {!modoSelecao ? (
                <TableCell scope="col" align="right">
                  Ações
                </TableCell>
              ) : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {gruposFiltrados
              .filter(([, , lista]) => lista.length > 0)
              .map(([id, turma, lista]) => (
                <Fragment key={id}>
                  <TableRow sx={{ backgroundColor: "action.hover" }}>
                    <TableCell colSpan={modoSelecao ? 2 : 3} component="th" scope="colgroup">
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                      >
                        <Typography component="h2" variant="subtitle2" sx={{ m: 0 }}>
                          {turma?.rotulo ?? "Turma"}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {lista.filter((aluno) => aluno.ativo).length} ativos
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  {lista.map((aluno) => (
                    <LinhaAluno
                      key={aluno.id}
                      aluno={aluno}
                      origem={rotulo(aluno.turmaOriginalId)}
                      modoSelecao={modoSelecao}
                      selecionado={selecionados.has(aluno.id)}
                      ocupado={chaveAtiva === aluno.id}
                      onSelecionar={alternarSelecao}
                      onEditar={abrirEdicao}
                      onAlternarAtivo={(selecionado) =>
                        setAcaoAluno({ tipo: "ativo", aluno: selecionado })
                      }
                      onExcluir={(selecionado) =>
                        setAcaoAluno({ tipo: "excluir", aluno: selecionado })
                      }
                    />
                  ))}
                </Fragment>
              ))}
          </TableBody>
        </TabelaPadrao>
      )}

      <Dialogo
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo aluno"}
        acoes={
          <>
            <Botao variante="texto" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Botao>
            <Botao variante="secundario" carregando={enviando} onClick={() => void submeter()}>
              {emEdicao ? "Salvar" : "Cadastrar"}
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
            <Campo id="nome-aluno-gestao" rotulo="Nome">
              <CampoTexto
                valor={formulario.nome}
                onValor={(nome) => setFormulario((atual) => ({ ...atual, nome }))}
                required
                maxLength={100}
                autoComplete="off"
                placeholder="Nome do aluno"
              />
            </Campo>
            <Campo
              id="turma-aluno-gestao"
              rotulo="Turma atual"
              descricao={
                emEdicao
                  ? "Escolha outra turma para mover o aluno. As chamadas anteriores e a turma de origem são preservadas."
                  : undefined
              }
            >
              <Selecionar
                valor={formulario.turmaId}
                buscavel
                onValor={(turmaId) =>
                  setFormulario((atual) => ({
                    ...atual,
                    turmaId,
                    // Só o cadastro novo acompanha a turma; na edição a origem
                    // do aluno fica como está.
                    turmaOriginalId:
                      emEdicao === null && atual.turmaOriginalId === atual.turmaId
                        ? turmaId
                        : atual.turmaOriginalId,
                  }))
                }
                opcoes={opcoesTurma}
              />
            </Campo>
            {emEdicao && emEdicao.ativo ? (
              <Box>
                <Botao
                  variante="contorno"
                  icone={<PersonOffRoundedIcon />}
                  disabled={chaveAtiva === emEdicao.id}
                  onClick={() => setConfirmarDesistencia(true)}
                >
                  {emEdicao.desistenteEm ? "Desfazer desistência" : "Marcar como desistente"}
                </Botao>
              </Box>
            ) : null}
            <Campo
              id="origem-aluno-gestao"
              rotulo="Turma de origem"
              descricao="Para a Grade do mês. Por padrão é a própria turma; mude quando o aluno veio de outra."
            >
              <Selecionar
                valor={formulario.turmaOriginalId}
                buscavel
                onValor={(turmaOriginalId) =>
                  setFormulario((atual) => ({ ...atual, turmaOriginalId }))
                }
                opcoes={opcoesTurma}
              />
            </Campo>
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </form>
      </Dialogo>

      <DialogoConfirmacao
        aberto={acaoAluno !== null}
        titulo={tituloAcao}
        descricao={descricaoAcao}
        rotuloConfirmar={
          acaoAluno?.tipo === "excluir"
            ? "Excluir"
            : alunoConfirmado?.ativo
              ? "Desativar"
              : "Reativar"
        }
        destrutivo={acaoAluno?.tipo === "excluir"}
        operacaoEmAndamento={alunoConfirmado?.id === chaveAtiva}
        onConfirmar={confirmarAcaoAluno}
        onCancelar={() => setAcaoAluno(null)}
      />

      <DialogoConfirmacao
        aberto={confirmarDesistencia && emEdicao !== null}
        titulo={
          emEdicao?.desistenteEm
            ? `Desfazer a desistência de ${emEdicao.nome}?`
            : `Marcar ${emEdicao?.nome ?? ""} como desistente?`
        }
        descricao={
          emEdicao?.desistenteEm
            ? "O aluno volta a poder receber marcas nas chamadas atuais. Os registros anteriores permanecem."
            : "O aluno continua visível na Chamada, com a marcação bloqueada. As faltas anteriores permanecem."
        }
        rotuloConfirmar="Confirmar"
        operacaoEmAndamento={emEdicao !== null && chaveAtiva === emEdicao.id}
        onConfirmar={() => {
          setConfirmarDesistencia(false);
          if (emEdicao) alternarDesistencia(emEdicao);
        }}
        onCancelar={() => setConfirmarDesistencia(false)}
      />

      <DialogoConfirmacao
        aberto={confirmarOrigem}
        titulo="Aplicar origem em massa?"
        descricao={`A origem de ${selecionados.size} ${
          selecionados.size === 1 ? "aluno selecionado" : "alunos selecionados"
        } passa a ser ${rotulo(origemEmMassa)}. A turma atual não muda; a Grade e a planilha usam a nova origem.`}
        rotuloConfirmar="Aplicar origem"
        operacaoEmAndamento={aplicando}
        onConfirmar={() => {
          setConfirmarOrigem(false);
          void aplicarOrigem();
        }}
        onCancelar={() => setConfirmarOrigem(false)}
      />

      <DialogoDownload
        aberto={downloadAberto}
        onAbrir={setDownloadAberto}
        preparar={prepararRelacao}
        onConcluido={() =>
          avisarSucesso(
            "Relação exportada.",
            "O arquivo leva os alunos ativos no padrão CSV da importação.",
          )
        }
      />
      <DialogoImportarRelacao
        aberto={importarAberto}
        onAbrir={setImportarAberto}
        turmas={turmas}
        onImportado={onMudanca}
      />
    </Stack>
  );
}
