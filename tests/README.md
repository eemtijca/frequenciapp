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

- `entradas.test.ts` e `planilha-entradas.test.ts`: horário, código por aluno e data, preservação de linhas e fórmulas, releitura, mudança de arquivo e falha sem confirmação com dublê de Sheets API.
- `frequencia.test.ts`: domínio da frequência (calendário, horários, aulas, marca, grade, normalização).
- `relatorios.test.ts`: indicadores do dia e relatórios por aluno e por saída.
- `justificativas.test.ts`: ordenação e validação do catálogo configurável.
- `planilha.test.ts`: dataframe, esquema da planilha, CSV e planejamento conservador.
- `gas.test.ts`: `gas/Codigo.gs` em `vm` com dublês fiéis às recusas das APIs do Google.
- `planilha-envios.test.ts`: erro vigente por turma ou por histórico único, data do último envio e datas sem horário em qualquer fuso.
- `planilha-cliente.test.ts`: cliente do Apps Script com recusa, falha parcial e detalhe técnico.
- `usuarios.test.ts`: política de senha, primeiro nome, rótulo de papel e capacidades por papel.
- `erros.test.ts`: tradução das exceções do Prisma para português com status correto.
- `hash.test.ts`: scrypt de senhas.
- `decisao-admin.test.ts`: bootstrap do administrador no modo `--somente-criar`.
- `diretores.test.ts`: identificador do diretor, palavra-chave gerada, estado da credencial, vínculos no tempo e categorias visíveis.
- `guardas-rotas.test.ts`: todo manipulador em `src/app/api` passa por uma guarda de capacidade, salvo as rotas públicas listadas com o motivo, e nenhuma rota decide acesso comparando o papel.
- `paleta.test.ts`: separação entre falta e falta justificada sob daltonismo simulado e contraste dos tokens, lidos do `globals.css` nos dois temas.
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

O contrato `entradas.test.ts` cobre duplicidade, validação, momento, responsável ativo e nome histórico, turma histórica, separação da chamada, cópia JSON, desistência e permissões.

A suíte usa os dias 2026-06-15 a 2026-06-19 como dias isolados de teste, cria e remove a própria massa antes e depois; execuções repetidas não acumulam estado. Não use dados reais em hipótese alguma.

## Ponta a ponta com Playwright

Rode a suíte na imagem oficial da Microsoft, sem instalar navegadores no host. O aplicativo precisa estar no ar antes (`docker compose up -d` ou `npm run dev`):

```bash
npm run test:e2e:docker            # todos os projetos
npm run test:e2e:docker:chromium   # só o Chromium
```

O script `tests/playwright-container.sh` monta o repositório em `mcr.microsoft.com/playwright:v1.63.0-noble`, usa a rede do host para alcançar o aplicativo e o banco em `localhost`, e repassa os argumentos extras ao `npx playwright test`. Ajuste com `PLAYWRIGHT_IMAGE`, `PLAYWRIGHT_DOCKER_NETWORK` e `PLAYWRIGHT_DOCKER_USER`. Em sistemas sem rede de host (Docker Desktop), escolha a rede e aponte `TEST_BASE_URL` para o host.

Como alternativa, instale os navegadores no host e mantenha a configuração já presente no repositório:

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium webkit
npm run dev            # ou docker compose up -d
npx playwright test    # headless, execução serial
```

- `playwright.config.ts`: projetos `chromium`, `mobile-chrome` (Pixel 7) e `mobile-webkit` (iPhone 13), `globalSetup` que garante as contas e grava o estado de sessão em `tests/e2e/.auth/`, e `webServer` que sobe o servidor de desenvolvimento quando `PLAYWRIGHT_SKIP_WEBSERVER` não é `1`.
- `playwright.pwa.config.ts`: roda os specs de PWA contra o build de produção, onde o service worker é o real.
- Helpers em `tests/e2e/helpers/`: autenticação, acesso ao banco para massa e utilidades de página (hidratação, troca de visão e rolagem do paginador).
- Specs atuais: autenticação com campos de senha exibir/ocultar e opção de manter conectado, banco sem turmas, chamada diária com falta justificada, chamada por aula com saída parcial e S na grade, seletor de período próprio em popover, troca de visão, indicador da barra inferior na visão ativa, abas da Gestão com toque e teclado, integração com Google Planilhas contra o script falso (token, conexão, estrutura, mapa, prévia na Grade, exportação CSV e desconexão), extras do 3º ano (Alunos por origem, busca por origem na Chamada e origem em massa), saída durante a aula com texto opcional, responsividade (barra lateral, modal centralizado no celular, login simétrico e campos com margem) e tema de três opções.
- `entradas.spec.ts`: calendário brasileiro mesmo em navegador inglês, navegação diária, seleção de momento e responsável, chegada atrasada, recarga, remoção confirmada e fluxo de aba/prévia/envio com API falsa. Esse spec e `planilha.spec.ts` bloqueiam o service worker para permitir interceptação de requisições. O PWA continua coberto pela suíte própria.
- Massa: prefixo `E2E` e limpeza antes e depois; nenhum dado real.

O script do contêiner já define `PLAYWRIGHT_SKIP_WEBSERVER=1` e `TEST_BASE_URL`; fora dele, exporte as duas variáveis com o aplicativo no ar. O CI sobe o Compose, instala o Chromium no runner e roda `npm run test:e2e:chromium`, publicando relatório e traces em caso de falha. No CI, o serviço `app` usa a rede do host e `PERMITIR_ENDPOINT_LOCAL=true` (ver `compose.ci.yml`), para o Apps Script falso responder no loopback do runner.

## Verificação visual e de ponta a ponta

Além das suítes, a validação inclui inspeção visual das telas (captura e análise por modelo de visão) e os specs de navegador cobrindo login com erro e sucesso, campos de senha com exibir e ocultar, lembrar o acesso no dispositivo (sessão persistente e e-mail preenchido), banco vazio, chamada diária com falta justificada, chamada por aula com saída parcial, painel com gráficos, seletor de período próprio em popover, troca de visão com indicador na visão ativa, barra lateral no desktop, abas da Gestão com toque e teclado, histórico, grade com divisórias e períodos, gestão completa (série, turma com aulas, aluno, contas e configurações), saídas antecipadas, cópia de segurança, troca de senha, tema de três opções, login simétrico, campos do login com margem no celular, PWA e larguras de celular e desktop.
