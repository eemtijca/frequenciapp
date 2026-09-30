# Notificações push

Aviso diário de acompanhamento para diretores de turma, com adesão voluntária por dispositivo. O aviso abre o FrequenciApp e a consulta continua exigindo autenticação. Não há nomes, turmas nem dados individuais de estudantes no texto enviado ao serviço de push.

## Ativar no dispositivo

1. Entrar como diretor de turma e concluir a troca inicial da palavra-chave.
2. Tocar no sino do cabeçalho, Configurar notificações.
3. Tocar em Ativar notificações e permitir o pedido do navegador.
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

Aplicar as migrações antes de servir esta versão: `npx prisma migrate deploy`. A migração `notificacoes_push` cria duas tabelas vazias, sem alterar chamadas ou contas existentes. As assinaturas e chaves ficam fora da cópia JSON do aplicativo.

As notificações podem ser ativadas sem ajustes da administração no aplicativo ou variáveis VAPID na hospedagem. O servidor deriva um par estável de `AUTH_SECRET` com HKDF-SHA-256 e contexto exclusivo para Web Push. Reinícios e instâncias com o mesmo segredo mantêm o par. A chave privada permanece somente no servidor, e o contato padrão é o endereço HTTPS do repositório do FrequenciApp.

Uma instalação com par VAPID próprio continua usando suas chaves, sem troca automática. Para definir esse par, gerar uma única vez com `npx web-push generate-vapid-keys` e configurar as duas chaves juntas. Não incluir a chave privada em commits, imagens, issues ou logs públicos. O contato pode ser personalizado de forma independente:

| Variável                 | Conteúdo                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| `PUSH_VAPID_PUBLIC_KEY`  | Chave pública do par, compartilhada com o navegador.              |
| `PUSH_VAPID_PRIVATE_KEY` | Chave privada do mesmo par, somente no servidor.                  |
| `PUSH_VAPID_SUBJECT`     | Contato opcional da administração em `mailto:` ou HTTPS.          |
| `CRON_SECRET`            | Segredo independente com pelo menos 32 caracteres, para a agenda. |

Uma única chave VAPID explícita impede a partida, para não substituir silenciosamente a identidade da instalação. Um par que não corresponde é recusado antes do cadastro ou envio. Trocar um par explícito, ou `AUTH_SECRET` quando o par é automático, exige ativar novamente nos dispositivos; a reativação remove assinaturas antigas da conta. A derivação está registrada na [ADR-029](adr/029-configuracao-automatica-push.md).

Ativação e notificação de teste não dependem de `CRON_SECRET`. O envio diário continua exigindo esse segredo e uma agenda configurada na hospedagem.

Na Vercel, a agenda de `vercel.json` chama `/api/notificacoes/resumo` de segunda a sexta, às 20:00 UTC, equivalente a 17:00 em `America/Fortaleza`. A plataforma envia `Authorization: Bearer CRON_SECRET`. Alterar o horário exige ajustar a expressão da agenda; a data das chamadas usa `TZ_APP`. A plataforma pode executar dentro de uma janela de horário, conforme o plano contratado.

Em Docker ou outra hospedagem, configurar uma agenda externa que faça GET nessa rota com o mesmo cabeçalho. O Compose não instala um agendador. O pedido não aceita contas, turmas nem datas escolhidas pelo chamador. Cookie de administrador não autoriza o envio.

## Regras do envio

- Só diretores ativos, com palavra-chave vigente, não revogada e já trocada.
- Só dispositivos que aderiram e usam o par VAPID atual.
- Só vínculos vigentes no dia, com pelo menos um aluno ativo da turma de origem na lista de uma chamada salva naquele dia. Turma reorganizada não perde o vínculo por origem. Aluno desistente no dia não ativa o aviso.
- Dias sem chamada, inclusive feriados, não geram aviso. Uma chamada salva depois da execução da agenda não dispara aviso naquele dia sem nova execução.
- Um aviso por assinatura e dia, com reserva de envio por dois minutos para impedir que execuções concorrentes enviem o mesmo aviso.
- Falha temporária libera a reserva para nova tentativa da agenda no mesmo dia e retorna 503 com contagens. Assinaturas recusadas com 404 ou 410 são removidas.
- As confirmações são guardadas por até 30 dias e a limpeza ocorre a cada execução configurada. Uma interrupção depois de o provedor aceitar o envio e antes da confirmação no banco pode causar repetição; a etiqueta da notificação agrupa avisos do mesmo dia no dispositivo.

Revogar a palavra-chave, gerar outra ou desativar o diretor remove todas as assinaturas da conta. Retirar um vínculo interrompe o envio para aquela turma. Avisos já aceitos pelo provedor não podem ser recolhidos; seu texto genérico não libera acesso aos dados.

## Validação

Os testes geram chaves e contas sintéticas, sem enviar mensagens a serviços externos. `tests/gerar-ambiente-push.mjs` escreve as variáveis somente no arquivo de ambiente indicado. A suíte de PWA simula a assinatura do navegador para testar adesão e cancelamento. Um evento simulado no worker de produção confere o conteúdo solicitado à API de notificação; a exibição pelo sistema operacional é simulada no Chromium sem interface. A entrega a um celular depende da configuração da instalação e deve ser conferida pela opção de teste no próprio dispositivo.
