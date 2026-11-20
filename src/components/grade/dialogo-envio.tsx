"use client";

// Envio com prévia por aba e mês, processado em sequência com resultado individual.
// Divergências e remoções dependem do modo completo.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao } from "@/components/ui/mui/botao";
import { CaixasDeInfo } from "@/components/ui/mui/caixas-de-info";
import { Dialogo } from "@/components/ui/mui/dialogo";

interface PlanoResumo {
  turmaOriginalId: string;
  rotulo: string;
  aba: string;
  mes?: string;
  dias: string[];
  semEnvio: boolean;
  planoHashTurma: string;
  bloqueado: boolean;
  resumo: {
    preencher: number;
    sinalizar: number;
    substituir: number;
    limpar: number;
    novasColunas: number;
    novosAlunos: number;
    vincular: number;
    removerLinhas: number;
    removerColunas: number;
    puladasFormula: number;
    puladasOcupadas: number;
    jaPresentes?: number;
    ambiguidades: number;
  };
  avisos: string[];
  novasColunas: { dia: string; antesDe: string | null }[];
  novosAlunos: { nome: string }[];
  substituir: { celula: string; valor: string; anterior: string; campo?: "nome" | "turma" }[];
  sinalizar: { celula: string; valor: string; anterior: string }[];
  candidatosRemocaoLinhas: { linha: number; nome: string }[];
  candidatosRemocaoColunas: { coluna: number; letra: string; rotulo: string; data?: string }[];
}

interface Simulacao {
  modalidade: "conservador" | "completo";
  planoHashGeral: string;
  planos: PlanoResumo[];
}

export type ObjetivoEdicaoPlanilha = "adicionar" | "corrigir" | "remover";

interface Props {
  objetivo?: ObjetivoEdicaoPlanilha;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  /** Ausente quando o envio é de todas as turmas mapeadas. */
  turmaOriginalId?: string;
  rotulo: string;
  de: string;
  ate: string;
  modoCompleto: boolean;
  todas?: boolean;
  aoConcluir: () => void;
}

type Andamento = "aguardando" | "enviando" | "enviado" | "sem_confirmacao" | "falhou";

const ROTULO_ANDAMENTO: Record<Andamento, string> = {
  aguardando: "aguardando",
  enviando: "enviando...",
  enviado: "enviado",
  sem_confirmacao: "sem confirmação, confira a aba",
  falhou: "não enviado",
};

/** Mensagem de quando a resposta não chegou: a planilha pode ter sido gravada. */
const SEM_CONFIRMACAO =
  "Não foi possível confirmar o resultado na planilha. Confira a aba antes de reenviar; o reenvio não sobrescreve o que já foi gravado.";

/** Dia AAAA-MM-DD como dd/mm, para a lista de dias do envio. */
function diaCurto(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function plural(valor: number, singular: string, pluralTexto: string): string {
  return `${valor} ${valor === 1 ? singular : pluralTexto}`;
}

/** Até três dias por extenso; acima disso, o intervalo e a quantidade. */
function resumirDias(dias: string[]): string {
  const primeiro = dias[0];
  const ultimo = dias[dias.length - 1];
  if (!primeiro || !ultimo) return "";
  if (dias.length <= 3) return dias.map(diaCurto).join(", ");
  return `${diaCurto(primeiro)} a ${diaCurto(ultimo)} (${dias.length} dias)`;
}

/** Só o que tem valor: zeros não aparecem, para a prévia caber numa olhada. */
function chipsDoPlano(item: PlanoResumo, modoCompleto: boolean): string[] {
  const r = item.resumo;
  const chips = [
    r.preencher > 0 ? `${r.preencher} a preencher` : "",
    item.dias.length > 0 ? `Dias ${resumirDias(item.dias)}` : "",
    r.novasColunas > 0 ? plural(r.novasColunas, "coluna nova", "colunas novas") : "",
    r.novosAlunos > 0 ? plural(r.novosAlunos, "aluno novo", "alunos novos") : "",
    r.sinalizar > 0 ? plural(r.sinalizar, "situação de aluno", "situações de aluno") : "",
    r.vincular > 0
      ? `${r.vincular} ${r.vincular === 1 ? "linha ganha" : "linhas ganham"} o código do aluno`
      : "",
    modoCompleto && r.substituir > 0 ? plural(r.substituir, "substituição", "substituições") : "",
    modoCompleto && (r.removerLinhas > 0 || r.removerColunas > 0)
      ? `Excluir: ${[
          r.removerLinhas > 0 ? plural(r.removerLinhas, "linha", "linhas") : "",
          r.removerColunas > 0 ? plural(r.removerColunas, "coluna", "colunas") : "",
        ]
          .filter(Boolean)
          .join(" e ")}`
      : "",
    (r.jaPresentes ?? 0) > 0
      ? plural(r.jaPresentes ?? 0, "célula já estava na planilha", "células já estavam na planilha")
      : "",
    r.puladasOcupadas > 0
      ? plural(r.puladasOcupadas, "divergência não sobrescrita", "divergências não sobrescritas")
      : "",
    r.puladasFormula > 0
      ? plural(r.puladasFormula, "fórmula protegida", "fórmulas protegidas")
      : "",
  ];
  return chips.filter(Boolean);
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (ouvinte) => {
      window.addEventListener("online", ouvinte);
      window.addEventListener("offline", ouvinte);
      return () => {
        window.removeEventListener("online", ouvinte);
        window.removeEventListener("offline", ouvinte);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export default function DialogoEnvio({
  objetivo,
  aberto,
  onAbrir,
  turmaOriginalId,
  rotulo,
  de,
  ate,
  modoCompleto,
  todas = false,
  aoConcluir,
}: Props) {
  const online = useOnline();
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [criarColunas, setCriarColunas] = useState(!objetivo);
  const [novosAlunos, setNovosAlunos] = useState(!objetivo || objetivo === "adicionar");
  const [substituir, setSubstituir] = useState(objetivo === "corrigir");
  const [exclusoesConferidas, setExclusoesConferidas] = useState(false);
  const [remocoes, setRemocoes] = useState<Record<string, { linhas: number[]; colunas: number[] }>>(
    {},
  );
  const [alcance, setAlcance] = useState<"pendentes" | "periodo" | null>(null);
  // A correção manual precisa reler também linhas sem chamada pendente.
  const somenteAlteradas = alcance
    ? alcance === "pendentes"
    : !objetivo && !(modoCompleto && !todas);
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const [detalhes, setDetalhes] = useState<Record<string, string>>({});
  const abaUnica = simulacao?.planos.length === 1 ? simulacao.planos[0]?.aba : undefined;
  const contextoRemocoes = JSON.stringify([turmaOriginalId, de, ate, somenteAlteradas, abaUnica]);
  const removerMarcadas = remocoes[contextoRemocoes]?.linhas;
  const removerColunasMarcadas = remocoes[contextoRemocoes]?.colunas;

  const entradas = useCallback(
    () => ({
      ...(todas ? { todas: true } : { turmaOriginalId }),
      de,
      ate,
      permitirInserirColunas: criarColunas,
      permitirNovosAlunos: novosAlunos,
      substituirDivergencias: modoCompleto && substituir,
      removerLinhas: !todas && modoCompleto && abaUnica ? removerMarcadas : undefined,
      removerColunas: !todas && modoCompleto && abaUnica ? removerColunasMarcadas : undefined,
      somenteAlteradas,
    }),
    [
      somenteAlteradas,
      todas,
      turmaOriginalId,
      de,
      ate,
      criarColunas,
      novosAlunos,
      modoCompleto,
      substituir,
      removerMarcadas,
      removerColunasMarcadas,
      abaUnica,
    ],
  );

  const { executando: carregando, executar: simular } = useAcaoUnica(async () => {
    setErro("");
    setExclusoesConferidas(false);
    setAndamento({});
    setDetalhes({});
    try {
      const dados = await pedir<Simulacao>("/api/planilha/simular", corpoJson(entradas()));
      setSimulacao(dados);
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível preparar a prévia.");
      setErroVariante(estadoDeErro(excecao));
    }
  });

  // A ação é estável; a chave acompanha as opções e as remoções selecionadas.
  // Preserva a aba durante a releitura para manter o contexto dessas seleções.
  const chaveDaPrevia = JSON.stringify(entradas());
  useEffect(() => {
    if (aberto) void simular();
  }, [aberto, simular, chaveDaPrevia]);

  // Uma requisição por aba: a falha de um mês não impede os demais envios.
  const { executando: enviando, executar: enviar } = useAcaoUnica(async () => {
    if (!simulacao || (totalExclusoes > 0 && !exclusoesConferidas)) return;
    setErro("");
    const pendentes = simulacao.planos.filter((item) => !item.semEnvio);
    setAndamento(Object.fromEntries(pendentes.map((item) => [item.aba, "aguardando"])));
    setDetalhes({});
    const finais: Andamento[] = [];
    for (const item of pendentes) {
      setAndamento((atual) => ({ ...atual, [item.aba]: "enviando" }));
      let final: Andamento = "enviado";
      let detalhe = "";
      try {
        const dados = await pedir<{
          resultados: {
            resultado: "sucesso" | "parcial" | "falha" | "sem_envio";
            erro?: string;
            aviso?: string;
          }[];
        }>(
          "/api/planilha/aplicar",
          corpoJson({
            ...entradas(),
            todas: undefined,
            turmaOriginalId: item.turmaOriginalId,
            aba: item.aba,
            planoHashGeral: item.planoHashTurma,
          }),
        );
        const resultado = dados.resultados[0];
        if (resultado?.resultado === "parcial") {
          final = "sem_confirmacao";
          detalhe = resultado.erro ?? SEM_CONFIRMACAO;
        } else if (resultado?.resultado === "falha") {
          final = "falhou";
          detalhe = resultado.erro ?? "Não foi possível enviar para esta aba.";
        } else if (resultado?.resultado === "sucesso" && resultado.aviso) {
          detalhe = resultado.aviso;
        }
      } catch (excecao) {
        // Sem resposta do servidor (504, queda de rede): a planilha pode ter
        // sido gravada. Resposta com erro do aplicativo: nada foi enviado.
        const semResposta =
          !(excecao instanceof ErroApi) || [502, 503, 504].includes(excecao.status);
        final = semResposta ? "sem_confirmacao" : "falhou";
        detalhe = semResposta
          ? SEM_CONFIRMACAO
          : excecao instanceof ErroApi
            ? excecao.message
            : "Não foi possível enviar.";
      }
      finais.push(final);
      setAndamento((atual) => ({ ...atual, [item.aba]: final }));
      if (detalhe) setDetalhes((atual) => ({ ...atual, [item.aba]: detalhe }));
    }
    const enviados = finais.filter((item) => item === "enviado").length;
    const semConfirmacao = finais.filter((item) => item === "sem_confirmacao").length;
    aoConcluir();
    if (enviados === finais.length) {
      avisarSucesso(`${enviados} ${enviados === 1 ? "aba enviada" : "abas enviadas"}.`);
      onAbrir(false);
      return;
    }
    avisarErro(new Error("envio incompleto"), {
      contexto: `${enviados} de ${finais.length} abas enviadas.`,
      descricao:
        semConfirmacao > 0
          ? "Algumas abas ficaram sem confirmação. Confira antes de reenviar."
          : "Veja no diálogo o que não foi enviado e tente de novo.",
    });
  });

  const bloqueado = simulacao?.planos.some((item) => item.bloqueado) ?? false;
  const plano = simulacao?.planos[0];
  const detalhado = !todas && simulacao?.planos.length === 1 && plano && !plano.semEnvio;
  const nadaAEnviar = simulacao !== null && simulacao.planos.every((item) => item.semEnvio);
  const enviou = Object.keys(andamento).length > 0 && !enviando;
  const periodo = de === ate ? diaCurto(de) : `${diaCurto(de)} a ${diaCurto(ate)}`;
  // As candidatas aparecem sempre na prévia detalhada; marcar exige o modo completo.
  const podeRemover = detalhado && !bloqueado;
  const colunasRemoviveis = plano?.candidatosRemocaoColunas ?? [];
  const linhasRemoviveis = plano?.candidatosRemocaoLinhas ?? [];
  const totalExclusoes =
    !todas && modoCompleto
      ? (removerMarcadas?.length ?? 0) + (removerColunasMarcadas?.length ?? 0)
      : 0;
  const temDetalhes =
    detalhado &&
    !bloqueado &&
    !!plano &&
    (plano.sinalizar.length > 0 || plano.novasColunas.length > 0 || plano.substituir.length > 0);

  function alterarRemocoes(
    mudar: (atual: { linhas: number[]; colunas: number[] }) => {
      linhas: number[];
      colunas: number[];
    },
  ) {
    setRemocoes((atuais) => ({
      ...atuais,
      [contextoRemocoes]: mudar(atuais[contextoRemocoes] ?? { linhas: [], colunas: [] }),
    }));
  }

  const rotuloConcluir = enviou
    ? "Nova prévia"
    : totalExclusoes > 0 || objetivo
      ? "Aplicar alterações"
      : "Enviar";

  return (
    <Dialogo
      aberto={aberto}
      onFechar={() => onAbrir(false)}
      titulo={`${objetivo ? "Editar planilha de " : "Enviar "}${rotulo}`}
      tamanho="grande"
      acoes={
        <>
          <Botao variante="contorno" onClick={() => onAbrir(false)} disabled={enviando}>
            {enviou ? "Fechar" : "Cancelar"}
          </Botao>
          <Botao
            variante="secundario"
            carregando={enviando}
            icone={<SendRoundedIcon />}
            onClick={() => void (enviou ? simular() : enviar())}
            disabled={
              enviando ||
              carregando ||
              !simulacao ||
              Boolean(erro) ||
              bloqueado ||
              !online ||
              (totalExclusoes > 0 && !exclusoesConferidas && !enviou) ||
              (nadaAEnviar && !enviou)
            }
          >
            {rotuloConcluir}
          </Botao>
        </>
      }
    >
      <Stack spacing={2}>
        {objetivo ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {objetivo === "adicionar"
              ? "Novas linhas e chamadas do mês."
              : objetivo === "corrigir"
                ? "Correções de nomes, turmas e chamadas."
                : "Marque as linhas ou colunas para retirar."}
          </Typography>
        ) : null}
        {modoCompleto && !objetivo ? (
          <AlertaCompacto
            variante="conflito"
            descricao="Edição da planilha liberada. Primeiro selecione as alterações; nada é excluído ao marcar."
            tamanho="linha"
          />
        ) : null}
        {!online ? (
          <AlertaCompacto
            variante="offline"
            descricao="Sem conexão. O envio fica indisponível até a internet voltar."
            tamanho="linha"
          />
        ) : null}

        {!objetivo ? (
          <FormControl component="fieldset" disabled={enviando || carregando} sx={{ minWidth: 0 }}>
            <FormLabel
              component="legend"
              sx={{
                position: "absolute",
                width: 1,
                height: 1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
              }}
            >
              O que enviar
            </FormLabel>
            <RadioGroup
              row
              value={somenteAlteradas ? "pendentes" : "periodo"}
              onChange={(evento) =>
                setAlcance(evento.target.value === "pendentes" ? "pendentes" : "periodo")
              }
            >
              <FormControlLabel
                value="pendentes"
                control={<Radio />}
                label="Só chamadas pendentes"
              />
              <FormControlLabel
                value="periodo"
                control={<Radio />}
                label={`O período inteiro (${periodo})`}
              />
            </RadioGroup>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {somenteAlteradas
                ? "Dias com chamada ainda não confirmada na planilha, por turma de origem."
                : "Para conferência ou recuperação; no modo conservador, só preenche o que está vazio."}
            </Typography>
          </FormControl>
        ) : null}

        {carregando ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <CircularProgress size={16} aria-hidden="true" />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Lendo a planilha e montando a prévia...
            </Typography>
          </Stack>
        ) : null}

        {bloqueado ? (
          <AlertaCompacto
            variante="dados_invalidos"
            descricao={
              simulacao?.planos.find((item) => item.avisos.length > 0)?.avisos[0] ??
              "A estrutura da planilha impede a escrita. Ajuste o cabeçalho."
            }
            tamanho="linha"
          />
        ) : null}

        {simulacao && !carregando && nadaAEnviar ? (
          <Paper variant="outlined" sx={{ p: 2, boxShadow: "none" }}>
            <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2">
                {objetivo
                  ? "Nenhuma alteração necessária para esta turma e mês."
                  : `Nenhuma chamada pendente${todas ? " em nenhuma turma" : ""}. Para conferir o período inteiro, escolha a segunda opção.`}
              </Typography>
              {!todas && somenteAlteradas ? (
                <Botao variante="contorno" onClick={() => setAlcance("periodo")}>
                  Conferir linhas da turma
                </Botao>
              ) : null}
            </Stack>
          </Paper>
        ) : null}

        {simulacao && !carregando && !bloqueado && !nadaAEnviar ? (
          <Box
            component="ul"
            aria-label="Turmas do envio"
            aria-live="polite"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              m: 0,
              px: 2,
              py: 1.5,
              bgcolor: "action.hover",
              borderRadius: 1,
              listStyle: "none",
            }}
          >
            {simulacao.planos.map((item) => {
              const estado = andamento[item.aba];
              return (
                <Stack
                  component="li"
                  key={item.aba}
                  data-turma={item.rotulo}
                  data-aba={item.aba}
                  spacing={0.5}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "baseline", flexWrap: "wrap" }}
                  >
                    <Typography component="span" variant="caption" sx={{ fontWeight: 600 }}>
                      Aba {item.aba}
                    </Typography>
                    {item.mes ? (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        {item.mes.slice(5)}/{item.mes.slice(0, 4)}
                      </Typography>
                    ) : null}
                    {item.semEnvio ? (
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        sem alterações
                      </Typography>
                    ) : null}
                    {!item.semEnvio && estado ? (
                      <Typography component="span" variant="caption">
                        {ROTULO_ANDAMENTO[estado]}
                      </Typography>
                    ) : null}
                  </Stack>
                  {!item.semEnvio && !estado ? (
                    <CaixasDeInfo itens={chipsDoPlano(item, modoCompleto)} />
                  ) : null}
                  {estado && detalhes[item.aba] ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: estado === "sem_confirmacao" ? "falta.texto" : "text.secondary",
                      }}
                    >
                      {detalhes[item.aba]}
                    </Typography>
                  ) : null}
                  {!estado && !item.semEnvio
                    ? item.avisos.slice(0, 3).map((aviso) => (
                        <Typography key={aviso} variant="caption" sx={{ color: "text.secondary" }}>
                          {aviso}
                        </Typography>
                      ))
                    : null}
                </Stack>
              );
            })}
          </Box>
        ) : null}

        {objetivo === "adicionar" && !carregando && !enviou && plano ? (
          <Paper variant="outlined" sx={{ p: 2, boxShadow: "none" }}>
            <Stack spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Alunos sem linha na aba {plano.aba}
              </Typography>
              {plano.novosAlunos.length > 0 ? (
                <Box component="ul" aria-label="Alunos que serão adicionados" sx={{ m: 0, pl: 2 }}>
                  {plano.novosAlunos.map((aluno, indice) => (
                    <Typography component="li" key={`${aluno.nome}-${indice}`} variant="body2">
                      {aluno.nome}
                    </Typography>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Nenhum aluno precisa de uma linha nova.
                </Typography>
              )}
            </Stack>
          </Paper>
        ) : null}

        {temDetalhes && !enviou && plano ? (
          <Box component="details">
            <Typography
              component="summary"
              variant="caption"
              sx={{ cursor: "pointer", py: 1, color: "text.secondary" }}
            >
              Ver detalhes da prévia
            </Typography>
            <Stack spacing={0.5} sx={{ px: 2, py: 1, bgcolor: "action.hover", borderRadius: 1 }}>
              {plano.novasColunas.length > 0 ? (
                <Typography variant="caption">
                  Dias novos: {plano.novasColunas.map((coluna) => coluna.dia).join(", ")}
                </Typography>
              ) : null}
              {plano.sinalizar.length > 0 ? (
                <Typography variant="caption">
                  Nome na planilha:{" "}
                  {plano.sinalizar
                    .slice(0, 5)
                    .map((item) => `${item.celula} ${item.anterior} para ${item.valor}`)
                    .join(", ")}
                  {plano.sinalizar.length > 5 ? " ..." : ""}
                </Typography>
              ) : null}
              {plano.substituir.length > 0 ? (
                <Typography variant="caption" sx={{ color: "falta.texto" }}>
                  Divergências:{" "}
                  {plano.substituir
                    .slice(0, 5)
                    .map(
                      (item) =>
                        `${item.celula} ${item.anterior || "vazia"} para ${item.valor}${
                          item.campo === "nome"
                            ? " (nome)"
                            : item.campo === "turma"
                              ? " (turma)"
                              : ""
                        }`,
                    )
                    .join(", ")}
                  {plano.substituir.length > 5 ? " ..." : ""}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        ) : null}

        <Acordeao titulo={objetivo ? "Opções da edição" : "Opções do envio"} nivelTitulo="h3">
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={criarColunas}
                  disabled={enviando}
                  onChange={(evento) => setCriarColunas(evento.target.checked)}
                />
              }
              label="Criar colunas para dias sem coluna"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={novosAlunos}
                  disabled={enviando}
                  onChange={(evento) => setNovosAlunos(evento.target.checked)}
                />
              }
              label="Acrescentar alunos sem linha"
            />
            {modoCompleto ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={substituir}
                    disabled={enviando}
                    onChange={(evento) => setSubstituir(evento.target.checked)}
                  />
                }
                label="Atualizar divergências, nomes e turma atual"
              />
            ) : null}
          </Stack>
        </Acordeao>

        {podeRemover && (linhasRemoviveis.length > 0 || colunasRemoviveis.length > 0) ? (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {modoCompleto
              ? "As exclusões abaixo afetam somente a aba indicada na prévia. O cadastro e as chamadas no aplicativo são preservados."
              : "Para selecionar exclusões, abra Gestão, Configurações, Planilha de frequência e libere o modo completo. Depois, reabra esta prévia."}
          </Typography>
        ) : null}

        {podeRemover && linhasRemoviveis.length > 0 ? (
          <FormControl
            component="fieldset"
            disabled={enviando || !modoCompleto}
            sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
          >
            <FormLabel component="legend" sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>
              Retirar linhas de alunos da planilha
            </FormLabel>
            <Typography variant="caption" sx={{ color: "text.secondary", mb: 1 }}>
              Alunos que não pertencem mais a esta turma. Selecione somente as linhas que devem sair
              da aba {plano?.aba}. A linha inteira será apagada, incluindo as frequências
              registradas nela.
            </Typography>
            <Stack spacing={0.5}>
              {linhasRemoviveis.map((item) => (
                <FormControlLabel
                  key={item.linha}
                  control={
                    <Checkbox
                      slotProps={{
                        input: {
                          "aria-label": `Retirar ${item.nome} da planilha (linha ${item.linha})`,
                        },
                      }}
                      checked={removerMarcadas?.includes(item.linha) ?? false}
                      onChange={(evento) => {
                        const marcado = evento.target.checked;
                        alterarRemocoes((atual) => ({
                          ...atual,
                          linhas: marcado
                            ? [...atual.linhas, item.linha]
                            : atual.linhas.filter((linha) => linha !== item.linha),
                        }));
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {item.nome}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Linha {item.linha}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Stack>
          </FormControl>
        ) : null}

        {podeRemover && colunasRemoviveis.length > 0 ? (
          <FormControl
            component="fieldset"
            disabled={enviando || !modoCompleto}
            sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
          >
            <FormLabel component="legend" sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>
              Remover colunas de dia criadas pela integração
            </FormLabel>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Botao
                variante="contorno"
                tamanho="pequeno"
                onClick={() =>
                  alterarRemocoes((atual) => ({
                    ...atual,
                    colunas: colunasRemoviveis.map((item) => item.coluna),
                  }))
                }
              >
                Marcar todas
              </Botao>
              <Botao
                variante="texto"
                tamanho="pequeno"
                onClick={() => alterarRemocoes((atual) => ({ ...atual, colunas: [] }))}
              >
                Limpar
              </Botao>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {colunasRemoviveis.map((item) => (
                <FormControlLabel
                  key={`coluna-${item.coluna}`}
                  sx={{
                    m: 0,
                    px: 1,
                    py: 0.25,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    bgcolor: "action.hover",
                  }}
                  control={
                    <Checkbox
                      size="small"
                      slotProps={{
                        input: {
                          "aria-label": `Remover coluna ${item.rotulo} (${item.letra})`,
                        },
                      }}
                      checked={removerColunasMarcadas?.includes(item.coluna) ?? false}
                      onChange={(evento) => {
                        const marcado = evento.target.checked;
                        alterarRemocoes((atual) => ({
                          ...atual,
                          colunas: marcado
                            ? [...atual.colunas, item.coluna]
                            : atual.colunas.filter((coluna) => coluna !== item.coluna),
                        }));
                      }}
                    />
                  }
                  label={
                    <Typography variant="caption">
                      {item.data ? diaCurto(item.data) : item.rotulo} ({item.letra})
                    </Typography>
                  }
                />
              ))}
            </Stack>
          </FormControl>
        ) : null}

        {totalExclusoes > 0 && !carregando && !enviou && !erro ? (
          <FormControlLabel
            sx={{
              m: 0,
              p: 1.5,
              alignItems: "flex-start",
              bgcolor: "falta.fraco",
              borderRadius: 1,
              color: "falta.texto",
            }}
            control={
              <Checkbox
                slotProps={{
                  input: {
                    "aria-label": `Conferi as exclusões na aba ${plano?.aba} e confirmo que podem ser aplicadas.`,
                  },
                }}
                checked={exclusoesConferidas}
                disabled={enviando}
                onChange={(evento) => setExclusoesConferidas(evento.target.checked)}
              />
            }
            label={
              <Typography variant="body2">
                Conferi as exclusões na aba {plano?.aba} e confirmo que podem ser aplicadas.
              </Typography>
            }
          />
        ) : null}

        {erro ? (
          <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
            <AlertaCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
            <Botao
              variante="contorno"
              onClick={() => void simular()}
              disabled={carregando || enviando}
            >
              Repetir prévia
            </Botao>
          </Stack>
        ) : null}
      </Stack>
    </Dialogo>
  );
}

export function useEstadoPlanilha() {
  const [estado, setEstado] = useState<{
    ativa: boolean;
    modo: "conservador" | "completo";
    modoCompletoAte: string | null;
    podeEnviar: boolean;
    alteradasDepois: number;
  } | null>(null);
  const recarregar = useCallback(async () => {
    try {
      const dados = await pedir<{ estado: typeof estado }>("/api/planilha/estado");
      setEstado(dados.estado);
    } catch {
      setEstado(null);
    }
  }, []);
  useEffect(() => {
    let viva = true;
    pedir<{ estado: typeof estado }>("/api/planilha/estado")
      .then((dados) => {
        if (viva) setEstado(dados.estado);
      })
      .catch(() => {
        if (viva) setEstado(null);
      });
    return () => {
      viva = false;
    };
  }, []);
  return { estado, recarregar };
}
