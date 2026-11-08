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
- Nenhum ensaio usa dados de alunos, credenciais de produção ou o banco da escola.
