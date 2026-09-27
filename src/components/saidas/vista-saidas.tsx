"use client";

// Saiu mais cedo: registro da saída antecipada, saídas do dia por turma e
// relatório semanal por aluno. Separado da chamada.
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type { Aluno, JustificativaConfigurada, SaidaAntecipada, Turma } from "@/domain/frequencia";
import {
  diaDaSemanaIso,
  diaSeguinte,
  ehMomentoDeAula,
  horaNoFuso,
  JUSTIFICATIVA_OUTROS,
  LIMITE_TEXTO_SAIDA,
  MOMENTOS_SAIDA,
  normalizar,
  partesJustificativaSaida,
  RESPONSAVEIS_LIBERACAO,
  rotuloDiaSemana,
  rotuloMomento,
} from "@/domain/frequencia";
import { relatorioSaidas } from "@/domain/relatorios";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import DialogoEnvioSaidas, {
  useEstadoPlanilhaSaidas,
} from "@/components/saidas/dialogo-envio-saidas";

interface Props {
  diaCorrente: string;
  fuso: string;
  mes: string;
  turmas: Turma[];
  alunos: Aluno[];
  catalogoJustificativas: JustificativaConfigurada[];
  saidas: SaidaAntecipada[];
  onSaidasMudaram: (mes: string) => Promise<void>;
  /** A vista é aquecida em segundo plano; só busca o estado quando visível. */
  ativo: boolean;
}

type FormaJustificativa = "texto" | "catalogo";

export default function VistaSaidas({
  diaCorrente,
  fuso,
  mes,
  turmas,
  alunos,
  catalogoJustificativas,
  saidas,
  onSaidasMudaram,
  ativo,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [momento, setMomento] = useState("");
  const [formaJustificativa, setFormaJustificativa] = useState<FormaJustificativa>("catalogo");
  const [justificativa, setJustificativa] = useState("");
  const [texto, setTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [responsavelCodigo, setResponsavelCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [doDia, setDoDia] = useState<SaidaAntecipada[] | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [recarregarDia, setRecarregarDia] = useState(0);
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);
  const [saidaRemover, setSaidaRemover] = useState<SaidaAntecipada | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const [mesEnvio, setMesEnvio] = useState(diaCorrente.slice(0, 7));
  const { estado: estadoPlanilha, recarregar: recarregarPlanilha } = useEstadoPlanilhaSaidas();

  // A vista é aquecida em segundo plano e pode montar antes de a planilha ser
  // configurada; ao ficar visível, o estado da integração é relido.
  useEffect(() => {
    if (ativo) void recarregarPlanilha();
  }, [ativo, recarregarPlanilha]);

  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [diaRelatorio, setDiaRelatorio] = useState(diaCorrente);
  const [turmaRelatorio, setTurmaRelatorio] = useState("");
  const [buscaRelatorio, setBuscaRelatorio] = useState("");
  const [filtroRelatorio, setFiltroRelatorio] = useState<"todas" | "repetidas">("todas");
  const [saidasSemana, setSaidasSemana] = useState<SaidaAntecipada[] | null>(null);

  const { executando: carregandoRelatorio, executar: carregarRelatorio } = useAcaoUnica(
    async () => {
      try {
        const dados = await pedir<{ saidas: SaidaAntecipada[] }>(
          `/api/saidas?de=${segundaRelatorio}&ate=${domingoRelatorio}`,
        );
        setSaidasSemana(dados.saidas);
      } catch (excecao) {
        toast.error(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar o relatório.",
        );
        setSaidasSemana([]);
      }
    },
  );

  const { chaveAtiva: removendoId, executar: executarRemocao } = useAcoesPorChave();

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const opcoesJustificativa = useMemo(
    () =>
      catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: `${item.codigo} · ${item.rotulo}` })),
    [catalogoJustificativas],
  );

  const alunosPorId = useMemo(() => new Map(alunos.map((aluno) => [aluno.id, aluno])), [alunos]);

  const compartilhado = dia.startsWith(mes);
  const duranteAula = ehMomentoDeAula(momento);

  useEffect(() => {
    if (compartilhado) {
      setDoDia(null);
      return;
    }
    let viva = true;
    setCarregandoDia(true);
    pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${dia}`)
      .then((dados) => {
        if (viva) setDoDia(dados.saidas);
      })
      .catch((excecao: unknown) => {
        if (viva) {
          setErro(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar as saídas.",
          );
          setErroVariante(estadoDeErro(excecao));
        }
      })
      .finally(() => {
        if (viva) setCarregandoDia(false);
      });
    return () => {
      viva = false;
    };
  }, [compartilhado, dia, recarregarDia]);

  const saidasDoDia = useMemo(
    () => (compartilhado ? saidas.filter((saida) => saida.dia === dia) : (doDia ?? [])),
    [compartilhado, dia, saidas, doDia],
  );

  const turmasComAlunos = useMemo(
    () =>
      turmas.filter((turma) => alunos.some((aluno) => aluno.ativo && aluno.turmaId === turma.id)),
    [alunos, turmas],
  );

  const alunosFiltrados = useMemo(() => {
    return alunos
      .filter((aluno) => aluno.ativo)
      .filter((aluno) => (turmaFiltro ? aluno.turmaId === turmaFiltro : true))
      .sort(
        (a, b) =>
          rotuloTurma(a.turmaId).localeCompare(rotuloTurma(b.turmaId), "pt-BR") ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [alunos, turmaFiltro, rotuloTurma]);

  const gruposPorTurma = useMemo(() => {
    const grupos = new Map<string, { rotulo: string; saidas: SaidaAntecipada[] }>();
    for (const saida of saidasDoDia) {
      const aluno = alunosPorId.get(saida.alunoId);
      const chave = aluno?.turmaOriginalId ?? "sem-turma";
      const grupo = grupos.get(chave) ?? { rotulo: rotuloTurma(chave), saidas: [] };
      grupo.saidas.push(saida);
      grupos.set(chave, grupo);
    }
    return [...grupos.entries()].sort((a, b) => b[1].saidas.length - a[1].saidas.length);
  }, [alunosPorId, saidasDoDia, rotuloTurma]);

  const segundaRelatorio = diaSeguinte(diaRelatorio, -(diaDaSemanaIso(diaRelatorio) - 1));
  const domingoRelatorio = diaSeguinte(segundaRelatorio, 6);

  const relatorio = useMemo(() => {
    if (saidasSemana === null) return [];
    const termo = normalizar(buscaRelatorio);
    const termos = termo.split(" ").filter(Boolean);
    return relatorioSaidas(saidasSemana, filtroRelatorio).filter((item) => {
      const aluno = alunosPorId.get(item.alunoId);
      if (turmaRelatorio && aluno?.turmaOriginalId !== turmaRelatorio) return false;
      if (termos.length === 0) return true;
      const alvo = normalizar(aluno?.nome ?? "");
      return termos.every((parte) => alvo.includes(parte));
    });
  }, [saidasSemana, filtroRelatorio, buscaRelatorio, turmaRelatorio, alunosPorId]);

  function textoDaSaida(saida: SaidaAntecipada): string {
    const partes = partesJustificativaSaida(saida, catalogoJustificativas);
    return `${rotuloMomento(saida.momento)} · ${partes.motivo}${
      partes.complemento ? ` · ${partes.complemento}` : ""
    }`;
  }

  async function registrar() {
    if (enviando) return;
    if (!alunoId || !momento || !responsavelCodigo) {
      setErro("Escolha o aluno, o momento da saída e quem liberou.");
      return;
    }
    if (formaJustificativa === "catalogo" && !justificativa) {
      setErro("Escolha o tipo de justificativa.");
      return;
    }
    if (formaJustificativa === "texto" && texto.trim() === "") {
      setErro("Escreva a justificativa em poucas palavras.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ saida: SaidaAntecipada }>(
        "/api/saidas",
        corpoJson({
          alunoId,
          dia,
          momento,
          justificativa: formaJustificativa === "catalogo" ? justificativa : undefined,
          texto:
            formaJustificativa === "texto"
              ? texto.trim()
              : duranteAula && texto.trim() !== ""
                ? texto.trim()
                : undefined,
          observacao:
            formaJustificativa === "catalogo" &&
            !duranteAula &&
            justificativa === JUSTIFICATIVA_OUTROS &&
            observacao.trim() !== ""
              ? observacao
              : undefined,
          liberadoPorCodigo: responsavelCodigo,
        }),
      );
      avisarSucesso(
        "Saída registrada.",
        "O registro aparece em Saídas, no dia de hoje, e nos relatórios.",
      );
      setAlunoId("");
      setMomento("");
      setFormaJustificativa("catalogo");
      setJustificativa("");
      setTexto("");
      setObservacao("");
      setResponsavelCodigo("");
      if (compartilhado) {
        await onSaidasMudaram(dia.slice(0, 7));
      } else {
        setRecarregarDia((valor) => valor + 1);
      }
      if (relatorioAberto) void carregarRelatorio();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível registrar a saída.";
      setErro(mensagem);
      setErroVariante(estadoDeErro(excecao));
      if (!(excecao instanceof ErroApi && excecao.status === 401)) toast.error(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  function remover(saida: SaidaAntecipada) {
    setSaidaRemover(saida);
  }

  function confirmarRemocao() {
    if (!saidaRemover) return;
    const saida = saidaRemover;
    setSaidaRemover(null);
    void executarRemocao(saida.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/saidas/${saida.id}`, { method: "DELETE" });
        toast.success("Saída removida.");
        if (compartilhado) {
          await onSaidasMudaram(dia.slice(0, 7));
        } else {
          setRecarregarDia((valor) => valor + 1);
        }
        if (relatorioAberto) void carregarRelatorio();
      } catch (excecao) {
        if (!(excecao instanceof ErroApi && excecao.status === 401)) {
          toast.error(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível remover a saída.",
          );
        }
      }
    });
  }

  const rotuloDia = dia.split("-").reverse().join("/");

  return (
    <section aria-label="Saídas antecipadas" className="flex flex-col gap-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <DoorOpen size={20} aria-hidden="true" />
            Saiu mais cedo
          </h1>
          <p className="text-muted-foreground text-sm">
            Registro separado da chamada. A presença ou falta do dia permanece como foi marcada.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-lg"
          disabled={!estadoPlanilha?.podeEnviar || !estadoPlanilha.configurada}
          title={
            estadoPlanilha?.configurada
              ? "Enviar as saídas do mês para o Google Planilhas"
              : "Configure a planilha de saídas na Gestão"
          }
          onClick={() => setEnvioAberto(true)}
        >
          <FileSpreadsheet size={16} />
          <span className="hidden sm:inline">Enviar para a planilha</span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label="Dia anterior"
          onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-saidas"
            modo="dia"
            valor={dia}
            max={diaCorrente}
            rotuloAcessivel="Data da saída"
            rotulo={rotuloDia}
            detalhe={rotuloDiaSemana(dia)}
            onValor={setDia}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0 rounded-lg"
          aria-label="Dia seguinte"
          disabled={dia >= diaCorrente}
          onClick={() => setDia((atual) => diaSeguinte(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      <form
        className="bg-card flex flex-col gap-3 rounded-lg border p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void registrar();
        }}
        noValidate
      >
        <h2 className="font-medium">Registro</h2>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="saida-turma">Turma</Label>
          <Selecionar
            id="saida-turma"
            value={turmaFiltro}
            onValueChange={setTurmaFiltro}
            placeholder="Todas as turmas"
            opcoes={[
              { valor: "", rotulo: "Todas as turmas" },
              ...turmasComAlunos.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saida-aluno">Aluno</Label>
          <Selecionar
            id="saida-aluno"
            value={alunoId}
            onValueChange={setAlunoId}
            buscavel
            placeholder="Selecione o aluno"
            opcoes={alunosFiltrados.map((aluno) => ({
              valor: aluno.id,
              rotulo: `${aluno.nome} · ${rotuloTurma(aluno.turmaId)}`,
            }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="saida-momento">Momento da saída</Label>
          <Selecionar
            id="saida-momento"
            value={momento}
            onValueChange={setMomento}
            placeholder="Selecione a aula ou pausa"
            opcoes={MOMENTOS_SAIDA.map((item) => ({
              valor: item.codigo,
              rotulo: item.rotulo,
            }))}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Justificativa</legend>
          <div
            role="radiogroup"
            aria-label="Forma da justificativa"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={formaJustificativa === "texto"}
              onClick={() => {
                setFormaJustificativa("texto");
                setJustificativa("");
                setObservacao("");
              }}
              className="aria-[checked=true]:border-primary aria-[checked=true]:bg-primary aria-[checked=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
            >
              Escrever em poucas palavras
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={formaJustificativa === "catalogo"}
              onClick={() => {
                setFormaJustificativa("catalogo");
                setTexto("");
              }}
              className="aria-[checked=true]:border-primary aria-[checked=true]:bg-primary aria-[checked=true]:text-primary-foreground pressionavel flex h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
            >
              Tipos de justificativa
            </button>
          </div>
          {formaJustificativa === "texto" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="saida-texto">Texto da justificativa</Label>
                <span className="text-muted-foreground numerais-tabulares text-xs">
                  {texto.length}/{LIMITE_TEXTO_SAIDA}
                </span>
              </div>
              <Input
                id="saida-texto"
                value={texto}
                maxLength={LIMITE_TEXTO_SAIDA}
                onChange={(evento) => setTexto(evento.target.value)}
                placeholder="Escreva a justificativa em poucas palavras"
                className="h-11"
              />
              <p className="text-muted-foreground text-xs">
                Até {LIMITE_TEXTO_SAIDA} caracteres. Este texto é a justificativa da saída.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="saida-justificativa">Tipo</Label>
                <Selecionar
                  id="saida-justificativa"
                  value={justificativa}
                  onValueChange={setJustificativa}
                  placeholder="Selecione a justificativa"
                  opcoes={opcoesJustificativa}
                />
              </div>
              {duranteAula ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="saida-texto">Texto da justificativa</Label>
                    <span className="text-muted-foreground numerais-tabulares text-xs">
                      {texto.length}/{LIMITE_TEXTO_SAIDA}
                    </span>
                  </div>
                  <Input
                    id="saida-texto"
                    value={texto}
                    maxLength={LIMITE_TEXTO_SAIDA}
                    onChange={(evento) => setTexto(evento.target.value)}
                    placeholder="Opcional: descreva a saída durante a aula"
                    className="h-11"
                  />
                  <p className="text-muted-foreground text-xs">
                    Opcional, até {LIMITE_TEXTO_SAIDA} caracteres. Aparece nos relatórios.
                  </p>
                </div>
              ) : justificativa === JUSTIFICATIVA_OUTROS ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="saida-observacao">Observação</Label>
                  <Input
                    id="saida-observacao"
                    value={observacao}
                    maxLength={200}
                    onChange={(evento) => setObservacao(evento.target.value)}
                    placeholder="Descreva brevemente o motivo"
                    className="h-11"
                  />
                </div>
              ) : null}
            </>
          )}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saida-responsavel">Responsável pela liberação</Label>
          <Selecionar
            id="saida-responsavel"
            value={responsavelCodigo}
            onValueChange={setResponsavelCodigo}
            placeholder="Selecione quem liberou"
            opcoes={RESPONSAVEIS_LIBERACAO.map((responsavel) => ({
              valor: responsavel.codigo,
              rotulo: responsavel.rotulo,
            }))}
          />
        </div>
        {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full rounded-lg px-6 sm:w-auto"
          disabled={enviando}
        >
          {enviando && <LoaderCircle size={16} className="animate-spin" />}
          Registrar saída
        </Button>
      </form>

      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Saídas por turma</h2>
          <span className="text-muted-foreground text-xs">
            {saidasDoDia.length} {saidasDoDia.length === 1 ? "saída" : "saídas"} em {rotuloDia}
          </span>
        </div>
        {carregandoDia ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Carregando saídas...
          </p>
        ) : gruposPorTurma.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma saída registrada neste dia.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gruposPorTurma.map(([chave, grupo]) => {
              const aberto = turmaAberta === chave;
              return (
                <li key={chave} className="overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    aria-expanded={aberto}
                    onClick={() => setTurmaAberta((atual) => (atual === chave ? null : chave))}
                    className="hover:bg-secondary/60 active:bg-secondary/80 pressionavel flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm transition-colors"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{grupo.rotulo}</span>
                    <span className="numerais-tabulares text-muted-foreground text-xs">
                      {grupo.saidas.length} {grupo.saidas.length === 1 ? "aluno" : "alunos"}
                    </span>
                  </button>
                  {aberto && (
                    <ul className="divide-y border-t">
                      {grupo.saidas.map((saida) => {
                        const aluno = alunosPorId.get(saida.alunoId);
                        return (
                          <li key={saida.id} className="flex items-start gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {aluno?.nome ?? "Aluno"}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {textoDaSaida(saida)}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                Liberado por {saida.liberadoPorNome ?? "registro anterior"}
                                {saida.criadoEm ? ` às ${horaNoFuso(saida.criadoEm, fuso)}` : ""}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-falta-texto h-9 shrink-0 rounded-lg px-2"
                              onClick={() => void remover(saida)}
                              disabled={removendoId === saida.id}
                            >
                              Remover
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
        <button
          type="button"
          aria-expanded={relatorioAberto}
          onClick={() => {
            const abrir = !relatorioAberto;
            setRelatorioAberto(abrir);
            if (abrir && saidasSemana === null) void carregarRelatorio();
          }}
          className="hover:bg-secondary/60 active:bg-secondary/80 pressionavel flex min-h-11 items-center justify-between gap-2 rounded-md text-left font-medium transition-colors"
        >
          <span>Relatório por aluno</span>
          <span className="text-muted-foreground text-xs">
            {relatorioAberto ? "Fechar" : "Abrir"}
          </span>
        </button>
        {relatorioAberto && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Semana de</Label>
                <SeletorPeriodo
                  id="saida-relatorio-dia"
                  modo="dia"
                  valor={diaRelatorio}
                  max={diaCorrente}
                  rotuloAcessivel="Data da semana do relatório"
                  rotulo={diaRelatorio.split("-").reverse().join("/")}
                  onValor={(valor) => {
                    setDiaRelatorio(valor);
                    setSaidasSemana(null);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="saida-relatorio-turma">Turma</Label>
                <Selecionar
                  id="saida-relatorio-turma"
                  value={turmaRelatorio}
                  onValueChange={setTurmaRelatorio}
                  placeholder="Todas as turmas"
                  opcoes={[
                    { valor: "", rotulo: "Todas as turmas" },
                    ...turmasComAlunos.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
                  ]}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="saida-relatorio-busca">Buscar aluno</Label>
                <BarraBusca
                  id="saida-relatorio-busca"
                  valor={buscaRelatorio}
                  onValor={setBuscaRelatorio}
                  placeholder="Digite o nome"
                  className="rounded-lg border-0 px-0 py-0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="saida-relatorio-filtro">Mostrar</Label>
                <Selecionar
                  id="saida-relatorio-filtro"
                  value={filtroRelatorio}
                  onValueChange={(valor) =>
                    setFiltroRelatorio(valor === "repetidas" ? "repetidas" : "todas")
                  }
                  opcoes={[
                    { valor: "todas", rotulo: "Todos com saídas" },
                    { valor: "repetidas", rotulo: "Duas ou mais na semana" },
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-lg"
                onClick={() => void carregarRelatorio()}
                disabled={carregandoRelatorio}
              >
                {carregandoRelatorio ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Atualizar relatório
              </Button>
              <span className="text-muted-foreground numerais-tabulares text-xs">
                {segundaRelatorio.split("-").reverse().join("/")} a{" "}
                {domingoRelatorio.split("-").reverse().join("/")}
              </span>
            </div>
            {saidasSemana === null ? (
              <p className="text-muted-foreground text-sm">Carregando relatório...</p>
            ) : relatorio.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma saída encontrada para esta semana e estes filtros.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {relatorio.map((item) => {
                  const aluno = alunosPorId.get(item.alunoId);
                  return (
                    <li key={item.alunoId} className="overflow-hidden rounded-lg border">
                      <div className="bg-secondary/40 flex items-center justify-between gap-2 px-3 py-2">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {aluno?.nome ?? "Aluno"}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {rotuloTurma(aluno?.turmaOriginalId ?? "")} · {item.saidas.length}{" "}
                          {item.saidas.length === 1 ? "saída" : "saídas"}
                        </span>
                      </div>
                      <ul className="divide-y">
                        {item.saidas.map((saida) => (
                          <li key={saida.id} className="px-3 py-2">
                            <p className="numerais-tabulares text-sm font-medium">
                              {saida.dia.split("-").reverse().join("/")}
                            </p>
                            <p className="text-muted-foreground text-xs">{textoDaSaida(saida)}</p>
                            <p className="text-muted-foreground text-xs">
                              Liberado por {saida.liberadoPorNome ?? "registro anterior"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      <AlertDialog
        open={saidaRemover !== null}
        onOpenChange={(aberto) => !aberto && setSaidaRemover(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta saída?</AlertDialogTitle>
            <AlertDialogDescription>
              A saída de {alunosPorId.get(saidaRemover?.alunoId ?? "")?.nome ?? "aluno"} em{" "}
              {saidaRemover?.dia.split("-").reverse().join("/") ?? ""} sai da lista do dia e dos
              relatórios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-falta text-falta-foreground hover:bg-falta/90"
              onClick={confirmarRemocao}
              disabled={saidaRemover !== null && removendoId === saidaRemover.id}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DialogoEnvioSaidas
        aberto={envioAberto}
        onAbrir={setEnvioAberto}
        mes={mesEnvio}
        onMes={setMesEnvio}
        modoCompleto={estadoPlanilha?.modo === "completo"}
        aoConcluir={() => void recarregarPlanilha()}
      />
    </section>
  );
}
