# ADR-064: auto-hospedagem com contrato portátil, proxy, backup e atualização

## Estado

Implementada para revisão.

## Contexto

O FrequenciApp funciona na Vercel, em Docker Compose, em máquina com systemd e nas implantações de nuvem descritas em [implantacao-nuvem.md](../implantacao-nuvem.md). A operação em servidor próprio ainda dependia de decisões externas ao repositório:

- não havia proxy reverso com TLS;
- não havia backup automático do banco;
- a atualização era manual;
- a agenda de cinco minutos dependia do GitHub Actions;
- o backup das planilhas usava GitHub Actions e um destino específico;
- não havia chart Kubernetes nem publicação ARM64;
- o Compose publicava a aplicação na porta 3000 e usava senha fixa no banco.

A escola precisa de instalação em VPS ou máquina on-premises sem perder a possibilidade de usar Vercel, AWS, Azure ou GCP. O runtime da aplicação não pode depender de uma plataforma, de um proxy, de um agendador, de um provedor de objetos ou de uma autoridade certificadora.

## Decisão

Separar o projeto em dois níveis.

### Contrato portátil obrigatório

- Imagem OCI multi-arquitetura AMD64 e ARM64.
- PostgreSQL 17 acessível por URL.
- Configuração por variáveis de ambiente.
- HTTP na porta 3000 e saúde em `/api/saude`.
- Cabeçalhos `X-Forwarded-For`, `X-Forwarded-Proto` e `X-Forwarded-Host`.
- Migrações por `prisma migrate deploy` ou `node ./docker/app/migrar.mjs`.
- `MIGRAR_NA_PARTIDA=true|false`, com padrão `true`.
- Agenda por endpoints autenticados com `CRON_SECRET`.
- Backup por `pg_dump` e restauração por `pg_restore`.

Nenhum SDK de provedor entra no runtime. Nenhum proxy, agendador ou armazenamento é obrigatório.

### Referências de infraestrutura

- Docker Compose com Caddy ou Nginx, TLS público ou interno.
- Nginx com Certbot no modo público.
- Cron no servidor para agenda, backup, atualização e renovação do Nginx.
- Backup do banco com `pg_dump`, GPG de chave pública ou age, rclone e verificação por download.
- Backup das planilhas no contêiner de backup, usando a rotina existente.
- Chart Helm com Deployment, Service, Ingress, ConfigMap, Secret, initContainer de migração, CronJob de agenda e CronJobs de backup.
- Publicação multi-arquitetura da aplicação e da imagem de backup no GHCR.
- Workflows de nuvem preservados, mas desativáveis por variável.

### Atualização

- `auto`, `release` e `main`.
- `auto` usa a branch principal enquanto não houver tag e passa a release quando uma tag contém o commit implantado.
- Backup obrigatório antes da aplicação.
- Migrações novas bloqueiam a atualização automática por padrão.
- Rollback de imagem e commit em caso de falha.
- A atualização automática é uma referência para Compose. Kubernetes, Vercel, ECS, Cloud Run e App Service usam o próprio rollout.

### Workflows

- `DEPLOY_TARGET=servidor` desativa deploy, migração de produção e preview de Vercel.
- `AGENDA_EXTERNA=servidor` desativa notificações e fila no GitHub.
- `BACKUP_EXTERNO=servidor` desativa o backup externo no GitHub.
- Sem variável, o comportamento anterior é preservado.
- A variável vazia mantém compatibilidade com instalações existentes.

## Alternativas consideradas

### Apenas Vercel

Manteria a operação simples, mas não atenderia VPS, on-premises, Kubernetes nem a exigência de backup próprio.

### Apenas Docker Compose

Cobriria a escola, mas ignoraria Vercel, AWS, Azure, GCP e Kubernetes. O contrato portátil permite que a aplicação rode em qualquer runtime OCI sem abandonar as referências existentes.

### Watchtower para atualização

Watchtower não faz backup antes, não bloqueia migração, não verifica a saúde pública e não tem rollback controlado. A rotina com Git, imagem, backup e healthcheck cobre esses riscos.

### Backup dentro da aplicação

A aplicação não deve receber credenciais de armazenamento nem executar transferências durante requisições escolares. A rotina fica fora do runtime.

### Dropbox obrigatório

O destino deve ser configurável. rclone cobre S3, B2, Drive, Dropbox, SFTP, NAS e disco local. O Dropbox continua possível, mas não é requisito.

### age apenas

GPG e age são suportados. A escola escolhe o esquema. GPG é comum em ambientes com chaves já existentes; age é simples e moderno.

### rclone crypt no lugar de GPG e age

O crypt mantém a chave no servidor e dificulta a conferência por download. A cifra do arquivo antes do transporte mantém a chave privada fora da máquina.

### Nginx apenas ou Caddy apenas

Caddy reduz a operação de certificados. Nginx atende escolas que já operam a pilha. As duas referências são mantidas, com Caddy como padrão.

### Publicar apenas AMD64

A imagem AMD64 atende a VPS atual, mas limita a portabilidade. A publicação multi-arquitetura evita um segundo caminho de build para ARM64.

## Consequências

### Positivas

- A aplicação pode ser executada em VPS, servidor dedicado, on-premises, Kubernetes e nuvem.
- O backup do banco passa a ser diário, cifrado e verificável.
- A atualização tem backup, bloqueio de migração, healthcheck e rollback.
- As planilhas continuam com cópia própria.
- A agenda deixa de depender do GitHub Actions em servidor persistente.
- Vercel, AWS, Azure e GCP continuam suportados.
- A imagem e o chart são validados em AMD64 e ARM64.

### Negativas e riscos

- A matriz de infraestrutura aumenta: Compose, Kubernetes, nuvem, dois proxies e dois modos de TLS.
- A chave privada GPG ou age e o `AUTH_SECRET` passam a ser dependências operacionais críticas.
- O backup local no mesmo disco não é recuperação de desastre.
- A publicação multi-arquitetura aumenta o tempo do release.
- O chart Kubernetes não instala PostgreSQL e exige um banco externo.
- A atualização automática não desfaz migração aplicada.
- O grupo `docker` continua equivalente a privilégio de root.

### Operação

- O servidor precisa de cron, rclone, GPG ou age, Docker e espaço para backup.
- A escola define retenção, custódia de chaves e periodicidade de ensaio.
- O runbook de restauração precisa ser testado antes de considerar a instalação concluída.
- As issues antigas de backup com GitHub Actions, Dropbox e age são substituídas por este desenho.
