"use client";

// Aba de diretores de turma: cadastro com as turmas de origem acompanhadas,
// emissão da palavra-chave (mostrada uma única vez), revogação com motivo e
// situação da conta. Só leitura de estatísticas para o diretor (ADR-021).
import { useEffect, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Campo } from "@/components/ui/mui/campo";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Selo, type TomSelo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { normalizar, rotuloData, rotuloDiaSemana, type Turma } from "@/domain/frequencia";
import {
  ROTULOS_ESTADO_CREDENCIAL,
  problemaDeIdentificador,
  type DiretorDTO,
  type EstadoCredencial,
} from "@/domain/diretores";
import { useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
import { TabelaCadastrosAdministrativos } from "./tabela-cadastros-administrativos";

interface Props {
  turmas: Turma[];
  diaCorrente: string;
  atualizacao?: number;
}

interface Formulario {
  nome: string;
  identificador: string;
  turmaIds: string[];
  inicio: string;
}

const VAZIO: Formulario = { nome: "", identificador: "", turmaIds: [], inicio: "" };

const VARIANTE_ESTADO: Record<EstadoCredencial, TomSelo> = {
  sem_palavra: "neutro",
  emitida: "neutro",
  em_uso: "sucesso",
  expirada: "atencao",
  revogada: "perigo",
};

const ALVO_ACAO = {
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
} as const;

function dataCurta(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

export default function AbaDiretores({ turmas, diaCorrente, atualizacao = 0 }: Props) {
  const { avisarErro, avisarSucesso, publicarAviso } = useAvisosDaSessao();
  const [diretores, setDiretores] = useState<DiretorDTO[] | null>(null);
  useLeituraDaVisao(diretores === null);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<DiretorDTO | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [inicioBase, setInicioBase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [emitirAlvo, setEmitirAlvo] = useState<DiretorDTO | null>(null);
  const [palavraEmitida, setPalavraEmitida] = useState<{
    diretor: DiretorDTO;
    palavraChave: string;
  } | null>(null);
  const [revogarAlvo, setRevogarAlvo] = useState<DiretorDTO | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busca, setBusca] = useState("");

  const { executando: carregando, executar: recarregar } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ diretores: DiretorDTO[] }>("/api/diretores");
      setDiretores(dados.diretores);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível carregar os diretores." });
      setDiretores([]);
    }
  });
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

  useEffect(() => {
    void recarregar();
  }, [recarregar, atualizacao]);

  const turmasOrdenadas = useMemo(
    () => turmas.slice().sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
    [turmas],
  );
  const termo = normalizar(busca);
  const filtrados = (diretores ?? []).filter(
    (diretor) =>
      termo === "" ||
      normalizar(
        `${diretor.nome} ${diretor.identificador} ${diretor.turmas.map((t) => t.turma).join(" ")}`,
      ).includes(termo),
  );
  const problemaIdentificador =
    emEdicao === null && formulario.identificador.trim() !== ""
      ? problemaDeIdentificador(formulario.identificador.trim().toLowerCase())
      : null;

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario({ ...VAZIO, inicio: diaCorrente });
    setInicioBase(diaCorrente);
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(diretor: DiretorDTO) {
    setEmEdicao(diretor);
    const maisAntigo = diretor.turmas.map((vinculo) => vinculo.inicio).sort()[0] ?? diaCorrente;
    setInicioBase(maisAntigo);
    setFormulario({
      nome: diretor.nome,
      identificador: diretor.identificador,
      turmaIds: diretor.turmas.map((vinculo) => vinculo.turmaId),
      inicio: maisAntigo,
    });
    setErro("");
    setDialogoAberto(true);
  }

  function alternarTurma(turmaId: string, marcada: boolean) {
    setFormulario((atual) => ({
      ...atual,
      turmaIds: marcada
        ? [...atual.turmaIds, turmaId]
        : atual.turmaIds.filter((id) => id !== turmaId),
    }));
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      if (emEdicao) {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${emEdicao.id}`,
          corpoAlteracao("PATCH", {
            nome: formulario.nome,
            turmaIds: formulario.turmaIds,
            ...(formulario.inicio && formulario.inicio !== inicioBase
              ? { inicioVinculo: formulario.inicio }
              : {}),
          }),
        );
        avisarSucesso(
          "Diretor atualizado.",
          "Turma retirada deixa de aparecer para o diretor na hora.",
        );
      } else {
        await pedir<{ diretor: DiretorDTO }>(
          "/api/diretores",
          corpoJson({
            nome: formulario.nome,
            identificador: formulario.identificador,
            turmaIds: formulario.turmaIds,
            ...(formulario.inicio ? { inicioVinculo: formulario.inicio } : {}),
          }),
        );
        avisarSucesso(
          "Diretor cadastrado.",
          "Gere a palavra-chave para liberar o primeiro acesso.",
        );
      }
      setDialogoAberto(false);
      await recarregar();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o diretor.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar o diretor." });
    } finally {
      setEnviando(false);
    }
  }

  function emitir(diretor: DiretorDTO) {
    void executarPorChave(`emitir-${diretor.id}`, async () => {
      try {
        const dados = await pedir<{ palavraChave: string; diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}/palavra-chave`,
          corpoJson({}),
        );
        setPalavraEmitida(dados);
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível gerar a palavra-chave." });
      } finally {
        setEmitirAlvo(null);
      }
    });
  }

  function revogar(diretor: DiretorDTO) {
    void executarPorChave(`revogar-${diretor.id}`, async () => {
      try {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}/revogar`,
          corpoJson({ motivo }),
        );
        avisarSucesso(
          "Palavra-chave revogada.",
          "O acesso caiu na hora. Para liberar de novo, gere outra palavra-chave.",
        );
        setRevogarAlvo(null);
        setMotivo("");
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível revogar a palavra-chave." });
      }
    });
  }

  function alternarAtivo(diretor: DiretorDTO) {
    void executarPorChave(`ativo-${diretor.id}`, async () => {
      try {
        await pedir<{ diretor: DiretorDTO }>(
          `/api/diretores/${diretor.id}`,
          corpoAlteracao("PATCH", { ativo: !diretor.ativo }),
        );
        avisarSucesso(
          diretor.ativo ? "Diretor desativado." : "Diretor reativado.",
          diretor.ativo
            ? "O acesso é bloqueado na hora; o histórico continua."
            : "O acesso volta com a palavra-chave vigente, se ainda valer.",
        );
        await recarregar();
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a situação do diretor." });
      }
    });
  }

  async function copiarPalavra(palavra: string) {
    try {
      await navigator.clipboard.writeText(palavra);
      avisarSucesso("Palavra-chave copiada.");
    } catch {
      publicarAviso({
        severidade: "error",
        titulo: "Não foi possível copiar. Selecione e copie o texto.",
      });
    }
  }

  const podeRevogar = (diretor: DiretorDTO) =>
    diretor.estado === "emitida" || diretor.estado === "em_uso" || diretor.estado === "expirada";

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        useFlexGap
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {diretores === null
            ? null
            : `${diretores.filter((diretor) => diretor.ativo).length} ${
                diretores.filter((diretor) => diretor.ativo).length === 1
                  ? "diretor ativo"
                  : "diretores ativos"
              }`}
        </Typography>
        <Botao variante="principal" icone={<AddRoundedIcon />} onClick={abrirNovo}>
          Novo diretor
        </Botao>
      </Stack>

      {carregando && diretores === null ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: 128,
            color: "text.secondary",
          }}
        >
          <CircularProgress size={20} aria-hidden="true" />
          <TextoDeCarregamento>Carregando diretores...</TextoDeCarregamento>
        </Stack>
      ) : (diretores ?? []).length === 0 ? (
        <EstadoVazio
          icone={<PersonAddRoundedIcon />}
          titulo="Nenhum diretor de turma cadastrado"
          descricao="Cadastre cada diretor com as turmas que ele acompanha."
          acao={
            <Botao variante="contorno" icone={<AddRoundedIcon />} onClick={abrirNovo}>
              Cadastrar diretor
            </Botao>
          }
        />
      ) : (
        <Stack spacing={2}>
          <BarraBusca
            id="busca-diretores"
            valor={busca}
            onValor={setBusca}
            placeholder="Buscar por nome, identificador ou turma"
          />
          {filtrados.length === 0 ? (
            <EstadoVazio
              icone={<SearchOffRoundedIcon />}
              titulo="Nenhum diretor encontrado"
              descricao="Tente outro termo de busca."
            />
          ) : (
            <TabelaCadastrosAdministrativos
              caption="Diretores de turma, com a situação da palavra-chave."
              identidade="Diretor"
            >
              <TableBody role="rowgroup">
                {filtrados.map((diretor) => {
                  const emitindo = chaveAtiva === `emitir-${diretor.id}`;
                  const primeiraEmissao = diretor.estado === "sem_palavra";
                  return (
                    <TableRow key={diretor.id} data-diretor={diretor.identificador} role="row">
                      <TableCell component="th" scope="row" role="rowheader">
                        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600 }}>{diretor.nome}</Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
                          >
                            {diretor.identificador}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {diretor.turmas.length > 0
                              ? diretor.turmas.map((vinculo) => vinculo.turma).join(", ")
                              : "Sem turma vinculada"}
                          </Typography>
                          <Stack
                            direction="row"
                            spacing={1}
                            useFlexGap
                            sx={{ alignItems: "center", flexWrap: "wrap" }}
                          >
                            <Selo
                              rotulo={ROTULOS_ESTADO_CREDENCIAL[diretor.estado]}
                              tom={VARIANTE_ESTADO[diretor.estado]}
                              sx={{
                                height: "auto",
                                minHeight: 24,
                                "& .MuiChip-label": { whiteSpace: "normal" },
                              }}
                            />
                            {!diretor.ativo ? <Selo rotulo="desativado" /> : null}
                          </Stack>
                          {diretor.expiraEm &&
                          (diretor.estado === "emitida" || diretor.estado === "em_uso") ? (
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              Palavra válida até {dataCurta(diretor.expiraEm)}
                            </Typography>
                          ) : null}
                          {diretor.estado === "revogada" && diretor.motivoRevogacao ? (
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              Motivo: {diretor.motivoRevogacao}
                            </Typography>
                          ) : null}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" role="cell">
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          sx={{
                            justifyContent: "flex-end",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <Botao
                            variante="contorno"
                            icone={<KeyRoundedIcon />}
                            carregando={emitindo}
                            disabled={!diretor.ativo}
                            aria-label={`Gerar ${primeiraEmissao ? "" : "nova "}palavra-chave para ${diretor.nome}`}
                            sx={{
                              height: "auto",
                              minHeight: TOKENS_LAYOUT.alvoToque,
                              maxWidth: "100%",
                              textAlign: "left",
                            }}
                            onClick={() =>
                              primeiraEmissao ? emitir(diretor) : setEmitirAlvo(diretor)
                            }
                          >
                            {primeiraEmissao ? "Gerar palavra-chave" : "Gerar nova"}
                          </Botao>
                          <BotaoIcone
                            rotulo={`Editar ${diretor.nome}`}
                            icone={<EditRoundedIcon fontSize="small" />}
                            variante="texto"
                            sx={ALVO_ACAO}
                            onClick={() => abrirEdicao(diretor)}
                          />
                          <BotaoIcone
                            rotulo={
                              diretor.ativo
                                ? `Desativar ${diretor.nome}`
                                : `Reativar ${diretor.nome}`
                            }
                            icone={<PowerSettingsNewRoundedIcon fontSize="small" />}
                            variante="texto"
                            sx={ALVO_ACAO}
                            disabled={chaveAtiva === `ativo-${diretor.id}`}
                            onClick={() => alternarAtivo(diretor)}
                          />
                          {podeRevogar(diretor) ? (
                            <BotaoIcone
                              rotulo={`Revogar a palavra-chave de ${diretor.nome}`}
                              icone={<BlockRoundedIcon fontSize="small" />}
                              variante="texto"
                              sx={[ALVO_ACAO, (tema) => ({ color: tema.vars.palette.falta.texto })]}
                              onClick={() => {
                                setMotivo("");
                                setRevogarAlvo(diretor);
                              }}
                            />
                          ) : null}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TabelaCadastrosAdministrativos>
          )}
        </Stack>
      )}

      <Dialogo
        aberto={dialogoAberto}
        onFechar={() => setDialogoAberto(false)}
        titulo={emEdicao ? `Editar ${emEdicao.nome}` : "Novo diretor de turma"}
        quebrarTitulo
        tamanho="grande"
        acoes={
          <>
            <Botao variante="texto" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Botao>
            <Botao
              variante="secundario"
              carregando={enviando}
              disabled={problemaIdentificador !== null}
              onClick={() => void submeter()}
            >
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
            <Campo id="nome-diretor" rotulo="Nome">
              <CampoTexto
                valor={formulario.nome}
                onValor={(nome) => setFormulario((atual) => ({ ...atual, nome }))}
                required
                maxLength={100}
                autoComplete="off"
                placeholder="Nome do professor"
              />
            </Campo>
            <Campo
              id="identificador-diretor"
              rotulo="Identificador de acesso"
              erro={problemaIdentificador ?? undefined}
              descricao={
                emEdicao
                  ? "O identificador não muda depois de criado."
                  : "Letras minúsculas, números, ponto ou hífen. É o que o diretor digita para entrar."
              }
            >
              <CampoTexto
                valor={formulario.identificador}
                onValor={(identificador) => setFormulario((atual) => ({ ...atual, identificador }))}
                required
                maxLength={40}
                autoComplete="off"
                disabled={emEdicao !== null}
                placeholder="ex.: 3a-maria"
              />
            </Campo>
            <Box component="fieldset" sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <Typography component="legend" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Turmas acompanhadas
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Os alunos entram pela turma de origem, como na Grade e na planilha.
              </Typography>
              {turmasOrdenadas.length === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
                  Cadastre as turmas antes.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 0.5,
                    maxHeight: 224,
                    overflowY: "auto",
                    mt: 1,
                    p: 1,
                    backgroundColor: "action.hover",
                    borderRadius: 1,
                  }}
                >
                  {turmasOrdenadas.map((turma) => (
                    <FormControlLabel
                      key={turma.id}
                      control={
                        <Checkbox
                          checked={formulario.turmaIds.includes(turma.id)}
                          onChange={(evento) => alternarTurma(turma.id, evento.target.checked)}
                          slotProps={{ input: { "aria-label": turma.rotulo } }}
                        />
                      }
                      label={turma.rotulo}
                      sx={{
                        minHeight: TOKENS_LAYOUT.alvoToque,
                        m: 0,
                        px: 1,
                        borderRadius: 1,
                        minWidth: 0,
                        width: { xs: "100%", sm: "calc(50% - 4px)" },
                        "& .MuiFormControlLabel-label": { overflowWrap: "anywhere" },
                        "&:hover": { backgroundColor: "action.selected" },
                      }}
                    />
                  ))}
                </Box>
              )}
            </Box>
            <Campo id="inicio-diretor" rotulo="Acompanha desde">
              <SeletorPeriodo
                id="inicio-diretor"
                modo="dia"
                valor={formulario.inicio || diaCorrente}
                max={diaCorrente}
                rotuloAcessivel="Data de início do acompanhamento"
                rotulo={rotuloData(formulario.inicio || diaCorrente)}
                detalhe={rotuloDiaSemana(formulario.inicio || diaCorrente)}
                onValor={(inicio) => setFormulario((atual) => ({ ...atual, inicio }))}
              />
            </Campo>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {emEdicao
                ? "Só antecipa o início das turmas já acompanhadas; turmas novas começam nesta data."
                : "O diretor vê a turma a partir desta data. Use uma data passada para incluir o histórico de quando já exercia a função."}
            </Typography>
            {erro ? (
              <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            ) : null}
          </Stack>
        </form>
      </Dialogo>

      <DialogoConfirmacao
        aberto={emitirAlvo !== null}
        titulo={`Gerar nova palavra-chave para ${emitirAlvo?.nome ?? ""}?`}
        quebrarTitulo
        descricao="A palavra atual deixa de valer na hora e as sessões abertas caem. A nova aparece uma única vez."
        rotuloConfirmar="Gerar nova"
        operacaoEmAndamento={emitirAlvo !== null && chaveAtiva === `emitir-${emitirAlvo.id}`}
        onConfirmar={() => {
          const alvo = emitirAlvo;
          setEmitirAlvo(null);
          if (alvo) emitir(alvo);
        }}
        onCancelar={() => setEmitirAlvo(null)}
      />

      <Dialogo
        aberto={palavraEmitida !== null}
        onFechar={() => setPalavraEmitida(null)}
        titulo={`Palavra-chave de ${palavraEmitida?.diretor.nome ?? ""}`}
        quebrarTitulo
        descricao="Ela aparece só agora. Entregue ao diretor em mãos ou por mensagem direta; no primeiro acesso ele troca por uma palavra própria."
        acoes={
          <>
            <Botao
              variante="contorno"
              icone={<ContentCopyRoundedIcon />}
              onClick={() => {
                if (palavraEmitida) void copiarPalavra(palavraEmitida.palavraChave);
              }}
            >
              Copiar
            </Botao>
            <Botao variante="secundario" onClick={() => setPalavraEmitida(null)}>
              Já entreguei
            </Botao>
          </>
        }
      >
        <Box
          sx={(tema) => ({
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            p: 2,
            border: `1px solid ${tema.vars.palette.divider}`,
            borderRadius: 1,
            backgroundColor: "action.hover",
          })}
        >
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Identificador
          </Typography>
          <Typography
            sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, overflowWrap: "anywhere" }}
          >
            {palavraEmitida?.diretor.identificador}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 1 }}>
            Palavra-chave
          </Typography>
          <Typography
            component="span"
            data-palavra-chave
            sx={{
              fontVariantNumeric: "tabular-nums",
              fontSize: "1.125rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              userSelect: "all",
            }}
          >
            {palavraEmitida?.palavraChave}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", mt: 1 }}>
            Válida até {dataCurta(palavraEmitida?.diretor.expiraEm ?? null)}, ou até a troca.
          </Typography>
        </Box>
      </Dialogo>

      <Dialogo
        aberto={revogarAlvo !== null}
        onFechar={() => {
          if (chaveAtiva !== `revogar-${revogarAlvo?.id}`) setRevogarAlvo(null);
        }}
        titulo={`Revogar a palavra-chave de ${revogarAlvo?.nome ?? ""}?`}
        quebrarTitulo
        descricao="O acesso cai na hora, em todos os aparelhos. Use em saída da função, suspeita de vazamento ou desligamento. O motivo fica registrado."
        acoes={
          <>
            <Botao
              variante="texto"
              disabled={chaveAtiva === `revogar-${revogarAlvo?.id}`}
              onClick={() => setRevogarAlvo(null)}
            >
              Cancelar
            </Botao>
            <Botao
              variante="destrutivo"
              carregando={chaveAtiva === `revogar-${revogarAlvo?.id}`}
              disabled={motivo.trim().length < 3}
              onClick={() => {
                if (revogarAlvo) revogar(revogarAlvo);
              }}
            >
              Revogar
            </Botao>
          </>
        }
      >
        <Campo id="motivo-revogacao" rotulo="Motivo">
          <CampoTexto
            valor={motivo}
            onValor={setMotivo}
            maxLength={200}
            autoComplete="off"
            placeholder="ex.: deixou a direção da turma"
          />
        </Campo>
      </Dialogo>
    </Stack>
  );
}
