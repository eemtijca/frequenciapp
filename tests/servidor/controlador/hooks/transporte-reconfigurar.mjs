// Encaminha o hook de interrupção ao filho que publica as rotinas administrativas.
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";

const interromper = fileURLToPath(new URL("./interromper-rename.mjs", import.meta.url));
const original = cp.spawnSync;
cp.spawnSync = (comando, argumentos, opcoes) => {
  const publica =
    Array.isArray(argumentos) &&
    argumentos.includes("reconfigurar-rotinas") &&
    argumentos.includes("--confirmar");
  return original(comando, publica ? ["--import", interromper, ...argumentos] : argumentos, opcoes);
};
syncBuiltinESMExports();
