# Segurança

Detalhamento das decisões de segurança. O resumo para reportar falhas está em [SECURITY.md](../SECURITY.md).

## Autenticação

- Senhas com scrypt (N 16384, r 8, p 1, chave de 64 bytes, sal de 16 bytes por conta), comparação em tempo constante. Formato do hash versionado em texto, o que permite trocar parâmetros no futuro sem quebrar contas existentes.
- O administrador inicial é criado pelo comando `npm run criar-admin` com credenciais do `.env` (idempotente) ou, no Compose, pelo entrypoint na partida (modo `--somente-criar`, que preserva uma conta existente); as contas de coordenação nascem pelo comando `npm run criar-coordenacao` ou pela área de Gestão, sem cadastro público.
- Política de senha em toda criação e redefinição: mínimo de 8 caracteres com ao menos uma letra e um número, verificada também por regra pura testada em unidade.
- Contas desativadas não entram; a sessão de uma conta desativada é encerrada na primeira requisição seguinte.
- Tentativas de entrada limitadas por dispositivo e login e por login, na janela dos parâmetros de acesso (padrão: 10, 30 e 15 minutos), contadas na tabela `tentativas_entrada` com um upsert atômico. O limite vale entre instâncias, o contador é limpo no sucesso e as chaves paradas há mais de um dia saem num expurgo ocasional. Quando o login não existe, uma verificação descartável iguala o tempo de resposta e não revela contas. Os limites operacionais da planilha usam o mesmo armazenamento.
- O diretor de turma entra pelo identificador (sem arroba, na mesma coluna do e-mail da equipe) e pela palavra-chave, gerada no servidor com cerca de 59 bits e guardada só como hash scrypt. O estado da palavra (vencida ou revogada) só é revelado depois de a palavra conferir. A sessão do diretor usa cookie de sessão, com validade no servidor limitada pelas horas dos parâmetros e pela validade da palavra.
- O diretor só tem `verEstatisticasDasTurmas` e `alterarPropriaSenha`. Enquanto a troca da palavra-chave for obrigatória, a rota de estatísticas responde 403. A turma pedida é conferida contra os vínculos vigentes lidos do banco na própria requisição, o período é recortado ao vínculo e a resposta traz só agregados por aluno e por semana das categorias liberadas, sem observação, justificativa escrita ou dado de outra turma. Cada consulta fica na auditoria (`diretor.consultar`).

## Sessões

- Token aleatório de 32 bytes gerado no servidor; o navegador recebe apenas o valor assinado com HMAC-SHA256 derivado de `AUTH_SECRET` no cookie `frequenciapp_sessao`, comparado em tempo constante.
- O banco guarda o hash SHA-256 do token, nunca o token; roubo do banco não permite reusar sessões diretamente.
- Cookie HttpOnly, SameSite=Lax, path `/`, Secure em produção, exceto quando `PERMITIR_HTTP=true` libera a implantação sem TLS ([ambiente.md](ambiente.md)). Com a opção "Manter conectado neste dispositivo", a validade é de 30 dias com expiração registrada; sem ela, o cookie é de sessão (some ao fechar o navegador) e a validade no servidor é de 12 horas.
- Sessões vencidas são apagadas no primeiro uso detectado e podem ser purgadas em rotina (ver [operacao.md](operacao.md)).
- Trocar a senha encerra as sessões dos outros dispositivos; o dispositivo corrente continua válido.
- A identidade de sessão carrega o papel, e as rotas exigem capacidades, não papéis (`exigirCapacidade`, com `exigirSessao` para a operação escolar e `exigirAdmin` para a gestão). A matriz de papel para capacidades fica em `src/domain/usuarios.ts` e recusa por padrão; ver [ADR-021](adr/021-acesso-de-leitura-dos-diretores-de-turma.md).

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
- Capacidades: `operar` (chamada, saídas, relatórios e envio à planilha), `administrar` (gestão, contas, catálogos, integrações e cópia de segurança) e `alterarPropriaSenha`. `ADMIN` tem as três; `COORDENACAO`, `operar` e `alterarPropriaSenha`. Papel sem a capacidade recebe 403 mesmo com sessão válida, e a página inicial só abre o aplicativo completo com `operar`. Todo manipulador da API passa por uma guarda, conferido em teste; as exceções públicas (entrada, saída, estado da sessão e saúde) ficam listadas no próprio teste.
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
- A integração OAuth com Google Planilhas guarda o token de atualização cifrado no banco, fora da cópia JSON. O segredo do cliente OAuth fica no servidor; a chave pública do Picker é restrita a sites e à API no projeto Cloud. A conexão legada usa token próprio e Web App publicado pela escola.

## Integração com Google Planilhas

- Desligada por padrão. Na conexão OAuth da frequência ou das saídas, o navegador abre o Google Picker com um token de acesso breve. O token de atualização fica cifrado no servidor com uma chave derivada de `AUTH_SECRET`, e as chamadas da Sheets API saem do servidor.
- OAuth usa estado assinado, PKCE, escopo `drive.file` e seleção explícita da planilha. Só a administração pode conectar a conta e escolher a planilha.
- Cada finalidade tem seleção de planilha, esquema e janela de modo completo próprios. A conexão legada por Apps Script mantém token e endereço específicos; o endereço é validado contra `script.google.com/macros/s/.../exec`, e loopback só é aceito fora de produção ou com `PERMITIR_ENDPOINT_LOCAL=true`, para os testes.
- Revelar o token, destravar o modo completo e restaurar cópia exigem a senha do administrador, com limite de tentativas por usuário.
- O modo completo expira sozinho, cria cópia oculta da aba antes de operação destrutiva e só remove linha, coluna ou aba com marcador de Developer Metadata da integração.
- Fórmulas e células ocupadas encontradas na última leitura são preservadas e relatadas. A Sheets API não oferece escrita condicionada ao conteúdo anterior; uma edição manual feita entre leitura e gravação pode conflitar com o lote.
- Toda ação é auditada sem nomes de alunos: token, esquema, mapa, envios, destrave e restauração.

## Superfície de dependências

Distribuição enxuta: framework, UI, Prisma 7 com adaptador pg, zod, Motion e dotenv para o CLI. Nenhuma dependência de serviços externos em runtime, o que elimina toda uma classe de risco de integração. O service worker é código próprio, auditável em um arquivo.
