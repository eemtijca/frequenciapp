// FrequenciBI real: autenticação independente, escopos, paginação, ciclo de chaves e limites.
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChaveBi, PaginaBi, EscopoBi } from "@/domain/bi";
const base = process.env.APP_URL ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prefixo = `QA BI ${randomUUID()}`;
let admin = "";
let coord = "";
let serie = "";
let turmaA = "";
let turmaB = "";
const chaves: string[] = [];
const ip = `198.18.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function login(email: string, senha: string) {
  const r = await fetch(`${base}/api/auth/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  expect(r.status).toBe(200);
  return r.headers.get("set-cookie")?.split(";")[0] ?? "";
}
async function acao(corpo: Record<string, unknown>, cookie = admin, origin = base) {
  return fetch(`${base}/api/bi/chaves`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ senha: "DirecaoFrequencia2026", ...corpo }),
  });
}
async function criar(escopo: EscopoBi = {}) {
  const r = await acao({
    acao: "criar",
    rotulo: `${prefixo} ${chaves.length}`,
    escopo,
    expiraEm: null,
  });
  expect(r.status).toBe(200);
  const dados = (await r.json()) as { chave: ChaveBi; segredo: string };
  chaves.push(dados.chave.id);
  return dados;
}
async function ler(segredo?: string, consulta = "recurso=acesso", cookie = "") {
  return fetch(`${base}/api/bi?${consulta}`, {
    headers: {
      ...(segredo ? { Authorization: `Bearer ${segredo}` } : {}),
      Cookie: cookie,
      "X-Forwarded-For": ip,
    },
  });
}
async function pagina(segredo: string, consulta: string) {
  const r = await ler(segredo, consulta);
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("no-store");
  return (await r.json()) as PaginaBi;
}
beforeAll(async () => {
  await db.connect();
  admin = await login("direcao@escola.exemplo", "DirecaoFrequencia2026");
  coord = await login("demo@escola.exemplo", "DemoFrequencia2026");
  const s = await db.query<{ id: string }>(
    "insert into series (nome, ordem) values ($1, 99) returning id",
    [prefixo],
  );
  serie = s.rows[0]?.id ?? "";
  const turmas = await db.query<{ id: string }>(
    "insert into turmas (serie_id,nome) values ($1,'A'),($1,'B') returning id",
    [serie],
  );
  turmaA = turmas.rows[0]?.id ?? "";
  turmaB = turmas.rows[1]?.id ?? "";
  for (const [i, t] of [turmaA, turmaB].entries()) {
    const a = (
      await db.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1,$2,$2,1) returning id",
        [`${prefixo} Aluno ${i}`, t],
      )
    ).rows[0]?.id;
    const h = (
      await db.query<{ id: string }>(
        "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, disciplinas) values ($1,1,'07:00','07:50','{1,2,3,4,5}','{\"1\":\"Matemática\"}') returning id",
        [t],
      )
    ).rows[0]?.id;
    const f = (
      await db.query<{ id: string }>(
        "insert into frequencias (turma_id,dia,revisao,atualizado_em) values ($1,'1991-05-06',1,now()) returning id",
        [t],
      )
    ).rows[0]?.id;
    await db.query("insert into alunos_chamada (frequencia_id,aluno_id) values ($1,$2)", [f, a]);
    if (i === 0)
      await db.query(
        "insert into faltas (frequencia_id,aluno_id,horario_id,observacao) values ($1,$2,$3,'Motivo sintético QA')",
        [f, a, h],
      );
    await db.query(
      "insert into frequencias_parciais (aluno_id,dia,turma_id,aluno_nome,turma_nome,tipo,aulas,atualizado_em) values ($1,'1991-05-06',$2,$3,$4,'DIA_INTEIRO','{}',now())",
      [a, t, `${prefixo} Aluno ${i}`, `${prefixo} ${i}`],
    );
    await db.query(
      "insert into saidas_antecipadas (aluno_id,dia,momento,horario,texto) values ($1,'1991-05-06','MANHA','10:00','Saída sintética')",
      [a],
    );
    await db.query(
      "insert into entradas_atrasadas (aluno_id,turma_id,turma_rotulo,dia,horario,motivo,registrado_por_nome) values ($1,$2,$3,'1991-05-06','08:00','Entrada sintética','Equipe QA')",
      [a, t, `${prefixo} ${i}`],
    );
  }
}, 30000);
afterAll(async () => {
  await db.query(
    "delete from faltas where frequencia_id in (select id from frequencias where turma_id in ($1,$2))",
    [turmaA, turmaB],
  );
  await db.query("delete from frequencias where turma_id in ($1,$2)", [turmaA, turmaB]);
  await db.query("delete from alunos where turma_id in ($1,$2)", [turmaA, turmaB]);
  await db.query("delete from turmas where serie_id=$1", [serie]);
  await db.query("delete from series where id=$1", [serie]);
  await db.query("delete from chaves_bi where id=any($1::uuid[])", [chaves]);
  await db.query("delete from auditoria where acao like 'bi.chave.%' and alvo=any($1::text[])", [
    chaves,
  ]);
  await db.query("delete from tentativas_entrada where chave=any($1::text[])", [
    [`bi-origem:${hash(ip)}`, `bi-invalida:${hash(ip)}`],
  ]);
  await db.end();
});
describe("FrequenciBI", () => {
  it("sessão não autoriza leitura e coordenação não administra chaves", async () => {
    expect((await ler(undefined, "recurso=acesso", admin)).status).toBe(401);
    expect((await acao({ acao: "revogar-todas" }, coord)).status).toBe(403);
    expect(
      (
        await acao(
          { acao: "criar", rotulo: prefixo, expiraEm: null, escopo: {} },
          admin,
          "https://outro.exemplo",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await acao({
          acao: "criar",
          rotulo: prefixo,
          expiraEm: null,
          escopo: {},
          senha: "incorreta",
        })
      ).status,
    ).toBe(400);
  });
  it("o segredo aparece uma vez e o banco e a listagem só conservam metadados", async () => {
    const c = await criar();
    const registro = (
      await db.query<{ segredo_hash: string }>("select segredo_hash from chaves_bi where id=$1", [
        c.chave.id,
      ])
    ).rows[0];
    expect(registro?.segredo_hash).toBe(hash(c.segredo));
    const r = await fetch(`${base}/api/bi/chaves`, { headers: { Cookie: admin } });
    const texto = await r.text();
    expect(texto.includes(c.segredo)).toBe(false);
    expect(texto.includes(hash(c.segredo))).toBe(false);
    expect((await ler(c.segredo)).status).toBe(200);
    const uso = (
      await db.query<{ usos: number; primeiro_uso_em: Date }>(
        "select usos,primeiro_uso_em from chaves_bi where id=$1",
        [c.chave.id],
      )
    ).rows[0];
    expect(uso?.usos).toBe(1);
    expect(uso?.primeiro_uso_em).toBeTruthy();
  });
  it("intersecta turma, série, período e recursos e não permite ampliar pela URL", async () => {
    const c = await criar({
      turmas: [turmaA],
      series: [serie],
      recursos: ["alunos", "chamadas", "faltas", "lista", "saidas", "entradas", "parciais"],
      inicio: "1991-05-01",
      fim: "1991-05-31",
    });
    const p = await pagina(c.segredo, `recurso=alunos&turmaId=${turmaB}`);
    expect(p.linhas).toEqual([]);
    expect((await ler(c.segredo, "recurso=horarios")).status).toBe(403);
    for (const recurso of ["chamadas", "faltas", "lista", "saidas", "entradas", "parciais"]) {
      const p = await pagina(c.segredo, `recurso=${recurso}&inicio=1900-01-01&fim=2100-01-01`);
      expect(p.linhas).toHaveLength(1);
      expect(p.linhas[0]?.turmaId).toBe(turmaA);
      expect(p.linhas[0]?.dia).toBe("1991-05-06");
    }
    expect((await pagina(c.segredo, "recurso=chamadas&inicio=1992-01-01")).linhas).toEqual([]);
  });
  it("as métricas respeitam a chamada histórica e a presença implícita", async () => {
    const c = await criar({ turmas: [turmaA, turmaB] });
    const p = await pagina(c.segredo, "recurso=chamadas&inicio=1991-05-06&fim=1991-05-06");
    const a = p.linhas.find((l) => l.turmaId === turmaA);
    const b = p.linhas.find((l) => l.turmaId === turmaB);
    expect(a?.registrados).toBe(1);
    expect(a?.ausencias).toBe(1);
    expect(a?.presentes).toBe(0);
    expect(b?.presentes).toBe(1);
    await db.query("update alunos set turma_id=$1 where turma_id=$2", [turmaB, turmaA]);
    const depois = await pagina(c.segredo, "recurso=chamadas&inicio=1991-05-06&fim=1991-05-06");
    expect(depois.linhas).toEqual(p.linhas);
    await db.query("update alunos set turma_id=$1 where turma_id=$2 and nome=$3", [
      turmaA,
      turmaB,
      `${prefixo} Aluno 0`,
    ]);
  });
  it("a paginação é estável, limitada e não expõe contas ou recursos internos", async () => {
    const c = await criar({ turmas: [turmaA, turmaB] });
    const a = await pagina(c.segredo, "recurso=alunos&limite=1");
    expect(a.proximaPagina).toBe(2);
    const b = await pagina(c.segredo, "recurso=alunos&limite=1&pagina=2");
    expect(b.proximaPagina).toBeNull();
    expect(a.linhas[0]?.id).not.toBe(b.linhas[0]?.id);
    for (const r of ["usuarios", "sessoes", "auditoria", "fila", "integracoes"])
      expect((await ler(c.segredo, `recurso=${r}`)).status).toBe(400);
    expect((await ler(c.segredo, "recurso=alunos&limite=201")).status).toBe(400);
    expect((await ler(c.segredo, "chave=indevida")).status).toBe(400);
    expect(
      (
        await fetch(`${base}/api/bi`, {
          method: "POST",
          headers: { Authorization: `Bearer ${c.segredo}` },
        })
      ).status,
    ).toBe(405);
  });
  it("edita, rotaciona e revoga com auditoria e preserva o histórico de uso", async () => {
    const c = await criar();
    await pagina(c.segredo, "recurso=acesso");
    expect(
      (
        await acao({
          acao: "editar",
          id: c.chave.id,
          rotulo: `${prefixo} Renomeada`,
          escopo: { turmas: [turmaA] },
          expiraEm: null,
        })
      ).status,
    ).toBe(200);
    const r = await acao({ acao: "rotacionar", id: c.chave.id });
    expect(r.status).toBe(200);
    const n = (await r.json()) as { chave: ChaveBi; segredo: string };
    chaves.push(n.chave.id);
    expect(n.chave.rotulo).toBe(`${prefixo} Renomeada`);
    expect(n.chave.escopo.turmas).toEqual([turmaA]);
    expect((await ler(c.segredo)).status).toBe(401);
    expect((await ler(n.segredo)).status).toBe(200);
    expect((await acao({ acao: "revogar", id: n.chave.id })).status).toBe(200);
    expect((await ler(n.segredo)).status).toBe(401);
    const auditoria = await db.query<{ acao: string }>("select acao from auditoria where alvo=$1", [
      c.chave.id,
    ]);
    expect(auditoria.rows.map((a) => a.acao)).toContain("bi.chave.rotacionar");
    expect(
      (await db.query<{ usos: number }>("select usos from chaves_bi where id=$1", [c.chave.id]))
        .rows[0]?.usos,
    ).toBe(1);
  });
  it("expiração e chave inexistente têm a mesma recusa sem mostrar dados", async () => {
    const c = await criar();
    await db.query("update chaves_bi set expira_em=now()-interval '1 minute' where id=$1", [
      c.chave.id,
    ]);
    const expirada = await ler(c.segredo);
    const invalida = await ler(`fbi_${"a".repeat(43)}`);
    expect(expirada.status).toBe(401);
    expect(await expirada.json()).toEqual(await invalida.json());
  });
  it("limita consultas por chave", async () => {
    const c = await criar();
    const chaveLimite = `bi-chave:${hash(c.segredo)}`;
    await db.query(
      "insert into tentativas_entrada (chave,contagem,janela_inicio) values ($1,240,now())",
      [chaveLimite],
    );
    expect((await ler(c.segredo)).status).toBe(429);
    await db.query("delete from tentativas_entrada where chave=$1", [chaveLimite]);
  });
  it("limita tentativas inválidas por origem", async () => {
    const chaveLimite = `bi-invalida:${hash(ip)}`;
    await db.query(
      "insert into tentativas_entrada (chave,contagem,janela_inicio) values ($1,30,now()) on conflict (chave) do update set contagem=30,janela_inicio=now()",
      [chaveLimite],
    );
    expect((await ler("inválida")).status).toBe(429);
    await db.query("delete from tentativas_entrada where chave=$1", [chaveLimite]);
  });
  it("revoga todas e limpa somente chaves encerradas, sem remover auditoria", async () => {
    // A operação global só roda se todas as chaves do banco forem desta massa.
    const externas = await db.query<{ total: string }>(
      "select count(*) as total from chaves_bi where rotulo not like $1",
      [`${prefixo}%`],
    );
    expect(Number(externas.rows[0]?.total)).toBe(0);
    const c = await criar();
    expect((await acao({ acao: "revogar-todas" })).status).toBe(200);
    expect((await ler(c.segredo)).status).toBe(401);
    const auditorias = await db.query<{ total: string }>(
      "select count(*) as total from auditoria where acao like 'bi.chave.%'",
    );
    expect((await acao({ acao: "limpar" })).status).toBe(200);
    expect(
      Number(
        (
          await db.query<{ total: string }>(
            "select count(*) as total from chaves_bi where rotulo like $1",
            [`${prefixo}%`],
          )
        ).rows[0]?.total,
      ),
    ).toBe(0);
    expect(
      Number(
        (
          await db.query<{ total: string }>(
            "select count(*) as total from auditoria where acao like 'bi.chave.%'",
          )
        ).rows[0]?.total,
      ),
    ).toBeGreaterThanOrEqual(Number(auditorias.rows[0]?.total));
  });
});
