# Ensaios do servidor

Os ensaios de `tests/servidor/` exercitam as rotinas de auto-hospedagem sem tocar em uma instalação real. Eles usam Git, Docker, PostgreSQL 17, GPG e rclone em diretórios e projetos descartáveis, com dados sintéticos.

## Comandos

```bash
bash tests/servidor/atualizacao.sh
bash tests/servidor/backup-restauracao.sh
bash tests/servidor/restauracao-url.sh
bash tests/servidor/atualizacao-integracao.sh
bash tests/servidor/executar.sh
```

`atualizacao.sh` usa dublês explícitos de Docker e não precisa de PostgreSQL. Os demais ensaios exigem Docker e são executados no fluxo `Servidor` do GitHub Actions. O ensaio de URL também exige `pg_restore` 17 e `psql` no host.

## Contrato dos dublês

- O dublê de Docker registra cada chamada em `DOCKER_LOG` e simula `config`, `build`, `pull`, `ps` e `up`.
- O backup do ensaio do atualizador grava um estado sintético em `ESTADO_DIR` e não usa chave real.
- A simulação é exercitada com tags locais divergentes do remoto local, referência remota removida e estado preexistente. O ensaio compara referências locais e do remoto sintético, índice, worktrees, `FETCH_HEAD`, estado e trava, e recusa qualquer chamada Docker ou backup durante a simulação. Clones parciais com árvore alvo ausente exercitam remoto disponível e indisponível: nenhuma busca implícita ou escrita de objetos é aceita, e comparação impossível precisa falhar sem anunciar ausência de migrações.
- Nenhum ensaio usa dados de alunos, credenciais de produção ou o banco da escola.
