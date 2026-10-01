# Notificações push

Avisos para diretores de turma e equipe escolar, com preferências pessoais e adesão voluntária por dispositivo. O aviso abre o FrequenciApp e a consulta continua exigindo autenticação. Não há nomes, turmas nem dados individuais de estudantes no texto enviado ao serviço de push.

## Tipos e horários

Em Gestão, Configurações, Notificações, a administração define os tipos disponíveis e os horários do resumo e das pendências. Os horários usam `TZ_APP`, normalmente `America/Fortaleza`. O resumo permanece ligado às 17:00 por padrão. Novas chamadas ficam disponíveis, mas exigem escolha pessoal. O aviso de pendências começa desligado até a Gestão habilitá-lo.

| Tipo               | Destinatários               | Condição                                                                                                           |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Resumo diário      | Diretores de turma          | Há chamada do dia nas turmas de origem acompanhadas, após o horário do resumo.                                     |
| Novas chamadas     | Diretores de turma          | Uma chamada do dia foi criada após a escolha desse tipo e a ativação do dispositivo. Edições não repetem o aviso.  |
| Chamadas pendentes | Coordenação e administração | Após o horário escolhido, há turma com aula ativa prevista no dia e aluno ativo não desistente, sem chamada salva. |

Cada conta escolhe seus tipos no diálogo Configurar notificações. As escolhas são salvas sem pedir permissão ao navegador e valem para todos os dispositivos da conta. O resumo dos diretores existentes é preservado. Avisos desligados pela Gestão não são enviados, mesmo quando a preferência pessoal está marcada.

Uma turma vazia, sem aula prevista ou somente com alunos desistentes não gera pendência. A grade semanal não identifica feriados ou suspensões: nesses dias, a Gestão deve desligar o aviso de pendências quando as aulas cadastradas não acontecerem. Uma chamada salva encerra a pendência, inclusive quando não há faltas.

## Ativar no dispositivo

1. Entrar na conta. Diretores precisam concluir a troca inicial da palavra-chave.
2. Abrir Configurar notificações pelo sino do cabeçalho ou pela área da conta no computador.
3. Escolher os tipos de aviso e tocar em Ativar notificações para permitir o pedido do navegador.
4. Usar Enviar notificação de teste para conferir a entrega. O teste tem limite de um por minuto.

A permissão nunca é solicitada ao abrir a página. Desativar notificações retira somente a assinatura deste dispositivo. Sair da conta também retira as assinaturas associadas à sessão corrente; outros dispositivos continuam ativos. A expiração natural da sessão não cancela a preferência, mas abrir o aplicativo exige entrar novamente.

Cada conta aceita até cinco dispositivos. Ao trocar de conta no mesmo navegador, é necessário ativar os avisos na nova conta; a mesma assinatura só pode pertencer a uma conta. A renovação da preferência exige uma sessão válida e a assinatura completa do navegador.

## Compatibilidade

- Chrome e Edge com Web Push, inclusive Android, e Firefox: navegador compatível e contexto HTTPS.
- iPhone e iPad: iOS ou iPadOS 16.4 ou posterior, aplicativo adicionado à Tela de Início pelo Safari e aberto por esse ícone. O navegador avulso pode não oferecer push.
- Permissão bloqueada: liberar as notificações nas configurações do site e abrir a opção novamente.
- HTTP fora de localhost não oferece push. O funcionamento comum do aplicativo continua disponível quando o navegador não suporta notificações.

O sistema operacional e o navegador podem atrasar ou silenciar avisos. A aceitação pelo serviço de push não comprova leitura nem entrega imediata. O conteúdo expira no serviço após uma hora.

## Configuração da instalação

Aplicar as migrações antes de servir esta versão: `npx prisma migrate deploy`. A migração `preferencias_notificacoes` cria regras e preferências, separa confirmações por tipo e chamada e registra o instante de criação da frequência para distinguir chamadas novas. Confirmações anteriores continuam sendo resumos. Assinaturas, chaves, preferências pessoais e regras de notificações ficam fora da cópia JSON de frequência.

As notificações podem ser ativadas sem ajustes da administração no aplicativo ou variáveis VAPID na hospedagem. O servidor deriva um par estável de `AUTH_SECRET` com HKDF-SHA-256 e contexto exclusivo para Web Push. Reinícios e instâncias com o mesmo segredo mantêm o par. A chave privada permanece somente no servidor, e o contato padrão é o endereço HTTPS do repositório do FrequenciApp.

Uma instalação com par VAPID próprio continua usando suas chaves, sem troca automática. Para definir esse par, gerar uma única vez com `npx web-push generate-vapid-keys` e configurar as duas chaves juntas. Não incluir a chave privada em commits, imagens, issues ou logs públicos. O contato pode ser personalizado de forma independente:

| Variável                 | Conteúdo                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| `PUSH_VAPID_PUBLIC_KEY`  | Chave pública do par, compartilhada com o navegador.              |
| `PUSH_VAPID_PRIVATE_KEY` | Chave privada do mesmo par, somente no servidor.                  |
| `PUSH_VAPID_SUBJECT`     | Contato opcional da administração em `mailto:` ou HTTPS.          |
| `CRON_SECRET`            | Segredo independente com pelo menos 32 caracteres, para a agenda. |

Uma única chave VAPID explícita impede a partida, para não substituir silenciosamente a identidade da instalação. Um par que não corresponde é recusado antes do cadastro ou envio. Trocar um par explícito, ou `AUTH_SECRET` quando o par é automático, exige ativar novamente nos dispositivos; a reativação remove assinaturas antigas da conta. A derivação está registrada na [ADR-029](adr/029-configuracao-automatica-push.md).

Ativação e notificação de teste não dependem de `CRON_SECRET`. Os avisos automáticos exigem esse segredo e uma agenda que consulte periodicamente `GET /api/notificacoes/agenda`, com `Authorization: Bearer CRON_SECRET`. O servidor avalia horários e preferências em cada execução, sem permitir contas, turmas ou datas escolhidas pelo chamador. Cookie de administrador não autoriza o envio.

### Vercel Hobby e GitHub Actions

A Vercel Hobby admite somente execução diária por tarefa. `vercel.json` mantém uma consulta compatível com esse plano às 20:00 UTC, de segunda a sexta. Essa consulta isolada não atende todos os horários escolhidos nem verifica novas chamadas ao longo do dia.

O workflow [notificacoes.yml](../.github/workflows/notificacoes.yml) verifica os avisos a cada cinco minutos, deslocado do início da hora. Para ativá-lo após integrar a versão à `main`:

1. Definir `CRON_SECRET` na Vercel e cadastrar o mesmo valor como secret de Actions do repositório. Nunca colocar o valor em código, issue, log ou conversa.
2. Se o aplicativo usar outro endereço, definir a variável de Actions `NOTIFICACOES_APP_URL`. O padrão é `https://frequenciappjca.vercel.app`.
3. Executar Agenda de notificações manualmente pelo GitHub e conferir o resultado. Sem o secret, o workflow informa que aguarda configuração e não faz pedidos ao aplicativo.

Pelo CLI, `gh secret set CRON_SECRET --repo eemtijca/frequenciapp` recebe o valor de forma interativa. A variável pública pode ser definida com `gh variable set NOTIFICACOES_APP_URL --repo eemtijca/frequenciapp --body 'https://endereco-da-instalacao.exemplo'`.

O repositório público permite usar Actions sem consumir a cota de minutos de repositórios privados. Agendas do GitHub podem atrasar, perder execuções em momentos de carga e ser desativadas após 60 dias sem atividade em repositórios públicos. Os horários são limites iniciais, sem promessa de entrega no minuto exato. A consulta diária da Vercel não contorna atrasos fora daquele horário.

Em Docker ou outra hospedagem, usar uma agenda externa com a mesma rota e autenticação. O Compose não instala um agendador. Uma Vercel com plano que permita consultas frequentes também pode usar sua própria agenda. `/api/notificacoes/resumo` permanece disponível para consultar somente os resumos, respeitando o horário definido na Gestão.

## Regras do envio

- Só contas ativas, com papel adequado ao aviso. Diretores também precisam de palavra-chave vigente, não revogada e já trocada.
- Só dispositivos que aderiram e usam o par VAPID atual.
- Só vínculos vigentes no dia, com pelo menos um aluno ativo da turma de origem na lista de uma chamada salva naquele dia. Turma reorganizada não perde o vínculo por origem. Aluno desistente no dia não ativa o aviso.
- Resumos e novas chamadas não são enviados em dias sem chamada. Pendências dependem da grade semanal e podem ser enviadas mesmo quando nenhuma chamada foi salva no dia.
- Um resumo e um aviso de pendências por assinatura e dia; um aviso de nova chamada por assinatura, dia e chamada. A reserva dura dois minutos para impedir duplicação em execuções concorrentes.
- Depois da reserva, o servidor reconsulta regras, preferências, conta, vínculos e pendências. Uma chamada concluída antes desse ponto cancela o aviso de pendências. Após aceitação pelo serviço de push, o aviso já não pode ser recolhido.
- Falha temporária libera a reserva para nova tentativa da agenda no mesmo dia e retorna 503 com contagens. Assinaturas recusadas com 404 ou 410 são removidas.
- As confirmações são guardadas por até 30 dias e a limpeza ocorre a cada execução configurada. Uma interrupção depois de o provedor aceitar o envio e antes da confirmação no banco pode causar repetição; a etiqueta da notificação agrupa avisos do mesmo dia no dispositivo.

Revogar a palavra-chave, gerar outra ou desativar o diretor remove todas as assinaturas da conta. Retirar um vínculo interrompe o envio para aquela turma. Avisos já aceitos pelo provedor não podem ser recolhidos; seu texto genérico não libera acesso aos dados.

## Validação

Os testes geram chaves e contas sintéticas, sem enviar mensagens a serviços externos. `tests/gerar-ambiente-push.mjs` escreve as variáveis somente no arquivo de ambiente indicado. A suíte de PWA simula a assinatura do navegador para testar adesão e cancelamento. Um evento simulado no worker de produção confere o conteúdo solicitado à API de notificação; a exibição pelo sistema operacional é simulada no Chromium sem interface. A entrega a um celular depende da configuração da instalação e deve ser conferida pela opção de teste no próprio dispositivo.
