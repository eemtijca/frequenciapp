// Semente de desenvolvimento: um ano letivo de uso para a conta de coordenação
// existente, com 9 turmas, faltas em cauda longa, saídas, entradas, frequências
// parciais, diretores de turma e o calendário de feriados. Determinística,
// idempotente e sem dados reais, conforme a LGPD.
import pg from "pg";
import "dotenv/config";
import { resolverSchema, selecionarSchema } from "../../src/infra/schema-postgres.mjs";
import { hashear } from "../administracao/senha.mjs";

const email = process.env.CONTA_EMAIL?.trim().toLowerCase();
const semente = Number(process.env.SEED_SEMENTE ?? 202602);
const perfil = (process.env.SEED_PERFIL ?? "padrao").trim().toLowerCase();
const PERFIS = {
  leve: { dias: 40, aulas: 6, densidade: 0.5 },
  padrao: { dias: 0, aulas: 9, densidade: 1 },
  pesado: { dias: 0, aulas: 9, densidade: 1.7 },
};
const alunosFixo = process.env.SEED_ALUNOS ? Number(process.env.SEED_ALUNOS) : null;
const diasLimite = Number(process.env.SEED_DIAS ?? PERFIS[perfil]?.dias ?? 0);
const limpar = (process.env.SEED_LIMPAR ?? "").trim().toLowerCase() === "true";
const apenasLimpar = (process.env.SEED_APENAS_LIMPAR ?? "").trim().toLowerCase() === "true";
const ano = Number(process.env.SEED_ANO ?? new Date().getFullYear());
const senhaDiretor = process.env.SEED_SENHA_DIRETOR ?? "DiretorFrequencia2026";

if (!email) {
  console.error(
    "Defina CONTA_EMAIL (a conta precisa existir; crie com pnpm run criar-coordenacao).",
  );
  process.exit(1);
}
if (!PERFIS[perfil]) {
  console.error("SEED_PERFIL deve ser leve, padrao ou pesado.");
  process.exit(1);
}
if (alunosFixo !== null && (!Number.isInteger(alunosFixo) || alunosFixo < 20 || alunosFixo > 60)) {
  console.error("SEED_ALUNOS deve ser um inteiro entre 20 e 60.");
  process.exit(1);
}
if (!Number.isInteger(diasLimite) || diasLimite < 0 || diasLimite > 260) {
  console.error("SEED_DIAS deve ser um inteiro entre 0 (ano completo) e 260.");
  process.exit(1);
}
if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
  console.error("SEED_ANO deve ser um ano entre 2020 e 2100.");
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
try {
  resolverSchema({ url, schemaExplicito: process.env.DATABASE_SCHEMA });
} catch (erro) {
  console.error(erro.message);
  process.exit(1);
}

// Nove turmas: 1º ao 3º ano, A a C. A média pede 35 a 50 alunos por turma.
const SERIES = [
  { nome: "1º ano", ordem: 1, turmas: ["A", "B", "C"] },
  { nome: "2º ano", ordem: 2, turmas: ["A", "B", "C"] },
  { nome: "3º ano", ordem: 3, turmas: ["A", "B", "C"] },
];

// Jornada de tempo integral: cinco aulas pela manhã, almoço e quatro à tarde.
const GRADE_INTEGRAL = [
  { ordem: 1, inicio: "07:00", fim: "07:50" },
  { ordem: 2, inicio: "07:50", fim: "08:40" },
  { ordem: 3, inicio: "08:40", fim: "09:30" },
  { ordem: 4, inicio: "09:50", fim: "10:40" },
  { ordem: 5, inicio: "10:40", fim: "11:30" },
  { ordem: 6, inicio: "13:00", fim: "13:50" },
  { ordem: 7, inicio: "13:50", fim: "14:40" },
  { ordem: 8, inicio: "14:40", fim: "15:30" },
  { ordem: 9, inicio: "15:50", fim: "16:40" },
];
const DIAS_UTEIS = [1, 2, 3, 4, 5];
const AULAS_DA_MANHA = 5;

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

// Motivos de falta justificada, com peso, para a distribuição ficar crível.
const MOTIVOS_PESADOS = [
  ["Dat", 30],
  ["D", 24],
  ["CM", 12],
  ["De", 8],
  ["T", 10],
  ["Vi", 5],
  ["Lt", 3],
  ["O", 4],
  ["C", 2],
  ["S", 1],
];

const MOMENTOS_SAIDA = [
  ...Array.from({ length: 9 }, (_, indice) => `aula_${indice + 1}`),
  "intervalo_1",
  "intervalo_2",
  "almoco",
];

const LIBERADORES = [
  ["S1", "Coordenação"],
  ["S2", "Direção"],
  ["S3", "Portaria"],
  ["S4", "Secretaria"],
];

const PRENOMES = [
  "Ana",
  "Arthur",
  "Beatriz",
  "Bernardo",
  "Bruno",
  "Caio",
  "Carlos",
  "Davi",
  "Daniel",
  "Eduarda",
  "Enzo",
  "Felipe",
  "Gabriel",
  "Giovana",
  "Guilherme",
  "Heitor",
  "Helena",
  "Igor",
  "Isabela",
  "João",
  "Júlia",
  "Kaique",
  "Larissa",
  "Lucas",
  "Luiza",
  "Manuela",
  "Maria",
  "Matheus",
  "Miguel",
  "Nicolas",
  "Pedro",
  "Rafael",
  "Rafaela",
  "Sofia",
  "Thiago",
  "Valentina",
  "Vinícius",
  "Yasmin",
  "Lívia",
  "Emanuelly",
  "Cauã",
  "Lorenzo",
  "Antonella",
  "Bryan",
  "Clara",
  "Débora",
  "Esther",
];
const SOBRENOMES = [
  "Almeida",
  "Alves",
  "Araújo",
  "Barbosa",
  "Barros",
  "Batista",
  "Cardoso",
  "Carvalho",
  "Castro",
  "Costa",
  "Dias",
  "Fernandes",
  "Ferreira",
  "Gomes",
  "Gonçalves",
  "Lima",
  "Lopes",
  "Machado",
  "Marques",
  "Martins",
  "Melo",
  "Mendes",
  "Monteiro",
  "Moraes",
  "Moreira",
  "Nascimento",
  "Neves",
  "Nogueira",
  "Oliveira",
  "Pereira",
  "Ramos",
  "Reis",
  "Ribeiro",
  "Rocha",
  "Rodrigues",
  "Sales",
  "Santos",
  "Silva",
  "Sousa",
  "Teixeira",
  "Vieira",
];

const JUSTIFICATIVAS_ENTRADA = [
  "Consulta médica",
  "Transporte escolar atrasou",
  "Compromisso familiar",
  "Consulta odontológica",
  "Chuva forte no trajeto",
  "Atendimento na secretaria",
];

function formatarDia(data) {
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(
    data.getUTCDate(),
  ).padStart(2, "0")}`;
}

function dataCivil(texto) {
  const [a, m, d] = texto.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
function criarSorteio(inicial) {
  let estado = inicial >>> 0;
  return function sortear() {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valor estável em [0, 1) derivado de uma chave, sem depender da ordem. */
function valorEstavel(chave) {
  let h = 1779033703 ^ chave.length;
  for (let i = 0; i < chave.length; i += 1) {
    h = Math.imul(h ^ chave.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  let a = (h ^ 0x6d2b79f5) >>> 0;
  a = Math.imul(a ^ (a >>> 15), 1 | a);
  a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(anoBase) {
  const a = anoBase % 19;
  const b = Math.floor(anoBase / 100);
  const c = anoBase % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anoBase, mes - 1, dia));
}

function somarDias(data, dias) {
  const copia = new Date(data.getTime());
  copia.setUTCDate(copia.getUTCDate() + dias);
  return copia;
}

/** Feriados e recessos considerados no ano letivo sintético. */
function diasSemAula(anoBase) {
  const mapa = new Map();
  const registrar = (data, nome) => mapa.set(formatarDia(data), nome);
  registrar(new Date(Date.UTC(anoBase, 0, 1)), "Confraternização Universal");
  registrar(new Date(Date.UTC(anoBase, 2, 25)), "Data Magna do Ceará");
  const domingoPascoa = pascoa(anoBase);
  registrar(somarDias(domingoPascoa, -48), "Segunda-feira de Carnaval");
  registrar(somarDias(domingoPascoa, -47), "Terça-feira de Carnaval");
  registrar(somarDias(domingoPascoa, -2), "Sexta-feira Santa");
  registrar(new Date(Date.UTC(anoBase, 3, 21)), "Tiradentes");
  registrar(new Date(Date.UTC(anoBase, 4, 1)), "Dia do Trabalho");
  registrar(somarDias(domingoPascoa, 60), "Corpus Christi");
  registrar(new Date(Date.UTC(anoBase, 5, 24)), "São João");
  registrar(new Date(Date.UTC(anoBase, 8, 7)), "Independência");
  registrar(new Date(Date.UTC(anoBase, 9, 12)), "Nossa Senhora Aparecida");
  registrar(new Date(Date.UTC(anoBase, 10, 2)), "Finados");
  registrar(new Date(Date.UTC(anoBase, 10, 15)), "Proclamação da República");
  registrar(new Date(Date.UTC(anoBase, 10, 20)), "Consciência Negra");
  registrar(new Date(Date.UTC(anoBase, 11, 25)), "Natal");
  // Recesso de julho: duas semanas e meia sem aula.
  for (let dia = 1; dia <= 19; dia += 1) {
    registrar(new Date(Date.UTC(anoBase, 6, dia)), "Recesso de julho");
  }
  return mapa;
}

/** Dias letivos do ano corrente, do início do ano até hoje, sem os sem-aula. */
function diasLetivos(anoBase, hoje) {
  const semAula = diasSemAula(anoBase);
  const dias = [];
  const data = new Date(Date.UTC(anoBase, 1, 1));
  const limite = new Date(Date.UTC(anoBase, 11, 20));
  while (data <= limite) {
    const diaSemana = data.getUTCDay();
    const texto = formatarDia(data);
    if (diaSemana !== 0 && diaSemana !== 6 && !semAula.has(texto) && data <= hoje) {
      dias.push(texto);
    }
    data.setUTCDate(data.getUTCDate() + 1);
  }
  return dias;
}

function escolherPeso(itens, valor) {
  const total = itens.reduce((soma, [, peso]) => soma + peso, 0);
  let alvo = valor * total;
  for (const [item, peso] of itens) {
    alvo -= peso;
    if (alvo <= 0) return item;
  }
  return itens[itens.length - 1][0];
}

/** Horário de 30 minutos depois do início da aula indicada. */
function horarioDaAula(ordem) {
  const aula = grade.find((item) => item.ordem === ordem);
  if (!aula) return null;
  const [hora, minuto] = aula.inicio.split(":").map(Number);
  const total = hora * 60 + minuto + 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function nomeSintetico(chave) {
  const primeiro = PRENOMES[Math.floor(valorEstavel(`${chave}:p`) * PRENOMES.length)];
  const segundo = SOBRENOMES[Math.floor(valorEstavel(`${chave}:s`) * SOBRENOMES.length)];
  const terceiro =
    valorEstavel(`${chave}:t`) < 0.55
      ? ""
      : ` ${SOBRENOMES[Math.floor(valorEstavel(`${chave}:t2`) * SOBRENOMES.length)]}`;
  return `${primeiro} ${segundo}${terceiro}`;
}

/** Quantidade de alunos da turma: 35 a 50, ou o valor fixo pedido. */
function alunosDaTurma(indiceTurma) {
  if (alunosFixo !== null) return alunosFixo;
  return 35 + Math.floor(valorEstavel(`${semente}:turma:${indiceTurma}`) * 16);
}

const cliente = new pg.Client({ connectionString: url });
let grade = [];
const hoje = new Date();
const feriados = diasSemAula(ano);
let dias = diasLetivos(ano, hoje);
if (diasLimite > 0 && dias.length > diasLimite) dias = dias.slice(-diasLimite);

if (dias.length === 0) {
  console.error(
    `Nenhum dia letivo encontrado em ${ano} até hoje. Confira SEED_ANO e a data do sistema.`,
  );
  process.exit(1);
}

try {
  await cliente.connect();
  await selecionarSchema(cliente, url);

  const coordenacao = await cliente.query(
    "select id from usuarios where lower(email) = $1 and papel = 'COORDENACAO'",
    [email],
  );
  if (coordenacao.rowCount === 0) {
    console.error(
      `Conta de coordenação ${email} não encontrada. Rode pnpm run criar-coordenacao antes.`,
    );
    process.exit(2);
  }
  const coordenacaoId = coordenacao.rows[0].id;

  grade = GRADE_INTEGRAL.slice(0, PERFIS[perfil].aulas);

  if (limpar) {
    // Os vínculos do diretor apontam para a turma com restrição: a conta sai antes.
    await cliente.query("delete from usuarios where email = any($1::text[])", [
      ["diretor.1a", "diretor.2b"],
    ]);
    const ids = [];
    for (const serie of SERIES) {
      for (const letra of serie.turmas) {
        const achada = await cliente.query(
          `select t.id from turmas t join series s on s.id = t.serie_id
           where lower(s.nome) = $1 and lower(t.nome) = $2`,
          [serie.nome.toLowerCase(), letra.toLowerCase()],
        );
        if (achada.rows[0]) ids.push(achada.rows[0].id);
      }
    }
    if (ids.length > 0) {
      await cliente.query("delete from frequencias where turma_id = any($1::uuid[])", [ids]);
      await cliente.query("delete from entradas_atrasadas where turma_id = any($1::uuid[])", [ids]);
      await cliente.query("delete from frequencias_parciais where turma_id = any($1::uuid[])", [
        ids,
      ]);
      await cliente.query("delete from alunos where turma_id = any($1::uuid[])", [ids]);
      await cliente.query("delete from horarios where turma_id = any($1::uuid[])", [ids]);
      await cliente.query("delete from turmas where id = any($1::uuid[])", [ids]);
    }
    await cliente.query("delete from feriados where dia = any($1::date[])", [[...feriados.keys()]]);
    await cliente.query("delete from liberadores where codigo = any($1::text[])", [
      LIBERADORES.map(([codigo]) => codigo),
    ]);
    console.log("Massa anterior da semente removida (SEED_LIMPAR).");
  }

  if (apenasLimpar) {
    await cliente.end();
    console.log(
      "Massa da semente removida. A base fica limpa para o e2e; rode pnpm run seed para recriar.",
    );
    process.exit(0);
  }

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

  // Calendário letivo: feriados e recessos entram para a Chamada bloquear os dias.
  let feriadosInseridos = 0;
  for (const [dia, nome] of feriados) {
    const inserido = await cliente.query(
      `insert into feriados (dia, nome, origem, criado_por_id, criado_em, atualizado_em)
       values ($1, $2, 'MANUAL', $3, now(), now())
       on conflict (dia) do nothing
       returning dia`,
      [dia, nome, coordenacaoId],
    );
    feriadosInseridos += inserido.rowCount;
  }

  // Quem libera as saídas: catálogo mínimo para o formulário e os registros.
  for (const [codigo, rotulo] of LIBERADORES) {
    await cliente.query(
      `insert into liberadores (codigo, rotulo) values ($1, $2)
       on conflict do nothing`,
      [codigo, rotulo],
    );
  }
  const liberadores = (await cliente.query("select codigo from liberadores order by codigo")).rows;

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

      for (const aula of grade) {
        await cliente.query(
          `insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo, criado_em)
           values ($1, $2, $3, $4, $5, true, now())
           on conflict (turma_id, ordem) do nothing`,
          [turmaId, aula.ordem, aula.inicio, aula.fim, DIAS_UTEIS],
        );
      }
    }
  }

  // Alunos sintéticos com nomes plausíveis e origem cruzada no 3º ano.
  let indiceTurma = 0;
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const rotulo = `${serie.nome} ${letra}`;
      const turmaId = idsDeTurmas[rotulo];
      const existentes = await cliente.query(
        "select count(*)::int as total from alunos where turma_id = $1",
        [turmaId],
      );
      if (existentes.rows[0].total > 0) {
        indiceTurma += 1;
        continue;
      }
      const total = alunosDaTurma(indiceTurma);
      const valores = [];
      for (let posicao = 1; posicao <= total; posicao += 1) {
        const nome = nomeSintetico(`${semente}:${rotulo}:${posicao}`);
        let origem = turmaId;
        if (serie.nome === "3º ano" && posicao % 4 === 0) {
          const outra = serie.turmas.find((t) => t !== letra) ?? letra;
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
      indiceTurma += 1;
    }
  }

  // Diretores de turma de exemplo, com palavra-chave já usada e sem troca
  // obrigatória, para a demonstração entrar direto.
  const diretores = [
    { identificador: "diretor.1a", nome: "Diretor de Turma 1A", turmas: ["1º ano A", "1º ano B"] },
    { identificador: "diretor.2b", nome: "Diretor de Turma 2B", turmas: ["2º ano B", "2º ano C"] },
  ];
  let diretoresCriados = 0;
  for (const diretor of diretores) {
    const existente = await cliente.query("select id from usuarios where email = $1", [
      diretor.identificador,
    ]);
    let usuarioId = existente.rows[0]?.id;
    if (!usuarioId) {
      const hash = await hashear(senhaDiretor);
      const criado = await cliente.query(
        `insert into usuarios (email, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
         values ($1, $2, $3, 'DIRETOR_TURMA', true, now(), now())
         returning id`,
        [diretor.identificador, hash, diretor.nome],
      );
      usuarioId = criado.rows[0].id;
      diretoresCriados += 1;
    }
    await cliente.query(
      `insert into credenciais_diretor
         (usuario_id, emitida_em, expira_em, primeiro_uso_em, troca_obrigatoria, atualizado_em)
       values ($1, now(), now() + interval '90 days', now(), false, now())
       on conflict (usuario_id) do nothing`,
      [usuarioId],
    );
    for (const rotulo of diretor.turmas) {
      await cliente.query(
        `insert into vinculos_diretor (usuario_id, turma_id, inicio, criado_por_id)
         select $1, $2, $3, $4
         where not exists (
           select 1 from vinculos_diretor where usuario_id = $1 and turma_id = $2
         )`,
        [usuarioId, idsDeTurmas[rotulo], `${ano}-02-01`, coordenacaoId],
      );
    }
  }

  // Chamadas do ano: faltas em cauda longa, com episódios e justificativas.
  const sorteio = criarSorteio(semente);
  const faltasPendentes = [];
  const alunosChamadaPendentes = [];
  const aulasChamadaPendentes = [];
  const ausencias = new Set();
  const estadoDosAlunos = new Map();
  let chamadasCriadas = 0;
  let faltasCriadas = 0;
  let alunosNaChamada = 0;

  const fatorSemana = { 1: 1.35, 2: 1.0, 3: 0.95, 4: 1.0, 5: 1.25 };
  const fatorMes = {
    2: 1,
    3: 1,
    4: 1.05,
    5: 1.1,
    6: 1.2,
    7: 1.25,
    8: 1.2,
    9: 1.05,
    10: 1,
    11: 1.1,
    12: 1.15,
  };
  const semanasDeProva = [
    [4, 22, 30],
    [6, 15, 26],
    [9, 8, 19],
    [12, 1, 12],
  ];

  indiceTurma = 0;
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const rotulo = `${serie.nome} ${letra}`;
      const turmaId = idsDeTurmas[rotulo];
      const alunosDaTurmaAtual = (
        await cliente.query(
          "select id, nome, ordem from alunos where turma_id = $1 order by ordem",
          [turmaId],
        )
      ).rows;
      const aulasDaTurma = (
        await cliente.query("select id from horarios where turma_id = $1 order by ordem", [turmaId])
      ).rows;
      if (alunosDaTurmaAtual.length === 0 || aulasDaTurma.length === 0) {
        indiceTurma += 1;
        continue;
      }
      const idsDeAula = aulasDaTurma.map((aula) => aula.id);

      for (const aluno of alunosDaTurmaAtual) {
        const chave = `${semente}:aluno:${rotulo}:${aluno.ordem}`;
        const cronico = valorEstavel(`${chave}:cronico`) < 0.08;
        const base = valorEstavel(`${chave}:prop`);
        estadoDosAlunos.set(aluno.id, {
          cronico,
          propensao: cronico ? 0.12 + 0.07 * base : 0.01 + 0.12 * base * base,
          sequencia: 0,
        });
      }

      for (const dia of dias) {
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

        for (const aluno of alunosDaTurmaAtual) {
          alunosChamadaPendentes.push([frequenciaId, aluno.id]);
        }
        aulasChamadaPendentes.push(...idsDeAula.map((aulaId) => [frequenciaId, aulaId]));
        alunosNaChamada += alunosDaTurmaAtual.length;

        const data = dataCivil(dia);
        const diaSemana = data.getUTCDay();
        const mes = data.getUTCMonth() + 1;
        const diaDoMes = data.getUTCDate();
        const prova = semanasDeProva.some(
          ([m, inicio, fim]) => m === mes && diaDoMes >= inicio && diaDoMes <= fim,
        );

        for (const aluno of alunosDaTurmaAtual) {
          const estado = estadoDosAlunos.get(aluno.id);
          let ausente;
          if (estado.sequencia > 0) {
            ausente = sorteio() < (estado.cronico ? 0.55 : 0.35);
          } else {
            const probabilidade =
              estado.propensao * fatorSemana[diaSemana] * (fatorMes[mes] ?? 1) * (prova ? 0.65 : 1);
            ausente = sorteio() < Math.min(0.9, probabilidade);
          }
          if (!ausente) {
            estado.sequencia = 0;
            continue;
          }
          estado.sequencia += 1;
          ausencias.add(`${aluno.id}|${dia}`);
          const justificativa =
            sorteio() < (estado.sequencia >= 2 ? 0.65 : 0.3)
              ? escolherPeso(MOTIVOS_PESADOS, sorteio())
              : null;
          for (const aulaId of idsDeAula) {
            faltasPendentes.push([frequenciaId, aluno.id, aulaId, justificativa]);
          }
          faltasCriadas += idsDeAula.length;
        }
      }
      indiceTurma += 1;
    }
  }

  for (let inicio = 0; inicio < alunosChamadaPendentes.length; inicio += 5000) {
    const lote = alunosChamadaPendentes.slice(inicio, inicio + 5000);
    await cliente.query(
      `insert into alunos_chamada (frequencia_id, aluno_id)
       select v.frequencia, v.aluno
       from (select unnest($1::uuid[]) as frequencia, unnest($2::uuid[]) as aluno) as v
       on conflict do nothing`,
      [lote.map((linha) => linha[0]), lote.map((linha) => linha[1])],
    );
  }
  for (let inicio = 0; inicio < aulasChamadaPendentes.length; inicio += 5000) {
    const lote = aulasChamadaPendentes.slice(inicio, inicio + 5000);
    await cliente.query(
      `insert into aulas_chamada (frequencia_id, horario_id)
       select v.frequencia, v.aula
       from (select unnest($1::uuid[]) as frequencia, unnest($2::uuid[]) as aula) as v
       on conflict do nothing`,
      [lote.map((linha) => linha[0]), lote.map((linha) => linha[1])],
    );
  }
  for (let inicio = 0; inicio < faltasPendentes.length; inicio += 4000) {
    const lote = faltasPendentes.slice(inicio, inicio + 4000);
    await cliente.query(
      `insert into faltas (frequencia_id, aluno_id, horario_id, justificativa, observacao)
       select v.frequencia, v.aluno, v.horario, v.justificativa, null
       from (select unnest($1::uuid[]) as frequencia, unnest($2::uuid[]) as aluno,
                    unnest($3::uuid[]) as horario, unnest($4::text[]) as justificativa) as v
       on conflict do nothing`,
      [
        lote.map((linha) => linha[0]),
        lote.map((linha) => linha[1]),
        lote.map((linha) => linha[2]),
        lote.map((linha) => linha[3]),
      ],
    );
  }

  // Saídas e entradas espalhadas pelos dias, sem coincidir com a falta do aluno.
  let saidasCriadas = 0;
  let entradasCriadas = 0;
  const turmasComAlunos = [];
  for (const serie of SERIES) {
    for (const letra of serie.turmas) {
      const turmaId = idsDeTurmas[`${serie.nome} ${letra}`];
      const alunos = (
        await cliente.query("select id, nome from alunos where turma_id = $1 order by ordem", [
          turmaId,
        ])
      ).rows;
      if (alunos.length > 0) {
        turmasComAlunos.push({ turmaId, rotulo: `${serie.nome} ${letra}`, alunos });
      }
    }
  }

  for (let indiceDia = 0; indiceDia < dias.length; indiceDia += 1) {
    const dia = dias[indiceDia];
    const quantidadeSaidas = sorteio() < 0.55 * PERFIS[perfil].densidade ? 2 : 1;
    for (let n = 0; n < quantidadeSaidas; n += 1) {
      const turma = turmasComAlunos[Math.floor(sorteio() * turmasComAlunos.length)];
      const aluno = turma.alunos[Math.floor(sorteio() * turma.alunos.length)];
      if (ausencias.has(`${aluno.id}|${dia}`)) continue;
      const momento = MOMENTOS_SAIDA[Math.floor(sorteio() * MOMENTOS_SAIDA.length)];
      const justificativa = escolherPeso(MOTIVOS_PESADOS, sorteio());
      const liberadoPorCodigo =
        sorteio() < 0.8 ? liberadores[Math.floor(sorteio() * liberadores.length)]?.codigo : null;
      const inserida = await cliente.query(
        `insert into saidas_antecipadas
           (aluno_id, dia, momento, horario, justificativa, observacao, liberado_por_codigo, criado_por_id)
         values ($1, $2, $3, $4, $5, null, $6, $7)
         on conflict (aluno_id, dia) do nothing
         returning id`,
        [
          aluno.id,
          dia,
          momento,
          momento.startsWith("aula_") ? horarioDaAula(Number(momento.slice(5))) : null,
          justificativa,
          liberadoPorCodigo,
          coordenacaoId,
        ],
      );
      saidasCriadas += inserida.rowCount;
    }

    if (sorteio() < 0.85 * PERFIS[perfil].densidade) {
      const turma = turmasComAlunos[Math.floor(sorteio() * turmasComAlunos.length)];
      const aluno = turma.alunos[Math.floor(sorteio() * turma.alunos.length)];
      if (!ausencias.has(`${aluno.id}|${dia}`)) {
        const momento = MOMENTOS_SAIDA[Math.floor(sorteio() * MOMENTOS_SAIDA.length)];
        const motivo =
          JUSTIFICATIVAS_ENTRADA[Math.floor(sorteio() * JUSTIFICATIVAS_ENTRADA.length)];
        const responsavel = liberadores[Math.floor(sorteio() * liberadores.length)];
        const inserida = await cliente.query(
          `insert into entradas_atrasadas
             (aluno_id, turma_id, turma_rotulo, dia, horario, motivo, registrado_por_nome,
              momento, responsavel_registro_codigo, responsavel_registro_nome, criado_por_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (aluno_id, dia) do nothing
           returning id`,
          [
            aluno.id,
            turma.turmaId,
            turma.rotulo,
            dia,
            `${String(7 + Math.floor(sorteio() * 3)).padStart(2, "0")}:${sorteio() < 0.5 ? "10" : "40"}`,
            motivo,
            "Coordenação",
            momento,
            responsavel?.codigo ?? null,
            responsavel?.rotulo ?? null,
            coordenacaoId,
          ],
        );
        entradasCriadas += inserida.rowCount;
      }
    }
  }

  // Frequências parciais: dia inteiro sem chamada, turno e aulas específicas.
  let parciaisCriadas = 0;
  const diasDeParcial = dias.filter((_, indice) => indice % 9 === 4);
  for (const dia of diasDeParcial) {
    const turma = turmasComAlunos[Math.floor(sorteio() * turmasComAlunos.length)];
    const aluno = turma.alunos[Math.floor(sorteio() * turma.alunos.length)];
    if (ausencias.has(`${aluno.id}|${dia}`)) continue;
    const tipo = ["DIA_INTEIRO", "TURNO", "AULAS"][Math.floor(sorteio() * 3)];
    const aulas =
      tipo === "AULAS"
        ? Array.from({ length: 1 + Math.floor(sorteio() * 4) }, (_, indice) => indice + 1)
        : tipo === "TURNO"
          ? Array.from({ length: AULAS_DA_MANHA }, (_, indice) => indice + 1)
          : [];
    const registradoSeduc = sorteio() < 0.4;
    const inserida = await cliente.query(
      `insert into frequencias_parciais
         (aluno_id, dia, turma_id, aluno_nome, turma_nome, tipo, turno, aulas, observacao,
          registrado_seduc, registrado_seduc_em, registrado_seduc_por_id, registrado_seduc_por_nome,
          revisao, criado_por_id, atualizado_por_id, criado_em, atualizado_em)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14, $14, now(), now())
       on conflict (aluno_id, dia) do nothing
       returning id`,
      [
        aluno.id,
        dia,
        turma.turmaId,
        aluno.nome,
        turma.rotulo,
        tipo,
        tipo === "TURNO" ? "MANHA" : null,
        aulas,
        tipo === "DIA_INTEIRO"
          ? "Dia inteiro sem chamada diária"
          : "Registro parcial da coordenação",
        registradoSeduc,
        registradoSeduc ? new Date() : null,
        registradoSeduc ? coordenacaoId : null,
        registradoSeduc ? "Coordenação" : null,
        coordenacaoId,
      ],
    );
    parciaisCriadas += inserida.rowCount;
  }

  const totalAlunos = (
    await cliente.query(
      `select count(*)::int as total from alunos where turma_id = any($1::uuid[])`,
      [Object.values(idsDeTurmas)],
    )
  ).rows[0].total;

  console.log(
    `Semente pronta: ${dias.length} dias letivos de ${ano}, ${SERIES.length} séries, ` +
      `${Object.keys(idsDeTurmas).length} turmas, ${grade.length} aulas por turma, ${totalAlunos} alunos, ` +
      `${diretoresCriados} diretores novos, ${justificativasNovas} justificativas novas, ${feriadosInseridos} feriados, ` +
      `${chamadasCriadas} chamadas, ${alunosNaChamada} presenças na lista, ${faltasCriadas} faltas, ` +
      `${saidasCriadas} saídas, ${entradasCriadas} entradas e ${parciaisCriadas} parciais. ` +
      `Diretores de exemplo: diretor.1a e diretor.2b (palavra-chave ${senhaDiretor}).`,
  );
} catch (erro) {
  console.error("Falha ao semear:", erro.message);
  process.exit(3);
} finally {
  await cliente.end().catch(() => {});
}
