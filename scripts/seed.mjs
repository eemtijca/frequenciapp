// Semente de desenvolvimento (séries, turmas, aulas e alunos sintéticos) para
// a conta de coordenação existente. Sem dados reais, conforme a LGPD.
import pg from "pg";
import "dotenv/config";

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const totalPorTurma = Number(process.env.SEED_ALUNOS ?? 12);

if (!email) {
  console.error(
    "Defina CONTA_EMAIL (a conta precisa existir; crie com npm run criar-coordenacao).",
  );
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

// Grade sintética de cinco aulas, de segunda a sexta.
const AULAS = [
  { ordem: 1, inicio: "07:00", fim: "07:50" },
  { ordem: 2, inicio: "07:50", fim: "08:40" },
  { ordem: 3, inicio: "08:40", fim: "09:30" },
  { ordem: 4, inicio: "09:50", fim: "10:40" },
  { ordem: 5, inicio: "10:40", fim: "11:30" },
];
const DIAS_UTEIS = [1, 2, 3, 4, 5];

const cliente = new pg.Client({ connectionString: url });

try {
  await cliente.connect();

  const coordenacao = await cliente.query(
    "select id from usuarios where lower(email) = $1 and papel = 'COORDENACAO'",
    [email],
  );
  if (coordenacao.rowCount === 0) {
    console.error(
      `Conta de coordenação ${email} não encontrada. Rode npm run criar-coordenacao antes.`,
    );
    process.exit(2);
  }

  const existentes = await cliente.query("select count(*)::int as total from series");
  if (existentes.rows[0].total > 0) {
    console.log("Já existem séries cadastradas; nada a fazer.");
    process.exit(0);
  }

  const idsDeTurmas = {};
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

      for (const aula of AULAS) {
        await cliente.query(
          `insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo, criado_em)
           values ($1, $2, $3, $4, $5, true, now())
           on conflict (turma_id, ordem) do nothing`,
          [turmaId, aula.ordem, aula.inicio, aula.fim, DIAS_UTEIS],
        );
      }
    }
  }

  // Alunos sintéticos com origem cruzada no 3º ano (cena de reorganização
  // de turmas, que exercita a grade do mês).
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

  // Chamada e saída sintéticas para os indicadores terem o que mostrar:
  // uma falta justificada, uma falta simples e uma saída antecipada.
  const ultimoDiaLetivo = (() => {
    const data = new Date();
    data.setDate(data.getDate() - 1);
    while (data.getDay() === 0 || data.getDay() === 6) data.setDate(data.getDate() - 1);
    return data.toISOString().slice(0, 10);
  })();
  const turmaExemplo = idsDeTurmas["1º ano A"];
  if (turmaExemplo) {
    const alunosDaTurma = await cliente.query(
      "select id from alunos where turma_id = $1 order by ordem limit 3",
      [turmaExemplo],
    );
    const aulasDaTurma = await cliente.query(
      "select id from horarios where turma_id = $1 order by ordem limit 1",
      [turmaExemplo],
    );
    if (alunosDaTurma.rowCount >= 2 && aulasDaTurma.rowCount === 1) {
      const criada = await cliente.query(
        `insert into frequencias (turma_id, dia, revisao, criado_por_id, atualizado_por_id, atualizado_em)
         values ($1, $2, 1, $3, $3, now())
         on conflict (turma_id, dia) do nothing
         returning id`,
        [turmaExemplo, ultimoDiaLetivo, coordenacao.rows[0].id],
      );
      const frequenciaId = criada.rows[0]?.id;
      if (frequenciaId) {
        await cliente.query(
          `insert into faltas (frequencia_id, aluno_id, horario_id, justificativa, observacao)
           values ($1, $2, $3, 'D', null), ($1, $4, $3, null, null)
           on conflict do nothing`,
          [
            frequenciaId,
            alunosDaTurma.rows[0].id,
            aulasDaTurma.rows[0].id,
            alunosDaTurma.rows[1].id,
          ],
        );
        await cliente.query(
          `insert into saidas_antecipadas (aluno_id, dia, momento, justificativa, observacao, liberado_por_id, criado_por_id)
           values ($1, $2, 'aula_2', 'CM', null, $3, $3)
           on conflict (aluno_id, dia) do nothing`,
          [alunosDaTurma.rows[0].id, ultimoDiaLetivo, coordenacao.rows[0].id],
        );
      }
    }
  }

  console.log(
    `Semente pronta: ${SERIES.length} séries, ${Object.keys(idsDeTurmas).length} turmas, ${AULAS.length} aulas por turma, ${semeados} alunos sintéticos, uma chamada com F e FJ em ${ultimoDiaLetivo} e uma saída antecipada.`,
  );
} catch (erro) {
  console.error("Falha ao semear:", erro.message);
  process.exit(3);
} finally {
  await cliente.end();
}
