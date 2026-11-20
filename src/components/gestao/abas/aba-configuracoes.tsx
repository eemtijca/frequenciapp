"use client";

// Configurações da escola em um único rascunho: recursos, catálogos, avisos,
// acesso, almoço, calendário e chaves do BI são revisados e gravados em lote.
import { useEffect, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentRoundedIcon from "@mui/icons-material/AssignmentRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import GridOnRoundedIcon from "@mui/icons-material/GridOnRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { avisarBeneficiosMudaram } from "@/lib/eventos-beneficios";
import { avisarOrdemAlmocoMudou } from "@/lib/eventos-ordem-almoco";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
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
import { Abas } from "@/components/ui/mui/abas";
import { Acordeao } from "@/components/ui/mui/acordeao";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { CampoSenha } from "@/components/ui/mui/campo-senha";
import { CampoTexto } from "@/components/ui/mui/text-field";
import { Dialogo } from "@/components/ui/mui/dialogo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Interruptor } from "@/components/ui/mui/interruptor";
import { PainelAcoes } from "@/components/ui/mui/painel-acoes";
import { Selo } from "@/components/ui/mui/selo";
import DialogoDownload from "@/components/conta/dialogo-download";
import SecaoChavesBi from "@/components/gestao/configuracoes/secao-chaves-bi";
import SecaoAcessoDiretores from "@/components/gestao/configuracoes/secao-acesso-diretores";
import SecaoNotificacoes from "@/components/gestao/configuracoes/secao-notificacoes";
import IntegracaoPlanilha from "@/components/gestao/planilhas/integracao-planilha";
import IntegracaoSaidas from "@/components/gestao/planilhas/integracao-saidas";
import IntegracaoParcial from "@/components/gestao/planilhas/integracao-parcial";
import SecaoFilaPlanilha from "@/components/gestao/planilhas/secao-fila-planilha";
import SecaoCalendarioLetivo from "@/components/gestao/configuracoes/secao-calendario-letivo";
import SecaoBeneficiosFrequencia from "@/components/gestao/configuracoes/secao-beneficios-frequencia";
import SecaoInfrequencia from "@/components/gestao/configuracoes/secao-infrequencia";
import VistaHorarios from "@/components/horarios/vista-horarios";
import SecaoProvasBimestrais from "@/components/horarios/secao-provas-bimestrais";
import SecaoOrdemAlmoco from "@/components/gestao/configuracoes/secao-ordem-almoco";
import {
  ProvedorRascunhoConfiguracoes,
  useRascunhoConfiguracoes,
} from "@/components/gestao/configuracoes/rascunho-configuracoes";

interface Props {
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  series: Serie[];
  turmas: Turma[];
  diaCorrente: string;
  fuso: string;
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

type Categoria = "escola" | "horarios" | "planilhas" | "acesso" | "dados";
type AcaoEscola = "geral" | "frequencia" | "calendario" | "cadastros";
type AcaoHorarios = "aulas" | "almoco" | "provas";
type AcaoAcesso = "diretores" | "notificacoes" | "bi";

const LIMITE_ARQUIVO = 25 * 1024 * 1024;
const CATEGORIAS: readonly {
  valor: Categoria;
  rotulo: string;
  icone: SvgIconComponent;
}[] = [
  { valor: "escola", rotulo: "Escola", icone: TuneRoundedIcon },
  { valor: "horarios", rotulo: "Horários", icone: ScheduleRoundedIcon },
  { valor: "planilhas", rotulo: "Planilhas", icone: GridOnRoundedIcon },
  { valor: "acesso", rotulo: "Acesso e avisos", icone: ShieldRoundedIcon },
  { valor: "dados", rotulo: "Dados", icone: Inventory2RoundedIcon },
];

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

const ESTILO_CAMPO_CODIGO = { minWidth: 0, width: { xs: "100%", sm: 128 } } as const;

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
  fuso,
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

  const [acaoEscola, setAcaoEscola] = useState<AcaoEscola>("geral");
  const [acaoHorarios, setAcaoHorarios] = useState<AcaoHorarios>("aulas");
  const [acaoAcesso, setAcaoAcesso] = useState<AcaoAcesso>("diretores");
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
  const [confirmarImportacao, setConfirmarImportacao] = useState(false);
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
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: 160,
          padding: 3,
          textAlign: "center",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
        }}
      >
        {carregando ? (
          <>
            <CircularProgress size={24} aria-label="Carregando configurações" />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Carregando configurações...
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2">
              {erro || "Não foi possível carregar as configurações."}
            </Typography>
            <Botao type="button" variante="contorno" onClick={() => void recarregar()}>
              Tentar novamente
            </Botao>
          </>
        )}
      </Box>
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
      avisarErro(new Error("Informe a senha do administrador para alterar as chaves do BI."), {
        contexto: "Informe a senha do administrador para alterar as chaves do BI.",
      });
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
      window.dispatchEvent(new Event("configuracoes-salvas"));
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
      avisarErro(excecao, {
        contexto: mensagem,
        descricao: "Confira o arquivo e tente de novo.",
        id: aviso,
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
    if (chave === "infrequencia") {
      return `Dentro do esperado até ${configuracoesAtuais.infrequenciaAtencaoPercentual}% e atenção até ${configuracoesAtuais.infrequenciaCriticaPercentual}%.`;
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
    if (chave === "planilhas") {
      const nomes: Record<string, string> = {
        frequencia: "Frequência",
        saidas: "Saídas e Entradas",
        parcial: "Chamada Parcial",
      };
      const mudadas = Object.keys(atual.planilhas).filter(
        (finalidade) =>
          JSON.stringify(atual.planilhas[finalidade as keyof typeof atual.planilhas]) !==
          JSON.stringify(anterior.planilhas[finalidade as keyof typeof anterior.planilhas]),
      );
      return mudadas.map((finalidade) => nomes[finalidade] ?? finalidade).join(", ");
    }
    return "";
  }

  const recursos = (
    <Stack data-secao="config-recursos" spacing={2}>
      <Acordeao
        titulo="Recursos da escola"
        resumo={<Selo>Chamada, saídas e origem</Selo>}
        aberto={abertoRecursos}
        onChange={setAbertoRecursos}
      >
        <Box
          role="region"
          aria-label="Recursos da escola"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Box
            sx={{
              padding: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Interruptor
              id="config-frequencia-aula"
              rotulo="Chamada por aula"
              descricao={atual.configuracoes.frequenciaPorAula ? "Por aula" : "Diária"}
              checked={atual.configuracoes.frequenciaPorAula}
              disabled={salvando}
              onChange={(valor) => alternar("frequenciaPorAula", valor)}
            />
          </Box>

          <Box
            sx={{
              padding: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Interruptor
              id="config-saida-antecipada"
              rotulo="Saídas e Entradas"
              descricao={atual.configuracoes.saidaAntecipada ? "Área disponível" : "Área oculta"}
              checked={atual.configuracoes.saidaAntecipada}
              disabled={salvando}
              onChange={(valor) => alternar("saidaAntecipada", valor)}
            />
          </Box>

          <Box
            role="group"
            aria-label="Turma de origem na Chamada"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Interruptor
              id="config-origem-chamada"
              rotulo="Turma de origem na Chamada"
              checked={atual.configuracoes.origemNaChamada}
              disabled={salvando}
              onChange={(valor) => salvarOrigem({ origemNaChamada: valor })}
            />
            {atual.configuracoes.origemNaChamada ? (
              <>
                <Box component="fieldset" sx={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                  <Typography component="legend" variant="subtitle2" sx={{ marginBottom: 0.5 }}>
                    Séries completas
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Inclui as turmas atuais e futuras.
                  </Typography>
                  <Box sx={{ display: "flex", flexDirection: "column", marginTop: 1 }}>
                    {series.map((serie) => (
                      <FormControlLabel
                        key={serie.id}
                        control={
                          <Checkbox
                            checked={atual.configuracoes.origemNaChamadaSerieIds.includes(serie.id)}
                            disabled={salvando}
                            onChange={(evento) =>
                              void salvarOrigem({
                                origemNaChamadaSerieIds: selecaoAlterada(
                                  atual.configuracoes.origemNaChamadaSerieIds,
                                  serie.id,
                                  evento.target.checked,
                                ),
                              })
                            }
                            slotProps={{
                              input: {
                                "aria-label": `Mostrar origem na série ${serie.nome}`,
                              },
                            }}
                          />
                        }
                        label={serie.nome}
                        sx={(tema) => ({
                          minHeight: 48,
                          margin: 0,
                          paddingX: 1,
                          borderRadius: 2,
                          backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 4%, transparent)`,
                        })}
                      />
                    ))}
                  </Box>
                </Box>
                <Box data-secao="config-origem-turmas">
                  <Acordeao
                    titulo="Turmas específicas"
                    nivelTitulo="h4"
                    resumo={
                      <Selo
                        tom={
                          atual.configuracoes.origemNaChamadaTurmaIds.length > 0
                            ? "sucesso"
                            : "neutro"
                        }
                      >
                        {atual.configuracoes.origemNaChamadaTurmaIds.length === 0
                          ? "Nenhuma"
                          : `${atual.configuracoes.origemNaChamadaTurmaIds.length} selecionada${
                              atual.configuracoes.origemNaChamadaTurmaIds.length === 1 ? "" : "s"
                            }`}
                      </Selo>
                    }
                    aberto={abertoTurmasOrigem}
                    onChange={setAbertoTurmasOrigem}
                  >
                    {abertoTurmasOrigem ? (
                      <Box
                        component="fieldset"
                        sx={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                      >
                        <Typography component="legend" sx={ESTILO_SOMENTE_LEITOR}>
                          Turmas específicas
                        </Typography>
                        <Box sx={{ display: "flex", flexDirection: "column" }}>
                          {turmas.map((item) => (
                            <FormControlLabel
                              key={item.id}
                              control={
                                <Checkbox
                                  checked={atual.configuracoes.origemNaChamadaTurmaIds.includes(
                                    item.id,
                                  )}
                                  disabled={salvando}
                                  onChange={(evento) =>
                                    void salvarOrigem({
                                      origemNaChamadaTurmaIds: selecaoAlterada(
                                        atual.configuracoes.origemNaChamadaTurmaIds,
                                        item.id,
                                        evento.target.checked,
                                      ),
                                    })
                                  }
                                  slotProps={{
                                    input: {
                                      "aria-label": `Mostrar origem na turma ${item.rotulo}`,
                                    },
                                  }}
                                />
                              }
                              label={item.rotulo}
                              sx={(tema) => ({
                                minHeight: 48,
                                margin: 0,
                                paddingX: 1,
                                borderRadius: 2,
                                backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 4%, transparent)`,
                              })}
                            />
                          ))}
                        </Box>
                      </Box>
                    ) : null}
                  </Acordeao>
                </Box>
                {atual.configuracoes.origemNaChamadaSerieIds.length === 0 &&
                atual.configuracoes.origemNaChamadaTurmaIds.length === 0 ? (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Nenhuma série ou turma selecionada.
                  </Typography>
                ) : null}
              </>
            ) : null}
          </Box>
        </Box>
      </Acordeao>
    </Stack>
  );

  const frequencia = (
    <Stack spacing={2}>
      <SecaoInfrequencia configuracoes={atual.configuracoes} onMudar={mutarConfiguracoes} />
      <SecaoBeneficiosFrequencia beneficios={atual.beneficios} onMudar={mutarBeneficios} />
    </Stack>
  );

  const calendario = (
    <Stack spacing={2}>
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
    </Stack>
  );

  const cadastros = (
    <Stack spacing={2}>
      <Box data-secao="config-justificativas">
        <Acordeao
          titulo="Justificativas"
          resumo={
            <Selo>{`${atual.justificativas.filter((item) => item.ativo).length} ativas`}</Selo>
          }
          aberto={abertoJustificativas}
          onChange={setAbertoJustificativas}
        >
          <Box
            role="region"
            aria-label="Justificativas"
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Acordeao
              titulo="Adicionar justificativa"
              nivelTitulo="h4"
              resumo={
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <AddRoundedIcon fontSize="inherit" aria-hidden="true" />
                  Código e rótulo
                </Typography>
              }
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { sm: "flex-end" },
                  gap: 2,
                }}
              >
                <Box sx={ESTILO_CAMPO_CODIGO}>
                  <Campo id="justificativa-codigo" rotulo="Código">
                    <CampoTexto
                      id="justificativa-codigo"
                      valor={novaCodigo}
                      onValor={setNovaCodigo}
                      maxLength={10}
                      autoComplete="off"
                      placeholder="Ex.: At"
                    />
                  </Campo>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Campo id="justificativa-rotulo" rotulo="Rótulo">
                    <CampoTexto
                      id="justificativa-rotulo"
                      valor={novaRotulo}
                      onValor={setNovaRotulo}
                      maxLength={60}
                      autoComplete="off"
                      placeholder="Ex.: Atestado"
                    />
                  </Campo>
                </Box>
                <Botao
                  type="button"
                  variante="primario"
                  icone={<AddRoundedIcon />}
                  onClick={criarJustificativa}
                  disabled={novaCodigo.trim() === "" || novaRotulo.trim() === ""}
                >
                  Adicionar
                </Botao>
              </Box>
            </Acordeao>

            {erroJustificativa ? (
              <AlertaCompacto
                variante="dados_invalidos"
                descricao={erroJustificativa}
                tamanho="linha"
              />
            ) : null}

            <Box
              component="ul"
              sx={{
                display: "flex",
                flexDirection: "column",
                margin: 0,
                padding: 0,
                listStyle: "none",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              {atual.justificativas.map((item) => (
                <Box
                  component="li"
                  key={item.codigo}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 56,
                    paddingX: 2,
                    paddingY: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    opacity: item.ativo ? 1 : 0.6,
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  {editando === item.codigo ? (
                    <Box
                      sx={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <CampoTexto
                          id={`justificativa-rotulo-${item.codigo}`}
                          valor={rotuloEdicao}
                          onValor={setRotuloEdicao}
                          maxLength={60}
                          autoComplete="off"
                          ariaLabel={`Rótulo de ${item.codigo}`}
                        />
                      </Box>
                      <BotaoIcone
                        rotulo={`Salvar rótulo de ${item.codigo}`}
                        variante="secundario"
                        icone={<CheckRoundedIcon />}
                        onClick={() => salvarRotulo(item.codigo)}
                        disabled={rotuloEdicao.trim().length < 2}
                      />
                      <BotaoIcone
                        rotulo={`Cancelar edição de ${item.codigo}`}
                        variante="secundario"
                        icone={<CloseRoundedIcon />}
                        onClick={() => {
                          setEditando(null);
                          setRotuloEdicao("");
                        }}
                      />
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {item.rotulo}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                        >
                          {item.codigo}
                          {item.ativo ? "" : " · desativada"}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                        <Switch
                          checked={item.ativo}
                          slotProps={{
                            input: {
                              "aria-label": `${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`,
                            },
                          }}
                          onChange={() => alternarAtivo(item)}
                        />
                        <BotaoIcone
                          rotulo={`Editar rótulo de ${item.codigo}`}
                          variante="texto"
                          icone={<TuneRoundedIcon />}
                          onClick={() => {
                            setEditando(item.codigo);
                            setRotuloEdicao(item.rotulo);
                          }}
                        />
                        <BotaoIcone
                          rotulo={`Excluir ${item.codigo}`}
                          variante="texto"
                          icone={<DeleteOutlineRoundedIcon />}
                          onClick={() => setExcluirAlvo(item)}
                          sx={(tema) => ({ color: tema.vars.palette.falta.main })}
                        />
                      </Stack>
                    </>
                  )}
                </Box>
              ))}
            </Box>

            <DialogoConfirmacao
              aberto={excluirAlvo !== null}
              titulo={`Excluir a justificativa ${excluirAlvo?.codigo ?? ""}?`}
              descricao="A exclusão é aplicada ao salvar as configurações. Se houver faltas ou saídas usando o código, o servidor recusa o lote e nada é gravado. Com histórico, o caminho é desativar."
              rotuloConfirmar="Excluir"
              destrutivo
              onConfirmar={() => {
                if (excluirAlvo) removerJustificativa(excluirAlvo);
              }}
              onCancelar={() => setExcluirAlvo(null)}
            />
          </Box>
        </Acordeao>
      </Box>

      <Box data-secao="config-liberadores">
        <Acordeao
          titulo="Quem libera as saídas"
          resumo={<Selo>{`${atual.liberadores.filter((item) => item.ativo).length} ativos`}</Selo>}
          aberto={abertoLiberadores}
          onChange={setAbertoLiberadores}
        >
          <Box
            role="region"
            aria-label="Quem libera as saídas"
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            <Acordeao
              titulo="Adicionar responsável"
              nivelTitulo="h4"
              resumo={
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <AddRoundedIcon fontSize="inherit" aria-hidden="true" />
                  Código e rótulo
                </Typography>
              }
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { sm: "flex-end" },
                  gap: 2,
                }}
              >
                <Box sx={ESTILO_CAMPO_CODIGO}>
                  <Campo id="liberador-codigo" rotulo="Código">
                    <CampoTexto
                      id="liberador-codigo"
                      valor={novaCodigoLiberador}
                      onValor={setNovaCodigoLiberador}
                      maxLength={20}
                      autoComplete="off"
                      placeholder="Ex.: maria"
                    />
                  </Campo>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Campo id="liberador-rotulo" rotulo="Rótulo">
                    <CampoTexto
                      id="liberador-rotulo"
                      valor={novaRotuloLiberador}
                      onValor={setNovaRotuloLiberador}
                      maxLength={60}
                      autoComplete="off"
                      placeholder="Ex.: Coordenadora Maria"
                    />
                  </Campo>
                </Box>
                <Botao
                  type="button"
                  variante="primario"
                  icone={<AddRoundedIcon />}
                  onClick={criarLiberador}
                  disabled={novaCodigoLiberador.trim() === "" || novaRotuloLiberador.trim() === ""}
                >
                  Adicionar
                </Botao>
              </Box>
            </Acordeao>

            {erroLiberador ? (
              <AlertaCompacto
                variante="dados_invalidos"
                descricao={erroLiberador}
                tamanho="linha"
              />
            ) : null}

            {atual.liberadores.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Nenhum nome cadastrado.
              </Typography>
            ) : null}

            <Box
              component="ul"
              sx={{
                display: "flex",
                flexDirection: "column",
                margin: 0,
                padding: 0,
                listStyle: "none",
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
              }}
            >
              {atual.liberadores.map((item) => (
                <Box
                  component="li"
                  key={item.codigo}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 56,
                    paddingX: 2,
                    paddingY: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    opacity: item.ativo ? 1 : 0.6,
                    "&:last-of-type": { borderBottom: 0 },
                  }}
                >
                  {editandoLiberador === item.codigo ? (
                    <Box
                      sx={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        minWidth: 0,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <CampoTexto
                          id={`liberador-rotulo-${item.codigo}`}
                          valor={rotuloEdicaoLiberador}
                          onValor={setRotuloEdicaoLiberador}
                          maxLength={60}
                          autoComplete="off"
                          ariaLabel={`Rótulo de ${item.codigo}`}
                        />
                      </Box>
                      <BotaoIcone
                        rotulo={`Salvar rótulo de ${item.codigo}`}
                        variante="secundario"
                        icone={<CheckRoundedIcon />}
                        onClick={() => salvarRotuloLiberador(item.codigo)}
                        disabled={rotuloEdicaoLiberador.trim().length < 2}
                      />
                      <BotaoIcone
                        rotulo={`Cancelar edição de ${item.codigo}`}
                        variante="secundario"
                        icone={<CloseRoundedIcon />}
                        onClick={() => {
                          setEditandoLiberador(null);
                          setRotuloEdicaoLiberador("");
                        }}
                      />
                    </Box>
                  ) : (
                    <>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {item.rotulo}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: "text.secondary", overflowWrap: "anywhere" }}
                        >
                          {item.codigo}
                          {item.ativo ? "" : " · desativado"}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                        <Switch
                          checked={item.ativo}
                          slotProps={{
                            input: {
                              "aria-label": `${item.ativo ? "Desativar" : "Reativar"} ${item.codigo}`,
                            },
                          }}
                          onChange={() => alternarAtivoLiberador(item)}
                        />
                        <BotaoIcone
                          rotulo={`Editar rótulo de ${item.codigo}`}
                          variante="texto"
                          icone={<TuneRoundedIcon />}
                          onClick={() => {
                            setEditandoLiberador(item.codigo);
                            setRotuloEdicaoLiberador(item.rotulo);
                          }}
                        />
                        <BotaoIcone
                          rotulo={`Excluir ${item.codigo}`}
                          variante="texto"
                          icone={<DeleteOutlineRoundedIcon />}
                          onClick={() => setExcluirAlvoLiberador(item)}
                          sx={(tema) => ({ color: tema.vars.palette.falta.main })}
                        />
                      </Stack>
                    </>
                  )}
                </Box>
              ))}
            </Box>

            <DialogoConfirmacao
              aberto={excluirAlvoLiberador !== null}
              titulo={`Excluir ${excluirAlvoLiberador?.rotulo ?? ""}?`}
              descricao="A exclusão é aplicada ao salvar as configurações. Se houver saídas com este código, o servidor recusa o lote e nada é gravado. Com histórico, o caminho é desativar."
              rotuloConfirmar="Excluir"
              destrutivo
              onConfirmar={() => {
                if (excluirAlvoLiberador) removerLiberador(excluirAlvoLiberador);
              }}
              onCancelar={() => setExcluirAlvoLiberador(null)}
            />
          </Box>
        </Acordeao>
      </Box>
    </Stack>
  );

  const dados = (
    <Box data-secao="config-copia">
      <Acordeao
        titulo="Cópia de segurança"
        resumo={<Selo>Arquivo JSON</Selo>}
        aberto={abertoCopia}
        onChange={setAbertoCopia}
      >
        <Box
          role="region"
          aria-label="Cópia de segurança"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <Box sx={{ display: "grid", gap: 1, gridTemplateColumns: "1fr 1fr" }}>
            <Botao
              type="button"
              variante="contorno"
              icone={<FileDownloadRoundedIcon />}
              onClick={() => setDownloadAberto(true)}
              disabled={importando}
              sx={{ minHeight: 96, flexDirection: "column", gap: 1 }}
            >
              Baixar cópia
            </Botao>
            <Botao
              type="button"
              variante="contorno"
              icone={<FileUploadRoundedIcon />}
              onClick={() => setConfirmarImportacao(true)}
              disabled={importando}
              sx={{ minHeight: 96, flexDirection: "column", gap: 1 }}
            >
              Importar cópia
            </Botao>
          </Box>
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
          <Acordeao
            titulo="Ajuda"
            nivelTitulo="h4"
            resumo={
              <Typography
                component="span"
                variant="body2"
                sx={{ display: "flex", alignItems: "center", gap: 1 }}
              >
                <HelpOutlineRoundedIcon fontSize="inherit" aria-hidden="true" />O que a importação
                altera
              </Typography>
            }
          >
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              A importação adiciona dados ausentes e preserva os existentes. Chaves do FrequenciBI
              precisam ser geradas novamente.
            </Typography>
          </Acordeao>
          {erroCopia ? (
            <AlertaCompacto variante="dados_invalidos" descricao={erroCopia} tamanho="linha" />
          ) : null}
          {resultado ? (
            <Box
              role="status"
              sx={(tema) => ({
                paddingX: 2,
                paddingY: 1.5,
                borderRadius: 2,
                backgroundColor: `color-mix(in srgb, ${tema.vars.palette.text.primary} 6%, transparent)`,
              })}
            >
              <Typography variant="body2">
                {resultado.adicionadas}{" "}
                {resultado.adicionadas === 1 ? "registro adicionado" : "registros adicionados"},{" "}
                {resultado.identicas}{" "}
                {resultado.identicas === 1 ? "já era igual" : "já eram iguais"} e{" "}
                {resultado.conflitos}{" "}
                {resultado.conflitos === 1 ? "conflito mantido" : "conflitos mantidos"}.
              </Typography>
              <Typography variant="caption" sx={{ display: "block", marginTop: 1 }}>
                Chaves do FrequenciBI não são restauradas. Gere novas chaves na Gestão quando
                necessário.
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Acordeao>
    </Box>
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

  const itensEscola = [
    { valor: "geral" as const, rotulo: "Geral", icone: <TuneRoundedIcon />, conteudo: recursos },
    {
      valor: "frequencia" as const,
      rotulo: "Frequência",
      icone: <InsightsRoundedIcon />,
      conteudo: frequencia,
    },
    {
      valor: "calendario" as const,
      rotulo: "Calendário",
      icone: <CalendarMonthRoundedIcon />,
      conteudo: calendario,
    },
    {
      valor: "cadastros" as const,
      rotulo: "Cadastros",
      icone: <AssignmentRoundedIcon />,
      conteudo: cadastros,
    },
  ];

  const itensAcesso = [
    {
      valor: "diretores" as const,
      rotulo: "Diretores",
      icone: <ShieldRoundedIcon />,
      conteudo: <SecaoAcessoDiretores parametros={atual.acesso} onMudar={mutarAcesso} />,
    },
    {
      valor: "notificacoes" as const,
      rotulo: "Notificações",
      icone: <NotificationsRoundedIcon />,
      conteudo: <SecaoNotificacoes configuracao={atual.notificacoes} onMudar={mutarNotificacoes} />,
    },
    {
      valor: "bi" as const,
      rotulo: "FrequenciBI",
      icone: <InsightsRoundedIcon />,
      conteudo: (
        <SecaoChavesBi
          series={series}
          turmas={turmas}
          chaves={atual.chavesBi}
          onMudar={(lista: ChaveBiDesejada[]) => mutarChaves(lista)}
        />
      ),
    },
  ];

  const itensHorarios = [
    {
      valor: "aulas" as const,
      rotulo: "Aulas",
      icone: <ScheduleRoundedIcon />,
      conteudo: (
        <VistaHorarios
          turmas={turmas}
          diaCorrente={diaCorrente}
          fuso={fuso}
          editavel
          onMudanca={onHorariosMudaram}
          onPendencia={onPendenciaHorarios}
        />
      ),
    },
    {
      valor: "almoco" as const,
      rotulo: "Almoço",
      icone: <RestaurantRoundedIcon />,
      conteudo: (
        <SecaoOrdemAlmoco
          turmas={turmas}
          dias={atual.ordemAlmoco}
          onMudar={mutarOrdem}
          onCopiarParaTodos={(_dia, itens) => {
            for (const valor of DIAS_ORDEM_ALMOCO) mutarOrdem(valor, itens);
          }}
        />
      ),
    },
    {
      valor: "provas" as const,
      rotulo: "Provas",
      icone: <EventRepeatRoundedIcon />,
      conteudo: <SecaoProvasBimestrais turmas={turmas} diaCorrente={diaCorrente} />,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        alignItems: "start",
        minWidth: 0,
        gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "208px minmax(0, 1fr)" },
      }}
    >
      {erro && !confirmarSalvar ? (
        <Box sx={{ gridColumn: "1 / -1" }}>
          <AlertaCompacto
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
        </Box>
      ) : null}

      <Box
        component="nav"
        aria-label="Categorias de configurações"
        sx={(tema) => ({
          display: "grid",
          gap: 1,
          padding: 1,
          borderRadius: 2,
          border: `1px solid ${tema.vars.palette.divider}`,
          backgroundColor: tema.vars.palette.background.paper,
          gridTemplateColumns: { xs: "1fr 1fr", lg: "1fr" },
          alignSelf: "start",
        })}
      >
        {CATEGORIAS.map(({ valor, rotulo, icone: Icone }) => (
          <Botao
            key={valor}
            id={`categoria-config-${valor}`}
            type="button"
            variante={categoria === valor ? "secundario" : "texto"}
            aria-pressed={categoria === valor}
            aria-controls={`config-grupo-${valor}`}
            icone={<Icone />}
            onClick={() => {
              setCategoria(valor);
              if (valor === "horarios") setHorariosAbertos(true);
            }}
            sx={{
              minHeight: 56,
              justifyContent: "flex-start",
              textAlign: "left",
              whiteSpace: "normal",
              paddingX: 1.5,
            }}
          >
            {rotulo}
          </Botao>
        ))}
      </Box>

      <Box sx={{ minWidth: 0, paddingBottom: 12 }}>
        <Box
          component="section"
          id="config-grupo-escola"
          aria-labelledby="categoria-config-escola"
          hidden={categoria !== "escola"}
          inert={categoria !== "escola"}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          <Abas<AcaoEscola>
            itens={itensEscola}
            ativo={acaoEscola}
            onChange={setAcaoEscola}
            rotuloAcessivel="Ações da escola"
            variant="scrollable"
            dataPager="config-escola"
          />
        </Box>
        <Box
          component="section"
          id="config-grupo-horarios"
          aria-labelledby="categoria-config-horarios"
          hidden={categoria !== "horarios"}
          inert={categoria !== "horarios"}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          {horariosAbertos ? (
            <Abas<AcaoHorarios>
              itens={itensHorarios}
              ativo={acaoHorarios}
              onChange={setAcaoHorarios}
              rotuloAcessivel="Ações dos horários"
              variant="scrollable"
              dataPager="config-horarios"
            />
          ) : null}
        </Box>
        <Box
          component="section"
          id="config-grupo-planilhas"
          aria-labelledby="categoria-config-planilhas"
          hidden={categoria !== "planilhas"}
          inert={categoria !== "planilhas"}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
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
        </Box>
        <Box
          component="section"
          id="config-grupo-acesso"
          aria-labelledby="categoria-config-acesso"
          hidden={categoria !== "acesso"}
          inert={categoria !== "acesso"}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          <Abas<AcaoAcesso>
            itens={itensAcesso}
            ativo={acaoAcesso}
            onChange={setAcaoAcesso}
            rotuloAcessivel="Ações de acesso e avisos"
            variant="scrollable"
            dataPager="config-acesso"
          />
        </Box>
        <Box
          component="section"
          id="config-grupo-dados"
          aria-labelledby="categoria-config-dados"
          hidden={categoria !== "dados"}
          inert={categoria !== "dados"}
          sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
        >
          {dados}
        </Box>
      </Box>

      {alterado ? (
        <Box
          role="region"
          aria-label="Salvar configurações"
          data-rodape-configuracoes=""
          sx={{
            gridColumn: "1 / -1",
            position: "sticky",
            bottom: "max(8px, env(safe-area-inset-bottom))",
            zIndex: 20,
            width: "fit-content",
            maxWidth: "100%",
            mx: { xs: "auto", lg: 0 },
            ml: { lg: "auto" },
            borderRadius: 4,
            border: 1,
            borderColor: "divider",
            boxShadow: 3,
            backgroundColor: "background.paper",
          }}
        >
          <PainelAcoes
            rotulo="Salvar configurações"
            sx={{
              padding: 1,
              paddingBottom: 1,
              backgroundColor: "transparent",
              borderTop: 0,
              border: 0,
              gap: 1,
            }}
          >
            <Typography
              variant="caption"
              aria-live="polite"
              title={`Alterações não salvas em ${secoesAlteradas.length} ${
                secoesAlteradas.length === 1 ? "seção" : "seções"
              }`}
              sx={{
                minWidth: 0,
                maxWidth: { xs: 96, sm: 192 },
                paddingX: 1,
                color: "text.secondary",
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                Não salvo
              </Box>
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Alterações não salvas em {secoesAlteradas.length}{" "}
                {secoesAlteradas.length === 1 ? "seção" : "seções"}
              </Box>
            </Typography>
            <Botao
              type="button"
              variante="texto"
              aria-label="Descartar"
              onClick={() => setConfirmarDescartar(true)}
              disabled={salvando}
              icone={<RestartAltRoundedIcon />}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Descartar
              </Box>
            </Botao>
            <Botao
              type="button"
              variante="secundario"
              aria-label="Salvar configurações"
              onClick={() => {
                setSenhaBi("");
                setConfirmarSalvar(true);
              }}
              disabled={salvando}
              carregando={salvando}
              icone={<SaveRoundedIcon />}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Salvar configurações
              </Box>
              <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                Salvar
              </Box>
            </Botao>
          </PainelAcoes>
        </Box>
      ) : null}

      <DialogoConfirmacao
        aberto={confirmarSalvar}
        titulo="Salvar configurações?"
        descricao={
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="body2">
              As alterações valem para toda a escola e são gravadas de uma vez. Se outra pessoa
              tiver mudado alguma seção, nada é gravado.
            </Typography>
            <Box
              component="ul"
              sx={{ display: "flex", flexDirection: "column", gap: 1, margin: 0 }}
            >
              {secoesAlteradas.map((secao) => (
                <Box component="li" key={secao.chave}>
                  <Typography variant="subtitle2">{secao.rotulo}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {resumoDaSecao(secao.chave)}
                  </Typography>
                </Box>
              ))}
            </Box>
            {precisaSenhaBi ? (
              <Campo
                id="config-senha-bi"
                rotulo="Senha do administrador"
                descricao="A senha confirma a criação, a substituição ou a revogação das chaves do BI."
              >
                <CampoSenha
                  id="config-senha-bi"
                  autoComplete="current-password"
                  valor={senhaBi}
                  onValor={setSenhaBi}
                />
              </Campo>
            ) : null}
            {erro ? (
              <AlertaCompacto
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
            ) : null}
          </Box>
        }
        rotuloCancelar="Continuar revisando"
        rotuloConfirmar="Salvar configurações"
        operacaoEmAndamento={salvando}
        onConfirmar={() => void concluirSalvamento()}
        onCancelar={() => setConfirmarSalvar(false)}
      />

      <DialogoConfirmacao
        aberto={confirmarDescartar}
        titulo="Descartar alterações?"
        descricao="Todas as seções voltam ao estado salvo, inclusive catálogos, calendário e chaves."
        rotuloCancelar="Continuar editando"
        rotuloConfirmar="Descartar"
        destrutivo
        onConfirmar={() => {
          descartar();
          setConfirmarDescartar(false);
        }}
        onCancelar={() => setConfirmarDescartar(false)}
      />

      <DialogoConfirmacao
        aberto={confirmarImportacao}
        titulo="Importar cópia?"
        descricao="O arquivo é mesclado ao banco: registros que já existem são mantidos e apenas os que faltam são adicionados. Confira o resultado depois da importação."
        rotuloConfirmar="Escolher arquivo"
        onConfirmar={() => {
          setConfirmarImportacao(false);
          arquivoRef.current?.click();
        }}
        onCancelar={() => setConfirmarImportacao(false)}
      />

      <Dialogo
        aberto={segredosBi.length > 0}
        onFechar={() => setSegredosBi([])}
        titulo="Guarde as chaves do BI"
        descricao="Elas aparecem apenas agora e dão acesso a dados pessoais. Não as inclua em links."
      >
        <Stack spacing={2}>
          {segredosBi.map((item) => (
            <Box key={item.id}>
              <CampoTexto
                id={`segredo-bi-${item.id}`}
                valor={item.segredo}
                onValor={() => {}}
                readOnly
                autoComplete="off"
                ariaLabel={`Chave gerada para ${item.rotulo}`}
              />
              <Typography variant="caption" sx={{ display: "block", marginTop: 0.5 }}>
                {item.rotulo}
              </Typography>
              <Botao
                type="button"
                variante="contorno"
                tamanho="pequeno"
                sx={{ justifySelf: "flex-start", marginTop: 1 }}
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
              </Botao>
            </Box>
          ))}
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Botao variante="secundario" onClick={() => setSegredosBi([])}>
              Já guardei
            </Botao>
          </Box>
        </Stack>
      </Dialogo>

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
    </Box>
  );
}

const ESTILO_SOMENTE_LEITOR = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
