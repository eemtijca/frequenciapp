import type pg from "pg";
import { executarLimpezas } from "./limpeza-fixture";

export async function conectarDiretores(cliente: pg.Client, selecionar: () => Promise<void>) {
  try {
    await cliente.connect();
    await selecionar();
  } catch (erro) {
    await cliente.end().catch(() => undefined);
    throw erro;
  }
}

export async function limparDiretores(banco: pg.Client, independente = false) {
  const daSerie =
    "select t.id from turmas t join series s on s.id = t.serie_id where s.nome = 'QD Ano'";
  const acoes = [
    () => banco.query("delete from usuarios where email like 'qd-%'"),
    () => banco.query("delete from tentativas_entrada where chave like '%qd-%'"),
    () => banco.query(`delete from frequencias where turma_id in (${daSerie})`),
    () => banco.query(`delete from alunos where turma_id in (${daSerie})`),
    () =>
      banco.query(
        "delete from turmas where serie_id in (select id from series where nome = 'QD Ano')",
      ),
    () => banco.query("delete from series where nome = 'QD Ano'"),
    () =>
      banco.query(`update parametros_acesso set validade_palavra_dias = 90, sessao_diretor_horas = 12,
       tentativas_por_origem = 10, tentativas_por_login = 30, janela_minutos = 15,
       categorias_diretor = '{faltas}', limite_risco_percentual = 25
     where id = 'principal'`),
  ];
  if (independente) await executarLimpezas(acoes);
  else for (const acao of acoes) await acao();
}

export async function finalizarDiretores(banco: pg.Client | null) {
  await executarLimpezas(
    banco ? [() => limparDiretores(banco, true)] : [],
    banco ? () => banco.end() : undefined,
  );
}

export async function limparSabado(
  banco: pg.Client,
  prefixo: string,
  justificativa: string,
  independente = false,
) {
  const acoes = [
    () =>
      banco.query(
        "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
        [prefixo],
      ),
    () => banco.query("delete from alunos where nome like $1", [`${prefixo}%`]),
    () =>
      banco.query("delete from turmas where serie_id in (select id from series where nome = $1)", [
        prefixo,
      ]),
    () => banco.query("delete from series where nome = $1", [prefixo]),
    () => banco.query("delete from justificativas where codigo = $1", [justificativa]),
  ];
  if (independente) await executarLimpezas(acoes);
  else for (const acao of acoes) await acao();
}

export async function finalizarSabado(
  banco: pg.Client,
  schemaSelecionado: boolean,
  conexaoEncerrada: boolean,
  prefixo: string,
  justificativa: string,
) {
  await executarLimpezas(
    schemaSelecionado ? [() => limparSabado(banco, prefixo, justificativa, true)] : [],
    conexaoEncerrada ? undefined : () => banco.end(),
  );
}

export async function removerFeriadoEmConexaoNova(
  cliente: pg.Client,
  conferir: (cliente: pg.Client) => void,
  selecionar: (cliente: pg.Client) => Promise<void>,
  remover: (cliente: pg.Client, dia: string, nome: string) => Promise<void>,
  dia: string,
  nome: string,
) {
  let falhou = false;
  let primeiroErro: unknown;
  try {
    conferir(cliente);
    await cliente.connect();
    conferir(cliente);
    await selecionar(cliente);
    await remover(cliente, dia, nome);
  } catch (erro) {
    falhou = true;
    primeiroErro = erro;
  } finally {
    try {
      await cliente.end();
    } catch (erro) {
      if (!falhou) {
        falhou = true;
        primeiroErro = erro;
      }
    }
  }
  if (falhou) throw primeiroErro;
}
