// Define a recusa conservadora de substituição integral fora do schema declarado.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validarRecibo, conferirArtefatos } from "./recibos.mjs";

export function validarEscopoEntrada(arquivo, schema, legado) {
  const base =
    arquivo &&
    path
      .basename(arquivo)
      .match(/^(frequenciapp-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8})\.dump\.(age|gpg)$/)?.[1];
  const recibo = base && path.join(path.dirname(arquivo), base + ".confirmado.json");
  if (recibo && fs.existsSync(recibo)) {
    const stat = fs.lstatSync(recibo);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Recibo não regular.");
    const r = validarRecibo(JSON.parse(fs.readFileSync(recibo, "utf8")));
    conferirArtefatos(path.dirname(arquivo), r);
    if (r.escopo.schema !== schema || !r.artefatos.some((a) => a.nome === path.basename(arquivo)))
      throw new Error("Escopo do recibo diverge do destino.");
    return;
  }
  if (legado !== schema)
    throw new Error(
      "Dump sem metadados exige --escopo-legado com o schema exato após revisão externa; não é backup integral.",
    );
}

export function validarInventario(i, schema, modo = "integral") {
  const strings = (a) =>
    Array.isArray(a) &&
    a.every((v) => typeof v === "string" && v.length > 0) &&
    new Set(a).size === a.length;
  const contagem = (v) => Number.isSafeInteger(v) && v >= 0;
  if (
    i?.versao !== 1 ||
    typeof schema !== "string" ||
    !schema ||
    !strings(i.schemas) ||
    !i.schemas.includes(schema) ||
    !strings(i.extensoes) ||
    !Array.isArray(i.objetos) ||
    !i.objetos.every(
      (o) =>
        typeof o.schema === "string" &&
        i.schemas.includes(o.schema) &&
        typeof o.tipo === "string" &&
        o.tipo,
    ) ||
    ![i.largeObjects, i.dependenciasExternas, i.globais].every(contagem) ||
    !["integral", "limitado"].includes(modo)
  )
    throw new Error("Inventário ausente, inválido ou ambíguo.");
  if (
    i.largeObjects ||
    i.dependenciasExternas ||
    i.globais ||
    i.extensoes.some((e) => e !== "plpgsql")
  )
    throw new Error(
      "Large objects, extensões, dependências ou objetos globais não cobertos pelo dump.",
    );
  if (
    modo === "integral" &&
    (i.schemas.some((s) => s !== schema && s !== "public") ||
      i.objetos.some((o) => o.schema !== schema))
  )
    throw new Error(
      "O banco não é dedicado ao schema declarado; preservar todos os objetos e recusar a troca.",
    );
  return i;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "entrada") validarEscopoEntrada(...process.argv.slice(3));
    else
      validarInventario(JSON.parse(fs.readFileSync(0, "utf8")), process.argv[2], process.argv[3]);
  } catch (e) {
    console.error(`[escopo] ${e.message}`);
    process.exitCode = 1;
  }
}
