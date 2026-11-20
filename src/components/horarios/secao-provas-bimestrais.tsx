"use client";

// Horário das provas bimestrais na Gestão: a administração cadastra as provas do período por turma,
// remove uma prova e encerra o período, que apaga o horário inteiro.
import { useEffect, useId, useMemo, useState } from "react";
import { CalendarClock, CalendarX, LoaderCircle, Plus, Trash2 } from "lucide-react";
import {
  diaDaSemanaIso,
  diaSeguinte,
  rotuloData,
  rotuloDataCurta,
  rotuloDiaSemana,
  type Turma,
} from "@/domain/frequencia";
import {
  LIMITE_DISCIPLINA_PROVA,
  problemaNaProva,
  provasPorDia,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";
import { corpoAlteracao, corpoJson, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import {
  avisarProvasBimestraisMudaram,
  ouvirProvasBimestraisMudaram,
} from "@/lib/eventos-provas-bimestrais";
import { useAcaoUnica } from "@/lib/use-acao-unica";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { AvisoCompacto } from "@/components/ui/tela-estado";

interface Props {
  turmas: Turma[];
  diaCorrente: string;
}

/** A mesma prova cadastrada para várias turmas aparece numa linha só. */
interface GrupoDeProva {
  chave: string;
  disciplina: string;
  inicio: string;
  fim: string;
  provas: ProvaBimestral[];
}

function agruparPorProva(provas: readonly ProvaBimestral[]): GrupoDeProva[] {
  const grupos = new Map<string, GrupoDeProva>();
  for (const prova of provas) {
    const chave = `${prova.inicio}|${prova.fim}|${prova.disciplina}`;
    const grupo = grupos.get(chave) ?? {
      chave,
      disciplina: prova.disciplina,
      inicio: prova.inicio,
      fim: prova.fim,
      provas: [],
    };
    grupo.provas.push(prova);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

function rotuloDoDia(dia: string): string {
  const nome = rotuloDiaSemana(dia);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${rotuloDataCurta(dia)}`;
}

function contarTurmas(quantidade: number): string {
  return quantidade === 1 ? "1 turma" : `${quantidade} turmas`;
}

export default function SecaoProvasBimestrais({ turmas, diaCorrente }: Props) {
  const base = useId();
  const [provas, setProvas] = useState<ProvaBimestral[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erroLeitura, setErroLeitura] = useState("");
  const [versao, setVersao] = useState(0);
  // No domingo, a data sugerida já é a segunda-feira.
  const [dia, setDia] = useState(() =>
    diaDaSemanaIso(diaCorrente) === 7 ? diaSeguinte(diaCorrente, 1) : diaCorrente,
  );
  const [inicio, setInicio] = useState("07:00");
  const [fim, setFim] = useState("09:00");
  const [disciplina, setDisciplina] = useState("");
  const [turmaIds, setTurmaIds] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [removendo, setRemovendo] = useState<{ dia: string; grupo: GrupoDeProva } | null>(null);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => ouvirProvasBimestraisMudaram(() => setVersao((atual) => atual + 1)), []);
  useEffect(() => {
    let atual = true;
    pedir<{ provas: ProvaBimestral[] }>("/api/provas-bimestrais")
      .then((dados) => {
        if (!atual) return;
        setProvas(dados.provas);
        setErroLeitura("");
      })
      .catch(() => {
        if (atual) setErroLeitura("Não foi possível ler o horário de provas.");
      })
      .finally(() => {
        if (atual) setCarregado(true);
      });
    return () => {
      atual = false;
    };
  }, [versao]);

  const series = useMemo(() => {
    const grupos = new Map<string, { id: string; nome: string; turmas: Turma[] }>();
    for (const turma of turmas) {
      const grupo = grupos.get(turma.serieId) ?? {
        id: turma.serieId,
        nome: turma.serieNome,
        turmas: [],
      };
      grupo.turmas.push(turma);
      grupos.set(turma.serieId, grupo);
    }
    return [...grupos.values()];
  }, [turmas]);
  const rotuloDe = useMemo(
    () => new Map(turmas.map((turma) => [turma.id, turma.rotulo])),
    [turmas],
  );
  const dias = provasPorDia(provas);

  function alternarTurmas(ids: string[], marcar: boolean) {
    setTurmaIds((atuais) =>
      marcar ? [...new Set([...atuais, ...ids])] : atuais.filter((id) => !ids.includes(id)),
    );
    setErro("");
  }

  function mudou() {
    setVersao((atual) => atual + 1);
    avisarProvasBimestraisMudaram();
  }

  const { executando: adicionando, executar: adicionar } = useAcaoUnica(async () => {
    const problema =
      turmaIds.length === 0
        ? "Escolha ao menos uma turma."
        : problemaNaProva({ dia, inicio, fim, disciplina }, diaCorrente);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    try {
      const { provas: criadas } = await pedir<{ provas: ProvaBimestral[] }>(
        "/api/provas-bimestrais",
        corpoJson({ turmaIds, dia, inicio, fim, disciplina: disciplina.trim() }),
      );
      avisarSucesso(
        "Prova adicionada.",
        `${disciplina.trim()} em ${rotuloData(dia)} para ${contarTurmas(criadas.length)}.`,
      );
      // Data e turmas ficam para a próxima prova do mesmo dia.
      setDisciplina("");
      setInicio(fim);
      mudou();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível adicionar a prova." });
    }
  });

  const { executando: removendoAgora, executar: remover } = useAcaoUnica(async () => {
    if (!removendo) return;
    try {
      for (const prova of removendo.grupo.provas) {
        await pedir(`/api/provas-bimestrais/${prova.id}`, corpoAlteracao("DELETE"));
      }
      avisarSucesso("Prova removida.");
      setRemovendo(null);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível remover a prova." });
    } finally {
      mudou();
    }
  });

  const { executando: encerrandoAgora, executar: encerrar } = useAcaoUnica(async () => {
    try {
      const { removidas } = await pedir<{ removidas: number }>(
        "/api/provas-bimestrais/encerrar",
        corpoJson({ confirmar: true }),
      );
      avisarSucesso(
        "Período de provas encerrado.",
        removidas === 1 ? "1 prova apagada." : `${removidas} provas apagadas.`,
      );
      setEncerrando(false);
      mudou();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível encerrar o período de provas." });
    }
  });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        O horário de provas vale só durante o período de provas. A aba Horários mostra a cada turma
        as provas de hoje em diante; datas passadas saem sozinhas, e Encerrar período de provas
        apaga o horário inteiro.
      </p>
      <form
        aria-label="Nova prova"
        className="superficie flex min-w-0 flex-col gap-3 p-3"
        onSubmit={(evento) => {
          evento.preventDefault();
          void adicionar();
        }}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${base}-dia`}>Data</Label>
            <SeletorPeriodo
              id={`${base}-dia`}
              modo="dia"
              valor={dia}
              min={diaCorrente}
              max="2199-12-31"
              semDomingo
              mostrarSelo={false}
              rotuloAcessivel="Data da prova"
              rotulo={rotuloData(dia)}
              disabled={adicionando}
              onValor={(valor) => {
                setDia(valor);
                setErro("");
              }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${base}-inicio`}>Início</Label>
            <SeletorHorario
              id={`${base}-inicio`}
              valor={inicio}
              rotuloAcessivel="Início da prova"
              disabled={adicionando}
              onValor={(valor) => {
                setInicio(valor);
                setErro("");
              }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${base}-fim`}>Fim</Label>
            <SeletorHorario
              id={`${base}-fim`}
              valor={fim}
              rotuloAcessivel="Fim da prova"
              disabled={adicionando}
              onValor={(valor) => {
                setFim(valor);
                setErro("");
              }}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${base}-disciplina`}>Disciplina</Label>
          <Input
            id={`${base}-disciplina`}
            value={disciplina}
            maxLength={LIMITE_DISCIPLINA_PROVA}
            placeholder="Ex.: Matemática"
            disabled={adicionando}
            onChange={(evento) => {
              setDisciplina(evento.target.value);
              setErro("");
            }}
          />
        </div>
        <fieldset disabled={adicionando} className="flex min-w-0 flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Turmas</legend>
          {series.map((serie) => {
            const ids = serie.turmas.map((turma) => turma.id);
            const marcadas = ids.filter((id) => turmaIds.includes(id)).length;
            return (
              <div key={serie.id} className="flex min-w-0 flex-col gap-2">
                <label className="faixa-toque flex min-h-11 items-center gap-3 rounded-lg px-1 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="accent-primary size-4 shrink-0"
                    aria-label={`Toda a ${serie.nome}`}
                    checked={marcadas === ids.length}
                    ref={(elemento) => {
                      if (elemento) elemento.indeterminate = marcadas > 0 && marcadas < ids.length;
                    }}
                    onChange={(evento) => alternarTurmas(ids, evento.target.checked)}
                  />
                  {serie.nome}
                </label>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
                  {serie.turmas.map((turma) => (
                    <label
                      key={turma.id}
                      className="faixa-toque bg-secondary/40 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary size-4 shrink-0"
                        checked={turmaIds.includes(turma.id)}
                        onChange={(evento) => alternarTurmas([turma.id], evento.target.checked)}
                      />
                      {turma.rotulo}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>
        {erro ? <AvisoCompacto variante="dados_invalidos" titulo={erro} tamanho="linha" /> : null}
        <Button type="submit" className="min-h-11 self-start" disabled={adicionando}>
          {adicionando ? (
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={16} aria-hidden="true" />
          )}
          {turmaIds.length > 1
            ? `Adicionar prova para ${contarTurmas(turmaIds.length)}`
            : "Adicionar prova"}
        </Button>
      </form>

      {erroLeitura ? (
        <AvisoCompacto variante="erro_interno" titulo={erroLeitura} tamanho="linha" />
      ) : null}
      {carregado && !erroLeitura && dias.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma prova cadastrada.</p>
      ) : null}
      {dias.length > 0 ? (
        <section aria-label="Provas cadastradas" className="superficie overflow-hidden">
          <h2 className="bg-secondary/50 flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <CalendarClock size={16} aria-hidden="true" className="shrink-0" />
            Provas cadastradas
          </h2>
          <ol className="divide-y">
            {dias.map((grupoDoDia) => (
              <li key={grupoDoDia.dia} className="flex flex-col gap-2 px-4 py-3">
                <h3 className="text-sm font-medium">{rotuloDoDia(grupoDoDia.dia)}</h3>
                <ul className="flex flex-col gap-2">
                  {agruparPorProva(grupoDoDia.provas).map((grupo) => (
                    <li key={grupo.chave} className="flex min-w-0 items-start gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">
                          {grupo.disciplina}
                          <span className="numerais-tabulares text-muted-foreground font-normal">
                            {" "}
                            · {grupo.inicio} às {grupo.fim}
                          </span>
                        </p>
                        <p className="text-muted-foreground text-xs break-words">
                          {grupo.provas
                            .map((prova) => rotuloDe.get(prova.turmaId) ?? "Turma")
                            .join(", ")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover a prova de ${grupo.disciplina} de ${rotuloDataCurta(grupoDoDia.dia)}`}
                        onClick={() => setRemovendo({ dia: grupoDoDia.dia, grupo })}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {dias.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="text-falta-texto min-h-11 self-start"
          onClick={() => setEncerrando(true)}
        >
          <CalendarX size={16} aria-hidden="true" />
          Encerrar período de provas
        </Button>
      ) : null}

      <AlertDialog
        open={removendo !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !removendoAgora) setRemovendo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a prova?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `${removendo.grupo.disciplina} em ${rotuloData(removendo.dia)}, das ${removendo.grupo.inicio} às ${removendo.grupo.fim}, sai do horário de ${contarTurmas(removendo.grupo.provas.length)}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendoAgora}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removendoAgora}
              onClick={(evento) => {
                evento.preventDefault();
                void remover();
              }}
            >
              {removendoAgora ? <LoaderCircle size={16} className="animate-spin" /> : null}
              Remover prova
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={encerrando}
        onOpenChange={(aberto) => {
          if (!encerrandoAgora) setEncerrando(aberto);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar o período de provas?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário de provas de todas as turmas será apagado e deixa de aparecer na aba
              Horários. As aulas não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={encerrandoAgora}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={encerrandoAgora}
              onClick={(evento) => {
                evento.preventDefault();
                void encerrar();
              }}
            >
              {encerrandoAgora ? <LoaderCircle size={16} className="animate-spin" /> : null}
              Encerrar período
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
