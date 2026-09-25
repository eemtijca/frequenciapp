# Testes

Suítes do FrequenciApp com Vitest.

| Suíte            | Comando             | Pré-requisitos                                    |
| ---------------- | ------------------- | ------------------------------------------------- |
| Unidade          | `npm run test:unit` | Nenhum.                                           |
| Contratos de API | `npm run test:api`  | Aplicativo no ar, banco migrado, contas de teste. |
| Ambas            | `npm test`          | Idem, na ordem.                                   |

## Unidade

Roda em qualquer ambiente, sem banco e sem rede:

- `frequencia.test.ts`: domínio da frequência (calendário, rótulos, marca, grade, normalização).
- `usuarios.test.ts`: política de senha, primeiro nome e rótulo de papel.
- `erros.test.ts`: tradução das exceções do Prisma para português com status correto.
- `hash.test.ts`: scrypt de senhas.
- `texto-editorial.test.ts`: guarda da convenção editorial do repositório (sem travessões e demais padrões proibidos).

## Contratos de API

A suíte aponta para o aplicativo em execução. O banco de testes precisa estar acessível para a limpeza da massa; exporte a connection string no comando porque ambientes locais podem ter outro valor de `DATABASE_URL` no shell:

```bash
# 1. banco migrado
npx prisma migrate deploy

# 2. contas de teste (padrões demo@escola.exemplo e direcao@escola.exemplo)
ADMIN_EMAIL=direcao@escola.exemplo ADMIN_SENHA=DirecaoFrequencia2026 ADMIN_NOME=Direção npm run criar-admin
CONTA_EMAIL=demo@escola.exemplo CONTA_SENHA=DemoFrequencia2026 CONTA_NOME=Demo npm run criar-conta

# 3. aplicativo no ar em outra sessão
npm run dev

# 4. suíte
DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia npm run test:api
```

Variáveis aceitas:

- `APP_URL`: endereço do aplicativo (padrão `http://localhost:3000`).
- `TESTE_ADMIN_EMAIL` e `TESTE_ADMIN_SENHA`: credenciais do administrador de teste.
- `TESTE_EMAIL` e `TESTE_SENHA`: credenciais do professor de teste.
- `DATABASE_URL`: limpeza da massa (dias e entidades prefixadas com QA).

A suíte usa os dias 2026-06-15 e 2026-06-16 como dias isolados de teste, cria e remove a própria massa antes e depois; execuções repetidas não acumulam estado. Não use dados reais em hipótese alguma.

## Verificação visual e de ponta a ponta

Além das suítes, a validação inclui inspeção visual das telas (captura e análise por modelo de visão) e navegação de ponta a ponta por navegador automatizado, cobrindo login com erro e sucesso, gestão completa (série, turma, professor com atribuições e aluno), frequência com marcação e salvamento, histórico, grade de originais, troca de senha com reentrada, registro do service worker, página offline, tema claro e escuro, e larguras de celular e desktop.
