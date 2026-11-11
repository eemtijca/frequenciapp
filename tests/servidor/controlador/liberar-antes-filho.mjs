// Exercita liberação antecipada do simulador em processo sintético supervisionado.
import { criarAdaptadorEnsaio, executar } from "../../../scripts/servidor/controlador/ensaio.mjs";

const adaptador = criarAdaptadorEnsaio({ bloquearEm: "migracao" });
if (process.argv[3] === "setup-abortado") {
  const primeira = executar({ raiz: process.argv[2], alvo: "alvo-sintetico", adaptador });
  let falha;
  try {
    throw new Error("setup sintético abortado");
  } catch (erro) {
    falha = erro.message;
  } finally {
    adaptador.liberar();
  }
  const resultado = await primeira;
  process.send({ falha, estado: resultado.estado, migracoes: adaptador.observar().migracoes });
} else {
  adaptador.liberar();
  const resultado = await executar({ raiz: process.argv[2], alvo: "alvo-sintetico", adaptador });
  process.send(resultado.estado);
}
