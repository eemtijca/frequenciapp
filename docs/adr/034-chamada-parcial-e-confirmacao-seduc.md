# ADR-034: Chamada Parcial e confirmação manual da Seduc

- Status: aceita
- Data: 2026-10-02

## Contexto

A equipe precisa registrar presença em apenas um turno ou em aulas específicas para lançar a frequência no sistema de acompanhamento da Seduc. A chamada diária e seus indicadores precisam continuar independentes. A equipe também precisa lembrar quais registros já foram lançados e manter uma terceira planilha Google para conferência.

## Decisão

- Acrescentar Chamada Parcial ao lado de Chamada. No celular, mover Gestão para o cabeçalho antes das notificações, preservando a navegação lateral do desktop.
- Guardar um registro parcial por aluno e dia. Usar turno inteiro (`MANHA` ou `TARDE`) ou aulas numeradas de 1 a 30, distintas e ordenadas, com observação de até 300 caracteres. Não gravar faltas nem alterar a chamada regular, sua Grade ou seus indicadores.
- Preservar nome do aluno e rótulo da turma no momento da criação. Transferência ou renomeação não reescreve o histórico. Referência de aluno usa cascata, turma histórica usa restrição de exclusão e autoria anulável mantém o histórico ao excluir contas.
- Usar revisão otimista e transações serializáveis para criação, correção, confirmação e exclusão. Revisão obsoleta responde 409. Repetir conteúdo ou confirmação já vigente não incrementa revisão. Correção efetiva limpa a confirmação da Seduc.
- A chave "Registrado na Seduc" é manual, por registro e revisão corrente. Ao marcar, guardar data, identificador e nome da conta autenticada; ao desmarcar, limpar esses dados. Não existe integração com API da Seduc. A chave não representa o estado de sincronização do Google.
- Configurar a finalidade Google `PARCIAL` na Gestão, por OAuth e Picker, exigindo arquivo distinto de frequência e saídas. Preparar a aba `Chamada Parcial` com nove colunas; aba existente é validada sem substituição de dados. Não há envio automático nem criação de backups internos.
- Exigir prévia e releitura antes do envio. Acrescentar registros novos por UUID; atualização de registros existentes depende de opção explícita e limita-se a linhas com marcador da integração, código único e ausência de fórmulas. Conferir valores anteriores imediatamente antes do lote. Divergências sem autorização, fórmulas e códigos repetidos bloqueiam a escrita; linhas manuais sem código ficam preservadas.
- Serializar envios da planilha parcial entre instâncias com `pg_try_advisory_xact_lock`, em conexão PostgreSQL dedicada usando `DATABASE_URL`. Obter a trava antes de remontar o plano, reler a planilha e enviar o lote. Trava ocupada responde 409; perda da conexão cancela a requisição HTTP e responde 502 com orientação de conferência, pois o resultado externo pode ser incerto. Não repetir operações com efeito no Google por retentativa de transação. Os demais fluxos de planilha conservam sua fila em memória nesta etapa.
- Manter a cópia JSON na versão 1, com `frequenciasParciais` opcional. Preservar identidade, presença, nomes históricos, revisão, datas e confirmação. Cópias antigas continuam válidas. Restaurar por mesclagem sem sobrescrever registros existentes por identificador ou aluno e dia; contar divergências e referências ausentes como conflitos. Credenciais OAuth ficam fora da cópia.

## Alternativas

Reutilizar a chamada diária faria a presença parcial interferir em relatórios que já usam outra semântica. Marcar automaticamente após envio ao Google confundiria a exportação com o lançamento manual na Seduc. Usar o mesmo arquivo das outras finalidades contrariaria a separação solicitada para conferência.

## Consequências

A equipe controla os lançamentos externos sem depender de automação da Seduc e corrige registros com proteção contra concorrência. Uma correção exige nova conferência da Seduc; atualizar uma linha Google previamente enviada exige selecionar a opção correspondente e gerar nova prévia. Excluir no aplicativo não apaga linhas da planilha.

A trava distribuída impede que duas instâncias executem simultaneamente o envio parcial pelo aplicativo. Ela não cria atomicidade entre PostgreSQL e Google: liberar ou reverter a transação local não desfaz gravações externas.

A Sheets API não oferece escrita condicionada ao conteúdo anterior. Edições externas após a última leitura ainda podem competir com o envio. Resposta perdida depois do lote exige conferência manual; nenhuma escrita é repetida automaticamente.
