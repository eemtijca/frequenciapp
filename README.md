# FrequenciApp

Aplicativo de registro de frequência escolar para escolas. Feito para o uso real em sala: mobile-first, sem ruído e com o menor número de toques possível entre abrir o app e ter a frequência salva.

O fluxo segue a prática do professor no papel: escolha a turma e o dia, todos começam presentes, toque apenas nos alunos que faltaram e salve. Tocar de novo em um aluno marcado devolve a presença. Salvar é necessário mesmo quando ninguém falta, porque a frequência do dia só existe depois de salva.

## Recursos

- **Frequência diária**: turmas por toque, data com navegação por setas, busca por nome, filtros por falta e presença, resumo ao vivo e salvamento com rascunho local.
- **Gestão pela administração**: séries, turmas, alunos e contas de professores em formulários curtos, com mensagens claras quando algo depende de outra ação (por exemplo, excluir turma com alunos).
- **Professores e papéis**: o administrador configura tudo e atribui as turmas de cada professor; contas desativadas perdem o acesso na hora.
- **Proteção contra conflitos**: uma frequência por dia, turma e professor; salvamentos de outro aparelho são recusados com aviso em vez de sobrescrita silenciosa (controle por revisão em transação serializável).
- **Histórico**: frequências salvas por mês, abertas em um toque para conferência ou correção.
- **Originais**: grade de frequência pelas turmas de origem, com alunos nas linhas, dias nas colunas e células P, F ou vazias; primeira coluna fixa durante a rolagem horizontal.
- **PWA completo**: instala no aparelho como aplicativo, página de aviso quando a internet cai e atualização com um toque quando há versão nova.
- **Erros em português**: toda falha de banco ou de API vira mensagem curta e acionável, sem termo técnico.
- **Tema claro e escuro**, animações discretas que respeitam a preferência de movimento reduzido e interface pensada para uma mão.

## Começando

Pré-requisitos: Node.js 20.19 ou superior e Docker com Compose (modo recomendado), ou um PostgreSQL 17 próprio.

```bash
cp .env.example .env
# Gere o segredo da sessão e cole no .env:
#   openssl rand -base64 32
docker compose up --build
```

No GitHub Codespaces, a rede bridge pode exigir o override local:

```bash
docker compose -f compose.yml -f compose.local.yml up --build
```

O Compose sobe o PostgreSQL 17, aplica as migrações na partida e inicia o aplicativo em http://localhost:3000. Em seguida, crie o administrador inicial (primeiro usuário, acesso root de configuração):

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='uma senha forte' ADMIN_NOME='Direção' \
  docker compose exec app npm run criar-admin
```

Com o administrador no aparelho, o restante (professores, séries, turmas e alunos) é configurado pela área de Gestão, sem comandos. Para experimentar com dados sintéticos (nenhum dado real de pessoa), crie também a conta de demonstração e a semente:

```bash
CONTA_EMAIL=professor@escola.br CONTA_SENHA='outra senha forte' CONTA_NOME='Ana' \
  docker compose exec app npm run criar-conta
SEED_ALUNOS=12 docker compose exec app npm run seed
```

Instruções sem Docker, variáveis de ambiente e demais detalhes em [docs/ambiente.md](docs/ambiente.md). Publicação em [docs/deploy.md](docs/deploy.md).

## Stack

- Next.js 16 (App Router) com TypeScript estrito.
- PostgreSQL 17 com Prisma ORM 7, conexão do runtime em `DATABASE_URL` e conexão do CLI em `DIRECT_URL`, com adaptador oficial `pg`.
- Autenticação própria: scrypt para senhas, sessões opacas em cookies HttpOnly e papéis de administrador e professor.
- Transações ACID com isolamento serializável e repetição automática em conflitos.
- Tailwind CSS 4 com componentes shadcn/ui personalizados e animações com Motion.
- Service worker próprio para a experiência instalável e o aviso offline.
- Vitest para testes de unidade e contratos de API.

## Comandos

| Comando                | Efeito                                                  |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Servidor de desenvolvimento em http://localhost:3000.   |
| `npm run build`        | Build de produção.                                      |
| `npm start`            | Serve o build de produção.                              |
| `npm run lint`         | ESLint com regras estritas.                             |
| `npm run format:check` | Prettier em modo verificação.                           |
| `npm run format`       | Prettier corrigindo formatação.                         |
| `npm run tsc`          | Verificação de tipos sem emissão.                       |
| `npm test`             | Testes de unidade e contratos de API.                   |
| `npm run test:unit`    | Apenas os testes de unidade.                            |
| `npm run test:api`     | Contratos de API com o aplicativo no ar.                |
| `npm run db:migrate`   | Cria e aplica migrações em desenvolvimento.             |
| `npm run db:deploy`    | Aplica migrações pendentes em produção.                 |
| `npm run criar-admin`  | Cria ou atualiza o administrador inicial (idempotente). |
| `npm run criar-conta`  | Cria ou atualiza uma conta de professor (idempotente).  |
| `npm run seed`         | Semeia séries, turmas e alunos sintéticos.              |

## Documentação

| Documento                                                                                  | Conteúdo                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [docs/arquitetura.md](docs/arquitetura.md)                                                 | Camadas, fluxo de requisição e organização.        |
| [docs/ambiente.md](docs/ambiente.md)                                                       | Variáveis de ambiente e execução local.            |
| [docs/banco.md](docs/banco.md)                                                             | Esquema, migrações e rotinas de banco.             |
| [docs/modelo-de-dados.md](docs/modelo-de-dados.md)                                         | Entidades e regras de frequência.                  |
| [docs/api.md](docs/api.md)                                                                 | Contratos das rotas HTTP.                          |
| [docs/interface.md](docs/interface.md)                                                     | Decisões de interface, movimento e acessibilidade. |
| [docs/testes.md](docs/testes.md)                                                           | Suítes, convenções e cobertura.                    |
| [docs/deploy.md](docs/deploy.md)                                                           | Docker Compose, Vercel e outras formas.            |
| [docs/seguranca.md](docs/seguranca.md)                                                     | Autenticação, sessões, CSRF, papéis e cabeçalhos.  |
| [docs/lgpd.md](docs/lgpd.md)                                                               | Dados tratados, minimização e direitos.            |
| [docs/operacao.md](docs/operacao.md)                                                       | Backup, restauração e rotinas do operador.         |
| [docs/adr/001-postgresql-com-prisma.md](docs/adr/001-postgresql-com-prisma.md) e seguintes | Decisões de arquitetura registradas.               |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                                         | Como preparar o ambiente e propor mudanças.        |
| [SECURITY.md](SECURITY.md)                                                                 | Como reportar vulnerabilidades.                    |

## Privacidade

O aplicativo guarda o mínimo necessário: nome dos alunos, turmas e as faltas registradas. Nenhum outro dado pessoal é coletado e nenhum serviço de terceiros recebe dados dos alunos. O repositório não contém dados reais de pessoas; a semente de desenvolvimento usa apenas nomes sintéticos. Detalhes e orientações em [docs/lgpd.md](docs/lgpd.md).

## Licença

[MIT](LICENSE)
