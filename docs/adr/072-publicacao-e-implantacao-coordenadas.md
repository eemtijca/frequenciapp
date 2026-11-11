# ADR-072: publicação e implantação coordenadas pela mesma revisão

## Estado

Aceita em 2026-11-10. Revisada em 2026-11-11 pela [ADR-075](075-vercel-continuo-e-auto-hospedagem-com-backup.md): a `main` é o caminho contínuo da Vercel e o atestado de backup e recuperação pertence à auto-hospedagem.

## Contexto

Os workflows `migracoes.yml`, `implantacao.yml` e `publicacao.yml` podiam agir sobre o mesmo banco e a mesma imagem sem uma ordem comum. A migração de produção era acionada por push na `main`, enquanto a implantação também publicava a `main` e a publicação manual aceitava uma versão e uma referência sem conferir a tag Git, o commit do checkout e o `package.json` do próprio commit. O canal `latest` podia regredir quando uma versão antiga era publicada depois de uma mais nova.

As issues #413 e #417 registraram o risco. A correção não pode depender das proteções reais de ambiente do GitHub ou da Vercel, que não são verificadas pelo repositório.

## Decisão

- `implantacao.yml` é o único proprietário da sequência de produção: validar, construir, migrar, publicar sem domínio, promover e conferir a saúde por SHA.
- `migracoes.yml` não mantém um caminho paralelo. O workflow manual delega a sequência inteira com `workflow_call` e `secrets: inherit`.
- A seção mutante usa a trava `implantacao-producao` com `cancel-in-progress: false`. Eventos intercalados da mesma implantação são serializados; destinos diferentes usam filas próprias no orquestrador.
- A seleção aceita `main` em cada push ou dispatch manual e a tag SemVer completa no evento `release` ou no dispatch manual.
- O fluxo da Vercel não usa `IMPLANTACAO_ATESTADO`. A auto-hospedagem mantém o backup obrigatório em `scripts/servidor/atualizar.sh` e o hook `backup-gate` do Kubernetes. A coordenação do auto-deploy nativo é garantida por `git.deploymentEnabled.main=false` no `vercel.json` e pela configuração do projeto na Vercel.
- A falha antes da migração é reportada como interrupção segura. A falha a partir da migração informa que o schema pode ter sido aplicado e que rollback de imagem não reverte o banco; não existe repetição automática de etapa mutante.
- `publicacao.yml` valida a identidade antes do login no registry. A versão precisa ser SemVer estável, a referência precisa ser `refs/tags/v<versao>`, a tag, leve ou anotada, precisa resolver para o SHA do checkout, o commit precisa ser ancestral da `main` e o `package.json` desse commit precisa declarar a mesma versão.
- As tags da aplicação e do backup usam a versão canônica validada, `sha-<SHA>` e `latest`. O inventário de releases é lido antes da publicação e `latest` só avança: uma versão anterior continua publicada com a própria tag e com `sha-<SHA>`, mas não reposiciona o canal estável.
- A saúde de produção confere `ok` e `commit` iguais ao SHA promovido. O ambiente `release` e as proteções externas continuam sendo aceites do mantenedor.

## Alternativas consideradas

- Manter migração e implantação em workflows independentes com travas separadas: recusada porque duas travas não impedem a ordem inversa entre uma migração e um deploy concorrente.
- Migrar depois do deploy: recusada porque a aplicação nova poderia servir tráfego sobre um schema antigo.
- Publicar `latest` em toda versão estável: recusada porque um dispatch de versão antiga faria o canal estável regredir.
- Aceitar branch homônima à tag: recusada porque a referência não prova que a versão publicada está no commit revisado.
- Exigir apenas a tag no evento de release: recusada porque o dispatch manual continuaria escolhendo uma referência divergente.
- Repetir a etapa de migração automaticamente após falha: recusada porque não há como garantir que a transação anterior não deixou schema aplicado.

## Consequências

- A publicação de imagem e a implantação por tag usam o mesmo validador de identidade.
- Cada tag estável tem uma única revisão canônica para a aplicação, o backup e a saúde.
- `latest` pode ficar atrás da última tag publicada, por decisão explícita, quando uma versão antiga é republicada.
- A Vercel não exige atestado de backup para publicar; a auto-hospedagem continua com o portão próprio antes de migrar.
- Falhas depois da migração exigem decisão e procedimento de recuperação do banco; a imagem anterior não é apresentada como rollback de dados.
- A proteção real dos environments e do auto-deploy nativo continua fora do repositório e precisa ser confirmada no GitHub e na Vercel.
