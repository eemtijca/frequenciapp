// Limitador de tentativas por chave, guardado no banco para valer entre
// instâncias (Vercel e várias réplicas). A contagem e a janela avançam num
// único upsert atômico; linhas vencidas são expurgadas de tempos em tempos.
import { banco, objetoDoBanco } from "@/infra/banco";

/** Janela usada pelos limites operacionais que não têm parâmetro próprio. */
const JANELA_PADRAO_MS = 15 * 60 * 1000;
const MAXIMO_PADRAO = 10;
/** Linhas paradas há mais que isso saem no expurgo ocasional. */
const RETENCAO_MS = 24 * 60 * 60 * 1000;
const CHANCE_DE_EXPURGO = 0.02;

/**
 * Registra uma tentativa e devolve false quando a chave passou do máximo na
 * janela. Janela vencida recomeça a contagem em 1.
 */
export async function limiteDeTentativas(
  chave: string,
  maximo = MAXIMO_PADRAO,
  janelaMs = JANELA_PADRAO_MS,
): Promise<boolean> {
  const segundos = janelaMs / 1000;
  const linhas = await banco().$queryRaw<{ contagem: number }[]>`
    INSERT INTO ${objetoDoBanco("tentativas_entrada")} AS tentativa ("chave", "contagem", "janela_inicio")
    VALUES (${chave.slice(0, 300)}, 1, now())
    ON CONFLICT ("chave") DO UPDATE SET
      "contagem" = CASE
        WHEN tentativa."janela_inicio" < now() - make_interval(secs => ${segundos}::double precision)
          THEN 1
        ELSE tentativa."contagem" + 1
      END,
      "janela_inicio" = CASE
        WHEN tentativa."janela_inicio" < now() - make_interval(secs => ${segundos}::double precision)
          THEN now()
        ELSE tentativa."janela_inicio"
      END
    RETURNING "contagem"`;
  if (Math.random() < CHANCE_DE_EXPURGO) await expurgarTentativas();
  return (linhas[0]?.contagem ?? 1) <= maximo;
}

/** Limpa as tentativas de uma chave após sucesso. */
export async function limparTentativas(chave: string): Promise<void> {
  await banco().tentativaEntrada.deleteMany({ where: { chave: chave.slice(0, 300) } });
}

/** Remove chaves paradas; também roda na rotina de operação. */
export async function expurgarTentativas(): Promise<number> {
  const resultado = await banco().tentativaEntrada.deleteMany({
    where: { janelaInicio: { lt: new Date(Date.now() - RETENCAO_MS) } },
  });
  return resultado.count;
}
