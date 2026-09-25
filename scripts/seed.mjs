// Semente de desenvolvimento (séries, turmas e alunos sintéticos) para a
// conta de professor existente. Sem dados reais, conforme a LGPD.
import pg from "pg";
import "dotenv/config";

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const totalPorTurma = Number(process.env.SEED_ALUNOS ?? 12);

if (!email) {
  console.error("Defina CONTA_EMAIL (a conta precisa existir; crie com npm run criar-conta).");
  process.exit(1);
}
if (!Number.isInteger(totalPorTurma) || totalPorTurma < 1 || totalPorTurma > 99) {
  console.error("SEED_ALUNOS deve ser um inteiro entre 1 e 99.");
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url || !(url.startsWith("postgresql://") || url.startsWith("postgres://"))) {
  console.error("DIRECT_URL ou DATABASE_URL deve ser uma connection string PostgreSQL.");
  process.exit(1);
}

const SERIES = [
  { nome: "1º ano", ordem: 1, turmas: ["A", "B"] },
  { nome: "2º ano", ordem: 2, turmas: ["A", "B"] },
  { nome: "3º ano", ordem: 3, turmas: ["A", "B", "C"] },
];

const cliente = new pg.Client({ connectionString: url });

try {
  await cliente.connect();

  const professor = await cliente.query(
    "select id from usuarios where lower(email) = $1 and papel = 'PROFESSOR'",
    [email],
  );
  if (professor.rowCount === 0) {
    console.error(`Conta de professor ${email} não encontrada. Rode npm run criar-conta antes.`);
    process.exit(2);
  }
  const professorId = professor.rows[0].id;

  const existentes = await cliente.query("select count(*)::int as total from series");
  if (existentes.rows[0].total > 0) {
    console.log("Já existem séries cadastradas; nada a fazer.");
    process.exit(0);
  }

  const idsDeTurmas = {};
  const idsDoTerceiro = [];
  for (const serie of SERIES) {
    const criada = await cliente.query(
      `insert into series (nome, ordem, criado_em) values ($1, $2, now())
       on conflict (lower(nome)) do nothing
       returning id`,
      [serie.nome, serie.ordem],
    );
    const serieId =
      criada.rows[0]?.id ??
      (await cliente.query("select id from series where lower(nome) = $1", [serie.nome])).rows[0]
        .id;

    for (const letra of serie.turmas) {
      const rotulo = `${serie.nome} ${letra}`;
      const turma = await cliente.query(
        `insert into turmas (serie_id, nome, criado_em) values ($1, $2, now())
         on conflict (serie_id, lower(nome)) do nothing
         returning id`,
        [serieId, letra],
      );
      const turmaId =
        turma.rows[0]?.id ??
        (
          await cliente.query("select id from turmas where serie_id = $1 and lower(nome) = $2", [
            serieId,
            letra.toLowerCase(),
          ])
        ).rows[0].id;
      idsDeTurmas[rotulo] = turmaId;
      if (serie.nome === "3º ano") idsDoTerceiro.push(turmaId);
    }
  }

  // Alunos sintéticos com origem cruzada no 3º ano (cena de reorganização
  // de turmas, que exercita a grade Originais).
  const terceiro = SERIES.find((serie) => serie.nome === "3º ano");
  let semeados = 0;
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const rotulo = `${serie.nome} ${letra}`;
      const turmaId = idsDeTurmas[rotulo];
      const valores = [];
      for (let posicao = 1; posicao <= totalPorTurma; posicao += 1) {
        const nome = `Aluno ${letra}-${String(posicao).padStart(3, "0")}`;
        let origem = turmaId;
        if (serie.nome === "3º ano" && posicao % 3 === 0) {
          const outra = SERIES[2].turmas.find((t) => t !== letra) ?? letra;
          origem = idsDeTurmas[`3º ano ${outra}`];
        }
        valores.push([nome, turmaId, origem, posicao]);
      }
      await cliente.query(
        `insert into alunos (nome, turma_id, turma_original_id, ordem, ativo, criado_em)
         select v.nome, v.turma, v.origem, v.ordem, true, now()
         from (select unnest($1::text[]) as nome, unnest($2::uuid[]) as turma,
                      unnest($3::uuid[]) as origem, unnest($4::int[]) as ordem) as v`,
        [
          valores.map((v) => v[0]),
          valores.map((v) => v[1]),
          valores.map((v) => v[2]),
          valores.map((v) => v[3]),
        ],
      );
      semeados += valores.length;
    }
  }

  // O professor de demonstração recebe as turmas do 3º ano.
  for (const turmaId of idsDoTerceiro) {
    await cliente.query(
      `insert into atribuicoes (professor_id, turma_id, criado_em) values ($1, $2, now())
       on conflict (professor_id, turma_id) do nothing`,
      [professorId, turmaId],
    );
  }
  void terceiro;

  console.log(
    `Semente pronta: ${SERIES.length} séries, ${Object.keys(idsDeTurmas).length} turmas, ${semeados} alunos sintéticos.`,
  );
  console.log(
    `Professor ${email} com ${idsDoTerceiro.length} turmas atribuídas (3º ano A, B e C).`,
  );
} catch (erro) {
  console.error("Falha ao semear:", erro.message);
  process.exit(3);
} finally {
  await cliente.end();
}
