import { useState } from "react";
import { createRoot } from "react-dom/client";
import DialogoAulas from "@/components/gestao/cadastros/dialogo-aulas";
import {
  DialogoFrequenciaParcial,
  edicaoDoRegistro,
} from "@/components/chamada-parcial/dialogo-frequencia-parcial";
import DialogoDownload from "@/components/conta/dialogo-download";
import DialogoSobre from "@/components/dialogo-sobre";
import { DialogoMostrarMes } from "@/components/gestao/planilhas/dialogo-mostrar-mes";
import "@/app/globals.css";

const turma = {
  id: "turma-teste",
  rotulo: "Turma teste",
  horarios: [],
  serieId: "serie-teste",
  nome: "Turma teste",
  serieNome: "Série teste",
} as Parameters<typeof DialogoAulas>[0]["turma"];
const tipo = new URLSearchParams(location.search).get("tipo");
function App() {
  const [aberto, setAberto] = useState(true);
  const [edicao, setEdicao] = useState({ ...edicaoDoRegistro(), alunoId: "aluno-teste" });
  const [salvos, setSalvos] = useState(0);
  return (
    <main>
      <output aria-label="salvos">{salvos}</output>
      <button type="button" onClick={() => setAberto(true)}>
        Reabrir
      </button>
      {tipo === "aulas" && (
        <DialogoAulas
          turma={turma}
          turmas={turma ? [turma] : []}
          aberto={aberto}
          onAbrir={setAberto}
          onMudanca={async () => {}}
        />
      )}
      {tipo === "parcial" && (
        <DialogoFrequenciaParcial
          aberto={aberto}
          edicao={edicao}
          registro={null}
          turma={turma ?? undefined}
          alunos={[{ id: "aluno-teste", nome: "Aluno teste" } as never]}
          dia="2026-10-20"
          hoje="2026-10-20"
          justificativas={[]}
          feriados={[]}
          sujo
          salvando={false}
          erro=""
          conflito={false}
          onEdicao={setEdicao}
          onFechar={() => setAberto(false)}
          onSalvar={() => setSalvos((n) => n + 1)}
          onRecarregar={() => {}}
        />
      )}
      {tipo === "download" && (
        <DialogoDownload
          aberto={aberto}
          onAbrir={setAberto}
          preparar={() => ({
            blob: new Blob(["teste"]),
            nome: "teste.txt",
            nomeZip: "teste.zip",
            nomeNoZip: "teste.txt",
          })}
          onConcluido={() => setSalvos((n) => n + 1)}
        />
      )}
      {tipo === "sobre" && <DialogoSobre aberto={aberto} onAbrir={setAberto} />}
      {tipo === "mes" && <DialogoMostrarMes mesAtual="2026-10" onAtualizar={async () => {}} />}
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Raiz ausente");
createRoot(root).render(<App />);
