// Configuração do Prisma 7 (CLI e migrações).
// O runtime usa o adaptador pg em src/infra/banco.ts; o CLI usa a
// connection string desta configuração, carregada do .env.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://chamada:chamada@localhost:5432/chamada",
  },
});
