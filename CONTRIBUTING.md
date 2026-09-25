# Contribuindo

Guia de desenvolvimento do FrequenciApp: como preparar o ambiente, propor mudanças, escrever código, testar e documentar. Dúvidas e propostas podem ser abertas como issue; o detalhamento técnico está em [docs/](docs/README.md). Para vulnerabilidades, siga [SECURITY.md](SECURITY.md) e nunca abra issue pública com dados sensíveis.

## Ambiente de desenvolvimento

Pré-requisitos: Node.js 20.19 ou superior e Docker com Compose no modo recomendado, ou um PostgreSQL 17 próprio, conforme [docs/ambiente.md](docs/ambiente.md).

```bash
npm ci
cp .env.example .env  # preencha AUTH_SECRET com um segredo aleatório
npx prisma migrate deploy
npm run criar-admin   # com ADMIN_EMAIL, ADMIN_SENHA e ADMIN_NOME no ambiente
npm run criar-coordenacao   # opcional: coordenação de demonstração (CONTA_*)
npm run seed          # opcional: séries, turmas e alunos sintéticos
npm run dev
```

Com Docker Compose, o banco e o aplicativo sobem juntos:

```bash
cp .env.example .env
# Gere os segredos com openssl rand -base64 32 e cole em AUTH_SECRET
docker compose up --build
```

Para criar o administrador inicial na partida, defina `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env`. O bootstrap não altera uma conta que já exista.

Comandos úteis na raiz:

| Comando                     | Efeito                                             |
| --------------------------- | -------------------------------------------------- |
| `npm run dev`               | Servidor de desenvolvimento em localhost:3000.     |
| `docker compose up`         | Sobe banco e aplicativo via Docker Compose.        |
| `docker compose down`       | Derruba o ambiente.                                |
| `npm run criar-admin`       | Cria o administrador inicial de forma idempotente. |
| `npm run criar-coordenacao` | Cria conta de coordenação de forma idempotente.    |
| `npm run seed`              | Semeia alunos sintéticos de desenvolvimento.       |
| `npx prisma generate`       | Regenera o cliente Prisma (o postinstall também).  |
| `npx prisma migrate dev`    | Cria e aplica migrações em desenvolvimento.        |

## Fluxo de contribuição e pull requests

### Issues e discussão

Descreva o problema ou a proposta antes de codificar quando a mudança for estrutural. Para bugs, inclua passos de reprodução, comportamento observado, comportamento esperado e o commit afetado. Nunca anexe dados reais de pessoas ou alunos.

### Branches

Parta da `main` atualizada e use o padrão `tipo/descricao-curta`:

- `feat/` para funcionalidades novas.
- `fix/` para correções.
- `docs/`, `test/`, `refactor/`, `perf/`, `chore/` e `ci/` para os demais casos.

### Commits

Siga o padrão Conventional Commits, em português, no imperativo e descrevendo o efeito da mudança. Use escopo entre parênteses quando ajudar a localizar a área:

```text
feat(frequencia): marca falta com um toque na linha do aluno
fix(api): corrige rejeição de falta de aluno movido de turma
docs: descreve a grade por turma de origem
test(unit): cobre o desempate de datas na grade
```

Mantenha cada commit coerente e reversível de forma isolada. Evite commits de trabalho em andamento na `main`; o histórico da `main` vem de pull requests.

### Pull requests

Um pull request resolve um assunto. Se a mudança misturar refatoração e comportamento, separe em pull requests menores.

A descrição deve conter:

- O problema e o resultado esperado.
- O que mudou e por quê.
- Como validar: comandos executados e, quando aplicável, passos de interface.
- Riscos, migrações ou variáveis de ambiente novas.
- A issue relacionada, quando houver.

Antes de abrir, rode as verificações locais:

```bash
npm run format:check
npm run lint
npm run tsc
npm run test:unit     # domínio, senhas, erros e guarda editorial
npm run test:api      # com o aplicativo no ar, contas de teste e DATABASE_URL
npm run build         # build de produção
```

Preencha o checklist do template de pull request. Ao alterar comportamento, atualize a documentação correspondente e os testes.

### Revisão

Corrija as falhas antes de pedir nova revisão. Pull requests sem verificações verdes não são mesclados. Mescle por merge commit, preservando o contexto da revisão, e apague a branch após o merge. Não faça force-push em `main`.

## Padrões de código

- Código e comentários em português, curtos e diretos.
- Artefatos gerados pelo Prisma (`prisma/migrations/*/migration.sql` e `migration_lock.toml`) mantêm os marcadores em inglês e não são editados à mão.
- Domínio em português (`frequências`, `faltas`, `alunos`); infraestrutura em inglês quando for termo consagrado (`prisma`, `middleware`).
- Camadas: `src/domain` não importa nada de fora; `src/application` orquestra domínio e infraestrutura; `src/infra` isola Prisma, autenticação e HTTP; `src/app` e `src/components` são apresentação.
- TypeScript estrito, sem `any` e sem asserções não nulas; o ESLint reprova ambos.
- Segredos apenas via ambiente, validados na partida por zod (`src/infra/ambiente.ts`).
- Sem travessão (em-dash ou meia-risca) em nenhum arquivo do repositório: o guarda editorial em `tests/unit/texto-editorial.test.ts` reprova. Use ponto, vírgula ou parênteses.
- Cada arquivo próprio começa com um cabeçalho curto, de uma a duas linhas, descrevendo seu papel.
- Comente apenas trechos não óbvios, como decisões de segurança e cálculos.

### Banco e migrações

Crie migrações com `npx prisma migrate dev --name ajuste`. Nunca edite uma migração aplicada; qualquer ajuste entra como migração nova. A migration inicial desta reconstrução pode ser reescrita antes do primeiro deploy de produção. Depois do primeiro deploy, a regra passa a ser aplicada sem exceção. O schema é a fonte da verdade em `prisma/schema.prisma`, e os comandos do dia a dia estão em [docs/banco.md](docs/banco.md).

### Formatação e análise estática

O Prettier cuida do estilo, com `prettier-plugin-tailwindcss` para ordenar as classes, e o ESLint cobre as regras do Next e do projeto. Rode `npm run format` e `npm run lint` antes de commitar. Não desative regras sem justificativa registrada em ADR.

## Testes e qualidade

| Suíte            | Requisito                   | Comando            |
| ---------------- | --------------------------- | ------------------ |
| Unidade          | Nenhum                      | `npm test`         |
| Contratos de API | Aplicativo no ar e conta    | `npm run test:api` |
| Guarda editorial | Nenhum (roda com a unidade) | `npm test`         |

Regras:

- Cada arquivo de teste cria e limpa a própria massa; nunca dependa de dados reais.
- Nenhum teste depende de ordem de execução.
- Ao corrigir um bug, adicione um teste que falharia antes da correção.
- Ao adicionar texto de interface, confira que o guarda editorial passa (sem travessões e sem pluralização com parênteses).

A convenção e a cobertura estão em [docs/testes.md](docs/testes.md); os pré-requisitos da suíte de API estão em [tests/README.md](tests/README.md).
