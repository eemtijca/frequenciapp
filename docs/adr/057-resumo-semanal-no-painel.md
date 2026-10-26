# ADR-057: resumo semanal nas quatro telas

- Status: aceita
- Data: 2026-10-25

## Contexto

O resumo da semana existia apenas quando o dia corrente era domingo e era compartilhado por Painel, Chamada e Chamada Parcial. O calendário dessas telas ia de segunda a sábado, as setas pulavam o domingo e não havia acesso a semanas anteriores. A Chamada Parcial reaproveitava o resumo de frequência regular, embora trabalhe com registros efetivos de conferência. Saídas e Entradas não tinha resumo. A atualização recarregava a tela de forma visível e não mostrava o horário da última leitura.

## Decisão

- Painel, Chamada, Chamada Parcial e Saídas e Entradas usam o calendário de segunda a domingo. A grade mostra cinco ou seis semanas, inclui os dias dos meses vizinhos, esmaece os dias fora do mês e destaca o domingo como resumo.
- Qualquer domingo já encerrado abre a semana de segunda a sábado anterior. O cabeçalho identifica o período e o domingo de encerramento. O atalho Hoje volta ao resumo quando hoje é domingo e ao dia corrente nos demais dias.
- As setas andam dia a dia. Sábado leva ao resumo do domingo seguinte e domingo leva à segunda. Em semanas passadas, a seta seguinte abre a segunda depois do domingo. No domingo corrente, a seta seguinte fica desabilitada no Painel, na Chamada e em Saídas e Entradas; na Chamada Parcial, abre a segunda dentro do limite de agendamento.
- O calendário da Chamada Parcial desabilita domingos futuros mesmo com datas futuras liberadas. A seta de um sábado futuro pula para a segunda e a de uma segunda futura volta para o sábado, sem abrir domingo futuro.
- Cada tela define o próprio recorte. O Painel usa todas as turmas visíveis e reúne frequência, saídas, entradas e pendências da Seduc. A Chamada usa a turma selecionada, com frequência e saídas, sem entradas e sem pendências parciais. A Chamada Parcial usa os registros efetivos da turma, com situação na Seduc, tipos de registro, pendentes, dias sem chamada e saídas. Saídas e Entradas usa a aba ativa, com todas as turmas da área.
- Movimentações e pendências da Seduc são seções globais no Painel, fora dos cartões por turma. Cada item mostra a turma gravada no registro. Entradas usam a turma histórica, saídas usam a turma atual do aluno e registros parciais usam a turma da criação. As seções respeitam as turmas visíveis da sessão.
- O resumo é dividido em seções recolhíveis. A Visão geral começa aberta e as demais começam recolhidas. No Painel, a primeira seção de cada turma começa aberta. A expansão é independente, preservada na atualização e reiniciada ao trocar de semana.
- Rosca, linha de infrequência e barras só são montadas na Visão geral aberta e visível. As seções recolhidas não renderizam gráficos. A linha de infrequência usa os limites configurados como referência.
- A carga mantém o último resultado válido por período. A mesma semana mantém o conteúdo durante a atualização e a semana nova mostra carregamento. Uma assinatura dos dados visíveis decide quando atualizar a tela e quando apenas mudar o horário. O anúncio Resumo atualizado ocorre apenas quando os dados mudam.
- Os resumos se atualizam a cada dois minutos, sem desmontar a tela, e pausam com o calendário aberto, a aba oculta ou a visão inativa. Um ciclo em andamento não é sobreposto por outro e as consultas são canceláveis.
- Falha na consulta principal mostra aviso com Tentar novamente. Falha em entradas, saídas ou pendências parciais no Painel preserva a frequência e a seção afetada mostra o aviso.
- O rótulo Atualizado às HH:MM fica no conteúdo, usa o fuso da escola, não é botão nem região viva e mostra Ainda não atualizado antes da primeira carga. A carga inicial do servidor informa o instante ao cliente. FrequenciBI e Minhas turmas usam o mesmo componente com estado local.
- O Painel mantém o refresh de sessenta segundos no dia e relê as configurações de infrequência no Atualizar tela e no ciclo automático. Chamada, Chamada Parcial e Saídas e Entradas não ganham refresh automático no dia.
- A implementação reutiliza as APIs de frequência, saídas, entradas, registros personalizados e configurações. Não cria tabela, migração, rota ou dependência de interface.

## Alternativas consideradas

- Manter o calendário de segunda a sábado e oferecer um seletor separado de semanas. Foi descartado porque criaria dois modelos de navegação na mesma tela e não resolveria o acesso ao domingo.
- Mostrar o mesmo resumo em todas as telas. Foi descartado porque o Painel precisa da união de dados, a Chamada não deve repetir entradas e pendências parciais, e a Chamada Parcial precisa dos registros efetivos.
- Atualizar o resumo com recarregamento visível. Foi descartado porque interrompe a leitura e perde foco, rolagem e seções abertas.
- Criar uma rota específica para o resumo. Foi descartado porque as APIs existentes já entregam os recortes necessários e um novo contrato ampliaria a manutenção sem ganho.

## Consequências

- A coordenação consulta semanas anteriores e entende o fechamento semanal em qualquer tela.
- O custo do Painel cresce para quatro consultas a cada dois minutos. O paralelismo, o cancelamento e a ausência de ciclos sobrepostos limitam o impacto.
- A documentação registra a limitação de saídas de alunos transferidos que hoje estão em turma fora do escopo visível.
- As capturas e os testes de resumo deixam de depender do dia da execução, porque o calendário permite escolher um domingo encerrado.
