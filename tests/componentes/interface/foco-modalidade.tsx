// Monta controles reais para verificar foco sem banco ou autenticação.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../../../src/components/ui/button";
import { Input } from "../../../src/components/ui/input";
import { BarraBusca } from "../../../src/components/ui/barra-busca";
import { ModalidadeFoco } from "../../../src/components/ui/modalidade-foco";
import { SeletorTurmaChamada } from "../../../src/components/chamada/seletor-turma-chamada";
import { Selecionar } from "../../../src/components/ui/selecionar";
import { SelecionarBuscavel } from "../../../src/components/ui/selecionar-buscavel";
import { Switch } from "../../../src/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "../../../src/components/ui/popover";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../../../src/components/ui/dialog";
import "../../../src/app/globals.css";

function MenuPopover() {
  const conteudoRef = useRef<HTMLDivElement>(null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          Abrir menu de teste
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={(evento) => {
          evento.preventDefault();
          conteudoRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }}
      >
        <div
          ref={conteudoRef}
          role="menu"
          aria-label="Menu de teste"
          className="flex flex-col gap-1"
        >
          <Button type="button" role="menuitem" variant="ghost" className="justify-start">
            Primeiro item
          </Button>
          <Button type="button" role="menuitem" variant="ghost" className="justify-start">
            Segundo item
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Aplicacao() {
  const [busca, setBusca] = useState("");
  const [escolha, setEscolha] = useState("");
  return (
    <main data-pronto="sim">
      {new URLSearchParams(window.location.search).has("sem-modalidade") ? null : (
        <ModalidadeFoco />
      )}
      <Button type="button">Primeira ação</Button>
      <Input aria-label="Nome" />
      <BarraBusca id="busca-teste" valor={busca} onValor={setBusca} placeholder="Buscar" />
      <Input aria-label="Inválido" aria-invalid="true" />
      <Button variant="outline" type="button" aria-pressed="true">
        Selecionado
      </Button>
      <Selecionar
        value={escolha}
        onValueChange={setEscolha}
        ariaLabel="Seleção simples"
        opcoes={[
          { valor: "a", rotulo: "Alfa" },
          { valor: "b", rotulo: "Beta" },
        ]}
      />
      <MenuPopover />
      <Switch aria-label="Interruptor de teste" />
      <details>
        <summary>Resumo de teste</summary>
        <p>Conteúdo do resumo</p>
      </details>
      <div role="button" tabIndex={0} aria-label="Cartão focável" className="controle p-3">
        Cartão focável
      </div>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        aria-label="Anotação editável"
        className="campo p-3"
      >
        Anotação
      </div>
      <a
        href="#resumo-teste"
        className="discreto inline-flex min-h-11 items-center px-3"
        onClick={(evento) => evento.preventDefault()}
      >
        Link de teste
      </a>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button">Abrir diálogo</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Diálogo de teste</DialogTitle>
          <DialogDescription>Conteúdo de teste</DialogDescription>
          <Input aria-label="Campo do diálogo" />
          <DialogClose asChild>
            <Button type="button">Concluir</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <Button
        variant="outline"
        className="after:absolute focus-visible:ring-2 focus-visible:after:ring-2"
        type="button"
      >
        Superfície controle
      </Button>
      <Button
        variant="ghost"
        className="after:absolute focus-visible:ring-2 focus-visible:after:ring-2"
        type="button"
      >
        Superfície discreto
      </Button>
      <Button
        className="after:absolute focus-visible:ring-2 focus-visible:after:ring-2"
        type="button"
      >
        Superfície primário
      </Button>
      <Button
        variant="destructive"
        className="after:absolute focus-visible:ring-2 focus-visible:after:ring-2"
        type="button"
      >
        Superfície destrutivo
      </Button>
      <SeletorTurmaChamada
        turmas={[
          {
            id: "a",
            serieId: "s",
            nome: "A",
            rotulo: "1ª série A",
            serieNome: "1º ano",
            horarios: [],
          },
        ]}
        alunos={[]}
        turmaId="a"
        dia="2026-10-27"
        frequencias={[]}
        coberturaDisponivel
        carregando={false}
        temAlteracoes={false}
        travado={false}
        onEscolher={() => {}}
      />
      <textarea className="campo" aria-label="Observações" />
      <SelecionarBuscavel
        value=""
        onValueChange={() => {}}
        ariaLabel="Escolha"
        placeholder="Escolha"
        opcoes={[
          { valor: "a", rotulo: "Alfa" },
          { valor: "b", rotulo: "Beta" },
        ]}
      />
    </main>
  );
}

const raiz = document.getElementById("root");
if (raiz) createRoot(raiz).render(<Aplicacao />);
