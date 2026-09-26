# ADR-014: catálogo de justificativas configurável

## Estado

Aceita.

## Contexto

As justificativas de falta e de saída nasceram como lista fixa no domínio, com os códigos do aplicativo de referência. A escola precisa ajustar códigos e rótulos sem uma nova versão do aplicativo, e a lista em uso deve poder crescer ou ser reduzida conforme a rotina da secretaria.

## Decisão

- Tabela `justificativas` com `codigo`, `rotulo`, `ativo` e criação; a migração insere os 12 códigos iniciais.
- O código é imutável depois de criado, porque a chamada e a saída guardam o código; rótulo e situação são editáveis.
- A exclusão é bloqueada quando há faltas ou saídas usando o código, com a desativação como caminho para preservar o histórico.
- A ordem de exibição é alfabética pelo rótulo, em português.
- A leitura do catálogo é liberada para qualquer sessão; criação, edição e exclusão exigem administração, com auditoria.
- A cópia de segurança em JSON passa a incluir o catálogo, mesclando sem sobrescrever.
- A constante do domínio vira o catálogo de fábrica, usado pela migração e pela semente, e serve de reserva quando nenhum catálogo é informado.

## Alternativas descartadas

- Lista em arquivo de configuração ou variável de ambiente: exigiria publicar uma nova versão para cada ajuste.
- Código editável em cascata: reescreveria o histórico e complicaria a importação de cópias antigas.
- Excluir mesmo com histórico: deixaria códigos órfãos nos relatórios e nas listas de faltas.

## Consequências

- A validação da chamada e da saída consulta o banco; desativar um código o retira das opções novas e mantém os rótulos do histórico.
- A Gestão ganha a seção de justificativas dentro de Configurações, sem criar uma sexta aba.
- Cópias geradas antes desta decisão não têm o campo e continuam importáveis: o catálogo atual é mantido e apenas as frequências com códigos desconhecidos ficam como conflito.
