// Preserva e restaura a configuração de origem nos testes sintéticos,
// sem deixar uma suíte alterar a seleção usada pela seguinte.
import type { Configuracoes } from "@/domain/frequencia";
import { comBanco } from "./banco";

export type ConfiguracaoOrigem = Pick<
  Configuracoes,
  "origemNaChamada" | "origemNaChamadaSerieIds" | "origemNaChamadaTurmaIds"
>;

export async function lerOrigem(): Promise<ConfiguracaoOrigem> {
  return comBanco(async (cliente) => {
    const recurso = await cliente.query<{ ligada: boolean }>(
      "select origem_na_chamada as ligada from configuracoes where id = 'principal'",
    );
    const series = await cliente.query<{ id: string }>(
      "select serie_id as id from configuracoes_origem_series where configuracao_id = 'principal' order by serie_id",
    );
    const turmas = await cliente.query<{ id: string }>(
      "select turma_id as id from configuracoes_origem_turmas where configuracao_id = 'principal' order by turma_id",
    );
    return {
      origemNaChamada: recurso.rows[0]?.ligada ?? false,
      origemNaChamadaSerieIds: series.rows.map((item) => item.id),
      origemNaChamadaTurmaIds: turmas.rows.map((item) => item.id),
    };
  });
}

export async function definirOrigem(configuracao: ConfiguracaoOrigem): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("begin");
    try {
      await cliente.query(
        "update configuracoes set origem_na_chamada = $1 where id = 'principal'",
        [configuracao.origemNaChamada],
      );
      await cliente.query(
        "delete from configuracoes_origem_series where configuracao_id = 'principal'",
      );
      await cliente.query(
        "delete from configuracoes_origem_turmas where configuracao_id = 'principal'",
      );
      await cliente.query(
        "insert into configuracoes_origem_series (configuracao_id, serie_id) select 'principal', unnest($1::uuid[])",
        [configuracao.origemNaChamadaSerieIds],
      );
      await cliente.query(
        "insert into configuracoes_origem_turmas (configuracao_id, turma_id) select 'principal', unnest($1::uuid[])",
        [configuracao.origemNaChamadaTurmaIds],
      );
      await cliente.query("commit");
    } catch (erro) {
      await cliente.query("rollback");
      throw erro;
    }
  });
}
