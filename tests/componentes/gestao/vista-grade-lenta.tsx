// Retém apenas a Grade até a fixture liberar a montagem, sem simular o conteúdo.
import { type ComponentProps } from "react";
import VistaGrade from "../../../src/components/grade/vista-grade";

let liberada = !new URLSearchParams(location.search).has("grade-lenta");
const carregamento = new Promise<void>((resolver) => {
  if (liberada) return resolver();
  window.addEventListener(
    "liberar-grade-teste",
    () => {
      liberada = true;
      resolver();
    },
    { once: true },
  );
});

export default function VistaGradeLenta(props: ComponentProps<typeof VistaGrade>) {
  if (props.aberto && !liberada) throw carregamento;
  return <VistaGrade {...props} />;
}
