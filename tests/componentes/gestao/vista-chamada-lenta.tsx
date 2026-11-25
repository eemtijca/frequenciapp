// Suspende a Chamada sob comando explícito da fixture para testar a prioridade da navegação.
import { type ComponentProps } from "react";
import VistaFrequencia from "../../../src/components/chamada/vista-frequencia";

const simularDemora = new URLSearchParams(location.search).has("chamada-lenta");
let liberada = !simularDemora;
const carregamento = new Promise<void>((resolver) => {
  if (liberada) return resolver();
  window.addEventListener(
    "liberar-chamada-teste",
    () => {
      liberada = true;
      resolver();
    },
    { once: true },
  );
});

export default function VistaChamadaLenta(props: ComponentProps<typeof VistaFrequencia>) {
  if (props.ativo && !liberada) throw carregamento;
  return <VistaFrequencia {...props} />;
}
