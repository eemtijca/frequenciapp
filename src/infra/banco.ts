// Cliente Prisma compartilhado. Uma ligação por processo, via
// adaptador pg (driver oficial do PostgreSQL para Node).
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ambiente } from "@/infra/ambiente";

const globalComBanco = globalThis as unknown as {
  // Reaproveita a instância entre recarregamentos do servidor em dev.
  prisma?: PrismaClient;
};

function criarCliente(): PrismaClient {
  const adaptador = new PrismaPg({ connectionString: ambiente.databaseUrl });
  return new PrismaClient({ adapter: adaptador, log: ["warn", "error"] });
}

/** Cliente pronto. Reaproveita a ligação por processo. */
export function banco(): PrismaClient {
  globalComBanco.prisma ??= criarCliente();
  return globalComBanco.prisma;
}

export type Banco = PrismaClient;
