-- AlterTable
ALTER TABLE "provas_especificas" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- Coordenadas do local no mapa: as duas ou nenhuma, dentro da faixa geográfica.
-- O IS NOT NULL é explícito porque um CHECK com resultado nulo é aprovado.
ALTER TABLE "provas_especificas" ADD CONSTRAINT "provas_especificas_coordenadas_ck" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR (
        "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        AND "latitude" BETWEEN -90 AND 90
        AND "longitude" BETWEEN -180 AND 180
    )
);
