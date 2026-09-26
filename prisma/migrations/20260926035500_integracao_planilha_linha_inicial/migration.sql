-- Linha única da integração com a planilha, criada na migração para leituras
-- concorrentes não disputarem a criação do registro.
insert into integracoes_planilha (id, ativa, modo, atualizado_em)
values ('principal', false, 'CONSERVADOR', now())
on conflict (id) do nothing;
