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

- O Preview pode compartilhar o database PostgreSQL com a produção, usando um schema próprio. Configure `DATABASE_URL` e `DIRECT_URL` no escopo Preview da Vercel com o mesmo parâmetro `schema`, por exemplo `schema=preview`.
- Preserve as URLs de produção e o segredo `DIRECT_URL_PROD`. As migrações de produção não preparam o Preview; aplique as migrações e crie uma conta administrativa no schema de Preview antes de publicar, conforme [deploy.md](deploy.md#preview-em-schema-do-mesmo-banco).
- O schema separa os objetos, mas as permissões da role PostgreSQL definem os limites de acesso. Use credenciais com os privilégios necessários apenas ao ambiente correspondente.

## Agenda e integração

- A agenda de notificações vive no GitHub Actions (`notificacoes.yml`) e usa `APP_URL` e `CRON_SECRET`.
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
3. Rodar `npm run infra:floci` para exercitar o Terraform nos emuladores.
