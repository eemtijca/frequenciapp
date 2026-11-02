// Identidades de catálogo e limpeza conservadora das justificativas da fixture.
import { randomBytes, randomUUID } from "node:crypto";

type Consulta = (sql: string, parametros: unknown[]) => Promise<{ rows: unknown[] }>;

// Não permitir que remoções com cascata apaguem dependentes após falha na limpeza.
export function guardaDependentesFixture() {
  let limpos = false;
  return {
    async limpar(acao: () => Promise<unknown>): Promise<void> {
      await acao();
      limpos = true;
    },
    somenteSeLimpos(acao: () => Promise<unknown>): () => Promise<unknown> {
      return async () => {
        if (!limpos) return;
        try {
          return await acao();
        } catch (erro) {
          limpos = false;
          throw erro;
        }
      };
    },
  };
}

export interface JustificativaFixture {
  id: string;
  codigo: string;
  rotulo: string;
}

// Todas as identidades existem antes de qualquer INSERT, inclusive se a resposta se perder.
export function novasJustificativasFixture(): [JustificativaFixture, JustificativaFixture] {
  const marcador = randomUUID();
  const criar = (indice: number): JustificativaFixture => ({
    id: randomUUID(),
    codigo: `Q${randomBytes(5).toString("hex").slice(0, 9)}`,
    rotulo: `QA Antecipadas ${marcador} ${indice}`,
  });
  const primeira = criar(1);
  let segunda = criar(2);
  while (segunda.codigo === primeira.codigo) segunda = criar(2);
  return [primeira, segunda];
}

export async function inserirJustificativaFixture(
  consultar: Consulta,
  item: JustificativaFixture,
): Promise<void> {
  await consultar("insert into justificativas(id,codigo,rotulo,ativo) values ($1,$2,$3,true)", [
    item.id,
    item.codigo,
    item.rotulo,
  ]);
}

export async function removerJustificativaFixture(
  consultar: Consulta,
  item: JustificativaFixture,
): Promise<void> {
  const parametros = [item.id, item.codigo, item.rotulo];
  // Somente banco sintético exclusivo: NOT EXISTS não protege contra escritores concorrentes.
  const removida = await consultar(
    `delete from justificativas j
     where j.id=$1 and j.codigo=$2 and j.rotulo=$3
       and not exists (select 1 from faltas f where lower(f.justificativa)=lower(j.codigo))
       and not exists (select 1 from saidas_antecipadas s where lower(s.justificativa)=lower(j.codigo))
       and not exists (select 1 from frequencias_parciais p where lower(p.justificativa)=lower(j.codigo))
     returning j.id`,
    parametros,
  );
  if (removida.rows.length) return;
  const restante = await consultar(
    "select id from justificativas where id=$1 and codigo=$2 and rotulo=$3",
    parametros,
  );
  if (restante.rows.length)
    throw new Error(
      `Justificativa ${item.codigo} da fixture ainda possui dependentes; preservada.`,
    );
  const identidade = await consultar("select id from justificativas where id=$1", [item.id]);
  if (identidade.rows.length)
    throw new Error(
      "Justificativa da fixture preservada: resíduo não resolvido por divergência de identidade.",
    );
}
