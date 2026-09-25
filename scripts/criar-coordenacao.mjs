// Cria ou atualiza a conta de uma pessoa da coordenação (idempotente). Uso:
// CONTA_EMAIL=... CONTA_SENHA=... CONTA_NOME=... npm run criar-coordenacao
import pg from "pg";
import "dotenv/config";
import { hashear, senhaValida } from "./senha.mjs";

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const senha = process.env.CONTA_SENHA;
const nome = process.env.CONTA_NOME?.trim();

if (!email || !senha || !nome) {
  console.error("Defina CONTA_EMAIL, CONTA_SENHA e CONTA_NOME no ambiente.");
  console.error(
    "Exemplo: CONTA_EMAIL=equipe@escola.br CONTA_SENHA='senha forte' CONTA_NOME='Equipe' npm run criar-coordenacao",
  );
  process.exit(1);
}
if (!senhaValida(senha)) {
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
     values ($1, $2, $3, 'COORDENACAO', true, now(), now())
     on conflict (lower(email)) do update
       set senha_hash = excluded.senha_hash,
           nome = excluded.nome,
           papel = 'COORDENACAO',
           ativo = true,
           atualizado_em = now()
     returning id, email, nome`,
    [email, senhaHash, nome],
  );
  const conta = resultado.rows[0];
  await cliente.query(
    "insert into auditoria (usuario_id, acao, alvo) values ($1, 'usuario.criarCoordenacao', $2)",
    [conta.id, conta.email],
  );
  console.log(`Conta de coordenação pronta: ${conta.email} (${conta.nome})`);
} catch (erro) {
  console.error("Falha ao criar a conta:", erro.message);
  process.exit(2);
} finally {
  await cliente.end();
}
