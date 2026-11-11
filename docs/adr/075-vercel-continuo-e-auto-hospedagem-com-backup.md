# ADR-075: Vercel contínuo e auto-hospedagem com backup obrigatório

## Estado

Aceita em 2026-11-11.

## Contexto

O fluxo da Vercel herdou o atestado `IMPLANTACAO_ATESTADO` da auto-hospedagem. Esse atestado exige backup verificado, recuperação verificada, migração expansiva e coordenação do auto-deploy para o SHA. As verificações fazem sentido quando o operador controla o banco e as rotinas de backup, mas não quando o PostgreSQL é gerenciado pela plataforma.

Na prática, o environment `release` recusava a `main`, o atestado impedia o disparo automático e o auto-deploy nativo da Vercel publicava o código sem aplicar a migração. A `l07_outbox_escolar_e_conferencia` ficou pendente e o salvamento da chamada passou a falhar na tabela `intencoes_envio_escolar`.

A auto-hospedagem já tem portão próprio: `scripts/servidor/atualizar.sh` executa backup obrigatório antes da atualização e exige confirmação para aplicar migrações. O chart Kubernetes mantém o hook `backup-gate` antes do upgrade.

## Decisão

- O `implantacao.yml` é o único caminho de produção da Vercel e roda em cada push na `main`, além de tags estáveis.
- A Vercel não usa `IMPLANTACAO_ATESTADO` nem exige backup e recuperação manuais. A sequência valida, constrói, migra, publica sem domínio, promove e confere a saúde por SHA.
- O auto-deploy nativo da `main` fica desligado em `vercel.json` com `git.deploymentEnabled.main=false` e também no painel da Vercel. Previews de outros branches continuam.
- A auto-hospedagem mantém o backup obrigatório, a confirmação de migração e o rollback verificado em `scripts/servidor/atualizar.sh`. O Kubernetes mantém o hook `backup-gate`.
- O atestado de backup e recuperação não é transferido para a Vercel. A recuperação da Vercel depende do backup e da restauração da plataforma.
- O `migracoes.yml` continua como entrada manual que delega a sequência inteira, sem um segundo caminho de migração.

## Alternativas consideradas

- Manter o atestado na Vercel: recusado porque as verificações pertencem ao operador do banco e bloqueiam a migração automática da `main`.
- Manter o auto-deploy nativo: recusado porque a publicação pode ocorrer antes da migração, como no incidente da tabela `intencoes_envio_escolar`.
- Migrar dentro do build da Vercel: recusado porque o build também roda em previews e mistura a credencial de migração com a construção da aplicação.
- Remover o portão da auto-hospedagem: recusado porque lá o banco é operado pela escola e o backup precisa ser comprovado antes da migração.

## Consequências

- Cada commit na `main` publica pela Vercel depois de aplicar as migrações pendentes.
- A auto-hospedagem continua exigindo backup verificado e revisão de migrações.
- A Vercel depende dos backups da plataforma e de migrações expansivas.
- O environment `release` precisa aceitar `main`, além das tags estáveis.
- O `IMPLANTACAO_ATESTADO` deixa de existir no fluxo da Vercel e permanece apenas nos controles da auto-hospedagem.
