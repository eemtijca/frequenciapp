# ADR-030: preferências e agenda de notificações

## Estado

Implementada para revisão. Complementa as ADRs 028 e 029.

## Contexto

O resumo diário dos diretores não cobre a escolha de tipos nem o aviso de chamadas pendentes para a coordenação. A Gestão precisa definir horários sem alterar código. A instalação usa Vercel Hobby, cujo cron diário não permite uma consulta frequente durante o dia.

## Decisão

Separar regras da escola, preferências da conta e consentimento por dispositivo. A capacidade `receberNotificacoes` permite configurar os próprios dispositivos sem conceder estatísticas de diretor à equipe ou operação aos diretores. Só a administração altera regras da escola, com auditoria.

Oferecer resumo diário e novas chamadas aos diretores, respeitando vínculo por origem e palavra-chave vigente. Novas chamadas exigem escolha explícita e usam o instante de criação, sem repetir correções ou enviar registros anteriores à escolha e ao dispositivo. Oferecer pendências à equipe, considerando turma com aula ativa no dia e aluno participante, sem chamada salva. O aviso de pendências começa desligado até a Gestão habilitá-lo.

Avaliar horários em `TZ_APP`, com um envio diário por tipo e dispositivo e um envio por nova chamada. Confirmar entregas com chave composta por assinatura, dia, tipo e referência, preservando confirmações antigas como resumo. Após reservar, reconsultar regras, preferências, conta, vínculos e pendências. Manter conteúdo genérico, sem nomes de alunos ou turmas.

Usar uma rota única de agenda autenticada por `CRON_SECRET`, com o escopo determinado no servidor. Fornecer workflow de GitHub Actions a cada cinco minutos e manter uma consulta diária da Vercel compatível com Hobby. O secret de Actions precisa ser igual ao da hospedagem, e o endereço público pode ser personalizado por variável do repositório.

## Alternativas

Alterar o cron na Vercel ao salvar exigiria credenciais de implantação e continuaria limitado pelo plano. Um cron frequente no Hobby impediria a publicação. Timers no navegador dependeriam de manter uma aba aberta; timers do servidor não sobrevivem ao ciclo de vida serverless. Uma agenda externa também pode usar a mesma rota.

## Consequências

Os horários representam o início permitido, sujeitos ao atraso da agenda e do serviço de push. Repositórios públicos podem ter agendas desativadas após inatividade; a consulta diária não garante recuperação de todos os horários. Feriados sem suspensão da grade exigem desligar pendências na Gestão. O agendador precisa de configuração inicial segura do secret, sem adicionar credenciais ao aplicativo.

Há duas tabelas novas, um enum, um instante de criação na frequência e uma ampliação da chave de confirmação. A migração deve ser aplicada antes de servir a versão. Regras e preferências de notificações ficam fora da cópia JSON de frequência. Não há dependências novas nem mudança na geração automática de VAPID.
