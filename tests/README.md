# Testes

Suítes do FrequenciApp com Vitest e Playwright.

| Suíte            | Comando             | Pré-requisitos                                           |
| ---------------- | ------------------- | -------------------------------------------------------- |
| Unidade          | `npm run test:unit` | Nenhum.                                                  |
| Contratos de API | `npm run test:api`  | Aplicativo no ar, banco migrado, contas de teste.        |
| Ponta a ponta    | `npm run test:e2e`  | Aplicativo no ar e navegadores instalados.               |
| PWA              | `npm run test:pwa`  | Build de produção no ar (`npm run build` e `npm start`). |
| API e unidade    | `npm test`          | Idem, na ordem.                                          |

## Unidade

Roda em qualquer ambiente, sem banco e sem rede:

- `frequencia.test.ts`: domínio da frequência (calendário, horários, aulas, marca, grade, normalização).
- `usuarios.test.ts`: política de senha, primeiro nome e rótulo de papel.
- `erros.test.ts`: tradução das exceções do Prisma para português com status correto.
- `hash.test.ts`: scrypt de senhas.
- `decisao-admin.test.ts`: bootstrap do administrador no modo `--somente-criar`.
- `texto-editorial.test.ts`: guarda da convenção editorial do repositório (sem travessões e demais padrões proibidos).

## Contratos de API

A suíte aponta para o aplicativo em execução. O banco de testes precisa estar acessível para a limpeza da massa; exporte a connection string no comando porque ambientes locais podem ter outro valor de `DATABASE_URL` no shell. Os scripts administrativos preferem `DIRECT_URL` quando a variável está definida:

```bash
# 1. banco migrado
npx prisma migrate deploy

# 2. contas de teste (padrões demo@escola.exemplo e direcao@escola.exemplo)
ADMIN_EMAIL=direcao@escola.exemplo ADMIN_SENHA=DirecaoFrequencia2026 ADMIN_NOME=Direção npm run criar-admin
CONTA_EMAIL=demo@escola.exemplo CONTA_SENHA=DemoFrequencia2026 CONTA_NOME=Demo npm run criar-coordenacao

# 3. aplicativo no ar em outra sessão
npm run dev

# 4. suíte
DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia npm run test:api
```

Variáveis aceitas:

- `APP_URL`: endereço do aplicativo (padrão `http://localhost:3000`).
- `TESTE_ADMIN_EMAIL` e `TESTE_ADMIN_SENHA`: credenciais da administração de teste.
- `TESTE_EMAIL` e `TESTE_SENHA`: credenciais da coordenação de teste.
- `DATABASE_URL`: limpeza da massa (dias e entidades prefixadas com QA).
- `DIRECT_URL`: conexão preferida pelos comandos administrativos, quando disponível.

A suíte usa os dias 2026-06-15 a 2026-06-19 como dias isolados de teste, cria e remove a própria massa antes e depois; execuções repetidas não acumulam estado. Não use dados reais em hipótese alguma.

## Ponta a ponta com Playwright

Instalação e configuração já estão no repositório:

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium webkit
npm run dev            # ou docker compose up -d
npx playwright test    # headless, execução serial
```

- `playwright.config.ts`: projetos `chromium`, `mobile-chrome` (Pixel 7) e `mobile-webkit` (iPhone 13), `globalSetup` que garante as contas e grava o estado de sessão em `tests/e2e/.auth/`, e `webServer` que sobe o servidor de desenvolvimento quando `PLAYWRIGHT_SKIP_WEBSERVER` não é `1`.
- `playwright.pwa.config.ts`: roda os specs de PWA contra o build de produção, onde o service worker é o real.
- Helpers em `tests/e2e/helpers/`: autenticação, acesso ao banco para massa e utilidades de página (hidratação, troca de visão e rolagem do paginador).
- Specs atuais: autenticação, banco sem turmas, frequência com saída por aula, troca de visão, deslize do paginador e tema de três opções.
- Massa: prefixo `E2E` e limpeza antes e depois; nenhum dado real.

Com o aplicativo já no ar, use `TEST_BASE_URL` e `PLAYWRIGHT_SKIP_WEBSERVER=1`. O CI sobe o Compose, instala o Chromium e roda `npm run test:e2e:chromium`, publicando relatório e traces em caso de falha.

## Verificação visual e de ponta a ponta

Além das suítes, a validação inclui inspeção visual das telas (captura e análise por modelo de visão) e os specs de navegador cobrindo login com erro e sucesso, banco vazio, deslize entre visões, barra lateral no desktop, frequência com saída por aula, histórico, grade, gestão completa (série, turma com aulas, aluno e contas), troca de senha, tema de três opções, PWA e larguras de celular e desktop.
