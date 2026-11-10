# ADR-072: publicação e implantação coordenadas pela mesma revisão

## Estado

Aceita em 2026-11-10. Revisada em 2026-11-10 para restringir a implantação à tag estável.

## Contexto

Os workflows `migracoes.yml`, `implantacao.yml` e `publicacao.yml` podiam agir sobre o mesmo banco e a mesma imagem sem uma ordem comum. A migração de produção era acionada por push na `main`, enquanto a implantação também publicava a `main` e a publicação manual aceitava uma versão e uma referência sem conferir a tag Git, o commit do checkout e o `package.json` do próprio commit. O canal `latest` podia regredir quando uma versão antiga era publicada depois de uma mais nova.

As issues #413 e #417 registraram o risco. A correção não pode depender das proteções reais de ambiente do GitHub ou da Vercel, que não são verificadas pelo repositório.

## Decisão

- `implantacao.yml` é o único proprietário da sequência de produção: validar, construir, migrar, publicar sem domínio, promover e conferir a saúde por SHA.
- `migracoes.yml` não mantém um caminho paralelo. O workflow manual delega a sequência inteira com `workflow_call` e `secrets: inherit`.
- A seção mutante usa a trava `implantacao-producao` com `cancel-in-progress: false`. Eventos intercalados da mesma implantação são serializados; destinos diferentes usam filas próprias no orquestrador.
- A seleção aceita somente a tag SemVer completa, tanto no evento `release` quanto no dispatch manual. Push na `main` não inicia produção, inclusive antes da primeira release estável.
- O atestado `IMPLANTACAO_ATESTADO` vincula SHA, destino, backup verificado, recuperação verificada, migrações expansivas e coordenação do auto-deploy nativo. Sem os quatro booleanos verdadeiros para o mesmo SHA, a sequência não começa.
- A falha antes da migração é reportada como interrupção segura. A falha a partir da migração informa que o schema pode ter sido aplicado e que rollback de imagem não reverte o banco; não existe repetição automática de etapa mutante.
- `publicacao.yml` valida a identidade antes do login no registry. A versão precisa ser SemVer estável, a referência precisa ser `refs/tags/v<versao>`, a tag, leve ou anotada, precisa resolver para o SHA do checkout, o commit precisa ser ancestral da `main` e o `package.json` desse commit precisa declarar a mesma versão.
- As tags da aplicação e do backup usam a versão canônica validada, `sha-<SHA>` e `latest`. O inventário de releases é lido antes da publicação e `latest` só avança: uma versão anterior continua publicada com a própria tag e com `sha-<SHA>`, mas não reposiciona o canal estável.
- A saúde de produção confere `ok` e `commit` iguais ao SHA promovido. O ambiente `release` e as proteções externas continuam sendo aceites do mantenedor.

## Alternativas consideradas

- Manter migração e implantação em workflows independentes com travas separadas: recusada porque duas travas não impedem a ordem inversa entre uma migração e um deploy concorrente.
- Migrar depois do deploy: recusada porque a aplicação nova poderia servir tráfego sobre um schema antigo.
- Publicar `latest` em toda versão estável: recusada porque um dispatch de versão antiga faria o canal estável regredir.
- Aceitar branch homônima à tag: recusada porque a referência não prova que a versão publicada está no commit revisado.
- Permitir a `main` antes da primeira release: recusada porque a produção deixaria de ter uma revisão versionada e o gatilho de push criaria execuções fora da política de tag.
- Exigir apenas a tag no evento de release: recusada porque o dispatch manual continuaria escolhendo uma referência divergente.
- Repetir a etapa de migração automaticamente após falha: recusada porque não há como garantir que a transação anterior não deixou schema aplicado.

## Consequências

- A publicação de imagem e a implantação passam a depender do mesmo validador de identidade.
- A primeira implantação também exige tag estável; a `main` não é um caminho de produção.
- Cada tag estável tem uma única revisão canônica para a aplicação, o backup e a saúde.
- `latest` pode ficar atrás da última tag publicada, por decisão explícita, quando uma versão antiga é republicada.
- O mantenedor precisa preencher o atestado com os valores da revisão antes de liberar a implantação.
- Falhas depois da migração exigem decisão e procedimento de recuperação do banco; a imagem anterior não é apresentada como rollback de dados.
- A proteção real dos environments e do auto-deploy nativo continua fora do repositório e precisa ser confirmada no GitHub e na Vercel.
