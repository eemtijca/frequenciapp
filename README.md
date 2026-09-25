# FrequenciApp

Aplicativo da coordenação escolar: chamada única diária, saídas antecipadas e indicadores da escola. Mobile-first, sem ruído e com o menor número de toques possível entre abrir o app e ter a chamada salva.

O fluxo segue a prática da coordenação: escolha a turma e o dia, todos começam presentes, toque apenas nos alunos que faltaram, escolha a justificativa quando houver e salve. O Painel mostra a infrequência do dia por série e por turma, a área Saiu mais cedo registra quem saiu antes com justificativa e responsável, e os Relatórios reúnem histórico, grade por período e o resumo por aluno.

## Recursos

- **Chamada diária**: turmas por toque, data com navegação por setas, busca por nome, resumo ao vivo e salvamento com rascunho local. A falta pode receber um código de justificativa e vira FJ; o acumulado do aluno aparece na lista e no resumo de faltas.
- **Saídas antecipadas**: registro separado da chamada, com momento (aulas, intervalos e almoço), justificativa, observação e responsável pela liberação escolhido na equipe ativa. As saídas do dia por turma e o relatório semanal por aluno completam a área.
- **Painel do dia**: gráficos de infrequência por série e por turma, total de faltas (F + FJ), taxa de infrequência, cobertura das chamadas e turmas pendentes.
- **Relatórios**: histórico por mês com filtro de série, grade por turma de origem nos modos dia, semana de aula, período e mês, com a coluna acumulada, e relatório por aluno com faltas, justificadas e saídas.
- **Gestão pela administração**: séries, turmas, aulas, alunos e contas da equipe, mais as configurações de recursos e a cópia de segurança em JSON.
- **Configurações de recursos**: a chamada por aula (chips de aulas e marca S) fica disponível para quando for usada e desligada por padrão; a área de saídas antecipadas pode ser ocultada sem perder registros.
- **Proteção contra conflitos**: uma chamada por turma e dia, compartilhada pela coordenação; salvamentos de outro dispositivo são recusados com aviso em vez de sobrescrita silenciosa (controle por revisão em transação serializável).
- **PWA completo**: instala no dispositivo como aplicativo, abre em Chamada ou Painel pelos atalhos, avisa quando a internet cai e atualiza com um toque quando há versão nova.
- **Erros em português**: toda falha de banco ou de API vira mensagem curta e acionável, sem termo técnico.
- **Navegação por deslize**: troca de visões deslizando a tela com o dedo, com o indicador acompanhando o gesto, navegação inferior no celular e barra lateral no desktop, com estado e rolagem preservados.
- **Tema do sistema, claro ou escuro**, animações discretas que respeitam a preferência de movimento reduzido e interface pensada para uma mão.

## Começando

Pré-requisitos: Node.js 20.19 ou superior e Docker com Compose (modo recomendado), ou um PostgreSQL 17 próprio.

```bash
cp .env.example .env
# Gere o segredo da sessão e cole no .env:
#   openssl rand -base64 32
docker compose up --build
```

O Compose sobe o PostgreSQL 17, aplica as migrações na partida e inicia o aplicativo em http://localhost:3000. O administrador inicial (primeiro usuário, acesso root de configuração) pode ser criado na partida: basta preencher `ADMIN_EMAIL`, `ADMIN_SENHA` e `ADMIN_NOME` no `.env`. O bootstrap não altera uma conta que já exista, então reiniciar o contêiner não regrava a senha. Para criar ou trocar a senha depois, rode o comando que sempre aplica os valores:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='uma senha forte' ADMIN_NOME='Direção' \
  docker compose exec app npm run criar-admin
```

Com o administrador no dispositivo, o restante (contas da equipe, séries, turmas, aulas e alunos) é configurado pela área de Gestão, sem comandos. Para experimentar com dados sintéticos (nenhum dado real de pessoa), crie também a conta de coordenação de demonstração e a semente:

```bash
CONTA_EMAIL=equipe@escola.br CONTA_SENHA='outra senha forte' CONTA_NOME='Equipe' \
  docker compose exec app npm run criar-coordenacao
SEED_ALUNOS=12 docker compose exec app npm run seed
```

Instruções sem Docker, variáveis de ambiente e demais detalhes em [docs/ambiente.md](docs/ambiente.md). Publicação em [docs/deploy.md](docs/deploy.md).

## Stack

- Next.js 16 (App Router) com TypeScript estrito.
- PostgreSQL 17 com Prisma ORM 7, conexão do runtime em `DATABASE_URL` e conexão do CLI em `DIRECT_URL`, com adaptador oficial `pg`.
- Autenticação própria: scrypt para senhas, sessões opacas em cookies HttpOnly e papéis de administração e coordenação.
- Transações ACID com isolamento serializável e repetição automática em conflitos.
- Tailwind CSS 4 com componentes shadcn/ui personalizados, animações com Motion e gráficos com Recharts.
- Service worker próprio para a experiência instalável e o aviso offline.
- Vitest para testes de unidade e contratos de API.

## Comandos

| Comando                     | Efeito                                                   |
| --------------------------- | -------------------------------------------------------- |
| `npm run dev`               | Servidor de desenvolvimento em http://localhost:3000.    |
| `npm run build`             | Build de produção.                                       |
| `npm start`                 | Serve o build de produção.                               |
| `npm run lint`              | ESLint com regras estritas.                              |
| `npm run format:check`      | Prettier em modo verificação.                            |
| `npm run format`            | Prettier corrigindo formatação.                          |
| `npm run tsc`               | Verificação de tipos sem emissão.                        |
| `npm test`                  | Testes de unidade e contratos de API.                    |
| `npm run test:unit`         | Apenas os testes de unidade.                             |
| `npm run test:api`          | Contratos de API com o aplicativo no ar.                 |
| `npm run test:e2e`          | Ponta a ponta com Playwright (headless).                 |
| `npm run test:pwa`          | PWA contra o build de produção.                          |
| `npm run db:migrate`        | Cria e aplica migrações em desenvolvimento.              |
| `npm run db:deploy`         | Aplica migrações pendentes em produção.                  |
| `npm run criar-admin`       | Cria ou atualiza o administrador inicial (idempotente).  |
| `npm run criar-coordenacao` | Cria ou atualiza uma conta de coordenação (idempotente). |
| `npm run seed`              | Semeia séries, turmas, aulas e alunos sintéticos.        |

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
