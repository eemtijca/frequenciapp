"use client";

// Configurações da escola em um único rascunho: recursos, catálogos, avisos,
// acesso, almoço, calendário e chaves do BI são revisados e gravados em lote.
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Clock,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { avisarBeneficiosMudaram } from "@/lib/eventos-beneficios";
import { avisarOrdemAlmocoMudou } from "@/lib/eventos-ordem-almoco";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import {
  ordenarPorRotulo,
  type Configuracoes,
  type JustificativaConfigurada,
  type LiberadorConfigurado,
  type Serie,
  type Turma,
} from "@/domain/frequencia";
import type {
  ChaveBiDesejada,
  ConfiguracoesCompletas,
  ResultadoLote,
} from "@/domain/configuracoes";
import { DIAS_ORDEM_ALMOCO } from "@/domain/ordem-almoco";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { CampoSenha } from "@/components/ui/campo-senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selo } from "@/components/ui/selo";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import DialogoDownload from "@/components/conta/dialogo-download";
import SecaoChavesBi from "@/components/gestao/secao-chaves-bi";
import SecaoAcessoDiretores from "@/components/gestao/secao-acesso-diretores";
import SecaoNotificacoes from "@/components/gestao/secao-notificacoes";
import IntegracaoPlanilha from "@/components/gestao/integracao-planilha";
import IntegracaoSaidas from "@/components/gestao/integracao-saidas";
import IntegracaoParcial from "@/components/gestao/integracao-parcial";
import SecaoFilaPlanilha from "@/components/gestao/secao-fila-planilha";
import SecaoCalendarioLetivo from "@/components/gestao/secao-calendario-letivo";
import SecaoBeneficiosFrequencia from "@/components/gestao/secao-beneficios-frequencia";
import VistaHorarios from "@/components/horarios/vista-horarios";
import SecaoOrdemAlmoco from "@/components/gestao/secao-ordem-almoco";
import {
  ProvedorRascunhoConfiguracoes,
  useRascunhoConfiguracoes,
} from "@/components/gestao/rascunho-configuracoes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  series: Serie[];
  turmas: Turma[];
  diaCorrente: string;
  /** Incrementado pelo botão global de atualização. */
  atualizacao?: number;
  onMudanca: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
  onHorariosMudaram: () => Promise<void> | void;
  onPendenciaHorarios?: (pendente: boolean) => void;
  onAbrirSaidas?: () => void;
  onAbrirParcial?: () => void;
  onPendenciaConfiguracoes?: (pendente: boolean) => void;
}

interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

const LIMITE_ARQUIVO = 25 * 1024 * 1024;
const CATEGORIAS = [
  { valor: "escola", rotulo: "Escola", icone: Settings2 },
  { valor: "horarios", rotulo: "Horários", icone: Clock },
  { valor: "planilhas", rotulo: "Planilhas", icone: FileSpreadsheet },
  { valor: "acesso", rotulo: "Acesso e avisos", icone: ShieldCheck },
  { valor: "dados", rotulo: "Dados", icone: Archive },
] as const;
type Categoria = (typeof CATEGORIAS)[number]["valor"];

const CODIGO_JUSTIFICATIVA = /^[A-Za-z][A-Za-z0-9]*$/;

function listasIguais(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenadaA = [...a].sort();
  const ordenadaB = [...b].sort();
  return ordenadaA.every((valor, indice) => valor === ordenadaB[indice]);
}

function varianteDoErro(status: number | undefined): VarianteEstado {
  if (status === 0) return "offline";
  if (status === 403) return "sem_permissao";
  if (status === 404) return "nao_encontrado";
  if (status === 409) return "conflito";
  if (status === 413 || status === 429) return "limite";
  if (status !== undefined && status >= 500) return "indisponivel";
  return "dados_invalidos";
}

function contagem(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export default function AbaConfiguracoes(props: Props) {
  return (
    <ProvedorRascunhoConfiguracoes>
      <ConteudoConfiguracoes {...props} />
    </ProvedorRascunhoConfiguracoes>
  );
}

function ConteudoConfiguracoes({
  planilhaInicial,
  series,
  turmas,
  diaCorrente,
  atualizacao = 0,
  onMudanca,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onHorariosMudaram,
  onPendenciaHorarios,
  onAbrirSaidas,
  onAbrirParcial,
  onPendenciaConfiguracoes,
}: Props) {
  const {
    base: baseCarregada,
    rascunho: rascunhoCarregado,
    carregando,
    salvando,
    erro,
    erroStatus,
    erroCodigo,
    alterado,
    secoesAlteradas,
    precisaSenhaBi,
    recarregar,
    descartar,
    salvar,
    aplicarFeriadosExternos,
    mutarConfiguracoes,
    mutarNotificacoes,
    mutarAcesso,
    mutarOrdem,
    mutarBeneficios,
    mutarJustificativas,
    mutarLiberadores,
    mutarFeriados,
    mutarChaves,
  } = useRascunhoConfiguracoes();

  const [categoria, setCategoria] = useState<Categoria>(planilhaInicial ? "planilhas" : "escola");
  // O editor de horários só monta na primeira visita e depois mantém o rascunho ao trocar de categoria.
  const [horariosAbertos, setHorariosAbertos] = useState(false);
  const [abertoRecursos, setAbertoRecursos] = useState(true);
  const [abertoJustificativas, setAbertoJustificativas] = useState(false);
  const [abertoLiberadores, setAbertoLiberadores] = useState(false);
  const [abertoCopia, setAbertoCopia] = useState(false);
  const [abertoTurmasOrigem, setAbertoTurmasOrigem] = useState(false);
  const [confirmarSalvar, setConfirmarSalvar] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);
  const [senhaBi, setSenhaBi] = useState("");
  const [segredosBi, setSegredosBi] = useState<ResultadoLote["segredosBi"]>([]);
  const [downloadAberto, setDownloadAberto] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erroCopia, setErroCopia] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const arquivoRef = useRef<HTMLInputElement | null>(null);

  const [novaCodigo, setNovaCodigo] = useState("");
  const [novaRotulo, setNovaRotulo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rotuloEdicao, setRotuloEdicao] = useState("");
  const [erroJustificativa, setErroJustificativa] = useState("");
  const [excluirAlvo, setExcluirAlvo] = useState<JustificativaConfigurada | null>(null);

  const [novaCodigoLiberador, setNovaCodigoLiberador] = useState("");
  const [novaRotuloLiberador, setNovaRotuloLiberador] = useState("");
  const [editandoLiberador, setEditandoLiberador] = useState<string | null>(null);
  const [rotuloEdicaoLiberador, setRotuloEdicaoLiberador] = useState("");
  const [erroLiberador, setErroLiberador] = useState("");
  const [excluirAlvoLiberador, setExcluirAlvoLiberador] = useState<LiberadorConfigurado | null>(
    null,
  );

  // O botão global só recarrega quando já houve uma atualização; a carga inicial
  // é feita pelo próprio provedor.
  const atualizacaoInicial = useRef(atualizacao);
  useEffect(() => {
    if (atualizacao === atualizacaoInicial.current) return;
    atualizacaoInicial.current = atualizacao;
    void recarregar();
  }, [atualizacao, recarregar]);

  useEffect(() => {
    onPendenciaConfiguracoes?.(alterado);
  }, [alterado, onPendenciaConfiguracoes]);

  useEffect(() => {
    return () => onPendenciaConfiguracoes?.(false);
  }, [onPendenciaConfiguracoes]);

  if (!rascunhoCarregado || !baseCarregada) {
    return (
      <div className="superficie-vidro flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center">
        {carregando ? (
          <>
            <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">Carregando configurações...</p>
          </>
        ) : (
          <>
            <p className="text-sm">{erro || "Não foi possível carregar as configurações."}</p>
            <Button type="button" variant="outline" onClick={() => void recarregar()}>
              Tentar novamente
            </Button>
          </>
        )}
      </div>
    );
  }

  const atual = rascunhoCarregado;
  const anterior = baseCarregada;

  function alternar(chave: "frequenciaPorAula" | "saidaAntecipada", valor: boolean) {
    mutarConfiguracoes({ [chave]: valor });
  }

  function salvarOrigem(
    entrada: Partial<
      Pick<Configuracoes, "origemNaChamada" | "origemNaChamadaSerieIds" | "origemNaChamadaTurmaIds">
    >,
  ) {
    mutarConfiguracoes(entrada);
  }

  function selecaoAlterada(ids: string[], id: string, marcado: boolean): string[] {
    return marcado ? [...ids, id] : ids.filter((atual) => atual !== id);
  }

  function criarJustificativa() {
    const codigo = novaCodigo.trim();
    const rotulo = novaRotulo.trim();
    if (!CODIGO_JUSTIFICATIVA.test(codigo) || codigo.length > 10) {
      setErroJustificativa("Use até 10 letras e números, começando por uma letra.");
      return;
    }
    if (rotulo.length < 2 || rotulo.length > 60) {
      setErroJustificativa("O rótulo deve ter de 2 a 60 caracteres.");
      return;
    }
    if (atual.justificativas.some((item) => item.codigo === codigo)) {
      setErroJustificativa("Já existe uma justificativa com este código.");
      return;
    }
    setErroJustificativa("");
    mutarJustificativas(
      ordenarPorRotulo([...atual.justificativas, { codigo, rotulo, ativo: true }]),
    );
    setNovaCodigo("");
    setNovaRotulo("");
    avisarSucesso("Justificativa adicionada ao rascunho.", "Salve as configurações para aplicar.");
  }

  function salvarRotulo(codigo: string) {
    const rotulo = rotuloEdicao.trim();
    if (rotulo.length < 2 || rotulo.length > 60) {
      setErroJustificativa("O rótulo deve ter de 2 a 60 caracteres.");
      return;
    }
    setErroJustificativa("");
    mutarJustificativas(
      ordenarPorRotulo(
        atual.justificativas.map((item) => (item.codigo === codigo ? { ...item, rotulo } : item)),
      ),
    );
    setEditando(null);
    setRotuloEdicao("");
    avisarSucesso("Justificativa atualizada no rascunho.", "Salve as configurações para aplicar.");
  }

  function alternarAtivo(item: JustificativaConfigurada) {
    mutarJustificativas(
      atual.justificativas.map((atual) =>
        atual.codigo === item.codigo ? { ...atual, ativo: !atual.ativo } : atual,
      ),
    );
    avisarSucesso(
      item.ativo ? "Justificativa desativada no rascunho." : "Justificativa reativada no rascunho.",
      item.ativo
        ? "O histórico que usa o código continua intacto."
        : "Ela volta ao seletor depois de salvar.",
    );
  }

  function removerJustificativa(item: JustificativaConfigurada) {
    mutarJustificativas(atual.justificativas.filter((atual) => atual.codigo !== item.codigo));
    setExcluirAlvo(null);
    avisarSucesso("Justificativa removida do rascunho.", "Salve as configurações para aplicar.");
  }

  function criarLiberador() {
    const codigo = novaCodigoLiberador.trim();
    const rotulo = novaRotuloLiberador.trim();
    if (!CODIGO_JUSTIFICATIVA.test(codigo) || codigo.length > 20) {
      setErroLiberador("Use até 20 letras e números, começando por uma letra.");
      return;
    }
    if (rotulo.length < 2 || rotulo.length > 60) {
      setErroLiberador("O rótulo deve ter de 2 a 60 caracteres.");
      return;
    }
    if (atual.liberadores.some((item) => item.codigo === codigo)) {
      setErroLiberador("Já existe um responsável com este código.");
      return;
    }
    setErroLiberador("");
    mutarLiberadores(ordenarPorRotulo([...atual.liberadores, { codigo, rotulo, ativo: true }]));
    setNovaCodigoLiberador("");
    setNovaRotuloLiberador("");
    avisarSucesso("Responsável adicionado ao rascunho.", "Salve as configurações para aplicar.");
  }

  function salvarRotuloLiberador(codigo: string) {
    const rotulo = rotuloEdicaoLiberador.trim();
    if (rotulo.length < 2 || rotulo.length > 60) {
      setErroLiberador("O rótulo deve ter de 2 a 60 caracteres.");
      return;
    }
    setErroLiberador("");
    mutarLiberadores(
      ordenarPorRotulo(
        atual.liberadores.map((item) => (item.codigo === codigo ? { ...item, rotulo } : item)),
      ),
    );
    setEditandoLiberador(null);
    setRotuloEdicaoLiberador("");
    avisarSucesso("Responsável atualizado no rascunho.", "Salve as configurações para aplicar.");
  }

  function alternarAtivoLiberador(item: LiberadorConfigurado) {
    mutarLiberadores(
      atual.liberadores.map((atual) =>
        atual.codigo === item.codigo ? { ...atual, ativo: !atual.ativo } : atual,
      ),
    );
    avisarSucesso(
      item.ativo ? "Responsável desativado no rascunho." : "Responsável reativado no rascunho.",
      item.ativo
        ? "As saídas antigas continuam mostrando o nome dele."
        : "Ele volta ao seletor depois de salvar.",
    );
  }

  function removerLiberador(item: LiberadorConfigurado) {
    mutarLiberadores(atual.liberadores.filter((atual) => atual.codigo !== item.codigo));
    setExcluirAlvoLiberador(null);
    avisarSucesso("Responsável removido do rascunho.", "Salve as configurações para aplicar.");
  }

  async function concluirSalvamento() {
    if (precisaSenhaBi && senhaBi.trim() === "") {
      toast.error("Informe a senha do administrador para alterar as chaves do BI.");
      return;
    }
    try {
      const resultadoLote = await salvar(precisaSenhaBi ? senhaBi : undefined);
      setConfirmarSalvar(false);
      setSenhaBi("");
      avisarSucesso("Configurações salvas.", "As alterações valem para toda a escola.");
      onMudanca(resultadoLote.completo.configuracoes);
      avisarBeneficiosMudaram();
      avisarOrdemAlmocoMudou();
      if (resultadoLote.segredosBi.length > 0) setSegredosBi(resultadoLote.segredosBi);
      try {
        await Promise.all([onJustificativasMudaram(), onLiberadoresMudaram()]);
        await onHorariosMudaram();
      } catch {
        // A gravação já foi concluída; a próxima atualização relê os catálogos.
      }
    } catch {
      // O provedor mantém a mensagem e o rascunho para revisão.
    }
  }

  async function prepararCopia(senha: string) {
    const dados = await pedir<unknown>("/api/backup/exportar", corpoJson({ senha }));
    return {
      blob: new Blob([JSON.stringify(dados, null, 2)], { type: "application/json;charset=utf-8" }),
      nome: `frequenciapp-copia-${diaCorrente}.json`,
      nomeNoZip: "copia.json",
      nomeZip: "frequenciapp-copia.zip",
    };
  }

  async function importar(arquivo: File) {
    const aviso = "backup-importar";
    setImportando(true);
    setErroCopia("");
    setResultado(null);
    toast.loading("Importando a cópia de segurança...", { id: aviso });
    try {
      if (arquivo.size > LIMITE_ARQUIVO) {
        throw new Error("A cópia é muito grande. Use um arquivo de até 25 MB.");
      }
      let corpo: unknown;
      try {
        corpo = JSON.parse(await arquivo.text());
      } catch {
        throw new Error("Não foi possível ler a cópia. Selecione o arquivo JSON correto.");
      }
      const dados = await pedir<ResultadoImportacao>("/api/backup", corpoJson(corpo));
      setResultado(dados);
      avisarSucesso("Importação concluída.", "Confira o resumo na tela antes de continuar.", aviso);
    } catch (excecao) {
      const mensagem = excecao instanceof ErroApi ? excecao.message : (excecao as Error).message;
      setErroCopia(mensagem);
      toast.error(mensagem, {
        id: aviso,
        description: "Confira o arquivo e tente de novo.",
        duration: 8000,
      });
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  function resumoDaSecao(chave: string): string {
    const configuracoesBase = anterior.configuracoes;
    const configuracoesAtuais = atual.configuracoes;
    if (chave === "configuracao") {
      const mudancas: string[] = [];
      if (configuracoesBase.frequenciaPorAula !== configuracoesAtuais.frequenciaPorAula) {
        mudancas.push(
          configuracoesAtuais.frequenciaPorAula ? "chamada por aula" : "chamada diária",
        );
      }
      if (configuracoesBase.saidaAntecipada !== configuracoesAtuais.saidaAntecipada) {
        mudancas.push(configuracoesAtuais.saidaAntecipada ? "saídas ligadas" : "saídas desligadas");
      }
      if (configuracoesBase.origemNaChamada !== configuracoesAtuais.origemNaChamada) {
        mudancas.push(configuracoesAtuais.origemNaChamada ? "origem ligada" : "origem desligada");
      }
      if (
        !listasIguais(
          configuracoesBase.origemNaChamadaSerieIds,
          configuracoesAtuais.origemNaChamadaSerieIds,
        )
      ) {
        mudancas.push(
          contagem(configuracoesAtuais.origemNaChamadaSerieIds.length, "série", "séries"),
        );
      }
      if (
        !listasIguais(
          configuracoesBase.origemNaChamadaTurmaIds,
          configuracoesAtuais.origemNaChamadaTurmaIds,
        )
      ) {
        mudancas.push(
          contagem(configuracoesAtuais.origemNaChamadaTurmaIds.length, "turma", "turmas"),
        );
      }
      return mudancas.join(", ");
    }
    if (chave === "notificacoes") return "Regras e horários dos avisos.";
    if (chave === "acesso") return "Limites e visibilidade dos diretores.";
    if (chave === "ordemAlmoco") {
      const diasMudados = atual.ordemAlmoco.filter((dia) => {
        const anteriorDoDia = anterior.ordemAlmoco.find((item) => item.diaSemana === dia.diaSemana);
        return JSON.stringify(anteriorDoDia?.itens ?? []) !== JSON.stringify(dia.itens);
      }).length;
      return contagem(diasMudados, "dia alterado", "dias alterados");
    }
    if (chave === "beneficios") {
      const novos = atual.beneficios.filter((item) => item.id.startsWith("novo-")).length;
      const removidos = anterior.beneficios.filter(
        (item) => !atual.beneficios.some((atual) => atual.id === item.id),
      ).length;
      return (
        [
          novos ? contagem(novos, "novo", "novos") : "",
          removidos ? `${removidos} removido${removidos === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Regras ajustadas."
      );
    }
    if (chave === "justificativas" || chave === "liberadores") {
      const listaBase = chave === "justificativas" ? anterior.justificativas : anterior.liberadores;
      const listaAtual = chave === "justificativas" ? atual.justificativas : atual.liberadores;
      const novos = listaAtual.filter(
        (item) => !listaBase.some((anterior) => anterior.codigo === item.codigo),
      ).length;
      const removidos = listaBase.filter(
        (item) => !listaAtual.some((atual) => atual.codigo === item.codigo),
      ).length;
      return (
        [
          novos ? contagem(novos, "novo", "novos") : "",
          removidos ? `${removidos} removido${removidos === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Itens ajustados."
      );
    }
    if (chave === "feriados") {
      const novos = atual.feriados.filter(
        (item) => !anterior.feriados.some((anterior) => anterior.dia === item.dia),
      ).length;
      const removidos = anterior.feriados.filter(
        (item) => !atual.feriados.some((atual) => atual.dia === item.dia),
      ).length;
      return (
        [
          novos ? contagem(novos, "novo", "novos") : "",
          removidos ? `${removidos} removido${removidos === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Calendário ajustado."
      );
    }
    if (chave === "chavesBi") {
      const novas = atual.chavesBi.filter((item) => item.id.startsWith("novo-")).length;
      const rotacionadas = atual.chavesBi.filter((item) => item.rotacionar).length;
      const revogadas = atual.chavesBi.filter(
        (item) =>
          item.revogada && !anterior.chavesBi.find((antiga) => antiga.id === item.id)?.revogadaEm,
      ).length;
      const removidas = anterior.chavesBi.filter(
        (item) => !atual.chavesBi.some((atual) => atual.id === item.id),
      ).length;
      return (
        [
          novas ? contagem(novas, "nova", "novas") : "",
          rotacionadas ? `${rotacionadas} substituída${rotacionadas === 1 ? "" : "s"}` : "",
          revogadas ? `${revogadas} revogada${revogadas === 1 ? "" : "s"}` : "",
          removidas ? `${removidas} removida${removidas === 1 ? "" : "s"} do histórico` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Chaves ajustadas."
      );
    }
    return "";
  }

  const escola = (
    <>
      <SecaoRecolhivel
        dataSecao="config-recursos"
        titulo="Recursos da escola"
        descricao="Liga e desliga recursos da chamada e das saídas."
        icone={Settings2}
        aberto={abertoRecursos}
        onAbertoChange={setAbertoRecursos}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-frequencia-aula">Chamada por aula</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ligada: faltas por aula. Desligada: chamada diária.
            </p>
          </div>
          <Switch
            id="config-frequencia-aula"
            checked={atual.configuracoes.frequenciaPorAula}
            disabled={salvando}
            onCheckedChange={(valor) => alternar("frequenciaPorAula", valor)}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="config-saida-antecipada">Saídas e Entradas</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Desligar oculta a área e preserva os registros.
            </p>
          </div>
          <Switch
            id="config-saida-antecipada"
            checked={atual.configuracoes.saidaAntecipada}
            disabled={salvando}
            onCheckedChange={(valor) => alternar("saidaAntecipada", valor)}
          />
        </div>

        <div
          className="superficie-vidro flex flex-col gap-3 p-3"
          role="group"
          aria-label="Turma de origem na Chamada"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="config-origem-chamada">Turma de origem na Chamada</Label>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Mostra a origem e o remanejamento nas séries e turmas selecionadas.
              </p>
            </div>
            <Switch
              id="config-origem-chamada"
              checked={atual.configuracoes.origemNaChamada}
              disabled={salvando}
              onCheckedChange={(valor) => salvarOrigem({ origemNaChamada: valor })}
            />
          </div>
          {atual.configuracoes.origemNaChamada && (
            <>
              <fieldset disabled={salvando} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Séries completas</legend>
                <p className="text-muted-foreground text-xs">Inclui as turmas atuais e futuras.</p>
                {series.map((serie) => (
                  <label
                    key={serie.id}
                    className="faixa-toque flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary size-4 shrink-0"
                      aria-label={`Mostrar origem na série ${serie.nome}`}
                      checked={atual.configuracoes.origemNaChamadaSerieIds.includes(serie.id)}
                      onChange={(evento) =>
                        void salvarOrigem({
                          origemNaChamadaSerieIds: selecaoAlterada(
                            atual.configuracoes.origemNaChamadaSerieIds,
                            serie.id,
                            evento.target.checked,
                          ),
                        })
                      }
                    />
                    {serie.nome}
                  </label>
                ))}
              </fieldset>
              <SecaoRecolhivel
                dataSecao="config-origem-turmas"
                nivel="interna"
                titulo="Turmas específicas"
                icone={Users}
                aberto={abertoTurmasOrigem}
                onAbertoChange={setAbertoTurmasOrigem}
                resumo={
                  <Selo
                    variante={
                      atual.configuracoes.origemNaChamadaTurmaIds.length > 0 ? "sucesso" : "neutro"
                    }
                  >
                    {atual.configuracoes.origemNaChamadaTurmaIds.length === 0
                      ? "Nenhuma"
                      : `${atual.configuracoes.origemNaChamadaTurmaIds.length} selecionada${
                          atual.configuracoes.origemNaChamadaTurmaIds.length === 1 ? "" : "s"
                        }`}
                  </Selo>
                }
              >
                <fieldset disabled={salvando} className="flex flex-col gap-2">
                  <legend className="sr-only">Turmas específicas</legend>
                  {turmas.map((item) => (
                    <label
                      key={item.id}
                      className="faixa-toque flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-4 shrink-0"
                        aria-label={`Mostrar origem na turma ${item.rotulo}`}
                        checked={atual.configuracoes.origemNaChamadaTurmaIds.includes(item.id)}
                        onChange={(evento) =>
                          void salvarOrigem({
                            origemNaChamadaTurmaIds: selecaoAlterada(
                              atual.configuracoes.origemNaChamadaTurmaIds,
                              item.id,
                              evento.target.checked,
                            ),
                          })
                        }
                      />
                      {item.rotulo}
                    </label>
                  ))}
                </fieldset>
              </SecaoRecolhivel>
              {atual.configuracoes.origemNaChamadaSerieIds.length === 0 &&
                atual.configuracoes.origemNaChamadaTurmaIds.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    Nenhuma série ou turma selecionada.
                  </p>
                )}
            </>
          )}
        </div>
      </SecaoRecolhivel>

      <SecaoCalendarioLetivo
        feriados={atual.feriados}
        diaCorrente={diaCorrente}
        onAdicionar={(feriado) => mutarFeriados([...atual.feriados, feriado])}
        onRemover={(dia) => mutarFeriados(atual.feriados.filter((feriado) => feriado.dia !== dia))}
        onSincronizar={async () => {
          const dados = await pedir<ConfiguracoesCompletas>("/api/configuracoes/completo");
          aplicarFeriadosExternos(dados);
        }}
      />

      <SecaoBeneficiosFrequencia beneficios={atual.beneficios} onMudar={mutarBeneficios} />

      <SecaoRecolhivel
        dataSecao="config-justificativas"
        titulo="Justificativas"
        descricao="Motivos disponíveis nas faltas justificadas."
        icone={ScrollText}
        aberto={abertoJustificativas}
        onAbertoChange={setAbertoJustificativas}
        resumo={
          <>
            <Selo>{atual.justificativas.length} no catálogo</Selo>
            <Selo>{atual.justificativas.filter((item) => item.ativo).length} ativas</Selo>
          </>
        }
      >
        <div className="superficie-vidro flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-32">
            <Label htmlFor="justificativa-codigo">Código</Label>
            <Input
              id="justificativa-codigo"
              value={novaCodigo}
              maxLength={10}
              autoComplete="off"
              onChange={(evento) => setNovaCodigo(evento.target.value)}
              placeholder="Ex.: At"
              className="h-11"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="justificativa-rotulo">Rótulo</Label>
            <Input
              id="justificativa-rotulo"
              value={novaRotulo}
              maxLength={60}
              autoComplete="off"
              onChange={(evento) => setNovaRotulo(evento.target.value)}
              placeholder="Ex.: Atestado"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="h-11 sm:w-auto"
            onClick={criarJustificativa}
            disabled={novaCodigo.trim() === "" || novaRotulo.trim() === ""}
          >
            <Plus size={16} />
            Adicionar
          </Button>
        </div>

        {erroJustificativa && (
          <AvisoCompacto variante="dados_invalidos" descricao={erroJustificativa} tamanho="linha" />
        )}

        <ul className="superficie-vidro divide-y overflow-hidden">
          {atual.justificativas.map((item) => (
            <li
              key={item.codigo}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${
                item.ativo ? "" : "opacity-60"
              }`}
            >
              <span className="bg-secondary text-secondary-foreground numerais-tabulares w-12 shrink-0 rounded-md px-1.5 py-1 text-center text-xs font-semibold">
                {item.codigo}
              </span>
              {editando === item.codigo ? (
                <>
                  <Input
                    value={rotuloEdicao}
                    maxLength={60}
                    autoComplete="off"
                    aria-label={`Rótulo de ${item.codigo}`}
                    onChange={(evento) => setRotuloEdicao(evento.target.value)}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Salvar rótulo de ${item.codigo}`}
                    onClick={() => salvarRotulo(item.codigo)}
                    disabled={rotuloEdicao.trim().length < 2}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Cancelar edição de ${item.codigo}`}
                    onClick={() => {
                      setEditando(null);
                      setRotuloEdicao("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.rotulo}
                    {item.ativo ? "" : " · desativada"}
                  </span>
                  <Switch
                    checked={item.ativo}
                    aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`}
                    onCheckedChange={() => alternarAtivo(item)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Editar rótulo de ${item.codigo}`}
                    onClick={() => {
                      setEditando(item.codigo);
                      setRotuloEdicao(item.rotulo);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-falta-texto size-10 shrink-0"
                    aria-label={`Excluir ${item.codigo}`}
                    onClick={() => setExcluirAlvo(item)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <AlertDialog
          open={excluirAlvo !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setExcluirAlvo(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a justificativa {excluirAlvo?.codigo}?</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão é aplicada ao salvar as configurações. Se houver faltas ou saídas usando
                o código, o servidor recusa o lote e nada é gravado. Com histórico, o caminho é
                desativar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => excluirAlvo && removerJustificativa(excluirAlvo)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SecaoRecolhivel>

      <SecaoRecolhivel
        dataSecao="config-liberadores"
        titulo="Quem libera as saídas"
        descricao="Nomes disponíveis ao registrar uma saída."
        icone={UserCheck}
        aberto={abertoLiberadores}
        onAbertoChange={setAbertoLiberadores}
        resumo={
          <>
            <Selo>{atual.liberadores.length} no catálogo</Selo>
            <Selo>{atual.liberadores.filter((item) => item.ativo).length} ativos</Selo>
          </>
        }
      >
        <div className="superficie-vidro flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:w-32">
            <Label htmlFor="liberador-codigo">Código</Label>
            <Input
              id="liberador-codigo"
              value={novaCodigoLiberador}
              maxLength={20}
              autoComplete="off"
              onChange={(evento) => setNovaCodigoLiberador(evento.target.value)}
              placeholder="Ex.: maria"
              className="h-11"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor="liberador-rotulo">Rótulo</Label>
            <Input
              id="liberador-rotulo"
              value={novaRotuloLiberador}
              maxLength={60}
              autoComplete="off"
              onChange={(evento) => setNovaRotuloLiberador(evento.target.value)}
              placeholder="Ex.: Coordenadora Maria"
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="h-11 sm:w-auto"
            onClick={criarLiberador}
            disabled={novaCodigoLiberador.trim() === "" || novaRotuloLiberador.trim() === ""}
          >
            <Plus size={16} />
            Adicionar
          </Button>
        </div>

        {erroLiberador && (
          <AvisoCompacto variante="dados_invalidos" descricao={erroLiberador} tamanho="linha" />
        )}

        {atual.liberadores.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum nome cadastrado.</p>
        )}

        <ul className="superficie-vidro divide-y overflow-hidden">
          {atual.liberadores.map((item) => (
            <li
              key={item.codigo}
              className={`flex min-h-14 items-center gap-3 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${
                item.ativo ? "" : "opacity-60"
              }`}
            >
              <span className="bg-secondary text-secondary-foreground numerais-tabulares w-20 shrink-0 truncate rounded-md px-1.5 py-1 text-center text-xs font-semibold">
                {item.codigo}
              </span>
              {editandoLiberador === item.codigo ? (
                <>
                  <Input
                    value={rotuloEdicaoLiberador}
                    maxLength={60}
                    autoComplete="off"
                    aria-label={`Rótulo de ${item.codigo}`}
                    onChange={(evento) => setRotuloEdicaoLiberador(evento.target.value)}
                    className="h-10 min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Salvar rótulo de ${item.codigo}`}
                    onClick={() => salvarRotuloLiberador(item.codigo)}
                    disabled={rotuloEdicaoLiberador.trim().length < 2}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Cancelar edição de ${item.codigo}`}
                    onClick={() => {
                      setEditandoLiberador(null);
                      setRotuloEdicaoLiberador("");
                    }}
                  >
                    <X size={16} />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.rotulo}
                    {item.ativo ? "" : " · desativado"}
                  </span>
                  <Switch
                    checked={item.ativo}
                    aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`}
                    onCheckedChange={() => alternarAtivoLiberador(item)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Editar rótulo de ${item.codigo}`}
                    onClick={() => {
                      setEditandoLiberador(item.codigo);
                      setRotuloEdicaoLiberador(item.rotulo);
                    }}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-falta-texto size-10 shrink-0"
                    aria-label={`Excluir ${item.codigo}`}
                    onClick={() => setExcluirAlvoLiberador(item)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        <AlertDialog
          open={excluirAlvoLiberador !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setExcluirAlvoLiberador(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {excluirAlvoLiberador?.rotulo}?</AlertDialogTitle>
              <AlertDialogDescription>
                A exclusão é aplicada ao salvar as configurações. Se houver saídas com este código,
                o servidor recusa o lote e nada é gravado. Com histórico, o caminho é desativar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => excluirAlvoLiberador && removerLiberador(excluirAlvoLiberador)}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SecaoRecolhivel>
    </>
  );

  const dados = (
    <>
      <SecaoRecolhivel
        dataSecao="config-copia"
        titulo="Cópia de segurança"
        descricao="A importação adiciona dados ausentes, sem sobrescrever os existentes."
        icone={Archive}
        aberto={abertoCopia}
        onAbertoChange={setAbertoCopia}
        resumo={<Selo>Arquivo JSON</Selo>}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setDownloadAberto(true)}
            disabled={importando}
          >
            <Download size={16} />
            Baixar cópia
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="h-11" disabled={importando}>
                {importando ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                Importar cópia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Importar cópia?</AlertDialogTitle>
                <AlertDialogDescription>
                  O arquivo é mesclado ao banco: registros que já existem são mantidos e apenas os
                  que faltam são adicionados. Confira o resultado depois da importação.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => arquivoRef.current?.click()}>
                  Escolher arquivo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <input
            ref={arquivoRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              if (arquivo) void importar(arquivo);
            }}
          />
        </div>
        {erroCopia && (
          <AvisoCompacto variante="dados_invalidos" descricao={erroCopia} tamanho="linha" />
        )}
        {resultado && (
          <p role="status" className="bg-secondary/60 rounded-lg px-4 py-3 text-sm">
            {resultado.adicionadas}{" "}
            {resultado.adicionadas === 1 ? "registro adicionado" : "registros adicionados"},{" "}
            {resultado.identicas} {resultado.identicas === 1 ? "já era igual" : "já eram iguais"} e{" "}
            {resultado.conflitos}{" "}
            {resultado.conflitos === 1 ? "conflito mantido" : "conflitos mantidos"}.
            <span className="mt-2 block">
              Chaves do FrequenciBI não são restauradas. Gere novas chaves na Gestão quando
              necessário.
            </span>
          </p>
        )}
      </SecaoRecolhivel>
    </>
  );

  const tituloErro =
    erroCodigo === "CONFIGURACOES_ALTERADAS"
      ? "Configurações alteradas em outro acesso"
      : erroCodigo === "JUSTIFICATIVA_EM_USO"
        ? "Justificativa em uso"
        : erroCodigo === "LIBERADOR_EM_USO"
          ? "Responsável em uso"
          : erroCodigo === "SENHA_BI_OBRIGATORIA"
            ? "Senha do administrador"
            : erroStatus === 409
              ? "Não foi possível concluir"
              : undefined;

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6">
      {erro && !confirmarSalvar && (
        <div className="col-span-full">
          <AvisoCompacto
            variante={varianteDoErro(erroStatus)}
            titulo={tituloErro}
            descricao={erro}
            tamanho="linha"
            acao={
              erroStatus === 409
                ? {
                    rotulo: "Recarregar tudo e descartar",
                    onClick: () => void recarregar(),
                  }
                : undefined
            }
          />
        </div>
      )}
      <nav
        aria-label="Categorias de configurações"
        className="superficie-vidro grid grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-1"
      >
        {CATEGORIAS.map(({ valor, rotulo, icone: Icone }) => (
          <Button
            key={valor}
            id={`categoria-config-${valor}`}
            type="button"
            variant="ghost"
            aria-pressed={categoria === valor}
            aria-controls={`config-grupo-${valor}`}
            onClick={() => {
              setCategoria(valor);
              if (valor === "horarios") setHorariosAbertos(true);
            }}
            className={`h-12 min-w-0 justify-start px-3 text-xs sm:text-sm ${
              categoria === valor ? "vidro-selecionado" : "text-muted-foreground"
            }`}
          >
            <Icone size={16} aria-hidden="true" />
            {rotulo}
          </Button>
        ))}
      </nav>
      <div className="min-w-0 pb-24">
        <section
          id="config-grupo-escola"
          aria-labelledby="categoria-config-escola"
          hidden={categoria !== "escola"}
          inert={categoria !== "escola"}
          className="flex min-w-0 flex-col gap-4"
        >
          {escola}
        </section>
        <section
          id="config-grupo-horarios"
          aria-labelledby="categoria-config-horarios"
          hidden={categoria !== "horarios"}
          inert={categoria !== "horarios"}
          className="flex min-w-0 flex-col gap-4"
        >
          {horariosAbertos && (
            <VistaHorarios
              turmas={turmas}
              diaCorrente={diaCorrente}
              editavel
              onMudanca={onHorariosMudaram}
              onPendencia={onPendenciaHorarios}
            />
          )}
          {horariosAbertos && (
            <SecaoOrdemAlmoco
              turmas={turmas}
              dias={atual.ordemAlmoco}
              onMudar={mutarOrdem}
              onCopiarParaTodos={(dia, itens) => {
                for (const valor of DIAS_ORDEM_ALMOCO) mutarOrdem(valor, itens);
              }}
            />
          )}
        </section>
        <section
          id="config-grupo-planilhas"
          aria-labelledby="categoria-config-planilhas"
          hidden={categoria !== "planilhas"}
          inert={categoria !== "planilhas"}
          className="flex min-w-0 flex-col gap-4"
        >
          <IntegracaoPlanilha
            turmas={turmas}
            diaCorrente={diaCorrente}
            abertoInicial={planilhaInicial === "FREQUENCIA"}
          />
          <IntegracaoSaidas
            onAbrirSaidas={onAbrirSaidas}
            abertoInicial={planilhaInicial === "SAIDAS"}
          />
          <IntegracaoParcial
            onAbrirParcial={onAbrirParcial}
            abertoInicial={planilhaInicial === "PARCIAL"}
          />
          <SecaoFilaPlanilha />
        </section>
        <section
          id="config-grupo-acesso"
          aria-labelledby="categoria-config-acesso"
          hidden={categoria !== "acesso"}
          inert={categoria !== "acesso"}
          className="flex min-w-0 flex-col gap-4"
        >
          <SecaoChavesBi
            series={series}
            turmas={turmas}
            chaves={atual.chavesBi}
            onMudar={(lista: ChaveBiDesejada[]) => mutarChaves(lista)}
          />
          <SecaoAcessoDiretores parametros={atual.acesso} onMudar={mutarAcesso} />
          <SecaoNotificacoes configuracao={atual.notificacoes} onMudar={mutarNotificacoes} />
        </section>
        <section
          id="config-grupo-dados"
          aria-labelledby="categoria-config-dados"
          hidden={categoria !== "dados"}
          inert={categoria !== "dados"}
          className="flex min-w-0 flex-col gap-4"
        >
          {dados}
        </section>
      </div>
      {alterado && (
        <div
          role="region"
          aria-label="Salvar configurações"
          className="superficie-vidro vidro-flutuante sticky z-20 col-span-full mx-auto flex w-fit max-w-full items-center gap-2 rounded-2xl p-2 xl:mr-0 xl:ml-auto"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <p
            className="text-muted-foreground max-w-32 min-w-0 truncate px-2 text-xs font-medium sm:max-w-48"
            aria-live="polite"
            title={`Alterações não salvas em ${secoesAlteradas.length} ${
              secoesAlteradas.length === 1 ? "seção" : "seções"
            }`}
          >
            <span className="sm:hidden">Não salvo</span>
            <span className="hidden sm:inline">
              Alterações não salvas em {secoesAlteradas.length}{" "}
              {secoesAlteradas.length === 1 ? "seção" : "seções"}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            className="shrink-0"
            aria-label="Descartar"
            onClick={() => setConfirmarDescartar(true)}
            disabled={salvando}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Descartar</span>
          </Button>
          <Button
            type="button"
            className="shrink-0 px-4"
            aria-label="Salvar configurações"
            onClick={() => {
              setSenhaBi("");
              setConfirmarSalvar(true);
            }}
            disabled={salvando}
          >
            {salvando ? (
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Save size={16} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">Salvar configurações</span>
            <span className="sm:hidden">Salvar</span>
          </Button>
        </div>
      )}
      <AlertDialog
        open={confirmarSalvar}
        onOpenChange={(aberto) => {
          if (!aberto && !salvando) setConfirmarSalvar(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salvar configurações?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações valem para toda a escola e são gravadas de uma vez. Se outra pessoa
              tiver mudado alguma seção, nada é gravado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-2 text-sm">
            {secoesAlteradas.map((secao) => (
              <li key={secao.chave} className="flex flex-col gap-0.5">
                <span className="font-medium">{secao.rotulo}</span>
                <span className="text-muted-foreground text-xs">{resumoDaSecao(secao.chave)}</span>
              </li>
            ))}
          </ul>
          {precisaSenhaBi && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="config-senha-bi">Senha do administrador</Label>
              <CampoSenha
                id="config-senha-bi"
                autoComplete="current-password"
                value={senhaBi}
                onChange={(evento) => setSenhaBi(evento.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                A senha confirma a criação, a substituição ou a revogação das chaves do BI.
              </p>
            </div>
          )}
          {erro && (
            <AvisoCompacto
              variante={varianteDoErro(erroStatus)}
              titulo={tituloErro}
              descricao={erro}
              tamanho="linha"
              acao={
                erroStatus === 409
                  ? {
                      rotulo: "Recarregar tudo e descartar",
                      onClick: () => {
                        setConfirmarSalvar(false);
                        void recarregar();
                      },
                    }
                  : undefined
              }
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Continuar revisando</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando || (precisaSenhaBi && senhaBi.trim() === "")}
              onClick={(evento) => {
                evento.preventDefault();
                void concluirSalvamento();
              }}
            >
              {salvando ? <LoaderCircle size={16} className="animate-spin" /> : null}
              Salvar configurações
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmarDescartar} onOpenChange={setConfirmarDescartar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as seções voltam ao estado salvo, inclusive catálogos, calendário e chaves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                descartar();
                setConfirmarDescartar(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={segredosBi.length > 0}
        onOpenChange={(aberto) => {
          if (!aberto) setSegredosBi([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guarde as chaves do BI</DialogTitle>
            <DialogDescription>
              Elas aparecem apenas agora e dão acesso a dados pessoais. Não as inclua em links.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {segredosBi.map((item) => (
              <div key={item.id} className="flex flex-col gap-1.5">
                <Label>{item.rotulo}</Label>
                <Input
                  aria-label={`Chave gerada para ${item.rotulo}`}
                  readOnly
                  value={item.segredo}
                  autoComplete="off"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(item.segredo);
                      avisarSucesso("Chave copiada.");
                    } catch (excecao) {
                      avisarErro(excecao, {
                        contexto: "Não foi possível copiar. Selecione a chave e copie manualmente.",
                      });
                    }
                  }}
                >
                  Copiar chave
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setSegredosBi([])}>Já guardei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DialogoDownload
        confirmarAdmin
        aberto={downloadAberto}
        onAbrir={setDownloadAberto}
        preparar={prepararCopia}
        onConcluido={() =>
          avisarSucesso(
            "Cópia preparada. Confira o download no navegador.",
            "Guarde a cópia em local seguro e, se protegida, mantenha a senha separada.",
          )
        }
      />
    </div>
  );
}
