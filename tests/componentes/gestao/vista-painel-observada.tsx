// Observa commits no Painel real durante o fechamento, sem medir tempo de CPU.
import { Profiler, type ComponentProps } from "react";
import VistaPainel from "../../../src/components/painel/vista-painel";

const observar = new URLSearchParams(location.search).has("observar-painel");

export default function VistaPainelObservada(props: ComponentProps<typeof VistaPainel>) {
  if (!observar) return <VistaPainel {...props} />;
  return (
    <Profiler id="Painel" onRender={() => performance.mark("commit-painel-teste")}>
      <VistaPainel {...props} />
    </Profiler>
  );
}
