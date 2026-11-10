// Compara a identidade do banco entre runtime, migração e backup.
import { pathToFileURL } from "node:url";
import { identidadeDaConexao, resolverSchema } from "../../src/infra/schema-postgres.mjs";

const NOMES = ["DATABASE_URL", "DIRECT_URL", "BACKUP_DATABASE_URL"];

/**
 * Exige que todas as URLs presentes apontem para o mesmo banco e schema.
 * Host e porta podem diferir entre pooler e conexão direta.
 */
export function validarIdentidadeBanco(ambiente = process.env) {
  const schemaExplicito = ambiente.DATABASE_SCHEMA?.trim() || null;
  const avisos = [];
  const presentes = [];
  for (const nome of NOMES) {
    const valor = ambiente[nome]?.trim();
    if (valor) presentes.push({ nome, url: valor });
  }
  if (presentes.length === 0) {
    throw new Error("Defina DATABASE_URL, DIRECT_URL ou BACKUP_DATABASE_URL.");
  }
  const identidades = presentes.map(({ nome, url }) => ({
    nome,
    ...identidadeDaConexao(url),
    schema: resolverSchema({ url, schemaExplicito }),
  }));
  const referencia = identidades[0];
  for (const identidade of identidades.slice(1)) {
    if (identidade.database !== referencia.database) {
      throw new Error(
        `${identidade.nome} aponta para outro banco. Runtime, migração e backup precisam usar o mesmo banco.`,
      );
    }
    if (identidade.schema !== referencia.schema) {
      throw new Error(
        `${identidade.nome} aponta para outro schema. Runtime, migração e backup precisam usar o mesmo schema.`,
      );
    }
    if (identidade.host !== referencia.host || identidade.port !== referencia.port) {
      avisos.push(`${identidade.nome} usa host ou porta diferente; banco e schema conferem.`);
    }
  }
  return { database: referencia.database, schema: referencia.schema, avisos };
}

const executadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executadoDiretamente) {
  try {
    const resultado = validarIdentidadeBanco();
    for (const aviso of resultado.avisos) console.error(`[banco] ${aviso}`);
    console.log(`[banco] Identidade conferida: ${resultado.database} schema ${resultado.schema}.`);
  } catch (erro) {
    console.error(`[banco] ${erro instanceof Error ? erro.message : "Identidade inválida."}`);
    process.exit(1);
  }
}
