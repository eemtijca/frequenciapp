"use client";

// Minhas turmas: estatísticas só de leitura da turma de origem do diretor,
// por mês, com números em destaque, gráficos e a mesma informação em tabela.
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import { diasDoMes, mesSeguinte, rotuloDataCurta, rotuloMes } from "@/domain/frequencia";
import type {
  ContextoDiretor,
  EstatisticasDoDiretor,
  EstatisticasTurma,
} from "@/domain/estatisticas-diretor";
import { ErroApi, pedir } from "@/lib/api-cliente";
import { estadoDeErro } from "@/lib/estado-http";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EstadoVazio } from "@/components/layout/estado-vazio";
import { GradeCartoes } from "@/components/layout/grade-cartoes";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Cartao } from "@/components/ui/mui/cartao";
import { Selo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { GraficoAlunos, GraficoSemanas } from "@/components/graficos/graficos-sob-demanda";
import { numeraisTabulares } from "@/theme/tipografia";

interface Props {
  contexto: ContextoDiretor;
  atualizacao?: number;
  onAtualizado: () => void;
}

type Exibicao = "grafico" | "tabela";
type TomDestaque = "neutro" | "falta";

interface Consulta {
  turmaId: string;
  mes: string;
}

interface Leitura {
  consulta: Consulta;
  dados: EstatisticasDoDiretor | null;
  carregando: boolean;
  erro?: { mensagem: string; variante: VarianteEstado };
}

const percentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const ALVO_ACAO = { minHeight: 48 } as const;
const OPCAO_SELECIONAVEL = {
  ...ALVO_ACAO,
  "&&": { borderColor: "text.secondary" },
  "&&[aria-pressed='true']": {
    bgcolor: "action.selected",
    borderColor: "primary.main",
    borderWidth: 2,
    fontWeight: 700,
    "@media (forced-colors: active)": { borderColor: "Highlight" },
  },
} as const;

function dataPorExtenso(dia: string): string {
  return dia.split("-").reverse().join("/");
}

function Destaque({
  valor,
  rotulo,
  tom = "neutro",
}: {
  valor: string;
  rotulo: string;
  tom?: TomDestaque;
}) {
  return (
    <Cartao sx={{ height: "100%", py: { xs: 1, sm: 2 } }}>
      <Stack
        direction={{ xs: "row", sm: "column" }}
        spacing={{ xs: 1, sm: 0.5 }}
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: { xs: "space-between", sm: "center" },
          textAlign: { xs: "start", sm: "center" },
        }}
      >
        <Typography
          component="p"
          variant="h5"
          sx={(tema) => ({
            ...numeraisTabulares,
            fontWeight: 600,
            flexShrink: 0,
            ...(tom === "falta" ? { color: tema.vars.palette.falta.texto } : {}),
          })}
        >
          {valor}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", textAlign: { xs: "end", sm: "center" } }}
        >
          {rotulo}
        </Typography>
      </Stack>
    </Cartao>
  );
}

function TabelaAlunos({ estatisticas }: { estatisticas: EstatisticasTurma }) {
  const verJustificadas = estatisticas.categorias.includes("justificativas");
  const verSaidas = estatisticas.categorias.includes("saidas");
  return (
    <Stack
      spacing={1.5}
      sx={(tema) => ({
        "& tr > :first-child": {
          position: "sticky",
          insetInlineStart: 0,
          zIndex: 1,
          bgcolor: tema.vars.palette.background.paper,
          maxWidth: { xs: 144, sm: 224 },
        },
      })}
    >
      <Typography component="h2" variant="h6">
        Ausência por aluno
      </Typography>
      <TabelaPadrao
        caption="Ausência por aluno no período"
        legendaNaLarguraVisivel
        rotuloRolagem="Rolagem da tabela de ausência por aluno"
      >
        <TableHead>
          <TableRow>
            <TableCell component="th" scope="col">
              Aluno
            </TableCell>
            <TableCell component="th" scope="col" align="right">
              Ausências
            </TableCell>
            {verJustificadas ? (
              <>
                <TableCell component="th" scope="col" align="right">
                  Faltas
                </TableCell>
                <TableCell component="th" scope="col" align="right">
                  Justificadas
                </TableCell>
              </>
            ) : null}
            {verSaidas ? (
              <TableCell component="th" scope="col" align="right">
                Saídas
              </TableCell>
            ) : null}
            <TableCell component="th" scope="col" align="right">
              Dias com chamada
            </TableCell>
            <TableCell component="th" scope="col" align="right">
              Ausência
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {estatisticas.alunos.map((aluno) => (
            <TableRow key={aluno.alunoId}>
              <TableCell component="th" scope="row">
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: "center", flexWrap: "wrap" }}
                >
                  <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {aluno.nome}
                  </Box>
                  {aluno.emRisco ? <Selo tom="atencao" rotulo="em risco" /> : null}
                </Stack>
              </TableCell>
              <TableCell align="right">{aluno.ausencias}</TableCell>
              {verJustificadas ? (
                <>
                  <TableCell align="right">{aluno.faltas}</TableCell>
                  <TableCell align="right">{aluno.justificadas}</TableCell>
                </>
              ) : null}
              {verSaidas ? <TableCell align="right">{aluno.saidas}</TableCell> : null}
              <TableCell align="right">{aluno.diasComChamada}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {aluno.diasComChamada > 0 ? percentual.format(aluno.taxa) : "sem chamada"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TabelaPadrao>
    </Stack>
  );
}

export default function VistaMinhasTurmas({ contexto, atualizacao = 0, onAtualizado }: Props) {
  const mesCorrente = contexto.diaCorrente.slice(0, 7);
  // Uma nova seleção cria outra consulta, mesmo ao voltar aos mesmos filtros.
  const [consulta, setConsulta] = useState<Consulta>({
    turmaId: contexto.turmas[0]?.turmaId ?? "",
    mes: mesCorrente,
  });
  const { turmaId, mes } = consulta;
  const [exibicao, setExibicao] = useState<Exibicao>("grafico");
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const atual = leitura?.consulta === consulta ? leitura : null;
  const dados = atual?.dados ?? null;
  const erro = atual?.erro;
  const carregando = atual?.carregando ?? Boolean(turmaId);

  function selecionarTurma(valor: string) {
    setConsulta((anterior) =>
      anterior.turmaId === valor ? anterior : { ...anterior, turmaId: valor },
    );
  }

  function selecionarMes(alterar: (anterior: string) => string) {
    setConsulta((anterior) => {
      const valor = alterar(anterior.mes);
      return anterior.mes === valor ? anterior : { ...anterior, mes: valor };
    });
  }

  useEffect(() => {
    if (!turmaId) return;
    const dias = diasDoMes(mes);
    const de = dias[0] ?? `${mes}-01`;
    const ate = dias[dias.length - 1] ?? de;
    let viva = true;
    async function buscar() {
      setLeitura((anterior) => ({
        consulta,
        dados: anterior?.consulta === consulta ? anterior.dados : null,
        carregando: true,
      }));
      try {
        const resposta = await pedir<EstatisticasDoDiretor>(
          `/api/diretor/estatisticas?turmaId=${turmaId}&de=${de}&ate=${ate}`,
        );
        if (viva) {
          setLeitura({ consulta, dados: resposta, carregando: false });
          onAtualizado();
        }
      } catch (excecao) {
        if (!viva) return;
        setLeitura({
          consulta,
          dados: null,
          carregando: false,
          erro: {
            mensagem:
              excecao instanceof ErroApi
                ? excecao.message
                : "Não foi possível carregar as estatísticas.",
            variante: estadoDeErro(excecao),
          },
        });
      }
    }
    void buscar();
    return () => {
      viva = false;
    };
  }, [consulta, turmaId, mes, atualizacao, onAtualizado]);

  if (contexto.turmas.length === 0) {
    return (
      <Stack component="section" aria-label="Minhas turmas" spacing={2} sx={{ pb: 3 }}>
        <CabecalhoPagina titulo="Minhas turmas" />
        <EstadoVazio
          icone={<GroupsRoundedIcon />}
          titulo="Sem turmas hoje"
          descricao="Nenhuma turma vinculada a esta conta hoje. Procure a gestão da escola."
        />
      </Stack>
    );
  }

  const turma = contexto.turmas.find((item) => item.turmaId === turmaId);
  const estatisticas = dados?.turmaId === turmaId ? dados.estatisticas : null;
  const periodo = dados?.turmaId === turmaId ? dados.periodo : null;
  const semChamada = estatisticas !== null && estatisticas.resumo.alunoDias === 0;
  const descricaoTurma = turma
    ? `${turma.turma}${
        periodo ? ` · ${rotuloDataCurta(periodo.de)} a ${rotuloDataCurta(periodo.ate)}` : ""
      }`
    : undefined;
  const inicioDoVinculo =
    dados && periodo && periodo.de === dados.vinculo.inicio
      ? ` Seu acompanhamento desta turma começou em ${dataPorExtenso(dados.vinculo.inicio)}.`
      : "";

  return (
    <Stack component="section" aria-label="Minhas turmas" spacing={2} sx={{ pb: 3 }}>
      <CabecalhoPagina titulo="Minhas turmas" descricao={descricaoTurma} />

      {contexto.turmas.length > 1 ? (
        <Stack
          role="group"
          aria-label="Turma"
          direction="row"
          useFlexGap
          spacing={1}
          sx={{ flexWrap: "wrap" }}
        >
          {contexto.turmas.map((item) => {
            const ativo = item.turmaId === turmaId;
            return (
              <Botao
                key={item.turmaId}
                variante="contorno"
                aria-pressed={ativo}
                onClick={() => selecionarTurma(item.turmaId)}
                sx={OPCAO_SELECIONAVEL}
              >
                {item.turma}
              </Botao>
            );
          })}
        </Stack>
      ) : null}

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <BotaoIcone
          rotulo="Mês anterior"
          variante="contorno"
          icone={<ChevronLeftRoundedIcon />}
          onClick={() => selecionarMes((atual) => mesSeguinte(atual, -1))}
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <SeletorPeriodo
            id="mes-diretor"
            modo="mes"
            valor={mes}
            max={mesCorrente}
            rotuloAcessivel="Mês das estatísticas"
            rotulo={rotuloMes(mes)}
            onValor={(valor) => selecionarMes(() => valor)}
          />
        </Box>
        <BotaoIcone
          rotulo="Mês seguinte"
          variante="contorno"
          icone={<ChevronRightRoundedIcon />}
          disabled={mes >= mesCorrente}
          onClick={() => selecionarMes((atual) => mesSeguinte(atual, 1))}
          sx={{ width: 48, height: 48, flexShrink: 0 }}
        />
      </Stack>

      {erro ? (
        <AlertaCompacto variante={erro.variante} descricao={erro.mensagem} tamanho="linha" />
      ) : null}

      {carregando && !estatisticas ? (
        <Stack
          role="status"
          aria-live="polite"
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", justifyContent: "center", minHeight: 160 }}
        >
          <CircularProgress size={18} aria-hidden="true" />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Carregando estatísticas
          </Typography>
        </Stack>
      ) : dados && dados.turmaId === turmaId && !periodo ? (
        <EstadoVazio
          icone={<EventBusyRoundedIcon />}
          titulo="Sem dados neste mês"
          descricao={`O vínculo com esta turma começou em ${dataPorExtenso(
            dados.vinculo.inicio,
          )}; não há dados seus neste mês.`}
        />
      ) : estatisticas ? (
        <>
          <Box role="group" aria-label="Resumo do período" aria-busy={carregando}>
            <GradeCartoes spacing={2}>
              <Destaque valor={String(estatisticas.resumo.alunos)} rotulo="Alunos acompanhados" />
              <Destaque
                valor={String(estatisticas.resumo.emRisco)}
                rotulo={`Em risco (a partir de ${estatisticas.limiteRisco}%)`}
                tom={estatisticas.resumo.emRisco > 0 ? "falta" : "neutro"}
              />
              <Destaque
                valor={semChamada ? "sem chamada" : percentual.format(estatisticas.resumo.taxa)}
                rotulo="Ausência da turma"
              />
            </GradeCartoes>
          </Box>

          {semChamada ? (
            <EstadoVazio
              icone={<EventBusyRoundedIcon />}
              titulo="Sem chamada no período"
              descricao={`Nenhuma chamada registrada neste período.${inicioDoVinculo}`}
            />
          ) : (
            <>
              <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
                <Stack role="group" aria-label="Forma de exibição" direction="row" spacing={1}>
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    aria-pressed={exibicao === "grafico"}
                    icone={<BarChartRoundedIcon fontSize="small" />}
                    onClick={() => setExibicao("grafico")}
                    sx={OPCAO_SELECIONAVEL}
                  >
                    Gráficos
                  </Botao>
                  <Botao
                    variante="contorno"
                    tamanho="pequeno"
                    aria-pressed={exibicao === "tabela"}
                    icone={<TableChartRoundedIcon fontSize="small" />}
                    onClick={() => setExibicao("tabela")}
                    sx={OPCAO_SELECIONAVEL}
                  >
                    Tabela
                  </Botao>
                </Stack>
              </Stack>

              {exibicao === "grafico" ? (
                <Stack spacing={2}>
                  <SecaoConteudo titulo="Ausência por aluno">
                    <GraficoAlunos
                      alunos={estatisticas.alunos}
                      limiteRisco={estatisticas.limiteRisco}
                    />
                  </SecaoConteudo>
                  <SecaoConteudo titulo="Ausência da turma por semana">
                    <GraficoSemanas
                      semanas={estatisticas.semanas}
                      limiteRisco={estatisticas.limiteRisco}
                      separarJustificadas={estatisticas.categorias.includes("justificativas")}
                    />
                  </SecaoConteudo>
                </Stack>
              ) : (
                <TabelaAlunos estatisticas={estatisticas} />
              )}
            </>
          )}

          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Ausência conta faltas e faltas justificadas sobre os dias em que a turma de cada aluno
            teve chamada registrada. Alunos da turma de origem, ativos hoje.
          </Typography>
        </>
      ) : null}
    </Stack>
  );
}
