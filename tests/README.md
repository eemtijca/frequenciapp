# Testes

O executor gera `AUTH_SECRET` e `CRON_SECRET` sintéticos por rodada. A configuração automática de VAPID deriva o mesmo par no app e nos testes. Não carregar chaves ou arquivos de ambiente da instalação. A suíte não envia push a dispositivos externos; a configuração e a entrega em aparelho real não são comprovadas por esses testes.

Suítes do FrequenciApp com Vitest e Playwright.

`tests/api/notificacoes/notificacoes-agenda.test.ts` exercita a agenda com PostgreSQL real e transporte simulado, incluindo horários, preferências, pendências e reserva concorrente. A suíte não faz envios externos. `tests/ponta-a-ponta/notificacoes/notificacoes.spec.ts` valida a Gestão e a coordenação; `tests/ponta-a-ponta/pwa/pwa-notificacoes.spec.ts` confere consentimento e tipos da conta. Contra servidor de produção em HTTP local, usar `PERMITIR_HTTP=true`. Essa opção não é necessária em desenvolvimento e não devem ser aplicadas a uma implantação HTTPS comum.

| Suíte                     | Comando                               | Pré-requisitos                                                          |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Unidade                   | `pnpm run test:unit`                  | Nenhum.                                                                 |
| Componentes               | `pnpm run test:componentes`           | Chromium instalado pelo Playwright; sem aplicativo ou banco.            |
| Visibilidade dos gráficos | `pnpm run test:graficos-visibilidade` | Chromium; fixture Vite isolada. Não há passo próprio no workflow atual. |
| Contratos de API          | `pnpm run test:api`                   | Docker, pilha exclusiva criada pelo executor.                           |
| Ponta a ponta             | `pnpm run test:e2e`                   | Docker, navegador da imagem do executor.                                |
| PWA                       | `pnpm run test:pwa`                   | Docker, build próprio preparado pelo executor.                          |
| API e unidade             | `pnpm test`                           | Idem, na ordem.                                                         |

Os testes de componente usam os helpers de `tests/apoio`: `vite.ts` sobe a fixture e `navegador.ts` abre o Chromium e aplica o tema. A matriz de `tests/componentes/interface/primitivas.test.ts` cobre contraste, borda, raio, altura, foco e estados desabilitados das primitivas nos dois temas. O guardrail de estrutura reprova opacidade manual para desabilitar controles e bordas transparentes fora das peças internas justificadas. O job `interface` do workflow `qualidade.yml` executa `pnpm run test:componentes`; os testes não precisam de banco nem do aplicativo no ar.

## Unidade

Roda em qualquer ambiente, sem banco e sem rede:

Os helpers E2E que navegam o seletor de período aceitam meses de `1000-01` a
`9999-11` nas duas extremidades e validam o destino antes de abrir o painel.
O limite é conservador e não altera o produto: o seletor anual não preenche
anos menores que 1000 com zeros e `Date.UTC` interpreta anos de 0 a 99 como
1900 a 1999. Além disso, o calendário semanal de dezembro de 9999
avança para um ano ISO de seis dígitos, incompatível com as datas de quatro
dígitos usadas na grade. A conta `deslocamentoMes` continua independente e
aceita `0001-01` a `9999-12`. Os controles e limites efetivos da tela ainda
podem impedir uma escolha; a contagem de passos não tem teto arbitrário.

- `entradas.test.ts` e `planilha-entradas.test.ts`: horário, código por aluno e data, preservação de linhas e fórmulas, releitura, mudança de arquivo e falha sem confirmação com dublê de Sheets API.
- `frequencia.test.ts`: domínio da frequência (calendário, horários, aulas, marca, grade, normalização).
- `relatorios.test.ts`: indicadores do dia, infrequência acumulada entre meses por série e turma, taxa sobre registros com chamada, listas históricas, desistências, ausência parcial em aulas e relatórios por aluno e por saída.
- `justificativas.test.ts`: ordenação e validação do catálogo configurável.
- `planilha.test.ts`: dataframe, esquema da planilha, CSV e planejamento conservador.
- `downloads.test.ts`: senha de exportação, AES-256 real, preservação de bytes, senha incorreta, sal aleatório e alteração da cifra.
- `exportacoes.test.ts` na suíte de API: confirmação da cópia, limite de tentativas, CSRF, papéis e auditoria mínima sem dados escolares.
- `downloads.spec.ts` na suíte de navegador: os três downloads protegidos, formatos originais, cancelamento, senhas locais, toque duplo e repetição após falha.
- `planilha-envios.test.ts`: erro vigente por turma ou por histórico único, data do último envio e datas sem horário em qualquer fuso.
- `planilha-erros.test.ts`: diagnóstico limitado sem divulgar credenciais.
- `usuarios.test.ts`: política de senha, primeiro nome, rótulo de papel e capacidades por papel.
- `erros.test.ts`: tradução das exceções do Prisma para português com status correto.
- `hash.test.ts`: scrypt de senhas.
- `decisao-admin.test.ts`: bootstrap do administrador no modo `--somente-criar`.
- `diretores.test.ts`: identificador do diretor, palavra-chave gerada, estado da credencial, vínculos no tempo e categorias visíveis.
- `guardas-rotas.test.ts`: todo manipulador em `src/app/api` passa por uma guarda de capacidade, salvo as rotas públicas listadas com o motivo, e nenhuma rota decide acesso comparando o papel.
- `paleta.test.ts`: separação entre falta e falta justificada sob daltonismo simulado e contraste dos tokens, lidos do `globals.css` nos dois temas.
- `texto-editorial.test.ts`: guarda da convenção editorial do repositório (sem travessões e demais padrões proibidos).

## Contratos de API

O contrato `schema-preview.test.ts` cria schemas descartáveis no mesmo banco para verificar o isolamento do Prisma e das consultas SQL diretas. A conexão de testes precisa de permissão `CREATE` no database; cada execução remove apenas os schemas que criou.

API e navegador usam somente a pilha criada pelo [executor de isolamento](isolamento/README.md). Não exportar URLs de banco, segredos, `APP_URL`, `TEST_BASE_URL` ou `NODE_OPTIONS` no host. O executor recusa esse ambiente antes de provisionar. Uma URL local ou um banco sem alunos não comprovam exclusividade.

```bash
node tests/isolamento/executar.mjs -- pnpm exec vitest run --config vitest.api.config.ts tests/api/sistema/documentacao.test.ts
pnpm run test:api
```

Cada rodada usa banco novo, runtime de produção próprio e contas sintéticas. Não executar comandos administrativos no banco de uma instalação para preparar os testes. A guarda valida o namespace sem rotas, o manifesto privado, a prova do processo HTTP, o marcador do banco, papel, schema e todos os checksums de migração antes de liberar fixtures. O setup de API roda antes da importação dos contratos; o setup de navegador valida antes da primeira leitura ou alteração de conta.

O transporte Google de teste aceita somente loopback no namespace compartilhado da rodada. O runtime e os testes recebem o mesmo segredo sintético, sem herdar credenciais do host. A rede bloqueia integrações externas, mesmo quando um token não é reconhecido pelo redirecionador.

O contrato `entradas.test.ts` cobre duplicidade, validação, momento, responsável ativo e nome histórico, turma histórica, separação da chamada, cópia JSON, desistência e permissões.

A suíte usa os dias 2026-06-15 a 2026-06-19 como dias isolados de teste, cria e remove a própria massa antes e depois; execuções repetidas não acumulam estado. Não use dados reais em hipótese alguma.

Os testes de planilha criam um servidor HTTP local que responde nos formatos OAuth e Sheets API, com dados sintéticos. O módulo de transporte aceita apenas tokens de teste e endereço HTTP em `127.0.0.1`. Não carregar esse módulo em produção. O executor o importa somente no processo de runtime de teste e gera o mesmo `AUTH_SECRET` sintético para aplicativo e suíte.

## Ponta a ponta com Playwright

O wrapper usa o mesmo executor, sem montar o repositório, socket Docker, home ou segredos do host. A imagem de navegador corresponde à versão 1.64.1 resolvida no lock, com digest no inventário de ferramentas, e usa Node 24. Antes da suíte, cada engine deve iniciar e encerrar com essa instalação; o caminho do executável não comprova as dependências de WebKit.

```bash
pnpm run test:e2e:docker
pnpm run test:e2e:docker:chromium
node tests/isolamento/executar.mjs -- pnpm exec playwright test tests/ponta-a-ponta/chamada/frequencia.spec.ts --project=chromium --workers=1 --retries=0
pnpm run test:pwa
```

Os configs que usam o aplicativo real recusam execução sem prova, inclusive na coleta e em execuções filtradas. Não iniciam nem reutilizam servidor externo. O executor já inicia o build de produção, inclusive para PWA. As configurações de componentes Vite, sem aplicativo ou banco, continuam independentes.

Cada comando cria uma rodada própria; não partilhar banco entre suítes. Sessões sintéticas ficam somente no container e não são exportadas. Capturas e relatórios autorizados são recuperados no destino privado informado pelo executor, antes da remoção dos containers. A interface interativa e o navegador com janela não são expostos pelo executor sem portas de host.

## Legibilidade: fixture e aplicativo real

`tests/componentes/entrada/legibilidade.test.ts` é uma regressão de componentes
com fonte fallback e invólucro sintético: não monta `layout.tsx`, não usa a
Plus Jakarta Sans do build e não representa o layout do aplicativo. A fixture é
executada por `test:componentes`; não há passo próprio no CI atual e ela não
comprova legibilidade de produção.

`tests/ponta-a-ponta/interface/legibilidade-real.spec.ts` exercita o Next real:
espera `document.fonts.ready`, exige uma face Jakarta carregada e consulta a fonte
computada no próprio texto da data (ou no placeholder), inclusive seu peso.
Essa consulta não comprova que cada glifo foi renderizado sem fallback. O teste
mede o placeholder com padding e bordas fracionários. Os textos descendentes são
medidos com `Range` e checados contra os recortes dos ancestrais; a data exata
também deve estar visível e ter área positiva sem recorte. Oito autochecagens com
HTML sintético verificam recorte, visibilidade, transparência, geometria e fonte
fallback; não substituem o teste real.
Registra capturas e verifica chamada, navegação, foco e contêineres também perto de 14rem.
O teste de alargamento modifica somente o invólucro do controle e seu tamanho
de fonte no navegador: é um estresse controlado, não prova de zoom do navegador
ou de acessibilidade em dispositivo físico. Aos domingos a chamada inicia no
resumo e o selo Hoje da chamada não está disponível; a presença do selo é
verificada quando a data selecionada é hoje, não é simulada por relógio local.

O spec autenticado usa a massa E2E padrão e a remove. Tanto seu helper quanto o
`globalSetup` do Playwright **escrevem no banco**, apagam dados por prefixo E2E
e podem redefinir contas fixas, mesmo que o teste aborte escritas da página.
Use exclusivamente banco e servidor descartáveis, isolados e sem outras suítes
concorrentes; nunca aponte para uma base real. O runner padrão descobre esse spec
junto com os demais. Para selecionar apenas os seis casos de login e as oito
autochecagens, sem ler estado de sessão no spec, com servidor descartável criado
pelo executor, usar o comando abaixo. O provisionador ainda cria as contas
sintéticas antes de qualquer comando, inclusive nessa configuração anônima;
não se trata de execução sem preparo ou sem escrita no banco.

```bash
node tests/isolamento/executar.mjs -- pnpm exec playwright test --config=playwright.legibilidade-anon.config.ts
```

Para a comparação RED/GREEN, execute o mesmo spec de login sobre o build da base
`537b826` e da branch, em ambientes descartáveis separados com a mesma versão de
navegador, e preserve resultados e capturas. Para comparar o seletor, coloque o
mesmo spec e helpers necessários em cada checkout e execute o runner padrão em
bancos isolados próprios; confira a limpeza e o relatório. Uma falha de fonte,
servidor ou seed é infraestrutura, não RED do defeito. A antiga falha na fixture
fallback não comprova RED do E2E real.

## Verificação visual e de ponta a ponta

Além das suítes, a validação inclui inspeção visual das telas (captura e análise por modelo de visão) e os specs de navegador cobrindo login com erro e sucesso, campos de senha com exibir e ocultar, lembrar o acesso no dispositivo (sessão persistente e e-mail preenchido), banco vazio, chamada diária com falta justificada, chamada por aula com saída parcial, painel com gráficos, seletor de período próprio em popover, troca de visão com seção ativa, barra lateral no desktop e menu lateral no celular, abas da Gestão com toque e teclado, histórico, grade com divisórias e períodos, gestão completa (série, turma com aulas, aluno, contas e configurações), saídas antecipadas, cópia de segurança, troca de senha, tema de três opções, login simétrico, campos do login com margem no celular, PWA e larguras de celular e desktop.

Os PNGs do spec são produzidos em `/work/docs/imagens/`, dentro da pilha descartável. Os comandos abaixo aplicam a semente somente nessa rodada comprovada e recuperam as sete imagens em `artefatos/docs/imagens/`, no diretório privado impresso na saída, sem alterar o checkout:

```bash
pnpm run capturas:readme
pnpm run capturas:readme:docker
```

Para escolher um destino recuperável, existente apenas como diretório pai privado, usar o executor diretamente. O caminho final deve ser absoluto, novo, fora do checkout e sem links:

```bash
node tests/isolamento/executar.mjs --artefatos "$HOME/evidencias/capturas-rodada-nova" -- sh -c 'CONTA_EMAIL=demo@escola.exemplo SEED_PERFIL=leve pnpm run seed && CAPTURAS=1 pnpm exec playwright test tests/ponta-a-ponta/interface/imagens.spec.ts --project=chromium --project=mobile-chrome'
```

O spec captura o Painel em 1440x900 no Chromium e a Chamada em 390x844 no mobile-chrome, nos temas claro e escuro, além de Relatórios, Saídas e Gestão, sempre com massa sintética. Antes do build de capturas, o executor retira da cópia as sete imagens antigas; uma captura ignorada não passa como resultado novo. A ausência de uma imagem obrigatória reprova a exportação, preservando as demais evidências. Só após revisão visual cabe copiar manualmente os PNGs escolhidos para `docs/imagens/` e revisar o diff; nenhuma substituição automática de arquivo versionado é feita. Não editar os PNGs à mão. A galeria fica em `docs/imagens/README.md` e o teste `tests/unidade/interface/readme-imagens.test.ts` limita largura e peso das imagens. Capturas locais de validação vão para `docs/imagens/locais/`, fora do versionamento.

A exportação, o modo de distribuição e a política de fontes novas têm regressões com dublês. Isso não comprova geração integrada de PNG, execução da imagem final ou CI remoto. Os gates integrados pendentes e o contrato de `--fontes-novas` estão no [guia do executor](isolamento/README.md).
