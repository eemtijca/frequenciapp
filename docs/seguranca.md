# Segurança

Detalhamento das decisões de segurança. O resumo para reportar falhas está em [SECURITY.md](../SECURITY.md).

## Autenticação

- Senhas com scrypt (N 16384, r 8, p 1, chave de 64 bytes, sal de 16 bytes por conta), comparação em tempo constante. Formato do hash versionado em texto, o que permite trocar parâmetros no futuro sem quebrar contas existentes.
- O administrador inicial é criado pelo comando `npm run criar-admin` com credenciais do `.env` (idempotente) ou, no Compose, pelo entrypoint na partida (modo `--somente-criar`, que preserva uma conta existente); as contas de coordenação nascem pelo comando `npm run criar-coordenacao` ou pela área de Gestão, sem cadastro público.
- Política de senha em toda criação e redefinição: mínimo de 8 caracteres com ao menos uma letra e um número, verificada também por regra pura testada em unidade.
- Contas desativadas não entram; a sessão de uma conta desativada é encerrada na primeira requisição seguinte.
- Tentativas de entrada limitadas a 10 por IP e e-mail e a 30 por e-mail, em janela de 15 minutos, em memória, com contador limpo no sucesso, teto de chaves e expurgo. Quando o e-mail não existe, uma verificação descartável iguala o tempo de resposta e não revela contas. Ambientes com múltiplas instâncias devem levar o limitador para um armazenamento compartilhado ou colocar o limite no proxy.

## Sessões

- Token aleatório de 32 bytes gerado no servidor; o navegador recebe apenas o valor assinado com HMAC-SHA256 derivado de `AUTH_SECRET` no cookie `frequenciapp_sessao`, comparado em tempo constante.
- O banco guarda o hash SHA-256 do token, nunca o token; roubo do banco não permite reusar sessões diretamente.
- Cookie HttpOnly, SameSite=Lax, path `/`, Secure em produção, exceto quando `PERMITIR_HTTP=true` libera a implantação sem TLS ([ambiente.md](ambiente.md)). Com a opção "Manter conectado neste dispositivo", a validade é de 30 dias com expiração registrada; sem ela, o cookie é de sessão (some ao fechar o navegador) e a validade no servidor é de 12 horas.
- Sessões vencidas são apagadas no primeiro uso detectado e podem ser purgadas em rotina (ver [operacao.md](operacao.md)).
- Trocar a senha encerra as sessões dos outros dispositivos; o dispositivo corrente continua válido.
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
- Sem `X-Powered-By`. HSTS é adicionado no caminho self-hosted pelo `next.config.ts` apenas quando o tráfego é TLS (produção sem `PERMITIR_HTTP`); na Vercel, o cabeçalho vem da plataforma. O CSP só inclui `upgrade-insecure-requests` quando a requisição chega por HTTPS.

Em desenvolvimento, a CSP abre `unsafe-eval` para as ferramentas do Next, o que não vale em produção.

## Papéis e isolamento

- Dois papéis: `ADMIN` gerencia séries, turmas, aulas, alunos e contas; `COORDENACAO` registra a frequência e consulta o histórico e a grade do mês. As duas funções veem os dados escolares, que são o objeto do serviço.
- Guardas intransponíveis: nunca remover o último administrador ativo, nunca rebaixar nem desativar a própria conta. A frequência é dado da escola: excluir uma conta preserva o histórico e anula a autoria.
- A guarda do último administrador roda dentro da transação serializável, junto da escrita, para duas alterações simultâneas não deixarem a escola sem acesso de configuração.
- A frequência é única por turma e dia, com revisão; a checagem de duplicata e de revisão acontece no banco, e o salvamento revalida alunos e aulas dentro da transação. A saída antecipada é única por aluno e dia, e o registro separado não altera a chamada. Os contratos de API testam os casos diretamente.

## Trilha de auditoria

Ações administrativas (criar, atualizar e excluir entidades escolares, gerenciar contas) e trocas de senha são registradas em `auditoria` na mesma transação da ação: quem, o quê e quando, sem nomes de alunos. Salvar frequência não gera linha na trilha: a própria frequência guarda revisão, autoria e momento da atualização. A trilha serve de insumo para apuração interna e políticas de retenção (ver [lgpd.md](lgpd.md)).

## Entrada e erros

- Corpo JSON validado por zod com limites de tamanho e comprimento; datas e meses conferidos contra o calendário real antes de tocar o banco.
- Mensagens de erro em português claro e acionável ao cliente (ADR-009); detalhes técnicos apenas no log do servidor.
- Falhas de banco não vazam SQL nem connection string: códigos Prisma viram frases como "Este registro está em uso por outros dados" e status adequado.
- Corpos acima de 200 kB em bytes são recusados com 413 antes do parse; hashes de senha com parâmetros fora de faixa são recusados sem executar o scrypt.

## Segredos

- `DATABASE_URL` e `AUTH_SECRET` são validados na partida; `DIRECT_URL` fica restrita ao Prisma CLI, às migrations e às operações administrativas.
- O runtime usa somente `DATABASE_URL`; opcionais de script são consumidos pelos comandos operacionais.
- `.env` fora do controle de versão; `.env.example` documenta sem valores.
- Nunca há chave de serviço de terceiros: o aplicativo não depende de e-mail, armazenamento externo ou inteligência artificial. A integração opcional com o Google Planilhas usa token próprio, guardado no banco, fora da cópia JSON, e só chama o Web App publicado pela escola.

## Integração com Google Planilhas

- Desligada por padrão. O navegador nunca fala com o Google: as chamadas saem do servidor, com o token no corpo e sem registro de segredo nos logs.
- O endereço é validado contra `script.google.com/macros/s/.../exec`; loopback só é aceito fora de produção, para os testes.
- Revelar o token, destravar o modo completo e restaurar cópia exigem a senha do administrador, com limite de tentativas por usuário.
- O modo completo expira sozinho, cria cópia oculta da aba antes de operação destrutiva e só remove linha, coluna ou aba com marcador de Developer Metadata da integração.
- Fórmula nunca é sobrescrita, nem no modo completo; célula ocupada é pulada e relatada.
- Toda ação é auditada sem nomes de alunos: token, esquema, mapa, envios, destrave e restauração.

## Superfície de dependências

Distribuição enxuta: framework, UI, Prisma 7 com adaptador pg, zod, Motion e dotenv para o CLI. Nenhuma dependência de serviços externos em runtime, o que elimina toda uma classe de risco de integração. O service worker é código próprio, auditável em um arquivo.
