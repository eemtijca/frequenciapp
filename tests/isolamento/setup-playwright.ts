// Protege os specs PWA antes de qualquer requisição ou fixture.
import { verificarIsolamento } from "../helpers/isolamento.mjs";
export default async function setupIsolado(): Promise<void> {
  await verificarIsolamento();
}
