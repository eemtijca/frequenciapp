# ADR-028: notificações Web Push voluntárias

## Estado

Proposta e implementada para revisão.

## Contexto

Diretores acompanham turmas pela PWA, mas precisam abrir o aplicativo para saber se há chamadas disponíveis. O aviso deve funcionar com o aplicativo fechado e respeitar o vínculo vigente, sem expor estudantes na tela bloqueada.

## Decisão

- Web Push padrão com VAPID, usando `web-push` no servidor e os eventos do service worker próprio da ADR-008. Sem projeto Firebase nem serviço de disparo adicional.
- Adesão por dispositivo depois de toque explícito e consentimento do navegador. A primeira modalidade é um aviso diário para diretores de turma. A matriz de acesso permite apenas a capacidade de leitura das próprias turmas nas rotas da preferência.
- Conteúdo genérico, sem estudantes, turmas ou estatísticas no payload. O destino é sempre o aplicativo; sessão e vínculo são verificados novamente ao consultar os dados.
- Assinaturas associadas à conta e à última sessão que confirmou a preferência. Expiração natural mantém a adesão; saída explícita remove a assinatura. Revogação, nova emissão de palavra-chave e desativação removem todas as assinaturas da conta.
- Endpoints restritos a serviços de push conhecidos para não permitir que uma assinatura cause acesso do servidor a endereços arbitrários.
- Agenda autenticada com segredo independente, diária na Vercel ou externa em outra hospedagem. Consulta o vínculo e a lista histórica da chamada por turma de origem, sem parâmetros de escopo do chamador.
- Reserva e confirmação por assinatura e dia no PostgreSQL. Falhas transitórias podem ser repetidas e respostas 404 ou 410 retiram a assinatura.

## Alternativas

Polling depende de manter o aplicativo aberto. Push com Firebase adicionaria configuração de fornecedor sem necessidade para a API padrão. Disparo em todo salvamento da chamada poderia repetir avisos durante correções e antes de terminar o dia; a primeira modalidade usa agenda diária.

## Consequências

Há uma dependência de transporte, duas tabelas e quatro variáveis opcionais. Chaves privadas e assinaturas não entram na cópia JSON nem nos logs. O aplicativo continua utilizável com push desligado. iOS exige instalação na Tela de Início. O serviço de push oferece entrega eventual, sem confirmação de leitura, e uma interrupção entre aceitação e confirmação pode repetir o aviso. Configuração e limites estão em [notificacoes.md](../notificacoes.md).
