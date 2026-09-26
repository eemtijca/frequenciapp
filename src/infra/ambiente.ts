// Validação das variáveis de ambiente. Falha antecipada: a aplicação
// não sobe com configuração incompleta ou inválida.
import { z } from "zod";
import { booleanoDeAmbiente, cookiesSegurosDe, permitirEndpointLocalDe } from "@/infra/booleano";

const esquema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (valor) => valor.startsWith("postgresql://") || valor.startsWith("postgres://"),
      "DATABASE_URL deve ser uma connection string PostgreSQL (postgresql://usuario:senha@host:porta/banco).",
    ),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET deve ter pelo menos 32 caracteres."),
  TZ_APP: z
    .string()
    .min(1)
    .default("America/Fortaleza")
    .refine((fuso) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: fuso });
        return true;
      } catch {
        return false;
      }
    }, "TZ_APP deve ser um fuso IANA válido, por exemplo America/Fortaleza."),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Quando verdadeiro, aceita implantação sem TLS: cookie sem Secure, sem
  // HSTS e sem upgrade-insecure-requests no CSP. Padrão falso.
  PERMITIR_HTTP: z
    .string()
    .optional()
    .transform((valor) => booleanoDeAmbiente(valor, false)),
  // Quando verdadeiro, aceita endpoint local da integração com Google
  // Planilhas mesmo em produção. Apenas para testes e ambientes controlados.
  PERMITIR_ENDPOINT_LOCAL: z
    .string()
    .optional()
    .transform((valor) => booleanoDeAmbiente(valor, false)),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((questao) => `  ${questao.path.join(".")}: ${questao.message}`)
    .join("\n");
  console.error(`Variáveis de ambiente inválidas:\n${problemas}`);
  throw new Error("Configuração de ambiente inválida. Verifique o .env contra o .env.example.");
}

const ehProducao = resultado.data.NODE_ENV === "production";
const permitirHttp = resultado.data.PERMITIR_HTTP;
const cookiesSeguros = cookiesSegurosDe(ehProducao, permitirHttp);
const permitirEndpointLocal = permitirEndpointLocalDe(
  ehProducao,
  resultado.data.PERMITIR_ENDPOINT_LOCAL,
);

// Aviso único na partida: sem TLS o tráfego fica em texto puro e o PWA não
// instala fora de localhost. O modo existe para redes internas confiáveis.
if (ehProducao && permitirHttp) {
  console.warn(
    "PERMITIR_HTTP ativo: o aplicativo aceita HTTP sem TLS. O cookie de sessão não usa Secure, o HSTS não é enviado e o tráfego fica em texto puro. Use apenas em rede confiável.",
  );
}

// Aviso único na partida: a integração passa a aceitar loopback, o que só
// faz sentido em testes ou ambiente controlado.
if (ehProducao && resultado.data.PERMITIR_ENDPOINT_LOCAL) {
  console.warn(
    "PERMITIR_ENDPOINT_LOCAL ativo: a integração com Google Planilhas aceita endereço local. Use apenas em teste ou ambiente controlado.",
  );
}

export const ambiente = {
  databaseUrl: resultado.data.DATABASE_URL,
  authSecret: resultado.data.AUTH_SECRET,
  fuso: resultado.data.TZ_APP,
  ehProducao,
  permitirHttp,
  cookiesSeguros,
  permitirEndpointLocal,
};
