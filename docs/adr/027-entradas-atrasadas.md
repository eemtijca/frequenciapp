# ADR-027: entradas atrasadas separadas da chamada

- Status: aceita
- Data: 2026-09-29
- Issue: #54

## Contexto

A coordenação solicitou registro de chegadas atrasadas na área de saídas e envio para uma aba separada no Google Planilhas. Saídas e faltas já têm históricos próprios que precisam permanecer intactos.

## Decisão

A navegação passa a Saídas e entradas, com dois seletores e formulários independentes. Uma entrada guarda aluno, data civil, horário, motivo, turma no momento do registro e autoria. Uma entrada por aluno e dia é permitida; a remoção confirmada permite corrigir com auditoria. A aplicação não modifica a chamada automaticamente. Alunos desativados ou desistentes na data não recebem novo registro.

A cópia JSON recebe o campo opcional entradas, com importação por mesclagem sem sobrescrever; versões antigas continuam aceitas. A turma registrada não acompanha transferências posteriores.

Na evolução da issue #56, o formulário segue o padrão de saídas e usa calendário brasileiro, momento de aula/pausa, justificativa por tipo ou texto e responsável selecionado no catálogo de Quem libera. Momento e código/nome do responsável são anuláveis nos históricos. Novos registros exigem esses campos. A autoria autenticada permanece independente; nome do responsável e motivo do catálogo são guardados como retrato, sem acompanhar renomeações.

O envio usa a conexão OAuth já configurada para saídas, exclusivamente pela Sheets API, em aba reservada Entradas. A administração confirma sua criação; aba existente é preservada. Prévia obrigatória e releitura antes da escrita invalidam plano após alteração de dados ou troca de arquivo. Cada linha tem código estável por aluno e data. Escrita apenas acrescenta linhas após todo o conteúdo, sem modo completo, limpeza ou remoção. Divergências existentes são relatadas para correção manual. Falha sem confirmação é auditada e nunca provoca retentativa automática.

## Alternativas

Reutilizar saídas ou faltas para representar chegadas foi descartado, pois esses registros têm significado e histórico diferentes. Uma segunda conexão OAuth foi descartada para aproveitar a planilha já selecionada e reduzir a configuração. O envio automático foi adiado para manter a revisão explícita antes da gravação.

## Consequências

Não há novas variáveis de ambiente nem publicação de Apps Script. A nova migração cria uma tabela sem modificar dados existentes. A seleção de planilha é compartilhada com saídas; trocar esse arquivo muda também o destino das entradas. A prévia informa a aba e a interface mostra o nome do arquivo.

A releitura reduz conflitos, mas não garante atomicidade entre aplicativo e edição manual no Google. O adaptador protege células ocupadas e fórmulas; envio incompleto exige conferência. A correção de linha já enviada é manual, preservando históricos da escola. Estatísticas de infrequência continuam baseadas nas chamadas.
