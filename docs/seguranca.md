# Segurança

Detalhamento das decisões de segurança. O resumo para reportar falhas está em [SECURITY.md](../SECURITY.md).

## Autenticação

- Senhas com scrypt (N 16384, r 8, p 1, chave de 64 bytes, sal de 16 bytes por conta), comparação em tempo constante. Formato do hash versionado em texto, o que permite trocar parâmetros no futuro sem quebrar contas existentes.
- O administrador inicial é criado pelo comando `npm run criar-admin` com credenciais do `.env` (idempotente); o restante das contas nasce na área de Gestão, sem cadastro público.
- Política de senha em toda criação e redefinição: mínimo de 8 caracteres com ao menos uma letra e um número, verificada também por regra pura testada em unidade.
- Contas desativadas não entram; a sessão de uma conta desativada é encerrada na primeira requisição seguinte.
- Tentativas de entrada limitadas a 10 por janela de 15 minutos, por origem e e-mail, em memória, com contador limpo no sucesso. Ambientes com múltiplas instâncias devem levar o limitador para um armazenamento compartilhado ou colocar o limite no proxy.

## Sessões

- Token aleatório de 32 bytes gerado no servidor; o navegador recebe apenas o valor assinado com HMAC curto derivado de `AUTH_SECRET` no cookie `frequenciapp_sessao`.
- O banco guarda o hash SHA-256 do token, nunca o token; roubo do banco não permite reusar sessões diretamente.
- Cookie HttpOnly, SameSite=Lax, path `/`, Secure em produção, validade de 30 dias com expiração registrada.
- Sessões vencidas são apagadas no primeiro uso detectado e podem ser purgadas em rotina (ver [operacao.md](operacao.md)).
- Trocar a senha encerra as sessões dos outros aparelhos; o aparelho corrente continua válido.
- A identidade de sessão carrega o papel; guardas de papel (`exigirAdmin`) fecham as rotas de gestão.

## CSRF

Camadas combinadas:

1. `src/proxy.ts` bloqueia mutações com `sec-fetch-site` diferente de same-origin/none e valida a origem quando o cabeçalho existe.
2. Toda rota mutante confere o cabeçalho `Origin` contra o host do pedido.
3. Cookie SameSite=Lax impede o envio em POST cross-site.

A combinação cobre navegadores modernos sem tokens por formulário.

## Cabeçalhos e CSP

- CSP por nonce em cada requisição: scripts limitados ao próprio servidor com `strict-dynamic`; estilos externos com `'unsafe-inline'` para as posições dinâmicas dos componentes; `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` sem câmera, microfone ou geolocalição.
- Sem `X-Powered-By`.

Em desenvolvimento, a CSP abre `unsafe-eval` para as ferramentas do Next, o que não vale em produção.

## Papéis e isolamento

- Dois papéis: `ADMIN` gerencia séries, turmas, alunos, contas e atribuições; `PROFESSOR` faz a frequência das turmas atribuídas. As listagens filtram pelo escopo: professor vê apenas os alunos das próprias turmas e as próprias frequências.
- Guardas intransponíveis: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta, nunca excluir conta com frequências registradas (o histórico da escola depende do autor).
- Toda consulta e mutação carrega o identificador da sessão nas cláusulas de banco, inclusive nas chaves de unicidade e nas exclusões. Não existe rota que receba identificador de outro professor e encontre dados: 404 é a resposta. Os contratos de API testam o caso diretamente.

## Trilha de auditoria

Ações administrativas (criar, atualizar e excluir entidades, gerenciar contas e atribuições) e trocas de senha são registradas em `auditoria` na mesma transação da ação: quem, o quê e quando, sem dados pessoais de alunos. A trilha serve de insumo para apuração interna e políticas de retenção (ver [lgpd.md](lgpd.md)).

## Entrada e erros

- Corpo JSON validado por zod com limites de tamanho e comprimento; datas e meses conferidos contra o calendário real antes de tocar o banco.
- Mensagens de erro em português claro e acionável ao cliente (ADR-009); detalhes técnicos apenas no log do servidor.
- Falhas de banco não vazam SQL nem connection string: códigos Prisma viram frases como "Este registro está em uso por outros dados" e status adequado.
- Corpos acima de 200 kB são recusados com 413 antes do parse.

## Segredos

- Apenas `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` e opcionais de script; validados na partida quando usados.
- `DIRECT_URL` fica restrita ao Prisma CLI, às migrations e às operações administrativas; o runtime usa somente `DATABASE_URL`.
- `.env` fora do controle de versão; `.env.example` documenta sem valores.
- Nunca há chave de serviço de terceiros: o aplicativo não depende de e-mail, armazenamento externo ou inteligência artificial.

## Superfície de dependências

Distribuição enxuta: framework, UI, Prisma 7 com adaptador pg, zod, Motion e dotenv para o CLI. Nenhuma dependência de serviços externos em runtime, o que elimina toda uma classe de risco de integração. O service worker é código próprio, auditável em um arquivo.
