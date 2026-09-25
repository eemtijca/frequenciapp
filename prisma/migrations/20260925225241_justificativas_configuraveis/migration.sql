-- CreateTable
CREATE TABLE "justificativas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(10) NOT NULL,
    "rotulo" VARCHAR(60) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "justificativas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "justificativas_codigo_unico" ON "justificativas" (lower("codigo"));

-- Catálogo inicial de justificativas, o mesmo do aplicativo de referência.
INSERT INTO "justificativas" ("codigo", "rotulo")
VALUES
    ('D', 'Doente'),
    ('Dat', 'Doente com atestado'),
    ('LM', 'Licença Maternidade'),
    ('G', 'Grávida'),
    ('T', 'Transporte'),
    ('Vi', 'Viagem'),
    ('CM', 'Consulta Médica'),
    ('De', 'Dentista'),
    ('Lt', 'Luto'),
    ('O', 'Outros'),
    ('C', 'Consulta'),
    ('S', 'Suspensão')
ON CONFLICT DO NOTHING;
