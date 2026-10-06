// Valida o schema da conexão e prepara sessões diretas dos scripts PostgreSQL.
import { Buffer } from "node:buffer";

function validarIdentificador(nome) {
  if (typeof nome !== "string" || !nome || nome.includes("\0") || Buffer.byteLength(nome) > 63) {
    throw new Error("O schema da conexão PostgreSQL é inválido.");
  }
  return nome;
}

function validarSchema(nome) {
  const schema = validarIdentificador(nome);
  // O compiler Prisma não escapa aspas no schema; search_path expande $user.
  if (schema === "$user" || schema.includes('"') || /\p{Cc}/u.test(schema)) {
    throw new Error("O schema da conexão PostgreSQL é inválido.");
  }
  return schema;
}

function enderecoDaConexao(url) {
  let endereco;
  try {
    endereco = new URL(url);
  } catch {
    throw new Error("A URL de conexão PostgreSQL é inválida.");
  }
  if (!["postgres:", "postgresql:"].includes(endereco.protocol) || !endereco.hostname) {
    throw new Error("A URL de conexão PostgreSQL é inválida.");
  }
  // Parâmetros colados no caminho sem o separador ? fariam o banco ser lido
  // com o sufixo inteiro, como em postgres&schema=preview.
  if (endereco.pathname.includes("&") || endereco.pathname.includes("=")) {
    throw new Error("A URL de conexão PostgreSQL tem parâmetros sem o separador ?.");
  }
  return endereco;
}

function schemaDaUrl(endereco) {
  const schemas = endereco.searchParams.getAll("schema");
  if (schemas.length > 1) {
    throw new Error("O schema da conexão PostgreSQL deve ser informado apenas uma vez.");
  }
  return validarSchema(schemas[0] ?? "public");
}

export function schemaDaConexao(url) {
  return schemaDaUrl(enderecoDaConexao(url));
}

/**
 * Resolve o schema efetivo. A variável DATABASE_SCHEMA, quando definida, vence
 * o parâmetro schema da URL, para a plataforma de deploy escolher o schema do
 * ambiente sem reescrever a connection string; sem as duas, o padrão é public.
 */
export function resolverSchema({ url, schemaExplicito } = {}) {
  const endereco = enderecoDaConexao(url);
  if (schemaExplicito !== undefined && schemaExplicito !== null && schemaExplicito !== "") {
    return validarSchema(schemaExplicito);
  }
  return schemaDaUrl(endereco);
}

export function identificadorPostgres(nome) {
  return `"${validarIdentificador(nome).replaceAll('"', '""')}"`;
}

// Exclusivo para conexão direta ou pooler de sessão. O runtime qualifica seu SQL.
export async function selecionarSchema(
  cliente,
  url,
  schemaExplicito = process.env.DATABASE_SCHEMA,
) {
  const schema = resolverSchema({ url, schemaExplicito });
  const resultado = await cliente.query(
    `select pg_catalog.has_schema_privilege(oid, 'USAGE') as uso
       from pg_catalog.pg_namespace where nspname = $1`,
    [schema],
  );
  if (!resultado.rows[0]) {
    throw Object.assign(
      new Error("O schema configurado não existe. Crie o schema antes de continuar."),
      { code: "3F000" },
    );
  }
  if (resultado.rows[0].uso !== true) {
    throw Object.assign(new Error("A conexão não tem permissão de uso do schema configurado."), {
      code: "42501",
    });
  }
  await cliente.query("select pg_catalog.set_config('search_path', $1, false)", [
    identificadorPostgres(schema),
  ]);
}
