// A mesma fixture é executada contra os componentes reais de cada revisão.
import { createRoot } from "react-dom/client";
import { Input } from "@/components/ui/input";
import { Selecionar } from "@/components/ui/selecionar";
import { BarraBusca } from "@/components/ui/barra-busca";
import "@/app/globals.css";

const opcoes = [{ valor: "um", rotulo: "Um" }];
function Campos({ superficie, disabled }: { superficie: string; disabled: boolean }) {
  const sufixo = `${superficie} ${disabled ? "desabilitado" : "habilitado"}`;
  return (
    <fieldset disabled={disabled} data-superficie={superficie} className="grid gap-4 p-4">
      <Input aria-label={`Texto ${sufixo}`} disabled={disabled} />
      <Selecionar
        ariaLabel={`Seletor ${sufixo}`}
        value="um"
        onValueChange={() => {}}
        opcoes={opcoes}
        disabled={disabled}
      />
      <Selecionar
        ariaLabel={`Buscável ${sufixo}`}
        value="um"
        onValueChange={() => {}}
        opcoes={opcoes}
        disabled={disabled}
        buscavel
      />
      <BarraBusca
        id={`busca-${superficie}-${disabled}`}
        valor=""
        onValor={() => {}}
        placeholder={`Busca ${sufixo}`}
      />
    </fieldset>
  );
}
const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <main>
    <Campos superficie="pagina" disabled={false} />
    <Campos superficie="pagina" disabled />
    <div className="superficie">
      <Campos superficie="cartao" disabled={false} />
      <Campos superficie="cartao" disabled />
    </div>
  </main>,
);
