// Monta os componentes reais para testes isolados no navegador.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../../../src/components/ui/dialog";
import { SecaoRecolhivel } from "../../../src/components/ui/secao-recolhivel";
import "../../../src/app/globals.css";

function Aplicacao() {
  const [aberto, setAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <>
      <Dialog>
        <DialogTrigger>Abrir folha</DialogTrigger>
        <DialogContent folha>
          <DialogTitle>Folha de teste</DialogTitle>
          <button>Primeira ação</button>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger>Abrir modal</DialogTrigger>
        <DialogContent>
          <DialogTitle>Modal de teste</DialogTitle>
        </DialogContent>
      </Dialog>
      <Dialog open={menuAberto} onOpenChange={setMenuAberto}>
        <DialogTrigger>Abrir menu</DialogTrigger>
        <DialogContent lateral={{ aberto: menuAberto }}>
          <DialogTitle>Menu de teste</DialogTitle>
        </DialogContent>
      </Dialog>
      <SecaoRecolhivel
        titulo="Configurações"
        icone={Settings}
        aberto={aberto}
        onAbertoChange={setAberto}
        acoes={<button>Ação externa</button>}
      >
        <button>Ação interna</button>
      </SecaoRecolhivel>
    </>
  );
}

const raiz = document.getElementById("root");
if (raiz) createRoot(raiz).render(<Aplicacao />);
