-- Local e ponto opcionais de cada aluno na prova. Nulos herdam os da prova.
-- Colunas novas e anuláveis: as inscrições existentes continuam válidas, sem reescrita.
ALTER TABLE "participantes_prova" ADD COLUMN "local" VARCHAR(120),
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION;

-- Coordenadas do local próprio: as duas ou nenhuma, dentro da faixa geográfica.
-- O IS NOT NULL é explícito porque um CHECK com resultado nulo é aprovado.
ALTER TABLE "participantes_prova" ADD CONSTRAINT "participantes_prova_coordenadas_ck" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR (
        "latitude" IS NOT NULL AND "longitude" IS NOT NULL
        AND "latitude" BETWEEN -90 AND 90
        AND "longitude" BETWEEN -180 AND 180
    )
);
