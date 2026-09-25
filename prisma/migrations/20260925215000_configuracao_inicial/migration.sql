-- Insere a linha única de configurações com os padrões de fábrica.
INSERT INTO "configuracoes" ("id", "atualizado_em")
VALUES ('principal', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
