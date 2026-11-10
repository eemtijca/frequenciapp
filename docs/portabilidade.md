# Portabilidade

O release é o artefato: a tag `vX.Y.Z` e a imagem publicada no GHCR são a fonte da verdade, e a plataforma de deploy é um adaptador.

## Alvo de deploy

- O workflow `implantacao.yml` lê a variável `DEPLOY_TARGET` do repositório; vazia ou `vercel` publica na Vercel.
- As migrações rodam no release, antes do deploy, no environment `release`, com backup confirmado.
- Para trocar de plataforma, adicione o job do novo alvo e ajuste a variável, sem mexer em tags, changelog ou migrações.

## Artefato

- `publicacao.yml` publica `ghcr.io/<repo>:<versão>` e `:<major>.<minor>` em releases estáveis; `latest` só em versão estável.
- Os rótulos OCI registram versão, revisão e origem da imagem.

## Schema de Preview

O validador de PR não recebe credencial administrativa. A manutenção usa revisão aprovada; preparo automático está suspenso. A proposta de banco dedicado por PR e o limite da caracterização de PUBLIC estão na [ADR-038](adr/038-automacao-do-schema-de-preview.md), sem afirmar grants ou proteções reais não examinados.

## Agenda e integração

- A agenda de notificações vive no GitHub Actions (`notificacoes.yml`) e usa `APP_URL` e `CRON_SECRET`. A agenda da fila de envios às planilhas (`fila-planilha.yml`) usa os mesmos valores.
- A integração com o Google Planilhas exige saída para `script.google.com` e `script.googleusercontent.com`.

## Saída da Vercel

1. Provisionar a infraestrutura com os módulos Terraform existentes apontando `imagem_aplicacao` para a imagem do release.
2. Configurar as variáveis, o banco e o domínio no novo host e cortar o DNS.
3. Manter a agenda no GitHub Actions e desligar a equivalente do provedor.
4. Conferir `/api/saude`, login e o salvamento de uma frequência, mantendo os dois hosts por um período de rollback.
5. Definir `DEPLOY_TARGET` para o novo alvo e desativar o projeto na Vercel.

## Ensaio local

1. Gerar a imagem pela `publicacao.yml` (dispatch manual) ou com `docker build`.
2. Executar o contêiner apontando para o schema de Preview e conferir `/api/saude` e o login.
3. Rodar `pnpm run infra:floci` para exercitar o Terraform nos emuladores.
