// Envio incremental da frequência: confirma cada dia pelo período enviado
// e pelo instante de leitura anterior às alterações seguintes da chamada.

export interface ChamadaParaEnvio {
  dia: Date;
  atualizadoEm: Date;
}

export interface EnvioConfirmadoDaFrequencia {
  de: Date;
  ate: Date;
  criadoEm: Date;
}

/** Recebe apenas sucessos sem células puladas e conserva dias ainda não cobertos. */
export function diasSemEnvioConfirmado(
  chamadas: readonly ChamadaParaEnvio[],
  envios: readonly EnvioConfirmadoDaFrequencia[],
): string[] {
  const pendentes = chamadas.filter(
    (chamada) =>
      !envios.some(
        (envio) =>
          envio.de <= chamada.dia &&
          envio.ate >= chamada.dia &&
          envio.criadoEm > chamada.atualizadoEm,
      ),
  );
  return [...new Set(pendentes.map((chamada) => chamada.dia.toISOString().slice(0, 10)))].sort();
}
