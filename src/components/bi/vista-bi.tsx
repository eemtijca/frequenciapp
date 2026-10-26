"use client";

// Aplicação de BI isolada: chave própria, leituras sob demanda e personalização apenas no navegador.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  ArrowLeft,
  Download,
  Upload,
  Link2,
  Maximize,
  Printer,
  Plus,
  Copy,
  Trash2,
  LoaderCircle,
  WifiOff,
  Pencil,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/ui/campo-senha";
import { BotaoAtualizar } from "@/components/ui/botao-atualizar";
import { AtualizadoEm } from "@/components/ui/atualizado-em";
import { SeletorTema } from "@/components/ui/seletor-tema";
import { Selecionar } from "@/components/ui/selecionar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
import estilos from "./vista-bi.module.css";
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
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const forcar = useRef(false);
  const [extra, setExtra] = useState<RecursoBi | null>(null);
  const [comparacao, setComparacao] = useState<"nenhuma" | "anterior" | "ano">("nenhuma");
  const [comparativo, setComparativo] = useState<{
    id: string;
    valor: number | null;
    inicio: string;
    fim: string;
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
        } else if (resultado?.status === "rejected") {
          const nome = ROTULOS_RECURSOS_BI[lista[i] ?? "contexto"];
          falhas.push(
            `${nome}: ${resultado.reason instanceof Error ? resultado.reason.message : "consulta interrompida"}`,
          );
        }
      }
      setRetrato({ id: assinatura, dados, datas, falhas });
      setAtualizadoEm(new Date().toISOString());
    });
    return () => {
      atual = false;
    };
  }, [assinatura, atualizacao, carregar, acesso, prontoLocal, filtros.inicio, filtros.fim]);
  const carregando = Boolean(acesso) && retrato?.id !== assinatura;
  const dados = useMemo(
    () => enriquecerBi(retrato?.id === assinatura ? retrato.dados : VAZIOS),
    [retrato, assinatura],
  );
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
  const { executando: entrando, executar: entrarAgora } = useAcaoUnica(() => entrar(chave.trim()));
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
  const idComparacao = JSON.stringify([comparacao, filtros, atualizacao]);
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
  const comparacaoVisivel = comparativo?.id === idComparacao ? comparativo : null;
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
  const ultimaData =
    retrato?.id === assinatura ? retrato.datas.filter(Boolean).sort()[0] : undefined;
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
          <Button
            size="sm"
            variant="ghost"
            className="print:hidden"
            aria-label={`Personalizar ${g.titulo}`}
            onClick={() => {
              setConfig({ ...g, id: "explorador" });
              trocarAba("explorador");
            }}
          >
            <Pencil size={15} />
            Personalizar
          </Button>
        }
      />
    );
  };
  return (
    <div className={`${estilos.raiz} ${apresentacao ? estilos.apresentacao : ""}`}>
      <RegistroPwa />
      {apresentacao && (
        <Button className={estilos.sairApresentacao} onClick={() => setApresentacao(false)}>
          Sair da apresentação
        </Button>
      )}
      <header className={`superficie ${estilos.cabecalho} print:hidden`}>
        <Link
          href="/"
          prefetch={false}
          aria-label="Voltar ao FrequenciApp"
          className="flex min-h-11 min-w-11 items-center gap-2 justify-self-start text-sm"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">FrequenciApp</span>
        </Link>
        <h1 className="flex items-center gap-2 justify-self-center text-lg font-semibold sm:text-xl">
          <ChartNoAxesCombined size={22} aria-hidden="true" />
          FrequenciBI
        </h1>
        <div className="flex items-center justify-self-end">
          <div className="hidden items-center gap-1 sm:flex">
            <SeletorTema />
            {acesso && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setChave("");
                  void esquecer();
                }}
              >
                Esquecer chave
              </Button>
            )}
          </div>
          <div className="sm:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-11 rounded-full"
                  aria-label="Mais ações do FrequenciBI"
                >
                  <MoreHorizontal size={20} aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-60 p-1.5">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="text-sm font-medium">Tema</span>
                  <SeletorTema />
                </div>
                {acesso && (
                  <Button
                    variant="ghost"
                    className="h-11 w-full justify-start"
                    onClick={() => {
                      setChave("");
                      void esquecer();
                    }}
                  >
                    Esquecer chave
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>
      <main className={estilos.conteudo}>
        {acesso && (
          <p className="text-muted-foreground mb-3 text-xs">
            {ABAS.find((a) => a.id === aba)?.nome} | {dataBr(filtros.inicio)} a{" "}
            {dataBr(filtros.fim)}
          </p>
        )}
        {!acesso ? (
          <section className="superficie mx-auto mt-12 w-full max-w-md space-y-5 p-6">
            <div>
              <h2 className="text-xl font-semibold">Abrir análises da escola</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Use a chave criada na Gestão. Não é necessário entrar na conta do FrequenciApp.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void entrarAgora();
              }}
              className="space-y-4"
            >
              <Label htmlFor="chave-bi">Chave de acesso</Label>
              <CampoSenha
                id="chave-bi"
                disabled={!prontoLocal}
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                autoComplete="off"
                placeholder="Cole a chave recebida"
                required
              />
              <Button
                type="submit"
                className="w-full"
                disabled={entrando || fonte.ocupado || !chave.trim()}
              >
                {entrando || fonte.ocupado ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : null}
                Testar e entrar
              </Button>
            </form>
            <p className="text-muted-foreground text-xs">
              A chave fica neste navegador e permite consultar dados pessoais. Use um dispositivo
              autorizado e remova a chave ao sair.
            </p>
            {fonte.erro && (
              <p role="alert" className="text-falta-texto text-sm">
                {fonte.erro}
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 print:hidden">
              <div className="sm:hidden">
                <Selecionar
                  ariaLabel="Seção do FrequenciBI"
                  value={aba}
                  onValueChange={(valor) => trocarAba(valor as AbaBi)}
                  opcoes={ABAS.map((item) => ({ valor: item.id, rotulo: item.nome }))}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <nav
                  aria-label="Seções do FrequenciBI"
                  className="controle hidden max-w-full gap-1 overflow-x-auto p-1 sm:flex"
                >
                  {ABAS.map((a) => (
                    <Button
                      key={a.id}
                      variant={aba === a.id ? "secondary" : "ghost"}
                      size="sm"
                      aria-current={aba === a.id ? "page" : undefined}
                      onClick={() => trocarAba(a.id)}
                      ref={(el) => {
                        if (el && aba === a.id) {
                          const nav = el.parentElement;
                          if (nav) nav.scrollLeft = el.offsetLeft - nav.offsetLeft - 8;
                        }
                      }}
                      className="shrink-0"
                    >
                      {a.nome}
                    </Button>
                  ))}
                </nav>
                <div className="flex flex-wrap gap-1">
                  <BotaoAtualizar
                    onAtualizar={atualizar}
                    ocupado={carregando || fonte.ocupado}
                    disponivel
                    rotulo="Atualizar dados"
                    variante="outline"
                    tamanho="sm"
                    comRotulo
                  />
                  <AtualizadoEm
                    instante={atualizadoEm ?? undefined}
                    fuso={fuso}
                    className="self-center px-1"
                  />
                  <div className="hidden flex-wrap gap-1 sm:flex">
                    <Button variant="ghost" size="sm" onClick={() => void compartilhar()}>
                      <Link2 size={15} />
                      Compartilhar filtros
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setApresentacao(!apresentacao)}
                    >
                      <Maximize size={15} />
                      {apresentacao ? "Sair da apresentação" : "Apresentar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={carregando || imprimindo}
                      onClick={() => void imprimir()}
                    >
                      <Printer size={15} />
                      {imprimindo ? "Preparando impressão..." : "Imprimir"}
                    </Button>
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full sm:hidden"
                        aria-label="Mais ações da análise"
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-1.5">
                      <Button
                        variant="ghost"
                        className="h-11 w-full justify-start"
                        onClick={() => void compartilhar()}
                      >
                        <Link2 size={16} />
                        Compartilhar filtros
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11 w-full justify-start"
                        onClick={() => setApresentacao(!apresentacao)}
                      >
                        <Maximize size={16} />
                        {apresentacao ? "Sair da apresentação" : "Apresentar"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11 w-full justify-start"
                        disabled={carregando || imprimindo}
                        onClick={() => void imprimir()}
                      >
                        <Printer size={16} />
                        {imprimindo ? "Preparando impressão..." : "Imprimir"}
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <SeletorFiltrosBi
              fuso={fuso}
              key={`${aba}-${painel?.id ?? "global"}-${filtros.inicio}-${filtros.fim}`}
              filtros={filtros}
              onAlterar={alterarFiltros}
              dados={dados}
              completo
            />
            <div
              role="status"
              className="text-muted-foreground my-3 flex flex-wrap items-center gap-2 text-xs"
            >
              {fonte.offline ? (
                <>
                  <WifiOff size={15} />
                  Consulta offline. Uma revogação recente só pode ser conferida com conexão.
                </>
              ) : (
                "Retrato consultado"
              )}
              {ultimaData
                ? new Date(ultimaData).toLocaleString("pt-BR")
                : "Ainda sem retrato completo"}
              {carregando && <span>{fonte.progresso || "Carregando conjuntos..."}</span>}
            </div>
            {fonte.erro && (
              <p
                role="alert"
                className="bg-falta-fraca text-falta-texto mb-4 rounded-2xl p-3 text-sm"
              >
                {fonte.erro}
              </p>
            )}
            {retrato?.id === assinatura && retrato.falhas.length > 0 && (
              <div
                role="alert"
                className="bg-falta-fraca text-falta-texto mb-4 rounded-2xl p-3 text-sm"
              >
                {retrato.falhas.map((f) => (
                  <p key={f}>{f}</p>
                ))}
              </div>
            )}
            {carregando ? (
              <div role="status" className="flex min-h-40 items-center justify-center gap-3">
                <LoaderCircle className="animate-spin" />
                Preparando o recorte
              </div>
            ) : (
              <>
                {aba === "geral" && (
                  <>
                    <section
                      className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
                      aria-label="Indicadores gerais"
                    >
                      {[
                        [
                          "Infrequência",
                          infrequencia === null
                            ? "Sem base de cálculo"
                            : `${numero(infrequencia)}%`,
                        ],
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
                        [
                          "Turmas",
                          dados.turmas
                            ? filtrarBi(dados.turmas, filtrosTurmas).length
                            : "Indisponível",
                        ],
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
                          cobertura?.taxa === null || !cobertura
                            ? "Sem base de cálculo"
                            : `${numero(cobertura.taxa)}%`,
                        ],
                      ].map(([titulo, valor]) => (
                        <article key={titulo} className="superficie p-4">
                          <p className="text-muted-foreground text-xs">{titulo}</p>
                          <strong className="mt-2 block text-xl break-words tabular-nums sm:text-2xl">
                            {valor}
                          </strong>
                        </article>
                      ))}
                    </section>
                    <section className="superficie mb-4 flex flex-wrap items-center gap-3 p-4">
                      <Label htmlFor="comparacao-bi">Comparar infrequência</Label>
                      <div className="min-w-48">
                        <Selecionar
                          id="comparacao-bi"
                          value={comparacao}
                          onValueChange={(v) => setComparacao(v as typeof comparacao)}
                          opcoes={[
                            { valor: "nenhuma", rotulo: "Sem comparação" },
                            { valor: "anterior", rotulo: "Período anterior" },
                            { valor: "ano", rotulo: "Ano anterior" },
                          ]}
                        />
                      </div>
                      {comparacao !== "nenhuma" && (
                        <p className="text-sm">
                          {comparacaoVisivel
                            ? (comparacaoVisivel.erro ??
                              `${comparacaoVisivel.inicio} a ${comparacaoVisivel.fim}: ${comparacaoVisivel.valor === null ? "sem base de cálculo" : `${numero(comparacaoVisivel.valor)}%`}${infrequencia === null || comparacaoVisivel.valor === null ? "" : ` | Variação: ${numero(infrequencia - comparacaoVisivel.valor)} pontos percentuais`}`)
                            : "Preparando comparação..."}
                        </p>
                      )}
                    </section>
                  </>
                )}
                {["geral", "faltas", "movimentos", "parciais"].includes(aba) && (
                  <>
                    <div className="mb-3 flex justify-end print:hidden">
                      <Button variant="outline" size="sm" onClick={personalizarModelo}>
                        <Pencil size={15} />
                        Personalizar este painel
                      </Button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">{curados.map(mostrarGrafico)}</div>
                  </>
                )}
                {aba === "explorador" && (
                  <div className="space-y-4">
                    <EditorGraficoBi config={config} onAlterar={setConfig} recursos={recursos} />
                    <div className="flex flex-wrap gap-2 print:hidden">
                      <Input
                        aria-label="Nome da visão salva"
                        placeholder="Nome da visão"
                        className="max-w-xs"
                        value={nomeVisao}
                        maxLength={100}
                        onChange={(e) => setNomeVisao(e.target.value)}
                      />
                      {visaoAtual && (
                        <Button onClick={() => guardarVisao(true)}>Atualizar visão</Button>
                      )}
                      <Button
                        variant={visaoAtual ? "outline" : "default"}
                        onClick={() => guardarVisao()}
                      >
                        {visaoAtual ? "Salvar como nova" : "Salvar visão"}
                      </Button>
                      {personalizacao.paineis.length > 0 && (
                        <div className="w-full min-w-0 sm:w-64">
                          <Selecionar
                            ariaLabel="Painel de destino"
                            value={painel?.id ?? ""}
                            opcoes={personalizacao.paineis.map((p) => ({
                              valor: p.id,
                              rotulo: p.nome,
                            }))}
                            onValueChange={(id) =>
                              setPersonalizacao((p) => ({
                                ...p,
                                preferencias: { ...p.preferencias, painelPadrao: id },
                              }))
                            }
                          />
                        </div>
                      )}
                      <Button
                        variant="outline"
                        onClick={painel ? adicionar : () => trocarAba("paineis")}
                      >
                        <Plus size={15} />
                        {painel ? "Adicionar ao painel" : "Criar painel"}
                      </Button>
                    </div>
                    {recursos.includes(config.recurso) ? (
                      mostrarGrafico(config)
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Escolha uma base permitida pela chave.
                      </p>
                    )}
                    <section className="superficie p-4">
                      <h2 className="mb-3 font-semibold">Visões salvas</h2>
                      {!personalizacao.visoes.length && (
                        <p className="text-muted-foreground text-sm">Nenhuma visão salva.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {personalizacao.visoes.map((v) => (
                          <div
                            key={v.id}
                            className="controle flex max-w-full min-w-0 items-center gap-1 p-1"
                          >
                            <Button
                              className="h-auto min-h-11 min-w-0 break-words whitespace-normal"
                              size="sm"
                              variant={config.id === v.id ? "secondary" : "ghost"}
                              aria-pressed={config.id === v.id}
                              onClick={() => {
                                setConfig(v);
                                setNomeVisao("");
                              }}
                            >
                              {v.titulo}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Excluir visão ${v.titulo}`}
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
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
                {aba === "paineis" && (
                  <div className="space-y-4">
                    <section className="superficie flex flex-wrap gap-2 p-4 print:hidden">
                      <Input
                        value={nomePainel}
                        maxLength={100}
                        aria-label="Nome do novo painel"
                        placeholder="Nome do painel"
                        className="max-w-xs"
                        onChange={(e) => setNomePainel(e.target.value)}
                      />
                      <Button
                        onClick={criarPainel}
                        disabled={!nomePainel.trim() || personalizacao.paineis.length >= 50}
                      >
                        Criar painel
                      </Button>
                      {painel && (
                        <>
                          <div className="min-w-48">
                            <Selecionar
                              ariaLabel="Painel atual"
                              value={painel.id}
                              opcoes={personalizacao.paineis.map((p) => ({
                                valor: p.id,
                                rotulo: p.nome,
                              }))}
                              onValueChange={(id) =>
                                setPersonalizacao((p) => ({
                                  ...p,
                                  preferencias: { ...p.preferencias, painelPadrao: id },
                                }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => trocarAba("explorador")}
                          >
                            <Plus size={15} />
                            Adicionar gráficos
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={personalizacao.paineis.length >= 50}
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
                                preferencias: { ...p.preferencias, painelPadrao: copia.id },
                              }));
                            }}
                          >
                            <Copy size={15} />
                            Duplicar painel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
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
                            <Trash2 size={15} />
                            Excluir painel
                          </Button>
                        </>
                      )}
                    </section>
                    {painel ? (
                      <>
                        <div className="flex flex-wrap gap-3">
                          <Label htmlFor="nome-painel">Nome do painel</Label>
                          <Input
                            id="nome-painel"
                            value={painel.nome}
                            maxLength={100}
                            className="max-w-sm"
                            onChange={(e) => {
                              if (e.target.value.trim())
                                alterarPainel({ ...painel, nome: e.target.value });
                            }}
                          />
                        </div>
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
                          <p className="text-muted-foreground py-6 text-sm">
                            Adicione gráficos pelo Explorador.
                          </p>
                        )}
                        <details className="superficie p-4">
                          <summary className="cursor-pointer text-sm">Anotação do painel</summary>
                          <textarea
                            value={painel.anotacao}
                            maxLength={2000}
                            aria-label="Anotação do painel"
                            className="controle mt-3 min-h-20 w-full p-3"
                            onChange={(e) => alterarPainel({ ...painel, anotacao: e.target.value })}
                          />
                        </details>
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Crie um painel para reunir as análises.
                      </p>
                    )}
                  </div>
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
                  <details className="superficie mt-4 p-4">
                    <summary className="cursor-pointer font-semibold">Destaques do recorte</summary>
                    <ul className="mt-3 space-y-2 text-sm">
                      {destaques.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground mt-3 text-xs">
                      Taxas por turma e destaques de motivos ou horários exigem pelo menos 5
                      registros. Contagens descrevem somente o recorte consultado.
                    </p>
                  </details>
                )}
              </>
            )}
            <details className="superficie mt-4 p-4 print:hidden">
              <summary className="cursor-pointer text-sm font-medium">
                Configurações deste navegador
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
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
                          {
                            type: "application/json",
                          },
                        ),
                        "frequencibi-configuracoes.json",
                      ),
                    )
                  }
                >
                  <Download size={15} />
                  Exportar configurações
                </Button>
                <Button size="sm" variant="outline" onClick={() => arquivo.current?.click()}>
                  <Upload size={15} />
                  Importar configurações
                </Button>
                <input
                  ref={arquivo}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  aria-label="Arquivo de configurações"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importar(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
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
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
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
                          graficoBi("chamadas", "turma", "infrequencia", "barras", "Minha análise"),
                        );
                        setArmazenar(true);
                        setRetrato(null);
                        setChave("");
                      },
                    )
                  }
                >
                  Limpar tudo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={fonte.ocupado}
                  onClick={() => void entrar(acesso.chave)}
                >
                  Conferir chave novamente
                </Button>
              </div>
            </details>
          </>
        )}
        {(erro || fonte.aviso) && (
          <div
            role="alert"
            className="bg-falta-fraca text-falta-texto mt-4 rounded-2xl p-3 text-sm"
          >
            {erro && <p>{erro}</p>}
            {fonte.aviso && <p>{fonte.aviso}</p>}
            <Button size="sm" variant="ghost" onClick={() => setErro("")}>
              Dispensar
            </Button>
          </div>
        )}
      </main>
      <AlertDialog
        open={Boolean(confirmacao)}
        onOpenChange={(aberto) => {
          if (!aberto && !confirmando) setConfirmacao(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmacao?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmacao?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmando}>Cancelar</AlertDialogCancel>
            <Button disabled={confirmando} onClick={() => void confirmarAgora()}>
              {confirmando ? "Preparando..." : "Confirmar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(editando)}
        onOpenChange={(aberto) => {
          if (!aberto) setEditando(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar análise do painel</DialogTitle>
            <DialogDescription>Alterações ficam neste navegador.</DialogDescription>
          </DialogHeader>
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
                <p role="alert" className="text-falta-texto text-sm">
                  {erroEdicao}
                </p>
              )}
              <Button
                onClick={() => {
                  const valido = esquemaGraficoBi.safeParse(editando);
                  if (valido.success && painel) {
                    alterarPainel({
                      ...painel,
                      graficos: painel.graficos.map((g) =>
                        g.id === editando.id ? valido.data : g,
                      ),
                    });
                    setEditando(null);
                  } else setErroEdicao("Confira o título e os valores da análise antes de salvar.");
                }}
              >
                Salvar análise
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
