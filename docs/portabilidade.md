# Portabilidade

A plataforma é um adaptador. A identidade de publicação é a combinação de versão estável, tag completa e commit do conteúdo, não um rótulo escolhido livremente.

## Publicação e identidade

`publicacao.yml` valida tanto release quanto dispatch com `validar-publicacao.mjs`, antes do login no registry. O dispatch precisa usar `refs/tags/v<versao>`, nunca uma branch homônima. A tag, leve ou anotada, resolve até o commit esperado, o commit é ancestral da `main`, o checkout aponta para ele e o `package.json` desse commit declara a mesma versão SemVer estável. Prerelease e divergência não autorizam publicar.

As duas imagens usam a versão canônica, `sha-<SHA completo>` e `latest` estável. Rótulos OCI, `COMMIT_SHA` e `APP_IMAGEM` do backup derivam das mesmas saídas. O job de publicação usa checkout do SHA e concurrency pela versão validada. `latest` é monotônico: uma versão anterior não reposiciona o canal estável depois de uma release mais nova. A publicação não é disparada como teste local. Durante a fase anterior à primeira release, o pacote continua `0.1.0`; testes sintéticos não criam uma release pública.

## Proprietário de implantação

`implantacao.yml` concentra a seção serializada `implantacao-producao`, sem cancelamento da operação em curso. `migracoes.yml` delega a sequência inteira. A seleção aceita `main` antes da primeira release estável e somente tags estáveis depois, com inventário completo de releases. Primeiro valida e constrói, depois migra, publica sem domínio, promove e confere a saúde com o SHA esperado. A trava do migrador no banco permanece intacta.

O atestado `IMPLANTACAO_ATESTADO` precisa corresponder ao SHA e destino e confirmar backup, recuperação, compatibilidade expansiva e coordenação do auto-deploy nativo. Este repositório não preenche um atestado real nem modifica plataformas. Sem essa confirmação, não há migração. Falha após iniciá-la pode deixar schema aplicado: rollback de imagem não desfaz banco, e não existe repetição mutante automática.

O adaptador executável é Vercel. Outros valores de `DEPLOY_TARGET` recusam migração isolada, em vez de manter um segundo dono oculto. A AWS usa um container migrador lateral antes da tarefa principal; Azure e GCP têm jobs próprios e recibo de conclusão por revisão. A ativação desses contratos e sua integração operacional exigem os gates em [implantacao-nuvem.md](implantacao-nuvem.md).

## Schema de Preview

O validador de PR não recebe credencial administrativa. A manutenção usa revisão aprovada; preparo automático está suspenso. A proposta de banco dedicado por PR e o limite da caracterização de PUBLIC estão na [ADR-038](adr/038-automacao-do-schema-de-preview.md), sem afirmar grants ou proteções reais não examinados.

## Agenda e integração

- A agenda de notificações vive no GitHub Actions (`notificacoes.yml`) e usa `APP_URL` e `CRON_SECRET`. A agenda da fila de envios às planilhas (`fila-planilha.yml`) usa os mesmos valores.
- A integração com o Google Planilhas exige saída para `script.google.com` e `script.googleusercontent.com`.
