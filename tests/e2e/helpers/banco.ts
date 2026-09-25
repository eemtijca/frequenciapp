// Acesso direto ao banco da suíte de ponta a ponta: contas fixas, contagens e
// limpeza da massa com prefixo E2E. Nunca usa dados reais.
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAssincrono = promisify(scrypt);
const CUSTO = 16384;
const BLOCO = 8;
const PARALELISMO = 1;
const TAMANHO = 64;

/** Papel de quem faz a frequência; acompanha o enum do schema. */
const PAPEL_COORDENACAO = "COORDENACAO";

export const ADMIN_E2E = {
  email: "direcao@escola.exemplo",
  senha: "DirecaoFrequencia2026",
  nome: "Direção",
};

export const COORD_E2E = {
  email: "demo@escola.exemplo",
  senha: "DemoFrequencia2026",
  nome: "Demo",
};

function urlDoBanco(): string {
  return (
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    "postgresql://frequencia:frequencia@localhost:5432/frequencia"
  );
}

/** Abre uma conexão, executa a operação e fecha, mesmo em falha. */
export async function comBanco<T>(operacao: (cliente: pg.Client) => Promise<T>): Promise<T> {
  const cliente = new pg.Client({ connectionString: urlDoBanco() });
  await cliente.connect();
  try {
    return await operacao(cliente);
  } finally {
    await cliente.end();
  }
}

async function hashear(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scryptAssincrono(senha, sal, TAMANHO, {
    N: CUSTO,
    r: BLOCO,
    p: PARALELISMO,
  });
  return `scrypt$${CUSTO}$${BLOCO}$${PARALELISMO}$${sal.toString("hex")}$${chave.toString("hex")}`;
}

async function garantirConta(
  cliente: pg.Client,
  conta: { email: string; senha: string; nome: string },
  papel: string,
): Promise<void> {
  const senhaHash = await hashear(conta.senha);
  await cliente.query(
    `insert into usuarios (email, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
     values ($1, $2, $3, $4, true, now(), now())
     on conflict (lower(email)) do update
       set senha_hash = excluded.senha_hash,
           nome = excluded.nome,
           papel = excluded.papel,
           ativo = true,
           atualizado_em = now()`,
    [conta.email, senhaHash, conta.nome, papel],
  );
}

/** Cria ou redefine as contas fixas usadas pelos testes de ponta a ponta. */
export async function garantirContasDeTeste(): Promise<void> {
  await comBanco(async (cliente) => {
    await garantirConta(cliente, ADMIN_E2E, "ADMIN");
    await garantirConta(cliente, COORD_E2E, PAPEL_COORDENACAO);
  });
}

/** Total de turmas: usado para pular o cenário de banco vazio em bases com dados. */
export async function contarTurmas(): Promise<number> {
  return comBanco(async (cliente) => {
    const resultado = await cliente.query("select count(*)::int as total from turmas");
    return resultado.rows[0]?.total ?? 0;
  });
}

/** Total de séries, para o cenário de banco vazio. */
export async function contarSeries(): Promise<number> {
  return comBanco(async (cliente) => {
    const resultado = await cliente.query("select count(*)::int as total from series");
    return resultado.rows[0]?.total ?? 0;
  });
}

/**
 * Cria a massa da suíte de frequência: série E2E Ano, turma A, três aulas
 * de segunda a domingo e dois alunos. Chamada no beforeAll do spec.
 */
export async function criarMassaE2E(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'E2E Ano'))",
    );
    await cliente.query("delete from alunos where nome like 'E2E %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Ano')",
    );
    await cliente.query("delete from series where nome = 'E2E Ano'");
    const serie = await cliente.query(
      "insert into series (nome, ordem) values ('E2E Ano', 99) returning id",
    );
    const serieId = serie.rows[0]?.id as string;
    const turma = await cliente.query(
      "insert into turmas (serie_id, nome) values ($1, 'A') returning id",
      [serieId],
    );
    const turmaId = turma.rows[0]?.id as string;
    const aulas: [number, string, string][] = [
      [1, "07:00", "07:50"],
      [2, "07:50", "08:40"],
      [3, "08:40", "09:30"],
    ];
    for (const [ordem, inicio, fim] of aulas) {
      await cliente.query(
        "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, $2, $3, $4, $5, true)",
        [turmaId, ordem, inicio, fim, [1, 2, 3, 4, 5, 6, 7]],
      );
    }
    await cliente.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ('E2E Aluno Um', $1, $1, 1, true), ('E2E Aluno Dois', $1, $1, 2, true)",
      [turmaId],
    );
  });
}

/** Remove a massa da suíte de frequência, incluindo as frequências criadas. */
export async function limparMassaE2E(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = 'E2E Ano'))",
    );
    await cliente.query("delete from alunos where nome like 'E2E %'");
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = 'E2E Ano')",
    );
    await cliente.query("delete from series where nome = 'E2E Ano'");
  });
}
