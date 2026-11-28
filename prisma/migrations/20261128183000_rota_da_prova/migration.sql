-- Origem e ordem da rota do ônibus. Tudo nulo: provas já gravadas continuam válidas.
ALTER TABLE "provas_especificas" ADD COLUMN "origem_rota" VARCHAR(200),
ADD COLUMN "origem_latitude" DOUBLE PRECISION,
ADD COLUMN "origem_longitude" DOUBLE PRECISION,
ADD COLUMN "rota_criterio" VARCHAR(12),
ADD COLUMN "rota_voltar" BOOLEAN,
ADD COLUMN "rota_ordem" JSONB;

-- Ponto de partida: as duas coordenadas ou nenhuma, dentro da faixa geográfica.
-- O IS NOT NULL é explícito porque um CHECK com resultado nulo é aprovado.
ALTER TABLE "provas_especificas" ADD CONSTRAINT "provas_especificas_origem_coordenadas_ck" CHECK (
    ("origem_latitude" IS NULL AND "origem_longitude" IS NULL)
    OR (
        "origem_latitude" IS NOT NULL AND "origem_longitude" IS NOT NULL
        AND "origem_latitude" BETWEEN -90 AND 90
        AND "origem_longitude" BETWEEN -180 AND 180
    )
);

ALTER TABLE "provas_especificas" ADD CONSTRAINT "provas_especificas_rota_criterio_ck" CHECK (
    "rota_criterio" IS NULL OR "rota_criterio" IN ('tempo', 'distancia')
);
