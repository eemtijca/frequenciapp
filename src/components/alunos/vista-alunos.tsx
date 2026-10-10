"use client";

// Alunos: lista de consulta do professor, agrupada por turma atual ou por
// turma de origem. O cadastro e a edição acontecem na área de Gestão.
import { memo, useDeferredValue, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { UserRound, Users } from "lucide-react";
import type { Aluno, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { BarraBusca } from "@/components/ui/barra-busca";

interface Props {
  alunos: Aluno[];
  turmas: Turma[];
}

type Agrupamento = "atual" | "origem";

const AGRUPAMENTOS: { valor: Agrupamento; rotulo: string }[] = [
  { valor: "atual", rotulo: "Turma atual" },
  { valor: "origem", rotulo: "Turma de origem" },
];

interface PropsGrupo {
  turma: Turma | undefined;
  lista: Aluno[];
  agrupamento: Agrupamento;
  semMovimento: boolean;
  rotuloDe: (id: string, fallback: string) => string;
}

const GrupoAlunos = memo(function GrupoAlunos({
  turma,
  lista,
  agrupamento,
  semMovimento,
  rotuloDe,
}: PropsGrupo) {
  return (
    <motion.div
      initial={semMovimento ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={semMovimento ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="superficie-vidro overflow-hidden"
    >
      <div className="bg-secondary/50 flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="font-medium">{turma?.rotulo ?? "Turma"}</h2>
        <span className="numerais-tabulares text-muted-foreground text-xs">
          {lista.filter((aluno) => aluno.ativo).length} ativos
        </span>
      </div>
      <ul className="divide-y">
        {lista.map((aluno) => (
          <li
            key={aluno.id}
            className={`flex items-center gap-3 px-4 py-2.5 ${aluno.ativo ? "" : "opacity-55"}`}
          >
            <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
              {String(aluno.ordem).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{aluno.nome}</p>
              {agrupamento === "atual" && aluno.turmaOriginalId !== aluno.turmaId && (
                <p className="text-muted-foreground text-xs">
                  Origem {rotuloDe(aluno.turmaOriginalId, "outra turma")}
                </p>
              )}
              {agrupamento === "origem" && aluno.turmaId !== aluno.turmaOriginalId && (
                <p className="text-muted-foreground text-xs">
                  Atual {rotuloDe(aluno.turmaId, "outra turma")}
                </p>
              )}
            </div>
            {aluno.desistenteEm ? (
              <span className="text-muted-foreground text-xs">Desistente</span>
            ) : !aluno.ativo ? (
              <span className="text-muted-foreground text-xs">desativado</span>
            ) : null}
          </li>
        ))}
      </ul>
    </motion.div>
  );
});

export default function VistaAlunos({ alunos, turmas }: Props) {
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("atual");
  const semMovimento = useReducedMotion() ?? false;
  const [busca, setBusca] = useState("");
  const buscaAplicada = useDeferredValue(busca);

  const rotuloDe = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string, fallback: string) => mapa.get(id) ?? fallback;
  }, [turmas]);

  const grupos = useMemo(() => {
    const porTurma = agrupamento === "atual";
    const turmasPorId = new Map(turmas.map((turma) => [turma.id, turma]));
    const mapa = new Map<string, { turma: Turma | undefined; alunos: Aluno[] }>();
    for (const aluno of alunos) {
      const chave = porTurma ? aluno.turmaId : aluno.turmaOriginalId;
      const item = mapa.get(chave) ?? {
        turma: turmasPorId.get(chave),
        alunos: [],
      };
      item.alunos.push(aluno);
      mapa.set(chave, item);
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[1].turma?.rotulo ?? "").localeCompare(b[1].turma?.rotulo ?? "", "pt-BR"))
      .map(([id, item]) => {
        const lista = item.alunos
          .slice()
          .sort((a, b) =>
            porTurma
              ? a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR")
              : a.nome.localeCompare(b.nome, "pt-BR"),
          );
        return [id, item.turma, lista] as const;
      });
  }, [agrupamento, alunos, turmas]);

  const ativos = useMemo(() => alunos.filter((aluno) => aluno.ativo).length, [alunos]);
  const nomesParaBusca = useMemo(
    () => new Map(alunos.map((aluno) => [aluno.id, normalizar(aluno.nome)])),
    [alunos],
  );
  const gruposFiltrados = useMemo(() => {
    const termo = normalizar(buscaAplicada);
    return termo === ""
      ? grupos
      : grupos
          .map(
            ([id, turma, lista]) =>
              [
                id,
                turma,
                lista.filter((aluno) => (nomesParaBusca.get(aluno.id) ?? "").includes(termo)),
              ] as const,
          )
          .filter(([, , lista]) => lista.length > 0);
  }, [grupos, nomesParaBusca, buscaAplicada]);

  return (
    <section
      aria-label="Lista de alunos"
      aria-busy={busca !== buscaAplicada}
      className="flex flex-col gap-4 pb-6"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alunos</h1>
          <p className="text-muted-foreground text-sm">
            {alunos.length} no total · {ativos} ativos
          </p>
        </div>
        <Users size={22} className="text-muted-foreground" aria-hidden="true" />
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Cadastros, transferências e desligamentos são feitos pelo administrador em Gestão.
      </p>

      <div
        role="group"
        aria-label="Agrupamento da lista"
        className="superficie-vidro grid grid-cols-2 gap-1 p-1.5"
      >
        {AGRUPAMENTOS.map((opcao) => {
          const ativo = agrupamento === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => setAgrupamento(opcao.valor)}
              className="controle-vidro vidro-discreto pressionavel relative flex min-h-10 items-center justify-center px-2 text-xs font-medium transition-colors"
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>

      {agrupamento === "origem" && (
        <p className="text-muted-foreground -mt-2 text-xs leading-relaxed">
          Turma da matrícula, usada na Grade e na planilha.
        </p>
      )}

      {alunos.length > 0 && (
        <BarraBusca id="busca-alunos" valor={busca} onValor={setBusca} placeholder="Buscar aluno" />
      )}

      {alunos.length === 0 ? (
        <div className="superficie-vidro flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
          <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhum aluno nas suas turmas</p>
          <p className="text-muted-foreground text-sm">
            Peça ao administrador para cadastrar os alunos e atribuir as turmas a você.
          </p>
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="superficie-vidro flex min-h-40 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="font-medium">Nenhum aluno encontrado</p>
          <p className="text-muted-foreground text-sm">Tente outro termo de busca.</p>
        </div>
      ) : (
        gruposFiltrados.map(([id, turma, lista]) => (
          <GrupoAlunos
            key={id}
            turma={turma}
            lista={lista}
            agrupamento={agrupamento}
            semMovimento={semMovimento}
            rotuloDe={rotuloDe}
          />
        ))
      )}
    </section>
  );
}
