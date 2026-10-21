# ADR-049: Regras de frequência dos benefícios configuráveis

Estado: aceita. Data: 2026-10-21.

## Contexto

A Chamada passou a avisar a coordenação quando as faltas do mês de um aluno passam do que o incentivo-frequência do Pé-de-Meia admite. A primeira versão embutia no código o nome do programa, o percentual de 80, o cálculo `floor(H * 20 / 100)` e o tratamento das faltas justificadas. A revisão apontou o acoplamento: uma política pública pode mudar de percentual, ganhar um benefício vizinho com regra própria ou acabar, e cada mudança exigiria alterar código e fazer deploy.

## Decisão

- A regra vira configuração persistida na tabela `beneficios_frequencia`: nome, percentual mínimo de frequência (1 a 100), se as faltas justificadas contam e situação. O domínio calcula o limite a partir do percentual recebido e não conhece nome de benefício.
- A administração gerencia os benefícios pela API (`GET` e `POST /api/beneficios-frequencia`, `PATCH` e `DELETE /api/beneficios-frequencia/{id}`) e pela tela Gestão, Configurações, Benefícios e frequência mínima. Leitura vale para qualquer sessão; escrita é da administração, com origem confiável e auditoria.
- O alerta passa a ser um alerta de frequência de benefícios: `GET /api/frequencias/alertas-beneficios?mes=` devolve um item por aluno e benefício ativo, com o nome do benefício, o percentual e o limite. O mesmo motor atende benefícios com percentuais e tratamentos de justificadas diferentes.
- A migração insere uma linha inicial com a regra do Pé-de-Meia (80%, sem contar justificadas). É dado, não código: pode ser editada, desativada ou excluída.
- A cópia de segurança inclui os benefícios, e a restauração compara por nome.
- A carga diária opcional por benefício permite projetar nove aulas nos dias úteis com aulas na grade e sem feriado. Nulo preserva o cálculo pela grade. Retratos e faltas salvos não são reescritos; chamadas antigas sem retrato usam a carga configurada como estimativa. O formulário novo sugere nove, mas a API e os benefícios existentes mantêm nulo por compatibilidade. Cópias antigas sem carga não apagam a configuração atual.
- A Chamada continua montada ao trocar de tela, então a Gestão avisa por um evento do navegador quando muda uma regra, e a Chamada relê os alertas.

## Alternativas

Manter as constantes no código com um comentário apontando o ponto de mudança deixaria cada ajuste dependente de deploy. Guardar só o percentual em `configuracoes` não permitiria vários benefícios com regras distintas. Uma base de cálculo configurável (horas letivas ou dias letivos) foi descartada por ora: só horas letivas está implementada, e um campo sem efeito enganaria a administração.

## Consequências

- A coordenação ajusta a política sem deploy, e um benefício novo reaproveita o cálculo.
- Há uma tabela, uma tela e cinco rotas a mais para manter.
- O nome do programa passa a existir só como dado da linha inicial.
- Com todos os benefícios desativados ou excluídos, a Chamada não mostra alerta; a administração é a responsável por manter a regra alinhada à norma vigente.
- O texto da regra do Pé-de-Meia foi levantado por pesquisa, sem abrir os textos oficiais; a conferência com a Portaria MEC 83/2024 fica a cargo de quem administra.
