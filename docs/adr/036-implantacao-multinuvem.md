# ADR-036: Implantação em AWS, Azure e GCP com Terraform

Estado: aceita. Data: 2026-10-03.

## Contexto

O produto já é publicado na Vercel, com o caminho de produção em [deploy.md](../deploy.md), e o Supabase atende o banco. Surgiu a necessidade de oferecer uma segunda opção de implantação em nuvens tradicionais, com infraestrutura declarativa, sem custo de nuvem nos testes e sem depender da Vercel para a agenda de notificações.

## Decisão

- Cada nuvem ganha um módulo raiz de Terraform em `infra/terraform/<nuvem>`, parametrizado por `modo_local`. No modo local os recursos apontam para os emuladores do Floci e usam valores de desenvolvimento; fora dele valem os serviços gerenciados, com criptografia, backups e segredos write-only.
- O alvo de computação é ECS Fargate na AWS, App Service no Azure em produção e Container Apps no modo local, e Cloud Run no GCP. O banco é sempre PostgreSQL gerenciado, com o mesmo administrador na `DATABASE_URL` e na `DIRECT_URL`: não existe papel de runtime separado.
- O cache externo e o armazenamento de anexos ficam de fora das três nuvens. A aplicação não usa Redis e os anexos continuam fora do escopo.
- A agenda de notificações permanece no GitHub Actions. Nenhuma nuvem cria EventBridge Scheduler, jobs do Container Apps ou Cloud Scheduler.
- A integração opcional com Google Planilhas não cria recursos de nuvem: as variáveis `GOOGLE_*` são configuradas no serviço de computação quando a escola habilita a integração, e a rede apenas precisa de saída HTTPS.
- O ciclo local e de integração contínua usa `infra/floci/compose.floci.yml` e `infra/floci/testar.sh`, que aplicam e destroem cada nuvem no emulador e conferem a sonda de saúde.
- A imagem ganha uma sonda de prontidão em `HEALTHCHECK`, usada pelo Docker e pelos emuladores de Container Apps.

## Alternativas

Manter apenas a Vercel deixaria a escola sem opção de hospedagem própria. Usar um único módulo com condicionais por nuvem misturaria provedores e dificultaria a validação. Provisionar cache e armazenamento nas três nuvens adicionaria custo e complexidade sem uso no produto. Criar agendadores nativos duplicaria a agenda que já funciona pelo GitHub Actions.

## Consequências

- A Vercel continua sendo a opção padrão documentada; a nuvem tradicional é uma alternativa.
- O caminho de produção depende de recursos que o emulador não cobre, como App Service, Key Vault e Artifact Registry, validados por `terraform validate` e não pelo Floci.
- O modo local tem limites registrados em [implantacao-nuvem.md](../implantacao-nuvem.md), como a ausência de registros de imagem e a limitação de ingress h2c dos emuladores de Container Apps e Cloud Run com o servidor standalone do Next.
- Rotação automática das senhas do banco fica como evolução; a troca acontece ao incrementar `versao_segredos`.
