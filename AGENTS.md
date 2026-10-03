# AGENTS.md

FrequenciApp: aplicativo de frequência escolar para a coordenação de uma escola brasileira. Um único processo Next.js 16 (App Router), PostgreSQL 17 com Prisma 7 e adaptador `pg`, autenticação própria com scrypt e service worker de PWA escrito à mão. Código, comentários, documentação, testes e commits são em português.

## Diretrizes do repositório

- Leia o `CONTRIBUTING.md`: ele reúne todas as diretrizes do repositório (ambiente, issues, etiquetas, branches, commits, pull requests, padrões de código, banco, formatação e testes).
- `tests/unit/texto-editorial.test.ts` varre código, documentação, configuração, scripts e os markdown da raiz (incluindo este arquivo). Ele reprova travessão, meia-risca, reticências tipográficas, aspas curvas, setas, entidades HTML de aspas, pronomes de segunda pessoa e plural escrito como o substantivo seguido de parênteses. Rode `npx vitest run tests/unit/texto-editorial.test.ts` depois de escrever texto de interface ou documentação.
- Todo arquivo próprio começa com um cabeçalho de uma a duas linhas em português descrevendo seu papel.
- Commits seguem Conventional Commits em português, no imperativo, com escopo opcional: `fix(api): corrige ...`. Branches usam `tipo/descricao-curta`.
- TypeScript é estrito e ainda tem `noUncheckedIndexedAccess`; o ESLint reprova `any`, asserções não nulas e `console` fora de `warn`/`error` (`scripts/` e `docker/` são isentos). Nenhuma regra é desativada sem justificativa registrada em ADR.
- Nomes de domínio em português (`frequencias`, `faltas`, `turmas`), termos de infraestrutura em inglês (`prisma`, `middleware`). Artefatos de migração do Prisma mantêm os marcadores em inglês e nunca são editados à mão.

## Padrões de código

- Rotas de API seguem o padrão de `src/infra/http.ts`: corpo envolvido por `executarRota`, guarda `exigirSessao` ou `exigirAdmin`, resposta por `json` sem cache e erros traduzidos por `src/infra/erros.ts`. Nenhuma rota expõe stack trace, SQL ou termo técnico; tudo vira frase curta em português.
- No cliente, use `pedir` de `src/lib/api-cliente.ts`, os avisos padrão de `src/lib/avisos.ts` e `useAcaoUnica` em ações de rede, para o toque duplo não duplicar chamadas. Reutilize os componentes de `src/components/ui` antes de criar outro ou adicionar dependência de interface.
- Arquivos de interface usam kebab-case em português com prefixo de papel (`vista-`, `aba-`, `dialogo-`, `seletor-`); o alias `@/*` aponta para `src/*`.
- O schema Prisma mantém nomes em português: modelos e enums em PascalCase com `@@map` para tabela em snake_case plural, campos camelCase com `@map` para coluna em snake_case, ids UUID com `gen_random_uuid()` e `criadoEm`/`atualizadoEm` em `Timestamptz`. Restrições e índices funcionais (por exemplo unicidade em `lower()`) vivem no SQL das migrações e são preservados.

## Comandos

Pré-requisitos: Node.js 20.19 ou superior e PostgreSQL 17 (ou Docker Compose). O CI e a imagem Docker usam Node 24.

- Gerenciador é npm, com `package-lock.json` versionado; não use bun, yarn nem pnpm.
- Ambiente local: `npm ci`; `cp .env.example .env` com `AUTH_SECRET` de 32 caracteres ou mais; `npx prisma migrate deploy`; depois `npm run criar-admin`, `npm run criar-coordenacao` e `npm run seed` com as variáveis `ADMIN_*`, `CONTA_*` e `SEED_*`.
- Docker (recomendado): `docker compose up --build` sobe banco e aplicativo; as migrações rodam na partida. Comando administrativo dentro do contêiner: `docker compose exec app npm run criar-admin`.
- Ordem de verificação antes do pull request: `npm run format:check`, `npm run lint`, `npm run tsc`, `npm run test:unit`. `npm run format` corrige a formatação.
- `npm test` não é autossuficiente: depois da suíte de unidade ele roda os contratos de API, que exigem o aplicativo no ar (padrão `APP_URL=http://localhost:3000`), banco migrado, contas de teste e `DATABASE_URL` exportada para a limpeza da massa. O CI separa: o `qualidade.yml` roda apenas formatação, lint, tipos e unidade; o `testes.yml` sobe o Compose e roda API, ponta a ponta no Chromium e PWA.
- Contratos de API: crie o admin `direcao@escola.exemplo` / `DirecaoFrequencia2026` e a coordenação `demo@escola.exemplo` / `DemoFrequencia2026`, suba `npm run dev` e rode `DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia npm run test:api`. Passos exatos em `tests/README.md`.
- Ponta a ponta: rode na imagem oficial da Microsoft com o aplicativo no ar (`npm run test:e2e:docker`, ou `npm run test:e2e:docker:chromium`), conforme "Ferramentas externas". Alternativa no host: `npx playwright install --with-deps chromium webkit` e depois `npm run test:e2e`. Roda em série (`workers: 1`) contra um banco compartilhado; o setup global cria as contas de teste e grava as sessões em `tests/e2e/.auth/`. Sobe `npm run dev` a menos que `PLAYWRIGHT_SKIP_WEBSERVER=1` com `TEST_BASE_URL`. Spec único: `npx playwright test tests/e2e/frequencia.spec.ts --project=chromium`.
- `npm run test:pwa` roda o próprio `npm run build && npm start`, porque o service worker precisa ser o de produção.
- Banco: `npm run db:migrate` em desenvolvimento, `npm run db:deploy` em produção. Nunca edite uma migração aplicada; crie uma nova com `npx prisma migrate dev --name ajuste`. O cliente Prisma em `generated/` fica fora do Git; `npm run db:generate` ou o `postinstall` o regenera.
- Etiquetas: `npm run etiquetas:sync` cria ou atualiza as etiquetas do GitHub conforme `.github/labels.json`.

## Ferramentas externas

- GitHub: opere issues, pull requests, execuções de workflow e releases pelo GitHub CLI (`gh`), não pela interface web. Antes de operar, confirme a sessão com `gh auth status` (ou `gh status`) e, se não houver conexão, rode `gh auth login`. Exemplos: `gh issue create`, `gh pr create`, `gh pr checks --watch`, `gh run watch` e `gh release create`. Nunca inclua segredos ou dados de alunos em comandos, títulos ou corpos.
- Playwright: rode a suíte de ponta a ponta na imagem oficial da Microsoft, sem instalar navegadores no host, com o aplicativo no ar. Use `npm run test:e2e:docker` (ou `npm run test:e2e:docker:chromium`) ou o comando direto `docker run --rm --ipc=host --network host -v "$PWD":/work -w /work -e HOME=/tmp -e PLAYWRIGHT_SKIP_WEBSERVER=1 -e TEST_BASE_URL=http://localhost:3000 mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test --project=chromium`. O script `tests/playwright-container.sh` monta o repositório e aceita `PLAYWRIGHT_IMAGE`, `PLAYWRIGHT_DOCKER_NETWORK` e `PLAYWRIGHT_DOCKER_USER`. A instalação de navegadores no host (`npx playwright install --with-deps chromium webkit`) fica como alternativa.

## Fluxo de issues e pull requests

- Aplique etiquetas em toda issue e todo pull request: uma de tipo e, fora do tipo `docs`, uma de área. Use `gh issue create --label "bug" --label "area: chamada"` e `gh pr edit <número> --add-label "area: planilhas"`. O catálogo fica em `.github/labels.json` e é sincronizado com `npm run etiquetas:sync`. Pull requests do Dependabot recebem `dependencies` e dispensam as demais.
- Faça apenas commits atômicos: uma mudança lógica completa por commit, sem trabalho em andamento nem correção de revisão. Use `git commit --fixup` durante o desenvolvimento e `git rebase -i --autosquash` antes de publicar.
- Organize todos os commits do assunto em uma única branch e um único pull request. Abra o pull request somente quando estiver finalizado, com título em Conventional Commits, verificações locais, documentação e CHANGELOG prontos. Não use `gh pr create --fill`.
- Se o CI falhar ou surgir algo novo depois de aberto, converta para rascunho com `gh pr ready --undo`, faça os commits e só marque como pronto com `gh pr ready` quando tudo estiver verde.
- Nunca peça revisão com o pull request em rascunho nem abra pull request incompleto.
- Commits com geração relevante por IA levam o rodapé `Assisted-by: ferramenta:modelo`; a autoria e a responsabilidade são humanas.

## Arquitetura

- A dependência aponta para dentro: `src/domain` é puro (só módulos de domínio, compartilhado com componentes de cliente), `src/application` reúne os casos de uso (validação com zod, transações serializáveis), `src/infra` isola Prisma, autenticação, HTTP e tradução de erros, `src/app` e `src/components` são apresentação. As rotas em `src/app/api/**` são adaptadores finos.
- O aplicativo inteiro vive em `/`. `src/app/page.tsx` resolve a sessão e pré-busca o escopo; `src/components/aplicacao.tsx` troca as visões localmente (Painel, Chamada, Saídas, Relatórios, Alunos, Gestão). Não crie navegação de página por visão.
- O bloqueio de CSRF e o CSP por nonce ficam em `src/proxy.ts` (o Next 16 renomeou middleware para proxy), não em um `middleware.ts`. Os cabeçalhos de segurança vêm do `next.config.ts`. Verificação de saúde: `/api/saude`.
- O ambiente é validado na partida em `src/infra/ambiente.ts`. O runtime usa apenas `DATABASE_URL`; `DIRECT_URL` é a conexão de sessão do Prisma CLI, das migrações e dos scripts administrativos. `TZ_APP` (padrão `America/Fortaleza`) resolve o dia corrente; datas civis trafegam como `YYYY-MM-DD` e são gravadas como `date` ao meio-dia UTC.
- A frequência guarda apenas as faltas, com presença implícita: uma linha em `frequencias` por turma e dia, com revisão otimista. O salvamento roda em transação serializável e conflito de revisão responde 409 com a versão vigente, nunca sobrescreve.

## Armadilhas

- O Dockerfile copia à mão `pg`, `dotenv` e suas dependências transitivas para o migrador e os scripts administrativos, que rodam fora da árvore do standalone. Dependência nova usada por esses scripts precisa entrar lá também.
- Ao adicionar variável de ambiente, atualize o `.env.example`, o `compose.yml` e espelhe no `compose.ci.yml` e nos blocos `env:` dos workflows quando fizer sentido.
- Migrações em produção são aplicadas pelo workflow `migracoes.yml` quando algo em `prisma/` muda na `main`, com o segredo `DIRECT_URL_PROD`, e pelo entrypoint do contêiner na partida (`docker/app/migrar.mjs`, com trava consultiva e conferência de checksum). O build da Vercel só roda `prisma generate`; não aplica migração.
- Ao mudar assets pré-cacheados (`offline.html`, ícones ou `manifest.webmanifest`), suba a `VERSAO` em `public/sw.js`; sem isso o cache antigo continua servindo o conteúdo.
- Nenhum teste usa dados reais. As suítes criam e limpam a própria massa: prefixo `QA` na suíte de API e `E2E` no Playwright. Dados reais de alunos nunca entram no Git nem em issue.
- A integração usa somente OAuth e Sheets API. Os testes de API e navegador simulam respostas HTTP do Google com `tests/helpers/google-falso.ts`; o redirecionamento de transporte é carregado somente pelo servidor de testes. `public/sw.js` é o service worker de verdade, coberto por `npm run test:pwa`.
- O `apporiginal.html` na raiz é uma referência local do aplicativo original, ignorada pelo Git. Não faz parte do entregável; não faça commit, formatação nem porte cego dele.
- Referência profunda: o índice `docs/README.md` aponta arquitetura, banco, api, interface, testes, segurança e operação; as decisões estão em `docs/adr/`, e a integração com a planilha tem `docs/planilha.md`. Atualize a documentação correspondente e os testes quando o comportamento mudar.
