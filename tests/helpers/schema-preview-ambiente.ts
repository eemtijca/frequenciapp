// Seleção de runtime exclusiva da regressão de schemas descartáveis.
import type { PrismaClient } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";

type Configuracao = { databaseUrl: string };

export function criarAmbienteSchemaPreview(
  conexao: string,
  schemaControle: string,
  configuracao: Configuracao,
  clientes: Map<string, PrismaClient>,
) {
  const globalComBanco = globalThis as unknown as { prisma?: PrismaClient };
  const prismaAnterior = globalComBanco.prisma;
  const urlAnterior = configuracao.databaseUrl;
  const schemaAnterior = process.env.DATABASE_SCHEMA;

  return {
    selecionar(schema: string): PrismaClient {
      const url = new URL(conexao);
      url.searchParams.set("schema", schema);
      // Uma regressão no SQL direto só alcança outro schema descartável.
      // O destino diverge do Preview para detectar dependência de search_path.
      url.searchParams.set("options", `-c search_path="${schemaControle.replaceAll('"', '""')}"`);
      configuracao.databaseUrl = url.toString();
      process.env.DATABASE_SCHEMA = schema;
      globalComBanco.prisma = clientes.get(schema);
      const cliente = banco();
      clientes.set(schema, cliente);
      return cliente;
    },
    restaurar(): void {
      if (schemaAnterior === undefined) delete process.env.DATABASE_SCHEMA;
      else process.env.DATABASE_SCHEMA = schemaAnterior;
      configuracao.databaseUrl = urlAnterior;
      globalComBanco.prisma = prismaAnterior;
    },
  };
}
