// Verifica o runtime e o banco antes de importar qualquer contrato de API.
import { verificarIsolamento } from "../helpers/isolamento.mjs";
await verificarIsolamento();
