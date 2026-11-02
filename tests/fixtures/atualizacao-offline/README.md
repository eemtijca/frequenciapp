# Fixture: bloqueio de atualização offline

Esta fixture usa o `ProvedorAtualizacao`, `useAtualizacaoTela`, `BotaoAtualizar` e o toast reais. Os dados são sintéticos; o callback registrado é um spy sem I/O, com Promise liberada manualmente. Não requer aplicação, banco, Docker, sessão ou `.auth`. O Playwright inicia apenas o Vite da fixture em `127.0.0.1:3196`, sem reutilizar servidor existente; o browser bloqueia service workers e rejeita e registra requisições de outras origens.

Após instalar as dependências e o Chromium compatível com o Playwright, execute no worktree (não em paralelo com outro servidor na porta):

```sh
./node_modules/.bin/playwright test --config=playwright.atualizacao-offline.config.ts
```

Controle negativo, com **falha esperada na contagem após o clique offline**:

```sh
OFFLINE_CAUSAL_SEM_RETURN=1 ./node_modules/.bin/playwright test --config=playwright.atualizacao-offline.config.ts
```

Esse modo transforma apenas a cópia transitória do provider servida pelo Vite; a função recusa a transformação se a guarda não ocorrer exatamente uma vez. Não modifica o arquivo de produto. Testes puros da transformação:

```sh
./node_modules/.bin/vitest run --config vitest.config.ts tests/unidade/interface/controle-negativo-offline.test.ts
```

`navigator.onLine` e os eventos online/offline são simulados; não há simulação de timer. O teste aguarda montagem, registro do atualizador e dois frames após os eventos. Ele mantém a Promise pendente nos cliques online, verifica o estado ocupado e a libera explicitamente; depois do aviso offline, observa por 100 ms antes de conferir que a contagem não mudou. Portanto, não testa perda real de conectividade, app completo ou service worker, e a observação não prova ausência de callbacks arbitrariamente tardios. Uma aprovação isolada não explica nem atribui causa aos três GETs inesperados observados no teste full.
