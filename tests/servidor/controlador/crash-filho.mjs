// Mantém uma migração sintética pendente para o teste de interrupção abrupta.
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

const adaptador = criarAdaptadorEnsaio({ bloquearEm: "migracao" });
const intervalo = setInterval(() => {
  if (adaptador.observar().vivo) {
    clearInterval(intervalo);
    process.send("migracao-viva");
  }
}, 5);
await executar({ raiz: process.argv[2], alvo: "alvo-sintetico", adaptador });
