# ADR-059: infrequência configurável

- Status: aceita
- Data: 2026-10-25

## Contexto

O card de Infrequência do Painel usava limites fixos de 10% e 20% no código. A escola precisava ajustar as faixas de atenção e crítica sem alterar os percentuais brutos de Relatórios, FrequenciBI ou benefícios. A configuração já usava um rascunho único, com revisão otimista e lote atômico, e o Painel já relia as configurações no refresh.

## Decisão

- A Gestão passa a configurar dois limites percentuais inteiros, de 0 a 100:
  - fim da faixa verde, padrão 10%;
  - fim da faixa âmbar, padrão 20%.
- A validação exige atenção menor que crítica. Uma atualização parcial lê o valor vigente para completar a dupla e recusa a combinação inválida.
- Os rótulos e as cores continuam fixos. Até a atenção o card mostra Dentro do esperado em verde; acima da atenção até a crítica mostra Atenção em âmbar; acima da crítica mostra Acima do limite em vermelho.
- A configuração é global para a escola e fica disponível apenas na Gestão. A leitura é permitida a qualquer sessão, porque o Painel precisa dos valores.
- O card do Painel nos dias de segunda a sábado usa os limites configurados. O resumo de domingo não mostra o card. A linha de infrequência do resumo semanal usa os mesmos valores como linhas de referência.
- Relatórios, FrequenciBI e benefícios continuam mostrando percentuais brutos, sem os níveis do card.
- No domínio, `nivelInfrequencia` recebe os dois limites em fração e `limiaresDoPainel` converte os percentuais da Gestão. Os padrões de fábrica continuam em constantes testadas.
- A configuração entra no rascunho único, na revisão por seção, na auditoria, na cópia de segurança e na migração. A seção própria Infrequência do Painel evita marcar Recursos da escola por um motivo que pertence a outra seção.
- Cópias antigas sem os campos não alteram os valores atuais ao restaurar. Cópias novas restauram a dupla quando presente e válida.
- O Painel relê `/api/configuracoes` no Atualizar tela e no refresh automático. Se a leitura falhar, mantém os limites atuais e tenta no próximo ciclo.

## Alternativas consideradas

- Manter os limites fixos e oferecer apenas um texto explicativo. Foi descartado porque a escola já precisava de faixas diferentes.
- Configurar os limites por turma. Foi descartado porque a decisão é global para a escola e o card é comparativo.
- Criar uma tabela nova para as faixas. Foi descartado porque a tabela de configuração já é o lugar natural e o lote único já cobre a gravação.
- Recalcular Relatórios e benefícios com os mesmos níveis. Foi descartado porque esses números são brutos e não devem mudar de significado.

## Consequências

- A escola ajusta as faixas sem alterar o histórico nem os percentuais exibidos em outras telas.
- A migração acrescenta duas colunas com padrões e restrições de faixa e de ordem entre os limites.
- O Painel precisa reler as configurações no refresh, o que acrescenta uma consulta pequena aos ciclos de dois minutos.
- Os testes cobrem os valores padrão, os valores configurados, as fronteiras exatas, a validação da dupla, o lote e a cópia de segurança.
