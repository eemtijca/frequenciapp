"use client";

// Provas específicas (Enem, vestibulares e similares): lista de provas, alunos inscritos e frequência por aluno.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Box from "@mui/material/Box";
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
  resumirMarcas,
  type MarcaDaProva,
  type ParticipanteDaProva,
  type ProvaEspecifica,
} from "@/domain/provas-especificas";
import { corpoAlteracao, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao } from "@/components/ui/mui/botao";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selo } from "@/components/ui/mui/selo";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { DialogoAlunosProva } from "@/components/provas/dialogo-alunos-prova";
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

function ResumoDaProva({ prova }: { prova: ProvaEspecifica }) {
  const pendentes = prova.total - prova.presentes - prova.ausentes;
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <Selo rotulo={contarAlunos(prova.total)} />
      {prova.presentes > 0 ? <Selo tom="sucesso" rotulo={`${prova.presentes} presentes`} /> : null}
      {prova.ausentes > 0 ? <Selo tom="perigo" rotulo={`${prova.ausentes} ausentes`} /> : null}
      {pendentes > 0 && prova.total > 0 ? (
        <Selo tom="atencao" rotulo={`${pendentes} sem registro`} />
      ) : null}
    </Stack>
  );
}

interface LinhaProps {
  participante: ParticipanteDaProva;
  turma: string;
  ocupado: boolean;
  onMarcar: (alunoId: string, marca: MarcaDaProva) => void;
}

function LinhaDoParticipante({ participante, turma, ocupado, onMarcar }: LinhaProps) {
  const { alunoId, nome, presente } = participante;
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
      sx={{ gap: 1.5, py: 1, flexWrap: "wrap", "&:last-of-type": { borderBottom: 0 } }}
    >
      <Box sx={{ minWidth: 0, flex: "1 1 200px", overflowWrap: "anywhere" }}>
        <Typography sx={{ fontWeight: 500 }}>{nome}</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {turma}
        </Typography>
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
  const [aberturas, setAberturas] = useState(0);
  const [dialogo, setDialogo] = useState<"nova" | "editar" | "alunos" | "remover" | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const { chaveAtiva, executar: executarPorAluno } = useAcoesPorChave();
  const pedidoDetalhe = useRef(0);

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
    setAbertaId(id);
    setDetalhe(null);
    setBusca("");
    lerDetalhe(id).catch((excecao) => {
      setAbertaId(null);
      avisarErro(excecao, { contexto: "Não foi possível abrir a prova." });
    });
  }

  function voltarParaLista() {
    pedidoDetalhe.current += 1;
    setAbertaId(null);
    setDetalhe(null);
    lerLista().catch(() => undefined);
  }

  function abrirDialogo(tipo: "nova" | "editar" | "alunos" | "remover") {
    setAberturas((atual) => atual + 1);
    setDialogo(tipo);
  }

  async function marcar(alunoId: string, marca: MarcaDaProva) {
    if (!detalhe) return;
    const anterior = detalhe;
    const participantes = detalhe.participantes.map((item) =>
      item.alunoId === alunoId ? { ...item, presente: marca } : item,
    );
    const contagem = resumirMarcas(participantes.map((item) => item.presente));
    setDetalhe({
      prova: { ...detalhe.prova, presentes: contagem.presentes, ausentes: contagem.ausentes },
      participantes,
    });
    await executarPorAluno(alunoId, async () => {
      try {
        const dados = await pedir<Detalhe>(
          `/api/provas/${anterior.prova.id}/frequencia`,
          corpoAlteracao("PUT", { marcas: [{ alunoId, presente: marca }] }),
        );
        setDetalhe(dados);
      } catch (excecao) {
        setDetalhe(anterior);
        avisarErro(excecao, { contexto: "Não foi possível salvar a frequência." });
      }
    });
  }

  async function marcarPendentesComoPresentes() {
    if (!detalhe) return;
    const marcas = detalhe.participantes
      .filter((item) => item.presente === null)
      .map((item) => ({ alunoId: item.alunoId, presente: true }));
    if (marcas.length === 0) return;
    await executarPorAluno("todos", async () => {
      try {
        const dados = await pedir<Detalhe>(
          `/api/provas/${detalhe.prova.id}/frequencia`,
          corpoAlteracao("PUT", { marcas }),
        );
        setDetalhe(dados);
        avisarSucesso(
          "Presenças registradas.",
          `${contarAlunos(marcas.length)} marcados como presentes.`,
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível salvar a frequência." });
      }
    });
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

  const participantesFiltrados = useMemo(() => {
    if (!detalhe) return [];
    const termo = normalizar(busca);
    return termo === ""
      ? detalhe.participantes
      : detalhe.participantes.filter((item) => normalizar(item.nome).includes(termo));
  }, [detalhe, busca]);

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
            <ResumoDaProva prova={prova} />
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
                  disabled={chaveAtiva === "todos"}
                  onClick={() => void marcarPendentesComoPresentes()}
                  sx={{ minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Marcar sem registro como presentes
                </Botao>
              ) : null}
            </Stack>
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
                <List disablePadding aria-label="Alunos da prova">
                  {participantesFiltrados.map((participante) => (
                    <LinhaDoParticipante
                      key={participante.alunoId}
                      participante={participante}
                      turma={rotuloDe.get(participante.turmaId) ?? "Turma"}
                      ocupado={chaveAtiva === participante.alunoId || chaveAtiva === "todos"}
                      onMarcar={(alunoId, marca) => void marcar(alunoId, marca)}
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
