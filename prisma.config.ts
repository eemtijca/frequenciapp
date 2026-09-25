// Configuração do Prisma 7 (CLI e migrações).
// O runtime usa o adaptador pg em src/infra/banco.ts; o CLI prefere
// a conexão de sessão para evitar usar o pooler de transações.
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
