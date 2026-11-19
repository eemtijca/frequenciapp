// Retém o filho imediatamente antes da trava para provar a revalidação de geração.
import cp from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const pronto = process.env.HOOK_PRONTO;
const liberar = process.env.HOOK_LIBERAR;
if (!pronto || !liberar) throw new Error("HOOK_PRONTO e HOOK_LIBERAR são obrigatórios.");

const original = cp.spawnSync;
cp.spawnSync = (comando, argumentos, opcoes) => {
  if (
    comando === "/bin/bash" &&
    Array.isArray(argumentos) &&
    argumentos[0]?.endsWith("/trancar.sh")
  ) {
    fs.writeFileSync(pronto, "pronto");
    const fim = Date.now() + 15000;
    while (!fs.existsSync(liberar)) {
      if (Date.now() > fim) throw new Error("espera de teste esgotada");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  return original(comando, argumentos, opcoes);
};
syncBuiltinESMExports();
