// Cria ou atualiza a conta de um professor de forma idempotente.
// Útil para contas de demonstração e testes; o gerenciamento do dia a
// dia acontece na área de Gestão do administrador.
// Uso: CONTA_EMAIL=... CONTA_SENHA=... CONTA_NOME=... npm run criar-conta
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";
import "dotenv/config";

const scryptAssincrono = promisify(scrypt);
const CUSTO = 16384;
const BLOCO = 8;
const PARALELISMO = 1;
const TAMANHO = 64;

async function hashear(senha) {
  const sal = randomBytes(16);
  const chave = await scryptAssincrono(senha, sal, TAMANHO, {
    N: CUSTO,
    r: BLOCO,
    p: PARALELISMO,
  });
  return `scrypt$${CUSTO}$${BLOCO}$${PARALELISMO}$${sal.toString("hex")}$${chave.toString("hex")}`;
}

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const senha = process.env.CONTA_SENHA;
const nome = process.env.CONTA_NOME?.trim();

if (!email || !senha || !nome) {
  console.error("Defina CONTA_EMAIL, CONTA_SENHA e CONTA_NOME no ambiente.");
  console.error(
    "Exemplo: CONTA_EMAIL=professor@escola.br CONTA_SENHA='senha forte' CONTA_NOME='Ana' npm run criar-conta",
  );
  process.exit(1);
}
if (senha.length < 8 || !/[a-zA-ZÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
  console.error("CONTA_SENHA deve ter ao menos 8 caracteres, com uma letra e um número.");
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url || !(url.startsWith("postgresql://") || url.startsWith("postgres://"))) {
  console.error("DIRECT_URL ou DATABASE_URL deve ser uma connection string PostgreSQL.");
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: url });

try {
  await cliente.connect();
  const senhaHash = await hashear(senha);
  const resultado = await cliente.query(
    `insert into usuarios (email, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
     values ($1, $2, $3, 'PROFESSOR', true, now(), now())
     on conflict (lower(email)) do update
       set senha_hash = excluded.senha_hash,
           nome = excluded.nome,
           papel = 'PROFESSOR',
           ativo = true,
           atualizado_em = now()
     returning id, email, nome`,
    [email, senhaHash, nome],
  );
  const conta = resultado.rows[0];
  console.log(`Conta pronta: ${conta.email} (${conta.nome})`);
} catch (erro) {
  console.error("Falha ao criar a conta:", erro.message);
  process.exit(2);
} finally {
  await cliente.end();
}
