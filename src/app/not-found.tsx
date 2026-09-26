// Página 404 para rotas reais desconhecidas.
import { TelaEstado } from "@/components/ui/tela-estado";

export default function NaoEncontrada() {
  return (
    <TelaEstado
      variante="nao_encontrado"
      codigo={404}
      acao={{ rotulo: "Ir para o início", href: "/" }}
    />
  );
}
