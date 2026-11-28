"use client";

// Provas específicas (Enem, vestibulares e similares): lista de provas, alunos inscritos e frequência por aluno.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  normalizar,
  rotuloData,
  rotuloDiaSemana,
  type Aluno,
  type Turma,
} from "@/domain/frequencia";
import {
  agruparPorLocal,
  chaveDoGrupoDeLocal,
  comMarca,
  enderecoNoOpenStreetMap,
  resolverLocalDoAluno,
  rotuloDasCoordenadas,
  type LocalGravado,
  type MarcaDaProva,
  type ParticipanteDaProva,
  type ProvaEspecifica,
} from "@/domain/provas-especificas";
import { corpoAlteracao, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnicaComChave } from "@/lib/use-acao-unica";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { ESTILO_ALVO_TOQUE } from "@/components/ui/mui/alvo-toque";
import { Botao } from "@/components/ui/mui/botao";
import { ESTILO_TEXTO_OCULTO } from "@/components/ui/mui/texto-de-carregamento";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selo } from "@/components/ui/mui/selo";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { DialogoAlunosProva } from "@/components/provas/dialogo-alunos-prova";
import { DialogoColarLocais } from "@/components/provas/dialogo-colar-locais";
import { DialogoLocalDoAluno } from "@/components/provas/dialogo-local-aluno";
import { DialogoProva } from "@/components/provas/dialogo-prova";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface Props {
  alunos: Aluno[];
  turmas: Turma[];
  diaCorrente: string;
  fuso: string;
}

interface Detalhe {
  prova: ProvaEspecifica;
  participantes: ParticipanteDaProva[];
}

function rotuloDoDia(dia: string): string {
  const nome = rotuloDiaSemana(dia);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${rotuloData(dia)}`;
}

function contarAlunos(quantidade: number): string {
  return quantidade === 1 ? "1 aluno" : `${quantidade} alunos`;
}

function contarMarcados(quantidade: number, singular: string, plural: string): string {
  return quantidade === 1 ? `1 ${singular}` : `${quantidade} ${plural}`;
}

function ResumoDaProva({
  prova,
  completo = false,
}: {
  prova: ProvaEspecifica;
  completo?: boolean;
}) {
  const pendentes = prova.total - prova.presentes - prova.ausentes;
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <Selo rotulo={contarAlunos(prova.total)} />
      {completo || prova.presentes > 0 ? (
        <Selo tom="sucesso" rotulo={contarMarcados(prova.presentes, "presente", "presentes")} />
      ) : null}
      {completo || prova.ausentes > 0 ? (
        <Selo tom="perigo" rotulo={contarMarcados(prova.ausentes, "ausente", "ausentes")} />
      ) : null}
      {completo || (pendentes > 0 && prova.total > 0) ? (
        <Selo tom="atencao" rotulo={`${pendentes} sem registro`} />
      ) : null}
    </Stack>
  );
}

interface LinhaProps {
  participante: ParticipanteDaProva;
  prova: Pick<ProvaEspecifica, "local" | "latitude" | "longitude">;
  turma: string;
  ocupado: boolean;
  selecionado: boolean;
  onSelecionar: (alunoId: string, marcado: boolean) => void;
  onMarcar: (alunoId: string, marca: MarcaDaProva) => void;
  onEditarLocal: (alunoId: string) => void;
}

function textoDoLocal(resolvido: ReturnType<typeof resolverLocalDoAluno>): string {
  if (resolvido.local) {
    return resolvido.proprio ? resolvido.local : `${resolvido.local} (local da prova)`;
  }
  if (resolvido.latitude !== null && resolvido.longitude !== null) {
    return resolvido.proprio ? "Ponto no mapa" : "Ponto no mapa (local da prova)";
  }
  return "Sem local";
}

function LinhaDoParticipante({
  participante,
  prova,
  turma,
  ocupado,
  selecionado,
  onSelecionar,
  onMarcar,
  onEditarLocal,
}: LinhaProps) {
  const { alunoId, nome, presente } = participante;
  const resolvido = resolverLocalDoAluno(participante, prova);
  const temPonto = resolvido.latitude !== null && resolvido.longitude !== null;
  function estilo(ativa: boolean, cor: "success" | "error") {
    return {
      minHeight: TOKENS_LAYOUT.alvoToque,
      minWidth: 96,
      ...(ativa && {
        bgcolor: `${cor}.main`,
        color: `${cor}.contrastText`,
        borderColor: `${cor}.main`,
        "&:hover": { bgcolor: `${cor}.dark` },
      }),
    };
  }
  return (
    <ListItem
      divider
      sx={{ gap: 1, py: 1, flexWrap: "wrap", "&:last-of-type": { borderBottom: 0 } }}
    >
      <Checkbox
        checked={selecionado}
        disabled={ocupado}
        onChange={(evento) => onSelecionar(alunoId, evento.target.checked)}
        slotProps={{ input: { "aria-label": `Selecionar ${nome}` } }}
        sx={{
          flexShrink: 0,
          minWidth: TOKENS_LAYOUT.alvoToque,
          minHeight: TOKENS_LAYOUT.alvoToque,
        }}
      />
      <Box sx={{ minWidth: 0, flex: "1 1 200px", overflowWrap: "anywhere" }}>
        <Typography sx={{ fontWeight: 500 }}>{nome}</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
          {turma}
          {" · "}
          {textoDoLocal(resolvido)}
        </Typography>
        {temPonto && resolvido.latitude !== null && resolvido.longitude !== null ? (
          <Link
            href={enderecoNoOpenStreetMap(resolvido.latitude, resolvido.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            variant="caption"
            sx={ESTILO_ALVO_TOQUE}
          >
            Abrir local no OpenStreetMap
            <Box component="span" sx={ESTILO_TEXTO_OCULTO}>
              {" "}
              (abre em nova aba)
            </Box>
          </Link>
        ) : null}
        <Botao
          variante="texto"
          disabled={ocupado}
          onClick={() => onEditarLocal(alunoId)}
          sx={{ minHeight: TOKENS_LAYOUT.alvoToque, px: 0 }}
        >
          Alterar local
        </Botao>
      </Box>
      <Stack
        role="group"
        aria-label={`Frequência de ${nome}`}
        direction="row"
        spacing={1}
        sx={{ flexShrink: 0 }}
      >
        <Botao
          variante="contorno"
          aria-pressed={presente === true}
          disabled={ocupado}
          onClick={() => onMarcar(alunoId, presente === true ? null : true)}
          sx={estilo(presente === true, "success")}
        >
          Presente
        </Botao>
        <Botao
          variante="contorno"
          aria-pressed={presente === false}
          disabled={ocupado}
          onClick={() => onMarcar(alunoId, presente === false ? null : false)}
          sx={estilo(presente === false, "error")}
        >
          Ausente
        </Botao>
      </Stack>
    </ListItem>
  );
}

export default function VistaProvas({ alunos, turmas, diaCorrente, fuso }: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const [provas, setProvas] = useState<ProvaEspecifica[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erroLeitura, setErroLeitura] = useState("");
  useLeituraDaVisao(!carregado && !erroLeitura);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [alunoDoLocal, setAlunoDoLocal] = useState<string | null>(null);
  const [aberturas, setAberturas] = useState(0);
  const [dialogo, setDialogo] = useState<
    "nova" | "editar" | "alunos" | "remover" | "local" | "locais" | "colar" | null
  >(null);
  const [removendo, setRemovendo] = useState(false);
  const { chaveAtiva, executar: executarFrequencia } = useAcaoUnicaComChave();
  const pedidoDetalhe = useRef(0);
  const abertaIdRef = useRef<string | null>(null);

  const rotuloDe = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma.rotulo])),
    [turmas],
  );

  const lerLista = useCallback(async () => {
    const dados = await pedir<{ provas: ProvaEspecifica[] }>("/api/provas");
    setProvas(dados.provas);
  }, []);

  const lerDetalhe = useCallback(async (id: string) => {
    const pedido = ++pedidoDetalhe.current;
    const dados = await pedir<Detalhe>(`/api/provas/${id}`);
    if (pedido === pedidoDetalhe.current) setDetalhe(dados);
  }, []);

  const marcarAtualizado = useAtualizacaoTela("provas", async () => {
    await lerLista();
    if (abertaId) await lerDetalhe(abertaId);
  });

  useEffect(() => {
    let atual = true;
    pedir<{ provas: ProvaEspecifica[] }>("/api/provas")
      .then((dados) => {
        if (!atual) return;
        setProvas(dados.provas);
        setErroLeitura("");
        marcarAtualizado();
      })
      .catch(() => {
        if (atual) setErroLeitura("Não foi possível ler as provas.");
      })
      .finally(() => {
        if (atual) setCarregado(true);
      });
    return () => {
      atual = false;
    };
  }, [marcarAtualizado]);

  function abrirProva(id: string) {
    abertaIdRef.current = id;
    setAbertaId(id);
    setDetalhe(null);
    setBusca("");
    setFiltroLocal("");
    setSelecionados([]);
    setAlunoDoLocal(null);
    lerDetalhe(id).catch((excecao) => {
      abertaIdRef.current = null;
      setAbertaId(null);
      avisarErro(excecao, { contexto: "Não foi possível abrir a prova." });
    });
  }

  function voltarParaLista() {
    abertaIdRef.current = null;
    pedidoDetalhe.current += 1;
    setAbertaId(null);
    setDetalhe(null);
    setFiltroLocal("");
    setSelecionados([]);
    setAlunoDoLocal(null);
    lerLista().catch(() => undefined);
  }

  function abrirDialogo(
    tipo: "nova" | "editar" | "alunos" | "remover" | "local" | "locais" | "colar",
  ) {
    setAberturas((atual) => atual + 1);
    setDialogo(tipo);
  }

  async function marcar(alunoId: string, marca: MarcaDaProva) {
    if (!detalhe) return;
    const provaId = detalhe.prova.id;
    const anterior = detalhe;
    await executarFrequencia(alunoId, async () => {
      setDetalhe(comMarca(anterior, alunoId, marca));
      try {
        const dados = await pedir<Detalhe>(
          `/api/provas/${provaId}/frequencia`,
          corpoAlteracao("PUT", { marcas: [{ alunoId, presente: marca }] }),
        );
        if (abertaIdRef.current !== provaId) return;
        setDetalhe(dados);
      } catch (excecao) {
        if (abertaIdRef.current !== provaId) return;
        setDetalhe(anterior);
        avisarErro(excecao, { contexto: "Não foi possível salvar a frequência." });
      }
    });
  }

  async function marcarPendentesComoPresentes() {
    if (!detalhe) return;
    const provaId = detalhe.prova.id;
    const marcas = detalhe.participantes
      .filter((item) => item.presente === null)
      .map((item) => ({ alunoId: item.alunoId, presente: true }));
    if (marcas.length === 0) return;
    await executarFrequencia("todos", async () => {
      try {
        const dados = await pedir<Detalhe>(
          `/api/provas/${provaId}/frequencia`,
          corpoAlteracao("PUT", { marcas }),
        );
        if (abertaIdRef.current !== provaId) return;
        setDetalhe(dados);
        avisarSucesso(
          "Presenças registradas.",
          `${contarAlunos(marcas.length)} marcados como presentes.`,
        );
      } catch (excecao) {
        if (abertaIdRef.current === provaId) {
          avisarErro(excecao, { contexto: "Não foi possível salvar a frequência." });
        }
      }
    });
  }

  function alternarSelecao(alunoId: string, marcado: boolean) {
    setSelecionados((atuais) => {
      if (marcado) return atuais.includes(alunoId) ? atuais : [...atuais, alunoId];
      return atuais.filter((id) => id !== alunoId);
    });
  }

  function selecionarVisiveis(ids: string[], marcado: boolean) {
    setSelecionados((atuais) => {
      if (marcado) return [...new Set([...atuais, ...ids])];
      const ocultar = new Set(ids);
      return atuais.filter((id) => !ocultar.has(id));
    });
  }

  async function salvarLocais(locais: Array<{ alunoId: string } & LocalGravado>) {
    if (!detalhe || locais.length === 0) return;
    const provaId = detalhe.prova.id;
    try {
      const dados = await pedir<Detalhe>(
        `/api/provas/${provaId}/locais`,
        corpoAlteracao("PUT", { locais }),
      );
      if (abertaIdRef.current !== provaId) return;
      setDetalhe(dados);
      setDialogo(null);
      setSelecionados([]);
      setAlunoDoLocal(null);
      avisarSucesso(
        "Local atualizado.",
        locais.length === 1
          ? "O local do aluno foi gravado."
          : `Local gravado para ${contarAlunos(locais.length)}.`,
      );
    } catch (excecao) {
      if (abertaIdRef.current === provaId) {
        avisarErro(excecao, { contexto: "Não foi possível salvar o local." });
      }
    }
  }

  async function salvarAlunos(alunoIds: string[]) {
    if (!detalhe) return;
    try {
      const dados = await pedir<Detalhe>(
        `/api/provas/${detalhe.prova.id}/participantes`,
        corpoAlteracao("PUT", { alunoIds }),
      );
      setDetalhe(dados);
      setDialogo(null);
      avisarSucesso("Alunos da prova atualizados.", `${contarAlunos(dados.prova.total)} na prova.`);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível salvar os alunos da prova." });
    }
  }

  async function removerProva() {
    if (!detalhe || removendo) return;
    setRemovendo(true);
    try {
      await pedir(`/api/provas/${detalhe.prova.id}`, corpoAlteracao("DELETE"));
      avisarSucesso("Prova removida.");
      setDialogo(null);
      voltarParaLista();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível remover a prova." });
    } finally {
      setRemovendo(false);
    }
  }

  const gruposDeLocal = useMemo(
    () => (detalhe ? agruparPorLocal(detalhe.participantes, detalhe.prova) : []),
    [detalhe],
  );
  const filtroAtivo = gruposDeLocal.some((grupo) => grupo.chave === filtroLocal) ? filtroLocal : "";

  const participantesFiltrados = useMemo(() => {
    if (!detalhe) return [];
    const termo = normalizar(busca);
    return detalhe.participantes.filter((item) => {
      if (termo !== "" && !normalizar(item.nome).includes(termo)) return false;
      if (filtroAtivo === "") return true;
      return chaveDoGrupoDeLocal(resolverLocalDoAluno(item, detalhe.prova).local) === filtroAtivo;
    });
  }, [detalhe, busca, filtroAtivo]);

  const idsVisiveis = participantesFiltrados.map((item) => item.alunoId);
  const visiveisMarcados = idsVisiveis.filter((id) => selecionados.includes(id)).length;
  const alunoEmEdicao =
    detalhe?.participantes.find((item) => item.alunoId === alunoDoLocal) ?? null;

  const dialogos = (
    <>
      <DialogoProva
        key={`prova-${aberturas}`}
        aberto={dialogo === "nova" || dialogo === "editar"}
        prova={dialogo === "editar" && detalhe ? detalhe.prova : null}
        diaCorrente={diaCorrente}
        onFechar={() => setDialogo(null)}
        onSalvo={(id) => {
          setDialogo(null);
          lerLista().catch(() => undefined);
          if (abertaId === id) lerDetalhe(id).catch(() => undefined);
          else abrirProva(id);
        }}
      />
      <DialogoAlunosProva
        key={`alunos-${aberturas}`}
        aberto={dialogo === "alunos"}
        alunos={alunos}
        turmas={turmas}
        inscritos={detalhe?.participantes.map((item) => item.alunoId) ?? []}
        onFechar={() => setDialogo(null)}
        onSalvar={salvarAlunos}
      />
      <DialogoLocalDoAluno
        key={`local-${aberturas}`}
        aberto={dialogo === "local" || dialogo === "locais"}
        alunos={dialogo === "local" ? 1 : selecionados.length}
        nome={alunoEmEdicao?.nome}
        localInicial={dialogo === "local" ? (alunoEmEdicao?.local ?? null) : null}
        pontoInicial={
          dialogo === "local" &&
          alunoEmEdicao &&
          alunoEmEdicao.latitude !== null &&
          alunoEmEdicao.longitude !== null
            ? { latitude: alunoEmEdicao.latitude, longitude: alunoEmEdicao.longitude }
            : null
        }
        onFechar={() => {
          setDialogo(null);
          setAlunoDoLocal(null);
        }}
        onSalvar={(local) => {
          const ids = dialogo === "local" && alunoDoLocal ? [alunoDoLocal] : selecionados;
          return salvarLocais(ids.map((alunoId) => ({ alunoId, ...local })));
        }}
      />
      <DialogoColarLocais
        key={`colar-${aberturas}`}
        aberto={dialogo === "colar"}
        alunos={detalhe?.participantes ?? []}
        onFechar={() => setDialogo(null)}
        onAplicar={(casados) =>
          salvarLocais(
            casados.map((item) => ({
              alunoId: item.alunoId,
              local: item.local,
              latitude: null,
              longitude: null,
            })),
          )
        }
      />
      <DialogoConfirmacao
        aberto={dialogo === "remover"}
        titulo="Remover a prova?"
        descricao={
          detalhe
            ? `${detalhe.prova.nome} sai da lista, com os alunos inscritos e a frequência registrada.`
            : ""
        }
        rotuloConfirmar="Remover prova"
        rotuloCancelar="Cancelar"
        destrutivo
        operacaoEmAndamento={removendo}
        onCancelar={() => {
          if (!removendo) setDialogo(null);
        }}
        onConfirmar={() => void removerProva()}
      />
    </>
  );

  if (abertaId) {
    const prova = detalhe?.prova;
    const pendentes = detalhe ? detalhe.participantes.filter((p) => p.presente === null).length : 0;
    return (
      <Box
        component="section"
        aria-label="Prova"
        sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
      >
        <Botao
          variante="texto"
          icone={<ArrowBackRoundedIcon />}
          onClick={voltarParaLista}
          sx={{ alignSelf: "flex-start", minHeight: TOKENS_LAYOUT.alvoToque }}
        >
          Todas as provas
        </Botao>
        {prova ? (
          <>
            <CabecalhoPagina
              compacto
              titulo={prova.nome}
              descricao={`${rotuloDoDia(prova.dia)}${prova.local ? ` · ${prova.local}` : ""}`}
              acoes={
                <>
                  <Botao
                    variante="contorno"
                    icone={<EditRoundedIcon />}
                    onClick={() => abrirDialogo("editar")}
                    sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                  >
                    Editar
                  </Botao>
                  <Botao
                    variante="contorno"
                    icone={<DeleteOutlineRoundedIcon />}
                    onClick={() => abrirDialogo("remover")}
                    sx={{ minHeight: TOKENS_LAYOUT.alvoToque, color: "falta.texto" }}
                  >
                    Remover
                  </Botao>
                </>
              }
            />
            {prova.latitude !== null && prova.longitude !== null ? (
              <Stack
                direction="row"
                spacing={0.75}
                useFlexGap
                sx={{ alignItems: "center", flexWrap: "wrap", color: "text.secondary" }}
              >
                <PlaceRoundedIcon fontSize="small" aria-hidden="true" />
                <Typography variant="body2">
                  Local no mapa: {rotuloDasCoordenadas(prova.latitude, prova.longitude)}
                </Typography>
                <Link
                  href={enderecoNoOpenStreetMap(prova.latitude, prova.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body2"
                  sx={ESTILO_ALVO_TOQUE}
                >
                  Abrir no OpenStreetMap
                  <Box component="span" sx={ESTILO_TEXTO_OCULTO}>
                    {" "}
                    (abre em nova aba)
                  </Box>
                </Link>
              </Stack>
            ) : null}
            <ResumoDaProva prova={prova} completo />
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Botao
                variante="principal"
                icone={<GroupAddRoundedIcon />}
                onClick={() => abrirDialogo("alunos")}
                sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
              >
                {prova.total === 0 ? "Adicionar alunos" : "Alterar alunos"}
              </Botao>
              {pendentes > 0 ? (
                <Botao
                  variante="contorno"
                  disabled={chaveAtiva !== null}
                  onClick={() => void marcarPendentesComoPresentes()}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Marcar sem registro como presentes
                </Botao>
              ) : null}
              {prova.total > 0 ? (
                <Botao
                  variante="contorno"
                  icone={<ContentPasteRoundedIcon />}
                  disabled={chaveAtiva !== null}
                  onClick={() => abrirDialogo("colar")}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Colar locais
                </Botao>
              ) : null}
              {selecionados.length > 0 ? (
                <Botao
                  variante="principal"
                  icone={<PlaceRoundedIcon />}
                  disabled={chaveAtiva !== null}
                  onClick={() => abrirDialogo("locais")}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  {selecionados.length === 1
                    ? "Definir local do selecionado"
                    : `Definir local dos ${selecionados.length} selecionados`}
                </Botao>
              ) : null}
            </Stack>
            {gruposDeLocal.length > 1 ? (
              <Stack spacing={1}>
                <Stack
                  role="group"
                  aria-label="Filtrar por local"
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: "wrap" }}
                >
                  <Selo
                    rotulo={`Todos · ${prova.total}`}
                    variant={filtroAtivo === "" ? "filled" : "outlined"}
                    aria-pressed={filtroAtivo === ""}
                    onClick={() => setFiltroLocal("")}
                  />
                  {gruposDeLocal.map((grupo) => (
                    <Selo
                      key={grupo.chave || "sem-local"}
                      rotulo={`${grupo.local ?? "Sem local"} · ${grupo.total}`}
                      variant={filtroAtivo === grupo.chave ? "filled" : "outlined"}
                      aria-pressed={filtroAtivo === grupo.chave}
                      onClick={() => setFiltroLocal(grupo.chave)}
                    />
                  ))}
                </Stack>
                <Box component="ul" aria-label="Comparecimento por local" sx={{ m: 0, pl: 2.5 }}>
                  {(filtroAtivo === ""
                    ? gruposDeLocal
                    : gruposDeLocal.filter((grupo) => grupo.chave === filtroAtivo)
                  ).map((grupo) => (
                    <Typography key={grupo.chave || "sem-local"} component="li" variant="body2">
                      {grupo.local ?? "Sem local"}:{" "}
                      {contarMarcados(grupo.presentes, "presente", "presentes")},{" "}
                      {contarMarcados(grupo.ausentes, "ausente", "ausentes")}, {grupo.pendentes} sem
                      registro
                    </Typography>
                  ))}
                </Box>
              </Stack>
            ) : null}
            {detalhe && detalhe.participantes.length > 8 ? (
              <BarraBusca
                id="busca-participantes-prova"
                valor={busca}
                onValor={setBusca}
                placeholder="Buscar aluno"
              />
            ) : null}
            {detalhe && detalhe.participantes.length === 0 ? (
              <EstadoVazio
                icone={<GroupAddRoundedIcon />}
                titulo="Nenhum aluno nesta prova"
                nivelTitulo="h3"
                descricao="Adicione os alunos que vão fazer a prova para registrar presença e ausência."
              />
            ) : participantesFiltrados.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nenhum aluno encontrado.
              </Typography>
            ) : (
              <Paper variant="outlined" sx={{ overflow: "hidden", boxShadow: "none" }}>
                {idsVisiveis.length > 0 ? (
                  <FormControlLabel
                    sx={{ minHeight: TOKENS_LAYOUT.alvoToque, mx: 0.5, my: 0.5 }}
                    control={
                      <Checkbox
                        checked={visiveisMarcados === idsVisiveis.length}
                        indeterminate={
                          visiveisMarcados > 0 && visiveisMarcados < idsVisiveis.length
                        }
                        disabled={chaveAtiva !== null}
                        onChange={(evento) =>
                          selecionarVisiveis(idsVisiveis, evento.target.checked)
                        }
                        slotProps={{ input: { "aria-label": "Selecionar os alunos visíveis" } }}
                      />
                    }
                    label="Selecionar os alunos visíveis"
                  />
                ) : null}
                <List disablePadding aria-label="Alunos da prova">
                  {participantesFiltrados.map((participante) => (
                    <LinhaDoParticipante
                      key={participante.alunoId}
                      participante={participante}
                      prova={prova}
                      turma={rotuloDe.get(participante.turmaId) ?? "Turma"}
                      ocupado={chaveAtiva !== null}
                      selecionado={selecionados.includes(participante.alunoId)}
                      onSelecionar={alternarSelecao}
                      onMarcar={(alunoId, marca) => void marcar(alunoId, marca)}
                      onEditarLocal={(alunoId) => {
                        setAlunoDoLocal(alunoId);
                        abrirDialogo("local");
                      }}
                    />
                  ))}
                </List>
              </Paper>
            )}
          </>
        ) : (
          <Typography role="status" variant="body2" color="text.secondary">
            Carregando prova...
          </Typography>
        )}
        {dialogos}
      </Box>
    );
  }

  return (
    <Box
      component="section"
      aria-label="Lista de provas"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <CabecalhoPagina
        compacto
        titulo="Provas"
        descricao="Frequência em provas como Enem e vestibulares."
        acoes={
          <>
            <AtualizadoDaVisao fuso={fuso} sx={{ whiteSpace: "normal" }} />
            <Botao
              variante="principal"
              icone={<AddRoundedIcon />}
              onClick={() => abrirDialogo("nova")}
              sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
            >
              Nova prova
            </Botao>
          </>
        }
      />
      {erroLeitura ? (
        <AlertaCompacto variante="erro_interno" titulo={erroLeitura} tamanho="linha" />
      ) : null}
      {carregado && !erroLeitura && provas.length === 0 ? (
        <EstadoVazio
          icone={<FactCheckRoundedIcon />}
          titulo="Nenhuma prova cadastrada"
          descricao="Cadastre uma prova, como o Enem, escolha os alunos e registre quem compareceu."
        />
      ) : null}
      {provas.length > 0 ? (
        <Paper variant="outlined" sx={{ overflow: "hidden", boxShadow: "none" }}>
          <List disablePadding aria-label="Provas cadastradas">
            {provas.map((prova) => (
              <ListItem
                key={prova.id}
                disablePadding
                divider
                sx={{ "&:last-of-type": { borderBottom: 0 } }}
              >
                <ListItemButton
                  onClick={() => abrirProva(prova.id)}
                  sx={{
                    minHeight: TOKENS_LAYOUT.alvoToque,
                    py: 1.5,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 0.75,
                  }}
                >
                  <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {prova.nome}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {rotuloDoDia(prova.dia)}
                  </Typography>
                  {prova.local ? (
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ alignItems: "center", color: "text.secondary" }}
                    >
                      <PlaceRoundedIcon fontSize="inherit" aria-hidden="true" />
                      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                        {prova.local}
                      </Typography>
                    </Stack>
                  ) : null}
                  <ResumoDaProva prova={prova} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      ) : null}
      {dialogos}
    </Box>
  );
}
