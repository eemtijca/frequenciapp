"use client";

// Aplicação de BI isolada: chave própria, leituras sob demanda e personalização apenas no navegador.
import { useEffect, useMemo, useRef, useState } from "react";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FullscreenExitRoundedIcon from "@mui/icons-material/FullscreenExitRounded";
import FullscreenRoundedIcon from "@mui/icons-material/FullscreenRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import MoreHorizRoundedIcon from "@mui/icons-material/MoreHorizRounded";
import PrintRoundedIcon from "@mui/icons-material/PrintRounded";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import WifiOffRoundedIcon from "@mui/icons-material/WifiOffRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { AlertaCompacto } from "@/components/ui/mui/tela-estado";
import { AtualizadoEm } from "@/components/ui/mui/atualizado-em";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { BotaoAtualizar } from "@/components/ui/mui/botao-atualizar";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { Campo } from "@/components/ui/mui/campo";
import { Cartao } from "@/components/ui/mui/cartao";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Popover } from "@/components/ui/mui/popover";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { SecaoConteudo } from "@/components/layout/secao-conteudo";
import { GradeCartoes } from "@/components/layout/grade-cartoes";
import { LayoutConteudo } from "@/components/layout/layout-conteudo";
import { LayoutPagina } from "@/components/layout/layout-pagina";
import { Selo } from "@/components/ui/mui/selo";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { SeletorTema } from "@/components/ui/mui/seletor-tema";
import RegistroPwa from "@/components/pwa/registro-pwa";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { useDadosBi } from "@/lib/use-dados-bi";
import { useCalculosBi } from "@/lib/use-calculos-bi";
import { guardarPersonalizacaoBi, lerPersonalizacaoBi, limparTudoBi } from "@/lib/bi-armazenamento";
import { baixarBi } from "@/lib/bi-exportacao";
import {
  exportarPersonalizacaoBi,
  migrarPersonalizacaoBi,
  personalizacaoVaziaBi,
  type PainelBi,
  type PersonalizacaoBi,
} from "@/domain/bi-personalizacao";
import {
  BASES_ANALISE,
  compararPeriodoBi,
  coberturaBi,
  destaquesBi,
  enriquecerBi,
  esquemaGraficoBi,
  filtrarBi,
  totalBi,
  type DadosBi,
  type FiltrosBi,
  type GraficoBi,
  type PontoBi,
} from "@/domain/bi-analise";
import { graficoBi, painelCuradoBi } from "@/domain/bi-painel";
import { CAMPOS_LINK_BI, receberFiltrosBi } from "@/domain/bi-compartilhamento";
import { exigeListaBi, resolverRecorteBi, type RecorteBi } from "@/domain/bi-recortes";
import { ROTULOS_RECURSOS_BI, type RecursoBi } from "@/domain/bi";
import { CartaoGrafico, type ConfirmarExportacaoBi } from "./cartao-grafico";
import { EditorGraficoBi } from "./editor-grafico";
import { SeletorFiltrosBi } from "./seletor-filtros";
import { GradePaineisBi } from "./grade-paineis";
import { TabelaApoioBi } from "./tabela-apoio";
import { VistaAjudaBi } from "./vista-ajuda";
const ABAS = [
  { id: "geral", nome: "Visão geral" },
  { id: "faltas", nome: "Faltas" },
  { id: "movimentos", nome: "Movimentações" },
  { id: "parciais", nome: "Chamada Parcial" },
  { id: "explorador", nome: "Explorador" },
  { id: "paineis", nome: "Meus painéis" },
  { id: "ajuda", nome: "Ajuda" },
] as const;
type AbaBi = PersonalizacaoBi["preferencias"]["aba"];
const VAZIOS: DadosBi = {};
const RECURSOS_VAZIOS: RecursoBi[] = [];
interface RetratoVista {
  id: string;
  acesso: NonNullable<ReturnType<typeof useDadosBi>["acesso"]>;
  dados: DadosBi;
  datas: string[];
  falhas: string[];
}
function dataBr(valor: string): string {
  const [ano, mes, dia] = valor.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : valor;
}

export default function VistaBi({ fuso }: { fuso: string }) {
  const fonte = useDadosBi();
  const { acesso, carregar, entrar, esquecer, armazenamentoFalhou } = fonte;
  const [personalizacao, setPersonalizacao] = useState<PersonalizacaoBi>(personalizacaoVaziaBi);
  const [prontoLocal, setProntoLocal] = useState(false);
  const [armazenar, setArmazenar] = useState(true);
  const [chave, setChave] = useState("");
  const [persistirDados, setPersistirDados] = useState(false);
  const [erro, setErro] = useState("");
  const [apresentacao, setApresentacao] = useState(false);
  const [prepararImpressao, setPrepararImpressao] = useState(false);
  const [config, setConfig] = useState(() =>
    graficoBi("chamadas", "turma", "infrequencia", "barras", "Minha análise"),
  );
  const ultimaAnaliseValida = useRef(config);
  const [nomePainel, setNomePainel] = useState("");
  const [nomeVisao, setNomeVisao] = useState("");
  const [editando, setEditando] = useState<GraficoBi | null>(null);
  const [erroEdicao, setErroEdicao] = useState("");
  const [retrato, setRetrato] = useState<RetratoVista | null>(null);
  const [atualizacao, setAtualizacao] = useState(0);
  const forcar = useRef(false);
  const [extra, setExtra] = useState<RecursoBi | null>(null);
  const [comparacao, setComparacao] = useState<"nenhuma" | "anterior" | "ano">("nenhuma");
  const [filtrosGeraisAbertos, setFiltrosGeraisAbertos] = useState(false);
  const expansorFiltros = useRef<HTMLButtonElement>(null);
  const [ancoraCabecalho, setAncoraCabecalho] = useState<HTMLElement | null>(null);
  const [ancoraAcoes, setAncoraAcoes] = useState<HTMLElement | null>(null);
  const [comparativo, setComparativo] = useState<{
    id: string;
    valor: number | null;
    inicio: string;
    fim: string;
    consultadoEm?: string;
    falhaAtualizacao?: boolean;
    acesso: NonNullable<typeof acesso>;
    erro?: string;
  } | null>(null);
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string;
    descricao: string;
    acao: () => Promise<void> | void;
  } | null>(null);
  const [ocupacaoLocal, setOcupacaoLocal] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const p = lerPersonalizacaoBi();
      const parametros = new URLSearchParams(window.location.search);
      const { temCompartilhados, resultado: filtros } = receberFiltrosBi(
        p.preferencias.filtros,
        parametros,
      );
      if (
        filtros.success &&
        (!filtros.data.inicio || !filtros.data.fim || filtros.data.inicio <= filtros.data.fim)
      ) {
        p.preferencias.filtros = filtros.data;
        if (temCompartilhados) p.preferencias.aba = "geral";
      }
      // Semente única das preferências: o armazenamento local só existe no
      // cliente, depois da hidratação, e a partir daqui o estado é editável.
      // O restante do efeito só toca no estado depois desta semente, por isso
      // a exceção cobre a leitura inteira. Ver ADR 047.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local (ADR 047)
      setPersonalizacao(p);
      if (p.preferencias.explorador) setConfig(p.preferencias.explorador);
    } catch {
      setArmazenar(false);
      setErro(
        "As configurações locais não puderam ser abertas. Exporte ou limpe o armazenamento antes de substituí-las.",
      );
    } finally {
      setProntoLocal(true);
    }
  }, []);
  useEffect(() => {
    if (!prontoLocal || !armazenar) return;
    try {
      const valida = esquemaGraficoBi.safeParse(config);
      if (valida.success) ultimaAnaliseValida.current = valida.data;
      guardarPersonalizacaoBi({
        ...personalizacao,
        preferencias: {
          ...personalizacao.preferencias,
          explorador: ultimaAnaliseValida.current,
        },
      });
    } catch {
      armazenamentoFalhou();
    }
  }, [personalizacao, config, prontoLocal, armazenar, armazenamentoFalhou]);
  const aba = personalizacao.preferencias.aba;
  const painel =
    personalizacao.paineis.find((p) => p.id === personalizacao.preferencias.painelPadrao) ??
    personalizacao.paineis[0];
  const filtros =
    aba === "paineis" && painel ? painel.filtros : personalizacao.preferencias.filtros;
  const curados = useMemo(() => painelCuradoBi(aba), [aba]);
  const recursos = acesso?.pagina.recursos ?? RECURSOS_VAZIOS;
  const precisaLista = exigeListaBi("chamadas", filtros);
  const necessarios = useMemo(() => {
    let bases: RecursoBi[] = [];
    if (aba === "geral")
      bases = ["chamadas", "alunos", "saidas", "entradas", "parciais", "lista", "feriados"];
    else if (aba === "faltas") bases = ["faltas"];
    else if (aba === "movimentos") bases = ["saidas", "entradas"];
    else if (aba === "parciais") bases = ["parciais", "lista"];
    else if (aba === "explorador") bases = [config.recurso];
    else if (aba === "paineis") bases = painel?.graficos.map((g) => g.recurso) ?? [];
    if (bases.includes("chamadas") && precisaLista) bases.push("lista");
    if (extra) bases.push(extra);
    return [...new Set<RecursoBi>(["series", "turmas", "alunos", ...bases])].filter((r) =>
      recursos.includes(r),
    );
  }, [aba, config.recurso, painel, extra, recursos, precisaLista]);
  const assinatura = JSON.stringify([
    acesso?.id,
    acesso?.pagina.escopo,
    filtros.inicio,
    filtros.fim,
    necessarios,
  ]);
  useEffect(() => {
    if (!acesso || !prontoLocal) return;
    let atual = true;
    const atualizar = forcar.current;
    forcar.current = false;
    const lista = JSON.parse(assinatura)[4] as RecursoBi[];
    void Promise.allSettled(
      lista.map(async (r) => ({
        r,
        retrato: await carregar(r, { inicio: filtros.inicio, fim: filtros.fim }, atualizar),
      })),
    ).then((resultados) => {
      if (!atual) return;
      const dados: DadosBi = {};
      const datas: string[] = [];
      const falhas: string[] = [];
      for (let i = 0; i < resultados.length; i++) {
        const resultado = resultados[i];
        if (resultado?.status === "fulfilled") {
          dados[resultado.value.r] = resultado.value.retrato.linhas;
          datas.push(resultado.value.retrato.consultadoEm);
          if (resultado.value.retrato.falhaAtualizacao)
            falhas.push(
              `${ROTULOS_RECURSOS_BI[resultado.value.r]}: exibindo dados guardados após falha na atualização.`,
            );
        } else if (resultado?.status === "rejected") {
          const nome = ROTULOS_RECURSOS_BI[lista[i] ?? "contexto"];
          falhas.push(
            `${nome}: ${resultado.reason instanceof Error ? resultado.reason.message : "consulta interrompida"}`,
          );
        }
      }
      setRetrato({ id: assinatura, acesso, dados, datas, falhas });
    });
    return () => {
      atual = false;
    };
  }, [assinatura, atualizacao, carregar, acesso, prontoLocal, filtros.inicio, filtros.fim]);
  const retratoAtual = retrato?.id === assinatura && retrato.acesso === acesso ? retrato : null;
  const carregando = Boolean(acesso) && !retratoAtual;
  const dados = useMemo(() => enriquecerBi(retratoAtual?.dados ?? VAZIOS), [retratoAtual]);
  const recortes = useMemo(
    () =>
      Object.fromEntries(
        BASES_ANALISE.map((r) => [r, resolverRecorteBi(dados, r, filtros)]),
      ) as Record<(typeof BASES_ANALISE)[number], RecorteBi>,
    [dados, filtros],
  );
  const calcular = useCalculosBi(recortes, acesso?.id ?? "");
  useEffect(() => {
    if (acesso) return;
    const frame = requestAnimationFrame(() => {
      setRetrato(null);
      setComparativo(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [acesso]);
  const trocarAba = (id: AbaBi) => {
    setExtra(null);
    setPersonalizacao((p) => ({ ...p, preferencias: { ...p.preferencias, aba: id } }));
  };
  const alterarPainel = (novo: PainelBi) =>
    setPersonalizacao((p) => ({
      ...p,
      paineis: p.paineis.map((v) => (v.id === novo.id ? novo : v)),
    }));
  const alterarFiltros = (f: FiltrosBi) => {
    if (aba === "paineis" && painel) alterarPainel({ ...painel, filtros: f });
    else setPersonalizacao((p) => ({ ...p, preferencias: { ...p.preferencias, filtros: f } }));
  };
  const filtrarGrafico = (g: GraficoBi, p: PontoBi) => {
    const campo: Partial<FiltrosBi> =
      g.dimensao === "serie"
        ? { serieId: p.referencia, turmaId: "", alunoId: "" }
        : g.dimensao === "turma"
          ? { turmaId: p.referencia, alunoId: "" }
          : g.dimensao === "aluno"
            ? { alunoId: p.referencia }
            : g.dimensao === "justificativa"
              ? { justificativa: p.nome }
              : g.dimensao === "tipo"
                ? { tipo: p.nome }
                : g.dimensao === "turno"
                  ? { turno: p.nome }
                  : g.dimensao === "dia"
                    ? { inicio: p.nome, fim: p.nome }
                    : {};
    if (Object.keys(campo).length) alterarFiltros({ ...filtros, ...campo });
  };
  const aprofundar = (g: GraficoBi) => {
    setPersonalizacao((p) => ({ ...p, preferencias: { ...p.preferencias, filtros } }));
    setConfig({
      ...g,
      id: "explorador",
      dimensao: g.dimensao === "serie" ? "turma" : "aluno",
      titulo: g.dimensao === "serie" ? "Análise por turma" : "Análise por aluno",
      recurso: g.dimensao === "turma" && g.recurso === "chamadas" ? "lista" : g.recurso,
      medida: g.medida,
    });
    trocarAba("explorador");
  };
  const confirmarExportacao: ConfirmarExportacaoBi = (acao) =>
    setConfirmacao({
      titulo: "Exportar dados pessoais?",
      descricao:
        "O arquivo pode conter nomes e informações escolares. Acesso restrito à equipe autorizada; guarde o arquivo em local seguro.",
      acao,
    });
  const confirmarLocal = (titulo: string, descricao: string, acao: () => Promise<void> | void) =>
    setConfirmacao({ titulo, descricao, acao });
  const { executando: imprimindo, executar: imprimir } = useAcaoUnica(async () => {
    setPrepararImpressao(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      let pronto = false;
      for (let tentativa = 0; tentativa < 150; tentativa++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const pendente = document.querySelector(
          'article[data-bi-carregando="true"], article[data-grafico-id] [data-bi-modulo-carregando]',
        );
        if (!pendente && pronto) {
          window.print();
          return;
        }
        pronto = !pendente;
      }
      setErro("Os gráficos ainda estão sendo preparados. Tente imprimir novamente.");
    } finally {
      setPrepararImpressao(false);
    }
  });
  const { executando: entrando, executar: entrarAgora } = useAcaoUnica(() =>
    entrar(chave.trim(), persistirDados),
  );
  const { executando: confirmando, executar: confirmarAgora } = useAcaoUnica(async () => {
    if (!confirmacao) return;
    try {
      await confirmacao.acao();
      setConfirmacao(null);
    } catch (e) {
      avisarErro(e, { contexto: "Não foi possível concluir a ação no BI." });
    }
  });
  const visaoAtual = personalizacao.visoes.find((v) => v.id === config.id);
  const guardarVisao = (atualizarExistente = false) => {
    const g = esquemaGraficoBi.safeParse({
      ...config,
      id: atualizarExistente && visaoAtual ? visaoAtual.id : crypto.randomUUID(),
      titulo: nomeVisao.trim() || config.titulo,
    });
    if (!g.success) {
      setErro("Confira o título e os valores da análise.");
      return;
    }
    if (!atualizarExistente && personalizacao.visoes.length >= 200) {
      setErro("O limite é de 200 visões. Exclua uma antes de salvar.");
      return;
    }
    setPersonalizacao((p) => ({
      ...p,
      visoes:
        atualizarExistente && visaoAtual
          ? p.visoes.map((v) => (v.id === visaoAtual.id ? g.data : v))
          : [...p.visoes, g.data],
    }));
    setConfig({ ...config, id: g.data.id });
    setErro("");
    setNomeVisao("");
    avisarSucesso(
      atualizarExistente ? "Visão atualizada neste navegador." : "Visão salva neste navegador.",
    );
  };
  const criarPainel = () => {
    const nome = nomePainel.trim();
    if (!nome || personalizacao.paineis.length >= 50) return;
    const novo: PainelBi = { id: crypto.randomUUID(), nome, graficos: [], filtros, anotacao: "" };
    setPersonalizacao((p) => ({
      ...p,
      paineis: [...p.paineis, novo],
      preferencias: { ...p.preferencias, painelPadrao: novo.id },
    }));
    setNomePainel("");
  };
  const adicionar = () => {
    if (!painel) {
      setErro("Crie um painel na aba Meus painéis antes de adicionar.");
      return;
    }
    const g = esquemaGraficoBi.safeParse({ ...config, id: crypto.randomUUID() });
    if (!g.success) {
      setErro("Confira os valores da análise.");
      return;
    }
    if (painel.graficos.length >= 40) {
      setErro("O painel já tem 40 gráficos.");
      return;
    }
    alterarPainel({ ...painel, graficos: [...painel.graficos, g.data] });
    setErro("");
    avisarSucesso("Gráfico adicionado ao painel.");
  };
  const personalizarModelo = () => {
    if (personalizacao.paineis.length >= 50) {
      setErro("O limite é de 50 painéis. Exclua um antes de criar.");
      return;
    }
    const novo: PainelBi = {
      id: crypto.randomUUID(),
      nome: ABAS.find((a) => a.id === aba)?.nome ?? "Meu painel",
      graficos: curados
        .filter((g) => recursos.includes(g.recurso))
        .map((g) => ({ ...g, id: crypto.randomUUID() })),
      filtros: { ...filtros },
      anotacao: "",
    };
    setPersonalizacao((p) => ({
      ...p,
      paineis: [...p.paineis, novo],
      preferencias: { ...p.preferencias, painelPadrao: novo.id, aba: "paineis" },
    }));
    avisarSucesso("Painel criado. Os gráficos já podem ser personalizados.");
  };
  const atualizar = () => {
    if (carregando) return;
    forcar.current = true;
    setRetrato(null);
    setAtualizacao((v) => v + 1);
  };
  const compartilhar = async () => {
    const url = new URL("/bi", window.location.origin);
    for (const c of CAMPOS_LINK_BI) if (filtros[c]) url.searchParams.set(c, filtros[c]);
    try {
      await navigator.clipboard.writeText(url.toString());
      avisarSucesso("Link copiado, sem chave ou anotações.");
    } catch {
      setErro(
        "A cópia foi bloqueada pelo navegador. Confira as permissões da área de transferência.",
      );
    }
  };
  const importar = async (file: File) => {
    try {
      if (file.size > 20_000_000) throw new Error("O arquivo de configurações deve ter até 20 MB.");
      const novo = migrarPersonalizacaoBi(JSON.parse(await file.text()));
      confirmarLocal(
        "Substituir configurações locais?",
        "O arquivo substituirá visões, painéis e preferências. A chave e os dados baixados serão preservados.",
        () => {
          setPersonalizacao(novo);
          setConfig(
            novo.preferencias.explorador ??
              graficoBi("chamadas", "turma", "infrequencia", "barras", "Minha análise"),
          );
          setArmazenar(true);
          setErro("");
        },
      );
    } catch {
      setErro("Arquivo inválido ou incompatível. A configuração atual foi preservada.");
    }
  };
  const geracaoComparada = useRef(0);
  const idComparacao = JSON.stringify([assinatura, comparacao, filtros, atualizacao]);
  const alunosComparacao = dados.alunos;
  useEffect(() => {
    if (comparacao === "nenhuma" || !acesso || aba !== "geral" || !recursos.includes("chamadas"))
      return;
    let atual = true;
    const f = compararPeriodoBi(filtros, comparacao);
    const base = exigeListaBi("chamadas", f) ? "lista" : "chamadas";
    const renovar = atualizacao !== geracaoComparada.current;
    geracaoComparada.current = atualizacao;
    void carregar(base, { inicio: f.inicio, fim: f.fim }, renovar)
      .then((r) => {
        const recorte = resolverRecorteBi(
          enriquecerBi({ [base]: r.linhas, alunos: alunosComparacao }),
          "chamadas",
          f,
        );
        if (atual) {
          setComparativo({
            id: idComparacao,
            valor: recorte.disponivel
              ? totalBi(recorte.linhas, "infrequencia", recorte.filtros)
              : null,
            inicio: f.inicio,
            fim: f.fim,
            acesso,
            consultadoEm: r.consultadoEm,
            falhaAtualizacao: r.falhaAtualizacao,
            erro: recorte.disponivel ? undefined : recorte.motivo,
          });
        }
      })
      .catch(() => {
        if (atual)
          setComparativo({
            id: idComparacao,
            valor: null,
            inicio: f.inicio,
            fim: f.fim,
            acesso,
            erro: "Comparação indisponível. Tente atualizar os dados.",
          });
      });
    return () => {
      atual = false;
    };
  }, [
    comparacao,
    acesso,
    aba,
    recursos,
    carregar,
    filtros,
    atualizacao,
    idComparacao,
    alunosComparacao,
  ]);
  const comparacaoVisivel =
    comparativo?.id === idComparacao && comparativo.acesso === acesso ? comparativo : null;
  const numero = (v: number | null) =>
    v === null ? "Sem dados" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const chamadaRecortada = recortes.chamadas;
  const infrequencia = chamadaRecortada.disponivel
    ? totalBi(chamadaRecortada.linhas, "infrequencia", chamadaRecortada.filtros)
    : null;
  const filtrosTurmas = {
    ...filtros,
    alunoId: "",
    busca: "",
    situacao: "",
    tipo: "",
    turno: "",
    justificativa: "",
  };
  const cobertura = coberturaBi(dados, filtrosTurmas, acesso?.pagina.escopo);
  const pendencias = ["lista", "parciais"] as const;
  const metrica = (
    recurso: (typeof BASES_ANALISE)[number],
    medida: Parameters<typeof totalBi>[1],
  ) => {
    const recorte = recortes[recurso];
    return recorte.disponivel ? totalBi(recorte.linhas, medida, recorte.filtros) : null;
  };
  const comparacaoAtiva =
    aba === "geral" && comparacao !== "nenhuma" && recursos.includes("chamadas");
  const datasVisiveis =
    comparacaoAtiva && comparacaoVisivel?.consultadoEm
      ? [...(retratoAtual?.datas ?? []), comparacaoVisivel.consultadoEm]
      : (retratoAtual?.datas ?? []);
  const ultimaData =
    retratoAtual &&
    retratoAtual.falhas.length === 0 &&
    (!comparacaoAtiva ||
      (comparacaoVisivel &&
        !comparacaoVisivel.erro &&
        !comparacaoVisivel.falhaAtualizacao &&
        comparacaoVisivel.consultadoEm)) &&
    datasVisiveis.length > 0 &&
    datasVisiveis.every((data) => Number.isFinite(Date.parse(data)))
      ? [...datasVisiveis].sort((a, b) => Date.parse(a) - Date.parse(b))[0]
      : undefined;
  const destaques = useMemo(() => destaquesBi(dados, filtros), [dados, filtros]);
  const mostrarGrafico = (g: GraficoBi) => {
    if (!recursos.includes(g.recurso)) return null;
    const recorte = recortes[g.recurso];
    return (
      <CartaoGrafico
        key={g.id}
        config={g}
        filtros={filtros}
        linhas={recorte.disponivel ? recorte.linhas : []}
        filtrosDados={recorte.disponivel ? recorte.filtros : filtros}
        indisponivel={recorte.disponivel ? undefined : recorte.motivo}
        calcular={calcular}
        onFiltrar={filtrarGrafico}
        onAprofundar={aprofundar}
        confirmar={confirmarExportacao}
        prepararImpressao={prepararImpressao}
        acoes={
          <Botao
            variante="secundario"
            tamanho="pequeno"
            sx={{ height: 48, "@media print": { display: "none" } }}
            aria-label={`Personalizar ${g.titulo}`}
            icone={<EditRoundedIcon />}
            onClick={() => {
              setConfig({ ...g, id: "explorador" });
              trocarAba("explorador");
            }}
          >
            Personalizar
          </Botao>
        }
      />
    );
  };
  const indicadores: Array<[string, string | number]> = [
    ["Infrequência", infrequencia === null ? "Sem base de cálculo" : `${numero(infrequencia)}%`],
    [
      "Alunos ativos",
      dados.alunos
        ? filtrarBi(dados.alunos, {
            ...filtros,
            justificativa: "",
            tipo: "",
            turno: "",
          }).filter((l) => l.ativo === true && !l.desistenteEm).length
        : "Indisponível",
    ],
    ["Turmas", dados.turmas ? filtrarBi(dados.turmas, filtrosTurmas).length : "Indisponível"],
    ["Ausências", numero(metrica("chamadas", "ausencias"))],
    ["Saídas", numero(metrica("saidas", "registros"))],
    ["Entradas", numero(metrica("entradas", "registros"))],
    [
      "Pendências Seduc",
      pendencias.every((r) => metrica(r, "pendentes") !== null)
        ? pendencias.reduce((n, r) => n + (metrica(r, "pendentes") ?? 0), 0)
        : "Conjuntos indisponíveis",
    ],
    ["Dias com chamada", numero(metrica("chamadas", "diasChamada"))],
    [
      "Cobertura das turmas",
      cobertura?.taxa === null || !cobertura ? "Sem base de cálculo" : `${numero(cobertura.taxa)}%`,
    ],
  ];
  const nomeAba = ABAS.find((a) => a.id === aba)?.nome ?? "Visão geral";
  return (
    <LayoutPagina semGaveta>
      <RegistroPwa />
      <Box
        data-apresentacao={apresentacao ? "true" : undefined}
        sx={{
          flex: 1,
          minWidth: 0,
          ...(apresentacao ? { "& [data-acoes-grafico]": { display: "none !important" } } : {}),
          "@media print": { minHeight: 0 },
        }}
      >
        <LayoutConteudo largura="larga">
          {apresentacao && (
            <Botao
              variante="secundario"
              onClick={() => setApresentacao(false)}
              sx={{
                position: "fixed",
                top: "max(8px, env(safe-area-inset-top))",
                right: "max(8px, env(safe-area-inset-right))",
                zIndex: 30,
                "@media print": { display: "none" },
              }}
            >
              Sair da apresentação
            </Botao>
          )}
          {!apresentacao && (
            <Box sx={{ "@media print": { display: "none" } }}>
              <CabecalhoPagina
                titulo="FrequenciBI"
                descricao={
                  acesso
                    ? `${nomeAba} | ${dataBr(filtros.inicio)} a ${dataBr(filtros.fim)}`
                    : "Análises da escola com chave própria, sem entrar na conta do FrequenciApp."
                }
                acoes={
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}
                  >
                    <Botao
                      href="/"
                      variante="texto"
                      tamanho="pequeno"
                      sx={{ height: 48 }}
                      icone={<ArrowBackRoundedIcon />}
                      aria-label="Voltar ao FrequenciApp"
                    >
                      FrequenciApp
                    </Botao>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ display: { xs: "none", sm: "flex" }, alignItems: "center" }}
                    >
                      <Box
                        sx={{
                          display: "inline-flex",
                          "& .MuiIconButton-root": {
                            backgroundColor: "transparent",
                            borderColor: "transparent",
                          },
                        }}
                      >
                        <SeletorTema />
                      </Box>
                      {acesso && (
                        <Botao
                          variante="texto"
                          tamanho="pequeno"
                          sx={{ height: 48 }}
                          onClick={() => {
                            setChave("");
                            void esquecer();
                          }}
                        >
                          Esquecer chave
                        </Botao>
                      )}
                    </Stack>
                    <Box sx={{ display: { xs: "block", sm: "none" } }}>
                      <BotaoIcone
                        rotulo="Mais ações do FrequenciBI"
                        icone={<MoreHorizRoundedIcon />}
                        variante="texto"
                        sx={{ width: 48, height: 48 }}
                        onClick={(evento) => setAncoraCabecalho(evento.currentTarget)}
                      />
                    </Box>
                  </Stack>
                }
              />
            </Box>
          )}
          <Popover
            aberto={Boolean(ancoraCabecalho)}
            ancora={ancoraCabecalho}
            onFechar={() => setAncoraCabecalho(null)}
            rotuloAcessivel="Mais ações do FrequenciBI"
            posicao="inferior-fim"
          >
            <Stack spacing={2} sx={{ minWidth: 220 }}>
              <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Tema
                </Typography>
                <Box
                  sx={{
                    display: "inline-flex",
                    "& .MuiIconButton-root": {
                      backgroundColor: "transparent",
                      borderColor: "transparent",
                    },
                  }}
                >
                  <SeletorTema />
                </Box>
              </Stack>
              {acesso && (
                <Botao
                  variante="texto"
                  sx={{ height: 48, justifyContent: "flex-start" }}
                  onClick={() => {
                    setChave("");
                    void esquecer();
                    setAncoraCabecalho(null);
                  }}
                >
                  Esquecer chave
                </Botao>
              )}
            </Stack>
          </Popover>
          <Stack spacing={2}>
            {!acesso ? (
              <Grid container sx={{ justifyContent: "center" }}>
                <Grid size={{ xs: 12, sm: 8, md: 6, lg: 4 }}>
                  <Cartao>
                    <Stack spacing={2}>
                      <Box>
                        <Typography component="h2" variant="h5">
                          Abrir análises da escola
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
                          Use a chave criada na Gestão.
                        </Typography>
                      </Box>
                      <Box
                        component="form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void entrarAgora();
                        }}
                      >
                        <Stack spacing={2}>
                          <Campo id="chave-bi" rotulo="Chave de acesso">
                            <CampoSenha
                              disabled={!prontoLocal}
                              valor={chave}
                              onValor={setChave}
                              rotulosVisibilidade={{
                                mostrar: "Mostrar chave de acesso",
                                ocultar: "Ocultar chave de acesso",
                              }}
                              autoComplete="off"
                              placeholder="Cole a chave recebida"
                              required
                            />
                          </Campo>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={persistirDados}
                                onChange={(evento) => setPersistirDados(evento.target.checked)}
                              />
                            }
                            label="Guardar chave e consultas para uso offline neste dispositivo"
                            sx={{ alignItems: "flex-start", minHeight: 48, m: 0 }}
                          />
                          <Botao
                            type="submit"
                            variante="secundario"
                            sx={{ width: "100%", height: 48 }}
                            disabled={entrando || fonte.ocupado || !chave.trim()}
                            carregando={entrando || fonte.ocupado}
                          >
                            Testar e entrar
                          </Botao>
                        </Stack>
                      </Box>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        Sem a opção, a consulta fica apenas nesta aba e some ao recarregar. Ao
                        guardar, a chave e os dados pessoais ficam disponíveis neste navegador por
                        até sete dias, inclusive offline. Em dispositivo compartilhado, mantenha
                        desmarcado. Sair do FrequenciApp também remove a chave e as consultas
                        guardadas; bloqueios do navegador podem impedir a remoção.
                      </Typography>
                      {fonte.erro && (
                        <AlertaCompacto
                          variante="dados_invalidos"
                          descricao={fonte.erro}
                          tamanho="linha"
                        />
                      )}
                    </Stack>
                  </Cartao>
                </Grid>
              </Grid>
            ) : (
              <>
                <Box
                  sx={{
                    display: apresentacao ? "none" : undefined,
                    "@media print": { display: "none" },
                  }}
                >
                  <Stack spacing={2}>
                    <Box sx={{ display: { xs: "block", sm: "none" } }}>
                      <Selecionar
                        ariaLabel="Seção do FrequenciBI"
                        valor={aba}
                        onValor={(valor) => trocarAba(valor as AbaBi)}
                        opcoes={ABAS.map((item) => ({ valor: item.id, rotulo: item.nome }))}
                      />
                    </Box>
                    <Box sx={{ display: { xs: "none", sm: "block" }, minWidth: 0 }}>
                      <Tabs
                        value={aba}
                        onChange={(_evento, valor: unknown) => {
                          if (typeof valor === "string" && ABAS.some((a) => a.id === valor))
                            trocarAba(valor as AbaBi);
                        }}
                        variant="scrollable"
                        scrollButtons="auto"
                        allowScrollButtonsMobile
                        aria-label="Seções do FrequenciBI"
                        sx={{
                          minHeight: 48,
                          "& .MuiTab-root.Mui-selected": {
                            backgroundColor: "action.selected",
                            borderColor: "divider",
                          },
                        }}
                      >
                        {ABAS.map((item) => (
                          <Tab
                            key={item.id}
                            value={item.id}
                            label={item.nome}
                            aria-current={aba === item.id ? "page" : undefined}
                          />
                        ))}
                      </Tabs>
                    </Box>
                    <Stack
                      direction="row"
                      useFlexGap
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <BotaoAtualizar
                          onAtualizar={atualizar}
                          ocupado={carregando || fonte.ocupado}
                          disponivel
                          rotulo="Atualizar dados"
                          variante="contorno"
                          tamanho="pequeno"
                        />
                        <AtualizadoEm instante={ultimaData} fuso={fuso} />
                      </Stack>
                      <Stack
                        direction="row"
                        useFlexGap
                        spacing={1}
                        sx={{ display: { xs: "none", sm: "flex" }, flexWrap: "wrap" }}
                      >
                        <Botao
                          variante="texto"
                          tamanho="pequeno"
                          sx={{ height: 48 }}
                          icone={<LinkRoundedIcon />}
                          onClick={() => void compartilhar()}
                        >
                          Compartilhar filtros
                        </Botao>
                        <Botao
                          variante="texto"
                          tamanho="pequeno"
                          sx={{ height: 48 }}
                          icone={
                            apresentacao ? <FullscreenExitRoundedIcon /> : <FullscreenRoundedIcon />
                          }
                          onClick={() => setApresentacao(!apresentacao)}
                        >
                          {apresentacao ? "Sair da apresentação" : "Apresentar"}
                        </Botao>
                        <Botao
                          variante="texto"
                          tamanho="pequeno"
                          sx={{ height: 48 }}
                          disabled={carregando || imprimindo}
                          icone={<PrintRoundedIcon />}
                          onClick={() => void imprimir()}
                        >
                          {imprimindo ? "Preparando impressão..." : "Imprimir"}
                        </Botao>
                      </Stack>
                      <Box sx={{ display: { xs: "block", sm: "none" } }}>
                        <BotaoIcone
                          rotulo="Mais ações da análise"
                          icone={<MoreHorizRoundedIcon />}
                          variante="texto"
                          sx={{ width: 48, height: 48 }}
                          onClick={(evento) => setAncoraAcoes(evento.currentTarget)}
                        />
                      </Box>
                    </Stack>
                    <Popover
                      aberto={Boolean(ancoraAcoes)}
                      ancora={ancoraAcoes}
                      onFechar={() => setAncoraAcoes(null)}
                      rotuloAcessivel="Mais ações da análise"
                      posicao="inferior-fim"
                    >
                      <Stack spacing={1} sx={{ minWidth: 220 }}>
                        <Botao
                          variante="texto"
                          sx={{ height: 48, justifyContent: "flex-start" }}
                          icone={<LinkRoundedIcon />}
                          onClick={() => {
                            setAncoraAcoes(null);
                            void compartilhar();
                          }}
                        >
                          Compartilhar filtros
                        </Botao>
                        <Botao
                          variante="texto"
                          sx={{ height: 48, justifyContent: "flex-start" }}
                          icone={<FullscreenRoundedIcon />}
                          onClick={() => {
                            setAncoraAcoes(null);
                            setApresentacao(!apresentacao);
                          }}
                        >
                          Apresentar
                        </Botao>
                        <Botao
                          variante="texto"
                          sx={{ height: 48, justifyContent: "flex-start" }}
                          disabled={carregando || imprimindo}
                          icone={<PrintRoundedIcon />}
                          onClick={() => {
                            setAncoraAcoes(null);
                            void imprimir();
                          }}
                        >
                          {imprimindo ? "Preparando impressão..." : "Imprimir"}
                        </Botao>
                      </Stack>
                    </Popover>
                    {aba === "geral" && (
                      <Botao
                        variante="contorno"
                        ref={expansorFiltros}
                        aria-expanded={filtrosGeraisAbertos}
                        aria-controls="filtros-bi"
                        onClick={() => setFiltrosGeraisAbertos((abertos) => !abertos)}
                        sx={{
                          display: { xs: "inline-flex", sm: "none" },
                          minHeight: 48,
                          width: "100%",
                          justifyContent: "space-between",
                        }}
                      >
                        Filtros da análise
                        <ExpandMoreRoundedIcon
                          sx={{ transform: filtrosGeraisAbertos ? "rotate(180deg)" : undefined }}
                        />
                      </Botao>
                    )}
                    <Box
                      id="filtros-bi"
                      sx={{
                        display:
                          aba === "geral" && !filtrosGeraisAbertos
                            ? { xs: "none", sm: "block" }
                            : undefined,
                      }}
                    >
                      <SeletorFiltrosBi
                        fuso={fuso}
                        key={`${aba}-${painel?.id ?? "global"}-${filtros.inicio}-${filtros.fim}`}
                        filtros={filtros}
                        onAlterar={alterarFiltros}
                        dados={dados}
                        completo
                        focoAoOcultarGatilho={
                          aba === "geral" && !filtrosGeraisAbertos ? expansorFiltros : undefined
                        }
                      />
                    </Box>
                  </Stack>
                </Box>
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  role="status"
                  sx={{ alignItems: "center", color: "text.secondary", flexWrap: "wrap" }}
                >
                  {fonte.offline ? (
                    <>
                      <Selo rotulo="Offline" tom="atencao" />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        <WifiOffRoundedIcon
                          fontSize="inherit"
                          aria-hidden="true"
                          sx={{ verticalAlign: "middle", mr: 0.5 }}
                        />
                        Consulta offline. Uma revogação recente só pode ser conferida com conexão.
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      Retrato consultado
                    </Typography>
                  )}
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {ultimaData
                      ? new Date(ultimaData).toLocaleString("pt-BR", { timeZone: fuso })
                      : "Ainda sem retrato completo"}
                  </Typography>
                  {carregando && (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {fonte.progresso || "Carregando conjuntos..."}
                    </Typography>
                  )}
                </Stack>
                {fonte.erro && (
                  <AlertaCompacto
                    variante="dados_invalidos"
                    descricao={fonte.erro}
                    tamanho="linha"
                    sx={{ mb: 2 }}
                  />
                )}
                {retratoAtual && retratoAtual.falhas.length > 0 && (
                  <AlertaCompacto
                    variante="dados_invalidos"
                    descricao={retratoAtual.falhas.join(" ")}
                    tamanho="linha"
                    sx={{ mb: 2 }}
                  />
                )}
                {carregando ? (
                  <Box
                    role="status"
                    sx={{
                      minHeight: 160,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                    }}
                  >
                    <CircularProgress size={24} />
                    Preparando o recorte
                  </Box>
                ) : (
                  <>
                    {aba === "geral" && (
                      <>
                        <Box component="section" aria-label="Indicadores gerais">
                          <GradeCartoes>
                            {indicadores.map(([titulo, valor]) => (
                              <Cartao key={titulo} component="article" sx={{ height: "100%" }}>
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  {titulo}
                                </Typography>
                                <Typography
                                  component="p"
                                  sx={{
                                    mt: 1,
                                    fontWeight: 700,
                                    fontVariantNumeric: "tabular-nums",
                                    overflowWrap: "anywhere",
                                    fontSize: { xs: "1.25rem", sm: "1.5rem" },
                                  }}
                                >
                                  {valor}
                                </Typography>
                              </Cartao>
                            ))}
                          </GradeCartoes>
                        </Box>
                        <SecaoConteudo>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                            sx={{ alignItems: { xs: "stretch", sm: "center" } }}
                          >
                            <Box sx={{ minWidth: 0, flex: { sm: "0 0 260px" } }}>
                              <Campo id="comparacao-bi" rotulo="Comparar infrequência">
                                <Selecionar
                                  valor={comparacao}
                                  onValor={(v) => setComparacao(v as typeof comparacao)}
                                  opcoes={[
                                    { valor: "nenhuma", rotulo: "Sem comparação" },
                                    { valor: "anterior", rotulo: "Período anterior" },
                                    { valor: "ano", rotulo: "Ano anterior" },
                                  ]}
                                />
                              </Campo>
                            </Box>
                            {comparacao !== "nenhuma" && (
                              <Typography variant="body2">
                                {comparacaoVisivel
                                  ? (comparacaoVisivel.erro ??
                                    `${comparacaoVisivel.inicio} a ${comparacaoVisivel.fim}: ${comparacaoVisivel.valor === null ? "sem base de cálculo" : `${numero(comparacaoVisivel.valor)}%`}${infrequencia === null || comparacaoVisivel.valor === null ? "" : ` | Variação: ${numero(infrequencia - comparacaoVisivel.valor)} pontos percentuais`}`)
                                  : "Preparando comparação..."}
                              </Typography>
                            )}
                          </Stack>
                        </SecaoConteudo>
                      </>
                    )}
                    {["geral", "faltas", "movimentos", "parciais"].includes(aba) && (
                      <>
                        <Box
                          sx={{
                            display: apresentacao ? "none" : "flex",
                            justifyContent: "flex-end",
                            "@media print": { display: "none" },
                          }}
                        >
                          <Botao
                            variante="contorno"
                            tamanho="pequeno"
                            sx={{ height: 48 }}
                            icone={<EditRoundedIcon />}
                            onClick={personalizarModelo}
                          >
                            Personalizar este painel
                          </Botao>
                        </Box>
                        <Grid container spacing={2}>
                          {curados.map((g) => (
                            <Grid key={g.id} size={{ xs: 12, lg: 6 }}>
                              {mostrarGrafico(g)}
                            </Grid>
                          ))}
                        </Grid>
                      </>
                    )}
                    {aba === "explorador" && (
                      <Stack spacing={2}>
                        <Box sx={{ display: apresentacao ? "none" : undefined }}>
                          <EditorGraficoBi
                            config={config}
                            onAlterar={setConfig}
                            recursos={recursos}
                          />
                        </Box>
                        <Stack
                          direction="row"
                          useFlexGap
                          spacing={1}
                          data-acoes-grafico
                          sx={{ flexWrap: "wrap", "@media print": { display: "none" } }}
                        >
                          <TextField
                            placeholder="Nome da visão"
                            value={nomeVisao}
                            onChange={(e) => setNomeVisao(e.target.value)}
                            slotProps={{
                              htmlInput: { "aria-label": "Nome da visão salva", maxLength: 100 },
                            }}
                            sx={{ width: { xs: "100%", sm: 280 } }}
                          />
                          {visaoAtual && (
                            <Botao variante="secundario" onClick={() => guardarVisao(true)}>
                              Atualizar visão
                            </Botao>
                          )}
                          <Botao
                            variante={visaoAtual ? "contorno" : "secundario"}
                            onClick={() => guardarVisao()}
                          >
                            {visaoAtual ? "Salvar como nova" : "Salvar visão"}
                          </Botao>
                          {personalizacao.paineis.length > 0 && (
                            <Box sx={{ width: { xs: "100%", sm: 256 }, minWidth: 0 }}>
                              <Selecionar
                                ariaLabel="Painel de destino"
                                valor={painel?.id ?? ""}
                                opcoes={personalizacao.paineis.map((p) => ({
                                  valor: p.id,
                                  rotulo: p.nome,
                                }))}
                                onValor={(id) =>
                                  setPersonalizacao((p) => ({
                                    ...p,
                                    preferencias: { ...p.preferencias, painelPadrao: id },
                                  }))
                                }
                              />
                            </Box>
                          )}
                          <Botao
                            variante="contorno"
                            onClick={painel ? adicionar : () => trocarAba("paineis")}
                          >
                            {painel ? "Adicionar ao painel" : "Criar painel"}
                          </Botao>
                        </Stack>
                        {recursos.includes(config.recurso) ? (
                          mostrarGrafico(config)
                        ) : (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            Escolha uma base permitida pela chave.
                          </Typography>
                        )}
                        <SecaoConteudo titulo="Visões salvas">
                          {!personalizacao.visoes.length && (
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                              Nenhuma visão salva.
                            </Typography>
                          )}
                          <Stack
                            direction="row"
                            useFlexGap
                            spacing={1}
                            sx={{ flexWrap: "wrap", minWidth: 0 }}
                          >
                            {personalizacao.visoes.map((v) => (
                              <Stack
                                key={v.id}
                                direction="row"
                                spacing={0.5}
                                sx={{
                                  alignItems: "center",
                                  p: 0.5,
                                  minWidth: 0,
                                  maxWidth: "100%",
                                  border: 1,
                                  borderColor: "divider",
                                  borderRadius: 2,
                                }}
                              >
                                <Botao
                                  variante={config.id === v.id ? "secundario" : "texto"}
                                  tamanho="pequeno"
                                  aria-pressed={config.id === v.id}
                                  onClick={() => {
                                    setConfig(v);
                                    setNomeVisao("");
                                  }}
                                  sx={{
                                    height: "auto",
                                    minHeight: 44,
                                    minWidth: 0,
                                    whiteSpace: "normal",
                                    overflowWrap: "anywhere",
                                    textAlign: "left",
                                  }}
                                >
                                  {v.titulo}
                                </Botao>
                                <BotaoIcone
                                  rotulo={`Excluir visão ${v.titulo}`}
                                  icone={<DeleteOutlineRoundedIcon />}
                                  variante="texto"
                                  onClick={() =>
                                    confirmarLocal(
                                      "Excluir visão?",
                                      "A visão será removida deste navegador. Os gráficos já adicionados aos painéis serão preservados.",
                                      () =>
                                        setPersonalizacao((p) => ({
                                          ...p,
                                          visoes: p.visoes.filter((g) => g.id !== v.id),
                                        })),
                                    )
                                  }
                                />
                              </Stack>
                            ))}
                          </Stack>
                        </SecaoConteudo>
                      </Stack>
                    )}
                    {aba === "paineis" && (
                      <Stack spacing={2}>
                        <Box
                          sx={{
                            display: apresentacao ? "none" : undefined,
                            "@media print": { display: "none" },
                          }}
                        >
                          <SecaoConteudo>
                            <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                              <TextField
                                value={nomePainel}
                                placeholder="Nome do painel"
                                onChange={(e) => setNomePainel(e.target.value)}
                                slotProps={{
                                  htmlInput: {
                                    "aria-label": "Nome do novo painel",
                                    maxLength: 100,
                                  },
                                }}
                                sx={{ width: { xs: "100%", sm: 280 } }}
                              />
                              <Botao
                                variante="secundario"
                                onClick={criarPainel}
                                disabled={!nomePainel.trim() || personalizacao.paineis.length >= 50}
                              >
                                Criar painel
                              </Botao>
                              {painel && (
                                <>
                                  <Box sx={{ width: { xs: "100%", sm: 240 }, minWidth: 0 }}>
                                    <Selecionar
                                      ariaLabel="Painel atual"
                                      valor={painel.id}
                                      opcoes={personalizacao.paineis.map((p) => ({
                                        valor: p.id,
                                        rotulo: p.nome,
                                      }))}
                                      onValor={(id) =>
                                        setPersonalizacao((p) => ({
                                          ...p,
                                          preferencias: { ...p.preferencias, painelPadrao: id },
                                        }))
                                      }
                                    />
                                  </Box>
                                  <Botao
                                    variante="contorno"
                                    tamanho="pequeno"
                                    sx={{ height: 48 }}
                                    icone={<EditRoundedIcon />}
                                    onClick={() => trocarAba("explorador")}
                                  >
                                    Adicionar gráficos
                                  </Botao>
                                  <Botao
                                    variante="texto"
                                    tamanho="pequeno"
                                    sx={{ height: 48 }}
                                    disabled={personalizacao.paineis.length >= 50}
                                    icone={<ContentCopyRoundedIcon />}
                                    onClick={() => {
                                      const copia = {
                                        ...painel,
                                        id: crypto.randomUUID(),
                                        nome: `${painel.nome.slice(0, 90)} (cópia)`,
                                        graficos: painel.graficos.map((g) => ({
                                          ...g,
                                          id: crypto.randomUUID(),
                                        })),
                                      };
                                      setPersonalizacao((p) => ({
                                        ...p,
                                        paineis: [...p.paineis, copia],
                                        preferencias: {
                                          ...p.preferencias,
                                          painelPadrao: copia.id,
                                        },
                                      }));
                                    }}
                                  >
                                    Duplicar painel
                                  </Botao>
                                  <Botao
                                    variante="destrutivo"
                                    tamanho="pequeno"
                                    sx={{ height: 48 }}
                                    icone={<DeleteOutlineRoundedIcon />}
                                    onClick={() =>
                                      confirmarLocal(
                                        "Excluir painel?",
                                        "O painel e suas anotações serão removidos deste navegador.",
                                        () =>
                                          setPersonalizacao((p) => ({
                                            ...p,
                                            paineis: p.paineis.filter((v) => v.id !== painel.id),
                                          })),
                                      )
                                    }
                                  >
                                    Excluir painel
                                  </Botao>
                                </>
                              )}
                            </Stack>
                          </SecaoConteudo>
                        </Box>
                        {painel ? (
                          <>
                            <TextField
                              label="Nome do painel"
                              value={painel.nome}
                              onChange={(e) => {
                                if (e.target.value.trim())
                                  alterarPainel({ ...painel, nome: e.target.value });
                              }}
                              slotProps={{ htmlInput: { maxLength: 100 } }}
                              sx={{ width: { xs: "100%", sm: 400 } }}
                            />
                            <GradePaineisBi
                              painel={painel}
                              onAlterar={alterarPainel}
                              recortes={recortes}
                              prepararImpressao={prepararImpressao}
                              calcular={calcular}
                              onFiltrar={filtrarGrafico}
                              confirmar={confirmarExportacao}
                              onEditar={(g) => {
                                setErroEdicao("");
                                setEditando(g);
                              }}
                            />
                            {!painel.graficos.length && (
                              <Typography variant="body2" sx={{ py: 3, color: "text.secondary" }}>
                                Adicione gráficos pelo Explorador.
                              </Typography>
                            )}
                            <Acordeao titulo="Anotação do painel">
                              <TextField
                                value={painel.anotacao}
                                multiline
                                minRows={3}
                                fullWidth
                                slotProps={{
                                  htmlInput: {
                                    "aria-label": "Anotação do painel",
                                    maxLength: 2000,
                                  },
                                }}
                                onChange={(e) =>
                                  alterarPainel({ ...painel, anotacao: e.target.value })
                                }
                              />
                            </Acordeao>
                          </>
                        ) : (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            Crie um painel para reunir as análises.
                          </Typography>
                        )}
                      </Stack>
                    )}
                    {aba === "ajuda" && (
                      <VistaAjudaBi dados={dados} recursos={recursos} onCarregar={setExtra} />
                    )}
                    {extra && dados[extra] && (
                      <TabelaApoioBi
                        key={extra}
                        recurso={extra}
                        linhas={dados[extra] ?? []}
                        confirmar={confirmarExportacao}
                      />
                    )}
                    {destaques.length > 0 && aba !== "ajuda" && (
                      <Acordeao titulo="Destaques do recorte">
                        <Box component="ul" sx={{ m: 0, pl: 3 }}>
                          {destaques.map((d) => (
                            <Typography key={d} component="li" variant="body2" sx={{ mb: 1 }}>
                              {d}
                            </Typography>
                          ))}
                        </Box>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Taxas por turma e destaques de motivos ou horários exigem pelo menos 5
                          registros. Contagens descrevem somente o recorte consultado.
                        </Typography>
                      </Acordeao>
                    )}
                  </>
                )}
                <Box
                  sx={{
                    display: apresentacao ? "none" : undefined,
                    "@media print": { display: "none" },
                  }}
                >
                  <Acordeao titulo="Configurações deste navegador">
                    <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                      <Botao
                        variante="contorno"
                        tamanho="pequeno"
                        sx={{ height: 48 }}
                        icone={<DownloadRoundedIcon />}
                        onClick={() =>
                          confirmarExportacao(() =>
                            baixarBi(
                              new Blob(
                                [
                                  exportarPersonalizacaoBi({
                                    ...personalizacao,
                                    preferencias: {
                                      ...personalizacao.preferencias,
                                      explorador: ultimaAnaliseValida.current,
                                    },
                                  }),
                                ],
                                { type: "application/json" },
                              ),
                              "frequencibi-configuracoes.json",
                            ),
                          )
                        }
                      >
                        Exportar configurações
                      </Botao>
                      <Botao
                        variante="contorno"
                        tamanho="pequeno"
                        sx={{ height: 48 }}
                        icone={<UploadRoundedIcon />}
                        onClick={() => arquivo.current?.click()}
                      >
                        Importar configurações
                      </Botao>
                      <input
                        ref={arquivo}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        aria-label="Arquivo de configurações"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void importar(f);
                          e.target.value = "";
                        }}
                      />
                      <Botao
                        variante="texto"
                        tamanho="pequeno"
                        sx={{ height: 48 }}
                        disabled={ocupacaoLocal}
                        onClick={() =>
                          confirmarLocal(
                            "Limpar dados baixados?",
                            "Os retratos offline serão removidos. A chave e as visões continuam neste navegador.",
                            async () => {
                              setOcupacaoLocal(true);
                              try {
                                await fonte.limparCache();
                                setRetrato(null);
                                setAtualizacao((v) => v + 1);
                              } finally {
                                setOcupacaoLocal(false);
                              }
                            },
                          )
                        }
                      >
                        Limpar cache
                      </Botao>
                      <Botao
                        variante="texto"
                        tamanho="pequeno"
                        sx={{ height: 48 }}
                        disabled={ocupacaoLocal}
                        onClick={() =>
                          confirmarLocal(
                            "Limpar tudo neste navegador?",
                            "Remove a chave, os dados, as visões, as metas e as anotações locais. As informações da escola no servidor são preservadas.",
                            async () => {
                              await esquecer();
                              await limparTudoBi();
                              setPersonalizacao(personalizacaoVaziaBi());
                              setConfig(
                                graficoBi(
                                  "chamadas",
                                  "turma",
                                  "infrequencia",
                                  "barras",
                                  "Minha análise",
                                ),
                              );
                              setArmazenar(true);
                              setRetrato(null);
                              setChave("");
                            },
                          )
                        }
                      >
                        Limpar tudo
                      </Botao>
                      <Botao
                        variante="texto"
                        tamanho="pequeno"
                        sx={{ height: 48 }}
                        disabled={fonte.ocupado}
                        onClick={() => void entrar(acesso.chave, acesso.persistir)}
                      >
                        Conferir chave novamente
                      </Botao>
                    </Stack>
                  </Acordeao>
                </Box>
                {(erro || fonte.aviso) && (
                  <AlertaCompacto
                    variante="dados_invalidos"
                    titulo="Não foi possível concluir"
                    descricao={
                      <>
                        {erro && <Typography component="span">{erro}</Typography>}
                        {fonte.aviso && (
                          <Typography
                            component="span"
                            sx={{ display: "block", mt: erro ? 0.5 : 0 }}
                          >
                            {fonte.aviso}
                          </Typography>
                        )}
                      </>
                    }
                    tamanho="linha"
                    acao={{ rotulo: "Dispensar", onClick: () => setErro("") }}
                    sx={{ mt: 2 }}
                  />
                )}
              </>
            )}
          </Stack>
        </LayoutConteudo>
      </Box>
      <DialogoConfirmacao
        aberto={Boolean(confirmacao)}
        titulo={confirmacao?.titulo ?? "Confirmar ação"}
        descricao={confirmacao?.descricao}
        onConfirmar={() => void confirmarAgora()}
        onCancelar={() => {
          if (!confirmando) setConfirmacao(null);
        }}
        rotuloConfirmar={confirmando ? "Preparando..." : "Confirmar"}
        operacaoEmAndamento={confirmando}
      />
      <Dialogo
        aberto={Boolean(editando)}
        onFechar={() => setEditando(null)}
        titulo="Editar análise do painel"
        descricao="Alterações ficam neste navegador."
        acoes={
          <Botao
            variante="secundario"
            onClick={() => {
              const valido = esquemaGraficoBi.safeParse(editando);
              if (valido.success && painel) {
                alterarPainel({
                  ...painel,
                  graficos: painel.graficos.map((g) => (g.id === editando?.id ? valido.data : g)),
                });
                setEditando(null);
              } else setErroEdicao("Confira o título e os valores da análise antes de salvar.");
            }}
          >
            Salvar análise
          </Botao>
        }
      >
        {editando && (
          <>
            <EditorGraficoBi
              config={editando}
              onAlterar={(g) => {
                setEditando(g);
                setErroEdicao("");
              }}
              recursos={recursos}
            />
            {erroEdicao && (
              <AlertaCompacto variante="dados_invalidos" descricao={erroEdicao} tamanho="linha" />
            )}
          </>
        )}
      </Dialogo>
    </LayoutPagina>
  );
}
