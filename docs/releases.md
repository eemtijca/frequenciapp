# Releases

Este documento descreve a política de versões e o fluxo de release do FrequenciApp.

## Política de versão

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) e mantém o [CHANGELOG.md](../CHANGELOG.md) no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

- Versão maior: mudança incompatível em rotas, contratos da API, formato do backup ou configuração obrigatória.
- Versão menor: funcionalidade nova compatível com as versões anteriores.
- Versão de correção: correção de comportamento, segurança e dependências.

Enquanto a primeira versão pública não é lançada, a versão permanece fixada em `0.1.0` e as mudanças acumulam na seção Não publicado do changelog. O deploy da aplicação acompanha a `main` em cada commit.

## Fluxo de release

A primeira release será a `v1.0.0`. A partir dela:

1. o [release-please](https://github.com/googleapis/release-please) mantém um pull request de release com a versão e o changelog;
2. o merge do pull request de release cria a tag `vX.Y.Z` e a release imutável no GitHub;
3. `publicacao.yml` valida identidade e publica as imagens no GHCR; `implantacao.yml` continua sendo o proprietário da sequência de produção e roda em cada push na `main`, além de aceitar a tag estável;
4. a produção acompanha a `main`; a tag também pode publicar o commit marcado. Os previews continuam por pull request.

As entradas do changelog vêm dos títulos dos pull requests, escritos no presente do indicativo e lidos como afirmações sobre a mudança; o merge por squash usa o título como commit na `main`.

## Etiquetas de versão

- `versao: maior`, `versao: menor` e `versao: correcao` são aplicadas pelo workflow de etiquetas conforme o título do pull request.
- O rodapé `Assisted-by` registra a autoria assistida por IA.

## Retroporte e suporte

- Correções entram primeiro na `main` e saem na próxima versão de correção.
- Quando existir uma linha antiga a manter, a branch `release/1.x` nasce da tag correspondente e recebe retroportes com a etiqueta `backport release/1.x`.
- A linha anterior recebe apenas segurança e correções críticas por 3 meses após o lançamento do próximo major.

## Backup, compatibilidade e recuperação

A seção mutante usa `cancel-in-progress:false` e uma chave comum por destino. `migracoes.yml` não mantém um caminho paralelo. A `main` e as tags estáveis são aceitas. O migrador mantém as duas travas consultivas e a conferência de checksums.

O fluxo da Vercel não usa `IMPLANTACAO_ATESTADO`. A migração roda antes da publicação e a recuperação depende do backup da plataforma. A auto-hospedagem mantém o backup obrigatório em `scripts/servidor/atualizar.sh` e o hook `backup-gate` do Kubernetes; esses portões não valem para a Vercel. O auto-deploy nativo da `main` fica desligado em `vercel.json` e no painel da Vercel, para o workflow ser o único caminho de produção.

O código valida e constrói a revisão antes de migrar, publica sem apontar o domínio, promove e exige `commit` igual ao SHA em `/api/saude`. Falha desde a entrada no estágio de migração informa que o schema pode já estar aplicado, inclusive em aplicação parcial. Não reexecutar automaticamente procedimento destrutivo. Recuperar a imagem anterior não reverte o banco; dados exigem decisão e procedimento de recuperação próprios, preferencialmente migração corretiva compatível.

## Identidade de publicação

Release e dispatch passam pelo mesmo validador de versão, ref e conteúdo. Tag inexistente, branch homônima, SemVer não estável, pacote ou SHA divergente interrompem antes do registry. A tag completa `refs/tags/v<versao>` precisa resolver para o SHA do checkout, o commit precisa ser ancestral da `main` e o `package.json` desse commit precisa declarar a mesma versão. Publicação da aplicação e do backup deriva dos mesmos valores canônicos.

O workflow lê o inventário de releases antes de publicar e `latest` é monotônico: uma versão anterior continua disponível com a própria tag e com `sha-<SHA>`, mas não reposiciona o canal estável. O dispatch manual precisa ser executado na tag correspondente; executar em uma branch homônima é recusado. Não alterar `0.1.0` nem criar tag pública só para satisfazer testes.

Para conferir a identidade sem publicar, use um repositório Git descartável com a mesma tag e o mesmo `package.json`:

```bash
PUBLICACAO_RELEASES=releases.json node scripts/github/validar-publicacao.mjs
pnpm exec vitest run tests/unidade/infra/publicacao.test.ts tests/unidade/infra/implantacao.test.ts tests/unidade/infra/implantacao-entrada.test.ts
```
