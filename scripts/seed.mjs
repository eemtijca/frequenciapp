// Semente de desenvolvimento para a conta de coordenação existente: séries,
// turmas, aulas, alunos, justificativas e alguns dias de chamadas e saídas.
// Idempotente por entidade e sem dados reais, conforme a LGPD.
import pg from "pg";
import "dotenv/config";

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const totalPorTurma = Number(process.env.SEED_ALUNOS ?? 12);
const totalDeDias = Number(process.env.SEED_DIAS ?? 5);

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
if (!Number.isInteger(totalDeDias) || totalDeDias < 1 || totalDeDias > 30) {
  console.error("SEED_DIAS deve ser um inteiro entre 1 e 30.");
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

// Mesmo catálogo inicial da migração.
const JUSTIFICATIVAS = [
  ["D", "Doente"],
  ["Dat", "Doente com atestado"],
  ["LM", "Licença Maternidade"],
  ["G", "Grávida"],
  ["T", "Transporte"],
  ["Vi", "Viagem"],
  ["CM", "Consulta Médica"],
  ["De", "Dentista"],
  ["Lt", "Luto"],
  ["O", "Outros"],
  ["C", "Consulta"],
  ["S", "Suspensão"],
];

const MOMENTOS = ["aula_2", "aula_3", "intervalo_1", "aula_5", "almoco"];

function formatarDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate(),
  ).padStart(2, "0")}`;
}

/** Últimos dias letivos antes de hoje, do mais antigo para o mais recente. */
function diasLetivosAtras(quantidade) {
  const dias = [];
  const data = new Date();
  data.setDate(data.getDate() - 1);
  while (dias.length < quantidade) {
    const diaSemana = data.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) dias.push(formatarDia(data));
    data.setDate(data.getDate() - 1);
  }
  return dias.reverse();
}

/**
 * Marca determinística e variada: a maioria presente, com faltas simples e
 * justificadas espalhadas, para os indicadores terem o que mostrar.
 */
function marcar(turmaIndice, ordemAluno, diaIndice) {
  const valor = (turmaIndice * 5 + ordemAluno * 7 + diaIndice * 3) % 23;
  if (valor === 0 || valor === 5 || valor === 11) {
    return {
      justificativa:
        JUSTIFICATIVAS[(turmaIndice + ordemAluno + diaIndice) % JUSTIFICATIVAS.length][0],
    };
  }
  if (valor === 3 || valor === 9) return { justificativa: null };
  return null;
}

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
  const coordenacaoId = coordenacao.rows[0].id;

  // Justificativas: garante o catálogo inicial sem sobrescrever edições.
  let justificativasNovas = 0;
  for (const [codigo, rotulo] of JUSTIFICATIVAS) {
    const inserida = await cliente.query(
      `insert into justificativas (codigo, rotulo) values ($1, $2)
       on conflict do nothing
       returning id`,
      [codigo, rotulo],
    );
    justificativasNovas += inserida.rowCount;
  }

  const idsDeTurmas = {};
  const idsDeSeries = {};
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
    idsDeSeries[serie.nome] = serieId;

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
  // de turmas, que exercita a grade). Turma com alunos é preservada.
  let semeados = 0;
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const rotulo = `${serie.nome} ${letra}`;
      const turmaId = idsDeTurmas[rotulo];
      const existentes = await cliente.query(
        "select count(*)::int as total from alunos where turma_id = $1",
        [turmaId],
      );
      if (existentes.rows[0].total > 0) {
        semeados += existentes.rows[0].total;
        continue;
      }
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

  // Chamadas dos últimos dias letivos, com presenças, faltas e justificadas.
  const dias = diasLetivosAtras(totalDeDias);
  let chamadasCriadas = 0;
  let faltasCriadas = 0;
  let indiceTurma = 0;
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const turmaId = idsDeTurmas[`${serie.nome} ${letra}`];
      const alunosDaTurma = await cliente.query(
        "select id, ordem from alunos where turma_id = $1 order by ordem",
        [turmaId],
      );
      const aulasDaTurma = await cliente.query(
        "select id from horarios where turma_id = $1 order by ordem",
        [turmaId],
      );
      if (alunosDaTurma.rowCount === 0 || aulasDaTurma.rowCount === 0) continue;
      const idsDeAula = aulasDaTurma.rows.map((aula) => aula.id);

      for (let indiceDia = 0; indiceDia < dias.length; indiceDia += 1) {
        const dia = dias[indiceDia];
        const criada = await cliente.query(
          `insert into frequencias (turma_id, dia, revisao, criado_por_id, atualizado_por_id, atualizado_em)
           values ($1, $2, 1, $3, $3, now())
           on conflict (turma_id, dia) do nothing
           returning id`,
          [turmaId, dia, coordenacaoId],
        );
        const frequenciaId = criada.rows[0]?.id;
        if (!frequenciaId) continue;
        chamadasCriadas += 1;

        for (const aluno of alunosDaTurma.rows) {
          const marca = marcar(indiceTurma, aluno.ordem, indiceDia);
          if (!marca) continue;
          for (const aulaId of idsDeAula) {
            await cliente.query(
              `insert into faltas (frequencia_id, aluno_id, horario_id, justificativa, observacao)
               values ($1, $2, $3, $4, null)
               on conflict do nothing`,
              [frequenciaId, aluno.id, aulaId, marca.justificativa],
            );
            faltasCriadas += 1;
          }
        }
      }
      indiceTurma += 1;
    }
  }

  // Saídas antecipadas espalhadas pela semana, para o relatório ter conteúdo.
  let saidasCriadas = 0;
  const turmasParaSaida = Object.values(idsDeTurmas);
  for (let indice = 0; indice < turmasParaSaida.length && indice < dias.length; indice += 1) {
    const turmaId = turmasParaSaida[indice];
    const alunosDaTurma = await cliente.query(
      "select id from alunos where turma_id = $1 order by ordem limit 1",
      [turmaId],
    );
    if (alunosDaTurma.rowCount === 0) continue;
    const dia = dias[indice];
    const momento = MOMENTOS[indice % MOMENTOS.length];
    const [codigoJustificativa] = JUSTIFICATIVAS[indice % JUSTIFICATIVAS.length];
    const criada = await cliente.query(
      `insert into saidas_antecipadas (aluno_id, dia, momento, justificativa, observacao, liberado_por_id, criado_por_id)
       values ($1, $2, $3, $4, null, $5, $5)
       on conflict (aluno_id, dia) do nothing
       returning id`,
      [alunosDaTurma.rows[0].id, dia, momento, codigoJustificativa, coordenacaoId],
    );
    saidasCriadas += criada.rowCount;
  }

  console.log(
    `Semente pronta: ${SERIES.length} séries, ${Object.keys(idsDeTurmas).length} turmas, ${AULAS.length} aulas por turma, ${semeados} alunos sintéticos, ${justificativasNovas} justificativas novas, ${chamadasCriadas} chamadas, ${faltasCriadas} faltas e ${saidasCriadas} saídas antecipadas.`,
  );
} catch (erro) {
  console.error("Falha ao semear:", erro.message);
  process.exit(3);
} finally {
  await cliente.end();
}
