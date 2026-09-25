# Segurança

## Versões com suporte

O projeto é um aplicativo pessoal mantido em uma branch principal. Use a última revisão da `main`.

## Como reportar uma vulnerabilidade

Escreva para o mantenedor pelo canal privado indicado no perfil do repositório. Não abra issue pública com detalhes da falha, exploit, dados de acesso ou logs que contenham dados pessoais.

Inclua na mensagem:

- Descrição do problema e impacto possível.
- Passos ou condições para reproduzir.
- Versões de aplicativo, Node e banco envolvidas.
- Sugestão de correção, se houver.

O relato é respondido em até 7 dias. Correções de segurança entram como lançamento com aviso no changelog, sem expor detalhes de exploração antes da correção disponível.

## Práticas adotadas

- **Senhas**: hash com scrypt (custo 16384, chave de 64 bytes, sal aleatório por conta) e comparação em tempo constante. Nenhuma senha trafega em log.
- **Sessões**: token aleatório de 32 bytes em cookie HttpOnly, SameSite=Lax e Secure em produção; o banco guarda apenas o hash SHA-256 do token, com expiração de 30 dias e purga de vencidas.
- **CSRF**: mutações cross-site bloqueadas no proxy por `sec-fetch-site` e comparação de origem; as rotas também verificam o cabeçalho Origin.
- **Cabeçalhos**: CSP com nonce por requisição, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy` restritivos.
- **Isolamento**: as rotas de cadastro e de contas exigem papel de administração, e a frequência é única por turma e dia, com revisão e revalidação de alunos e aulas dentro da transação.
- **Entrada**: validação de corpo com zod em todas as mutações; datas e meses conferidos contra o calendário real.
- **Brute force**: limitador de tentativas de entrada por origem e e-mail, com janela de 15 minutos.
- **Segredos**: apenas via variáveis de ambiente; `DATABASE_URL` e `AUTH_SECRET` são validados na partida, e `DIRECT_URL` fica restrita ao CLI, às migrations e às operações administrativas; o `.env` nunca é commitado.
- **Dependências**: nenhuma dependência de serviço de IA; superfície mínima de pacotes.

## Limitações conhecidas

- O limitador de tentativas é em memória por instância; implantações com múltiplas instâncias devem adotar armazenamento compartilhado (ver [docs/seguranca.md](docs/seguranca.md)).
- Não há segundo fator de autenticação; para contas compartilhadas, prefira credenciais individuais por pessoa da equipe.
- O aplicativo pressupõe HTTPS terminado à frente (proxy reverso ou plataforma); o cookie só marca Secure em produção.
