# ADR-002: Sessões opacas em cookie HttpOnly

## Estado

Aceita.

## Contexto

O acesso é pessoal e privado do professor. O aplicativo original delegava a autenticação a um adaptador neutro não implementado, o que deixava o salvamento desativado. A reconstrução precisa de autenticação própria, simples de operar e sem dependência de provedores de identidade.

## Decisão

- Sessões opacas: token aleatório de 32 bytes gerado no servidor, guardado no banco apenas como hash SHA-256.
- Cookie `chamada_sessao` HttpOnly, SameSite=Lax, Secure em produção, com o valor assinado por HMAC curto derivado de `AUTH_SECRET` para impedir forja do conteúdo trafegado.
- Validade de 30 dias, expiração registrada e purga de vencidas.
- Sem cadastro público: a conta nasce do comando idempotente `criar-conta`.

## Alternativas descartadas

- JWT stateless: revogação imediata exigiria lista de bloqueio de qualquer forma, e o aplicativo recarrega a identidade a cada requisição.
- Autenticação de provedor externo: contraria o requisito de independência de terceiros.

## Consequências

- Roubo do banco não reutiliza sessões; roubo de cookie vale até a expiração ou até a troca de senha com limpeza de sessões.
- O limitador de tentativas em memória basta para instância única e está documentado como ponto de atenção em ambientes com várias instâncias.
