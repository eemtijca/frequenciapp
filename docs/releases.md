# Releases

Este documento descreve a política de versões e o fluxo de release do FrequenciApp.

## Política de versão

O projeto segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/) e mantém o [CHANGELOG.md](../CHANGELOG.md) no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

- Versão maior: mudança incompatível em rotas, contratos da API, formato do backup ou configuração obrigatória.
- Versão menor: funcionalidade nova compatível com as versões anteriores.
- Versão de correção: correção de comportamento, segurança e dependências.

Enquanto a primeira versão pública não é lançada, a versão permanece fixada em `0.1.0` e as mudanças acumulam na seção Não publicado do changelog. Não há deploy de produção pela `main`, nem antes da primeira release: a implantação exige uma tag estável.

## Fluxo a partir da v1.0.0

A primeira release será a `v1.0.0` e inaugura o único caminho de produção:

1. o [release-please](https://github.com/googleapis/release-please) mantém um pull request de release com a versão e o changelog;
2. o merge do pull request de release cria a tag `vX.Y.Z` e a release imutável no GitHub;
3. `publicacao.yml` valida identidade e publica as imagens no GHCR; `implantacao.yml` é o proprietário da sequência de implantação no environment `release`, com build anterior à migração;
4. o deploy de produção acontece somente por tag; os previews continuam por pull request.

As entradas do changelog vêm dos títulos dos pull requests, escritos no presente do indicativo e lidos como afirmações sobre a mudança; o merge por squash usa o título como commit na `main`.

## Etiquetas de versão

- `versao: maior`, `versao: menor` e `versao: correcao` são aplicadas pelo workflow de etiquetas conforme o título do pull request.
- O rodapé `Assisted-by` registra a autoria assistida por IA.

## Retroporte e suporte

- Correções entram primeiro na `main` e saem na próxima versão de correção.
- Quando existir uma linha antiga a manter, a branch `release/1.x` nasce da tag correspondente e recebe retroportes com a etiqueta `backport release/1.x`.
- A linha anterior recebe apenas segurança e correções críticas por 3 meses após o lançamento do próximo major.

## Backup, compatibilidade e recuperação

A seção mutante usa `cancel-in-progress:false` e uma chave comum por destino. `migracoes.yml` não migra mais por um caminho paralelo. A implantação aceita somente tag estável, inclusive antes da primeira release; push na `main` não inicia produção. O migrador mantém as duas travas consultivas e a conferência de checksums.

Antes da primeira mutação, o mantenedor registra `IMPLANTACAO_ATESTADO` com `sha`, `destino: "producao"`, `backupVerificado`, `recuperacaoVerificada`, `migracoesExpansivas` e `autoDeployCoordenado`. Todos os booleanos precisam ser verdadeiros para a revisão em questão. Atestar não executa backup nem ensaio de recuperação; o recibo depende dessas verificações reais previamente autorizadas. Configuração nativa de auto-deploy e proteções dos environments permanecem externas e não verificadas por unidade.

O código valida e constrói a revisão antes de migrar, publica sem apontar o domínio, promove e exige `commit` igual ao SHA em `/api/saude`. Falha desde a entrada no estágio de migração informa que o schema pode já estar aplicado, inclusive em aplicação parcial. Não reexecutar automaticamente procedimento destrutivo. Recuperar a imagem anterior não reverte o banco; dados exigem decisão e procedimento de recuperação próprios, preferencialmente migração corretiva compatível.

## Identidade de publicação

Release e dispatch passam pelo mesmo validador de versão, ref e conteúdo. Tag inexistente, branch homônima, SemVer não estável, pacote ou SHA divergente interrompem antes do registry. A tag completa `refs/tags/v<versao>` precisa resolver para o SHA do checkout, o commit precisa ser ancestral da `main` e o `package.json` desse commit precisa declarar a mesma versão. Publicação da aplicação e do backup deriva dos mesmos valores canônicos.

O workflow lê o inventário de releases antes de publicar e `latest` é monotônico: uma versão anterior continua disponível com a própria tag e com `sha-<SHA>`, mas não reposiciona o canal estável. O dispatch manual precisa ser executado na tag correspondente; executar em uma branch homônima é recusado. Não alterar `0.1.0` nem criar tag pública só para satisfazer testes.

Para conferir a identidade sem publicar, use um repositório Git descartável com a mesma tag e o mesmo `package.json`:

```bash
PUBLICACAO_RELEASES=releases.json node scripts/github/validar-publicacao.mjs
pnpm exec vitest run tests/unidade/infra/publicacao.test.ts tests/unidade/infra/implantacao.test.ts tests/unidade/infra/implantacao-entrada.test.ts
```
