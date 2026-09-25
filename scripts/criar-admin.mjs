// Cria ou atualiza o administrador inicial (primeiro usuário, acesso
// root) de forma idempotente. Credenciais vêm do .env:
//   ADMIN_EMAIL=... ADMIN_SENHA=... ADMIN_NOME=...
// Uso: npm run criar-admin
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

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const senha = process.env.ADMIN_SENHA;
const nome = process.env.ADMIN_NOME?.trim();

if (!email || !senha || !nome) {
  console.error("Defina ADMIN_EMAIL, ADMIN_SENHA e ADMIN_NOME no ambiente (ver .env.example).");
  console.error(
    "Exemplo: ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' npm run criar-admin",
  );
  process.exit(1);
}
if (senha.length < 8 || !/[a-zA-ZÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
  console.error("ADMIN_SENHA deve ter ao menos 8 caracteres, com uma letra e um número.");
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
     values ($1, $2, $3, 'ADMIN', true, now(), now())
     on conflict (lower(email)) do update
       set senha_hash = excluded.senha_hash,
           nome = excluded.nome,
           papel = 'ADMIN',
           ativo = true,
           atualizado_em = now()
     returning id, email, nome`,
    [email, senhaHash, nome],
  );
  const conta = resultado.rows[0];
  await cliente.query(
    "insert into auditoria (usuario_id, acao, alvo) values ($1, 'usuario.criarAdmin', $2)",
    [conta.id, conta.email],
  );
  console.log(`Administrador pronto: ${conta.email} (${conta.nome})`);
} catch (erro) {
  console.error("Falha ao criar o administrador:", erro.message);
  process.exit(2);
} finally {
  await cliente.end();
}
