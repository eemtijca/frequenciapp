// Encerra o processo antes ou depois do rename do alvo, para provar a retomada do journal.
import fs from "node:fs";

const alvo = process.env.HOOK_ALVO;
const momento = process.env.HOOK_MOMENTO ?? "depois";
if (!alvo) throw new Error("HOOK_ALVO ausente para o hook de interrupção.");

const original = fs.renameSync;
fs.renameSync = (origem, destino) => {
  if (destino === alvo && momento === "antes") process.kill(process.pid, "SIGKILL");
  const resultado = original(origem, destino);
  if (destino === alvo && momento === "depois") process.kill(process.pid, "SIGKILL");
  return resultado;
};
