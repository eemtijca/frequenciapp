// Os componentes de produção são montados sobre as duas superfícies do tema claro.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Input } from "../../../src/components/ui/input";
import { BarraBusca } from "../../../src/components/ui/barra-busca";
import { Selecionar } from "../../../src/components/ui/selecionar";
import { CampoSenha } from "../../../src/components/ui/campo-senha";
import "../../../src/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");

function Campos({ superficie }: { superficie: string }) {
  const [valor, setValor] = useState("um");
  const [simples, setSimples] = useState("");
  const [busca, setBusca] = useState("");
  return (
    <div data-superficie={superficie} className="grid gap-4 p-4">
      <Input aria-label={`Texto ${superficie}`} />
      <Selecionar
        ariaLabel={`Seletor ${superficie}`}
        value={simples}
        onValueChange={setSimples}
        opcoes={[
          { valor: "um", rotulo: "Um" },
          { valor: "dois", rotulo: "Dois" },
        ]}
      />
      <BarraBusca
        id={`busca-${superficie}`}
        valor={busca}
        onValor={setBusca}
        placeholder={`Busca ${superficie}`}
      />
      <Selecionar
        ariaLabel={`Buscável ${superficie}`}
        value={valor}
        onValueChange={setValor}
        opcoes={[
          { valor: "um", rotulo: "Um" },
          { valor: "dois", rotulo: "Dois" },
        ]}
        buscavel
      />
      <Input aria-label={`Inválido ${superficie}`} aria-invalid="true" defaultValue="Inválido" />
      <Input aria-label={`Desabilitado ${superficie}`} disabled defaultValue="Bloqueado" />
      <CampoSenha aria-label={`Senha ${superficie}`} defaultValue="senha-teste" />
    </div>
  );
}

createRoot(raiz).render(
  <main className="grid gap-4 p-4">
    <Campos superficie="pagina" />
    <div className="superficie">
      <Campos superficie="cartao" />
    </div>
  </main>,
);
