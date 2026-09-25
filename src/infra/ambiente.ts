// Validação das variáveis de ambiente. Falha antecipada: a aplicação
// não sobe com configuração incompleta ou inválida.
import { z } from "zod";

const esquema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (valor) => valor.startsWith("postgresql://") || valor.startsWith("postgres://"),
      "DATABASE_URL deve ser uma connection string PostgreSQL (postgresql://usuario:senha@host:porta/banco).",
    ),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve ter pelo menos 32 caracteres."),
  TZ_APP: z.string().min(1).default("America/Fortaleza"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((questao) => `  ${questao.path.join(".")}: ${questao.message}`)
    .join("\n");
  console.error(`Variáveis de ambiente inválidas:\n${problemas}`);
  throw new Error("Configuração de ambiente inválida. Verifique o .env contra o .env.example.");
}

export const ambiente = {
  databaseUrl: resultado.data.DATABASE_URL,
  authSecret: resultado.data.AUTH_SECRET,
  fuso: resultado.data.TZ_APP,
  ehProducao: resultado.data.NODE_ENV === "production",
};
