// Configuração do Prisma 7 (CLI e migrações). O CLI prefere DIRECT_URL
// (conexão de sessão) para evitar o pooler de transações.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  "postgresql://frequencia:frequencia@localhost:5432/frequencia";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
