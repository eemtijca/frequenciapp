# ADR-029: configuração automática de Web Push

## Estado

Implementada para revisão. Complementa a ADR-028.

## Contexto

A ativação de notificações por diretores era bloqueada sem três variáveis VAPID na hospedagem. A mensagem atribuía o bloqueio a uma configuração da administração, embora o aplicativo não oferecesse essa configuração. Gerar chaves aleatórias a cada partida invalidaria assinaturas existentes e dividiria a identidade entre instâncias.

## Decisão

Derivar um par P-256 estável de `AUTH_SECRET` por HKDF-SHA-256, com contexto exclusivo e versionado para Web Push. Saídas fora do intervalo da curva são descartadas com uma nova derivação determinística. A chave privada mantém os 32 bytes, inclusive zeros iniciais, e nunca é enviada ao cliente.

Preservar a prioridade de um par VAPID explícito. Uma única chave explícita continua sendo erro de configuração. O contato pode ser personalizado de forma independente; na ausência, usa o endereço HTTPS do repositório do aplicativo.

Manter consentimento por dispositivo, controles de acesso e o segredo independente da agenda diária. A configuração automática não altera a autorização de disparos.

## Alternativas

Exigir chaves na hospedagem mantém o bloqueio relatado. Gerar um par a cada partida perde a identidade entre reinícios e réplicas. Persistir um par aleatório no banco exige armazenamento de segredo e coordenação de inicialização; a derivação aproveita o segredo estável já obrigatório na instalação.

## Consequências

Diretores podem ativar notificações sem configuração manual de VAPID. Reinícios e réplicas com o mesmo segredo preservam assinaturas. Trocar `AUTH_SECRET` no modo automático também troca a identidade de push e exige nova ativação. Instalações que precisam rotacionar autenticação sem trocar a identidade de push podem manter um par explícito.
