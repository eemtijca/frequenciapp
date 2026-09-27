-- Linha da integração das saídas antecipadas, criada desligada na migração
-- para leituras concorrentes não disputarem a criação do registro.
insert into integracoes_planilha (id, finalidade, ativa, modo, atualizado_em)
values ('saidas', 'SAIDAS', false, 'CONSERVADOR', now())
on conflict (id) do nothing;
