import { createRoot } from "react-dom/client";
import VistaFrequencia from "@/components/chamada/vista-frequencia";
import VistaGrade from "@/components/grade/vista-grade";
import { CartaoDia } from "@/components/resumo-semanal/base";
import { CONFIGURACOES_PADRAO, type Aluno, type Turma } from "@/domain/frequencia";
import "@/app/globals.css";

const turmas: Turma[] = ["A", "B"].map((id) => ({
  id,
  nome: id,
  rotulo: `Turma ${id}`,
  serieId: "s",
  serieNome: "Ano",
  horarios: [1, 2].map((ordem) => ({
    id: `${id}-${ordem}`,
    turmaId: id,
    ordem,
    inicio: ordem === 1 ? "07:00" : "08:00",
    fim: "09:00",
    diasSemana: [1],
    ativo: true,
  })),
}));
const alunos: Aluno[] = turmas.map(({ id }, ordem) => ({
  id,
  nome: `Aluno ${id}`,
  turmaId: id,
  turmaOriginalId: id,
  ativo: true,
  ordem,
}));
const noop = () => {};
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
createRoot(root).render(
  <main className="space-y-8 p-4">
    <section aria-label="Chamada">
      <VistaFrequencia
        usuario={{
          id: "teste",
          nome: "Teste",
          email: "teste@example.invalid",
          papel: "ADMIN",
          ativo: true,
        }}
        ativo
        turmas={turmas}
        alunos={alunos}
        diaCorrente="2026-10-19"
        fuso="America/Sao_Paulo"
        alvo={null}
        configuracoes={{ ...CONFIGURACOES_PADRAO, frequenciaPorAula: true }}
        catalogoJustificativas={[]}
        versaoFrequencias={0}
        onFrequenciasMudaram={async () => {}}
        onPendencia={noop}
      />
    </section>
    <section aria-label="Dias">
      <ul>
        <CartaoDia
          dia="2026-10-19"
          rotulo="Segunda"
          status="Pendente"
          tom="pendente"
          abrir
          onAbrir={() => document.body.setAttribute("data-abriu", "sim")}
          ariaLabel="Abrir segunda"
        />
        <CartaoDia
          dia="2026-10-20"
          rotulo="Terça"
          status="Sem registro"
          tom="neutro"
          abrir={false}
          ariaLabel="Terça indisponível"
        />
      </ul>
    </section>
    <section aria-label="Grade">
      <VistaGrade
        alunos={alunos}
        frequencias={[]}
        resumo={null}
        mes="2026-10"
        mesCorrente="2026-10"
        hoje="2026-10-19"
        aberto
        versao={0}
        origens={turmas}
        onMes={noop}
      />
    </section>
  </main>,
);
