"use client";

// Saiu mais cedo: registro da saída antecipada, saídas do dia por turma e
// relatório semanal por aluno. Separado da chamada.
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Aluno,
  JustificativaConfigurada,
  Responsavel,
  SaidaAntecipada,
  Turma,
} from "@/domain/frequencia";
import {
  diaDaSemanaIso,
  diaSeguinte,
  horaNoFuso,
  JUSTIFICATIVA_OUTROS,
  MOMENTOS_SAIDA,
  normalizar,
  rotuloDiaSemana,
  rotuloJustificativa,
  rotuloMomento,
} from "@/domain/frequencia";
import { relatorioSaidas } from "@/domain/relatorios";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";

interface Props {
  usuarioId: string;
  diaCorrente: string;
  fuso: string;
  mes: string;
  turmas: Turma[];
  alunos: Aluno[];
  responsaveis: Responsavel[];
  catalogoJustificativas: JustificativaConfigurada[];
  saidas: SaidaAntecipada[];
  onSaidasMudaram: (mes: string) => Promise<void>;
}

export default function VistaSaidas({
  usuarioId,
  diaCorrente,
  fuso,
  mes,
  turmas,
  alunos,
  responsaveis,
  catalogoJustificativas,
  saidas,
  onSaidasMudaram,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [momento, setMomento] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [observacao, setObservacao] = useState("");
  const [responsavelId, setResponsavelId] = useState(usuarioId);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [doDia, setDoDia] = useState<SaidaAntecipada[] | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [recarregarDia, setRecarregarDia] = useState(0);
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);

  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [diaRelatorio, setDiaRelatorio] = useState(diaCorrente);
  const [turmaRelatorio, setTurmaRelatorio] = useState("");
  const [buscaRelatorio, setBuscaRelatorio] = useState("");
  const [filtroRelatorio, setFiltroRelatorio] = useState<"todas" | "repetidas">("todas");
  const [saidasSemana, setSaidasSemana] = useState<SaidaAntecipada[] | null>(null);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);

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

  async function carregarRelatorio() {
    setCarregandoRelatorio(true);
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
    } finally {
      setCarregandoRelatorio(false);
    }
  }

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

  async function registrar() {
    if (enviando) return;
    if (!alunoId || !momento || !justificativa) {
      setErro("Escolha o aluno, o momento da saída e a justificativa.");
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
          justificativa,
          observacao: justificativa === JUSTIFICATIVA_OUTROS ? observacao : undefined,
          liberadoPorId: responsavelId,
        }),
      );
      toast.success("Saída registrada.");
      setAlunoId("");
      setMomento("");
      setJustificativa("");
      setObservacao("");
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
      toast.error(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  async function remover(saida: SaidaAntecipada) {
    const aluno = alunosPorId.get(saida.alunoId);
    const confirmar = window.confirm(
      `Remover a saída de ${aluno?.nome ?? "aluno"} em ${saida.dia.split("-").reverse().join("/")}?`,
    );
    if (!confirmar) return;
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
      toast.error(
        excecao instanceof ErroApi ? excecao.message : "Não foi possível remover a saída.",
      );
    }
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="saida-justificativa">Justificativa</Label>
            <Selecionar
              id="saida-justificativa"
              value={justificativa}
              onValueChange={setJustificativa}
              placeholder="Selecione a justificativa"
              opcoes={opcoesJustificativa}
            />
          </div>
        </div>
        {justificativa === JUSTIFICATIVA_OUTROS && (
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
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saida-responsavel">Responsável pela liberação</Label>
          <Selecionar
            id="saida-responsavel"
            value={responsavelId}
            onValueChange={setResponsavelId}
            opcoes={responsaveis.map((responsavel) => ({
              valor: responsavel.id,
              rotulo: `${responsavel.nome} · ${responsavel.papel === "ADMIN" ? "Direção" : "Coordenação"}`,
            }))}
          />
        </div>
        {erro && (
          <p
            role="alert"
            className="border-falta/40 bg-falta-fraca text-falta-texto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
          >
            <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            {erro}
          </p>
        )}
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
                    className="hover:bg-secondary/60 flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm transition-colors"
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
                                {rotuloMomento(saida.momento)} ·{" "}
                                {rotuloJustificativa(saida.justificativa, catalogoJustificativas)}
                                {saida.observacao ? ` · ${saida.observacao}` : ""}
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
          className="flex min-h-11 items-center justify-between gap-2 text-left font-medium"
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
                            <p className="text-muted-foreground text-xs">
                              {rotuloMomento(saida.momento)} ·{" "}
                              {rotuloJustificativa(saida.justificativa, catalogoJustificativas)}
                              {saida.observacao ? ` · ${saida.observacao}` : ""}
                            </p>
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
    </section>
  );
}
